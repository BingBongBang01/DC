# DC Ultimate Changelog

## [Unreleased]

### Fixed — 확장 프로그램 아이콘
- **설치 시 `'icon.png' 이미지를 디코딩하지 못했습니다` 오류**: `manifest.json`의 `icons`·`action.default_icon` 여섯 칸이 모두 2048×2048 / 2.68MB 짜리 `assets/icons/icon.png` 하나를 가리켰고, 이 파일에는 IHDR 직후에 23,733바이트 사설 청크(`caBX`)가 들어 있었습니다. 크롬은 설치 시점에 manifest에 선언된 모든 이미지를 미리 디코딩하는데, 이 단계에서 거부되어 설치가 실패했습니다. 크기별 아이콘(`icon16.png` / `icon48.png` / `icon128.png`)을 만들어 각 칸이 알맞은 파일을 가리키도록 했습니다.
- **`icon16.png` / `icon48.png` / `icon128.png` 가 깨진 PNG였던 문제**: 세 파일 모두 70바이트에 IHDR 청크가 없어 어떤 디코더로도 열리지 않았습니다(`file` 판정: `data`). 원인은 생성 스크립트에 하드코딩된 base64 리터럴의 오타 한 글자(`…SU6EUgAA…`, 정상값은 `…SUhEUgAA…`)였습니다. 1×1 플레이스홀더를 만들던 `assets/icons/make.js` · `assets/icons/generate-icons.js`를 제거하고, 원본에서 실제 아이콘을 축소 생성하는 `scripts/generate-icons.mjs`(`npm run icons`, 외부 의존성 없음)로 대체했습니다.
- **알림 아이콘 용량**: `chrome.notifications.create`에 2.68MB 아이콘을 넘기던 `src/core/notifications/notification-manager.js`를 포함해 알림 3곳(키워드 알림, 자동 로그인)의 `iconUrl`을 `assets/icons/icon128.png`(11.6KB)로 통일했습니다.
- **확장자와 실제 형식이 다른 이미지**: `assets/icons/dc_ultimate_icon.png`는 실제로 JPEG였습니다. 미참조 원본 이미지들과 함께 `assets/icons/master/`로 옮기고 확장자를 바로잡았습니다. 패키지에 실리는 `assets/icons/` 용량은 3.2MB → 16KB가 되었습니다.

### Fixed — 페이지 레이아웃
- **좌우가 잘리는데 가로 스크롤이 안 되던 문제**: 광고 날개를 숨기는 주입 스타일에 `html, body { overflow-x: hidden !important }` 가 함께 들어 있었습니다. 디씨 목록은 `.dcwrap.width1160` — 가로 1160px 고정이라, 창이 그보다 좁으면 우측 사이드바가 스크롤 없이 잘려 나갔습니다. 콘텐츠 스크립트가 `document_idle` 에 실행되므로 로딩 직후 떠 있던 가로 스크롤바가 곧 사라지는 증상으로 나타났습니다. 오버플로 clamp 를 제거해 가로 스크롤을 되돌렸습니다.
- **창 폭에 맞춰 `body` 를 축소하던 해킹 제거**: `document.body.style.zoom = innerWidth / 1160` 을 설정 없이 무조건 적용하고 `resize` 리스너도 해제하지 않았습니다. `innerWidth` 가 세로 스크롤바 폭을 포함해 배율이 늘 조금 크고, 남는 몇 px 이 위 `overflow-x: hidden` 에 먹혀 조용히 잘렸습니다. 축소 대신 가로 스크롤로 동작합니다.
- **날개 광고 숨김 범위 확대**: 날개 배너는 `#ad_floating` 의 자식이 아니라 형제이고 클래스 이름이 페이지 종류별로 다릅니다(`ad_left_wing_list_top` 등). `#ad_floating` 과 `div[class*="_wing_"]` 를 함께 숨겨 목록 외 페이지에서도 걷어냅니다. 와일드카드는 `_wing_`(양쪽 밑줄)이어야 하며, `wing` 으로 하면 디씨의 `.following` 이 걸립니다.
- 레이아웃 보정 로직을 `src/content/page-layout.js` 로 분리하고 `tests/page-layout.test.js` 를 추가했습니다. 실제 페이지 fixture 로 날개 셀렉터가 맞는지 확인하고, `overflow-x` 규칙과 `body.style.zoom` 이 되살아나면 실패합니다.

### Added — 패키징
- **`npm run pack`**: 스토어 업로드용 zip 을 만드는 `scripts/pack.mjs` 를 추가했습니다(외부 의존성 없음). 엔트리 이름을 항상 슬래시(`/`)로 기록합니다 — 역슬래시(`assets\icons\icon128.png`)로 저장하는 압축 도구를 쓰면 크롬이 폴더 구조를 인식하지 못해 아이콘 경로가 사라지고 동일한 디코딩 오류로 설치가 실패합니다. 저장소에 있던 `DC-Ultimate-v1.0.0-store.zip` 이 그 경우로, 91개 엔트리 중 90개가 역슬래시였습니다. `node_modules/` · `tests/` · `scripts/` · `docs/` · `assets/icons/master/` 를 제외하며, manifest 와 package 의 버전이 어긋나거나 manifest 가 선언한 아이콘이 패키지에 없으면 실패합니다.

## [2.0.0] - 2026-08-19

### Performance
- **콘텐츠 스크립트 초기 로딩 -33%**: 글쓰기/본문 전용 피처(자짤·임시저장·마크다운·디시콘·박제·댓글 트리·AI)를 페이지 종류에 따라 지연 로딩으로 전환했습니다. 가장 흔한 목록 페이지 기준 모듈 73개·301KB → **56개·203KB**, 동일 조건 로드 시간 측정에서 **1218ms → 611ms(-50%)**.
- **아카이브 캡처 중복 전송 제거**: DOM이 바뀔 때마다 목록 전체(500행 기준 약 140KB)를 다시 직렬화해 백그라운드로 보내고 IndexedDB에 같은 수만큼 쓰던 것을, 새로 등장한 글/댓글만 보내도록 바꿨습니다. 반복 호출 시 전송 **50건 → 0건**, 무한 스크롤로 50행이 추가되면 그 50건만 전송합니다.
- **사이드패널 폴링 축소**: 15초 주기 갱신이 어떤 서비스를 보고 있든 항상 돌던 것을, **알림 서비스가 열려 있을 때만** 수행하고 타일을 열 때 1회 즉시 갱신하도록 했습니다(패널이 숨겨져 있으면 건너뜀).
- 유저 규칙 적중 횟수 저장을 3초 → 10초 간격으로 모아 스크롤 중 저장소 쓰기를 줄였습니다.
- 측정 결과 목록 스캔(차단/도배/하이라이트)은 499행에서 합계 약 3.8ms로 병목이 아니어서 알고리즘은 그대로 두었습니다.

### Added — 아카이빙 및 휘발 방지 (Phase 22)
- **삭제 글/댓글 로컬 캐시 복구**: 목록·본문을 볼 때마다 글과 댓글을 백그라운드의 IndexedDB 아카이브(`src/core/archive/archive-db.js`)에 저장합니다. 나중에 글이 삭제되면 그 자리에서 캐시된 제목·본문·이미지·댓글을 복구해 보여주고, 살아 있는 글에서는 **삭제된 댓글만** 따로 펼쳐 볼 수 있습니다. (보관 한도: 글 8,000건 / 댓글 40,000건 / 45일, 초과분 자동 정리)
- **원클릭 박제**: 본문에 박제 바를 붙이고 **Shift+A** 단축키를 지원합니다. `로컬 캐시 저장` / `화면 이미지(PNG)` / `PDF로 인쇄` / `archive.today`(새 탭에서 사용자가 완료) 4가지 방식이며, 기본 동작은 사이드패널에서 고를 수 있습니다.

### Added — 탐색 및 가독성 UX
- **호버 미리보기 개선**: "📷 이미지 첨부됨" 문구 대신 **첨부 이미지 썸네일**을 최대 4장까지 실제로 렌더링합니다.
- **대댓글 트리(계층형) 변환**: `@닉네임` 호출과 답글 대상 번호를 파싱해 일렬 댓글을 레딧식 들여쓰기 구조로 재정렬합니다(최대 6단계, 순환 방지). `트리 보기 ↔ 원본 순서` 토글 제공.
- **작성자(글쓴이) 댓글 모아보기**: 본문 작성자의 댓글에 `글쓴이` 배지와 배경색을 넣고, 그 댓글만 보는 토글을 제공합니다.

### Added — 유저 분석 및 패턴 감지
- **유저 활동 히스토리 팝오버**: 닉네임/IP를 **Alt+클릭**하면 그 갤러리에서의 글·댓글 수, 24시간 활동 분포, 최근 글, 관측된 닉네임, 같은 IP 대역의 다른 닉네임을 즉시 보여주고 바로 메모/차단을 걸 수 있습니다.
- **갤러리 활동 지분율 통계**: 최근 100/200/500개 글 중 작성자별 비율을 막대로 표시하고, 같은 IP 대역에서 여러 닉네임이 나오는 **통피/다중 계정 의심 대역**을 함께 보고합니다.

### Changed
- 사이드패널 서비스 바에 **보관**·**분석** 타일을 추가해 8개 서비스로 재편했습니다.
- 저장소 스키마를 `2.0.0`으로 올리고 신규 기본값·데이터 키를 채우는 마이그레이션 단계를 추가했습니다.
- 확장 프로그램 버전을 **2.0.0**으로 올렸습니다.

## [Unreleased 이전 작업 — 2.0.0에 포함]

### Added — 자짤 다중 등록 및 적용 방식 (랜덤 / 지정 / 갤러리별)
- 자짤을 **여러 장 등록**할 수 있게 저장 구조를 바꿨습니다(`src/core/signature/signature-store.js`, 최대 20장). 기존에 저장해 둔 단일 자짤(`autoSignatureImage`)은 처음 실행할 때 목록으로 자동 이관됩니다.
- 적용 방식 3가지: **랜덤**(등록된 자짤 중 무작위) / **지정 1개**(고른 자짤만) / **갤러리별**(갤러리마다 다른 자짤, 미지정 갤러리는 기본 자짤 → 없으면 무작위).
- 사이드패널 **[작성] 서비스**에 `자짤 자동 첨부` 섹션 추가: 사용 토글, 적용 방식 선택, 썸네일 그리드(클릭으로 지정·이름 변경·삭제), **현재 갤러리에 지정** 버튼, 갤러리별 매핑 목록과 해제.
- 이미지 추가는 사이드패널의 파일 선택 또는 기존처럼 글쓰기 화면에 **드래그 앤 드롭 / 붙여넣기(Ctrl+V)** 로 가능하며, 붙여넣은 이미지는 적용 방식과 무관하게 그 글에 바로 첨부됩니다.
- 글쓰기 화면 자짤 박스가 현재 적용 방식(`랜덤 (N개)` / `지정 1개 사용` / `갤러리별 자짤`)과 이번 글에 첨부될 자짤 이름을 함께 표시합니다.
- 등록 시 이미지를 자동 압축(최대 900px, GIF는 원본 유지)하고, 중복·과대 용량·개수 초과를 막습니다. 자짤을 삭제하면 그 자짤을 가리키던 기본 지정과 갤러리 매핑도 함께 정리됩니다.
- 설정 페이지의 자짤 탭도 새 목록 구조를 쓰도록 바꾸고, 다중 관리는 사이드패널에서 하도록 안내를 추가했습니다.

### Changed — 사이드패널 서비스 바 재구성
- 사이드패널 상단에 **정사각형 서비스 타일 바**를 추가하고, 타일을 누르면 아래 본문 영역이 해당 서비스로 전환되도록 재배치했습니다. 기존처럼 모든 기능이 한 화면에 세로로 쌓이지 않습니다.
- 구현된 기능을 성격에 따라 6개 서비스로 묶었습니다.
  | 타일 | 담당 기능 |
  | --- | --- |
  | **검색** | 검색어·검색 옵션·수집 진행률·검색 결과·가상 페이지네이션 |
  | **갤러리** | 현재 갤러리 이동(전체글/개념글/공지)·즐겨찾기·최근 방문 |
  | **알림** | 키워드 알림 규칙·최근 알림·지금 검사 (읽지 않은 알림 수를 타일 배지로 표시) |
  | **차단** | 유저 메모·차단 규칙, 도배·패턴 숨김 설정 |
  | **작성** | 임시저장 목록, 디시콘 즐겨찾기 핀 관리 |
  | **보기** | 무한 스크롤·화제글 하이라이트·마크다운·임시저장·디시콘 토글 및 기준값 |
- 타일은 패널 폭에 맞춰 균등 분할되며 `aspect-ratio`로 항상 정사각형을 유지합니다(320px 폭에서도 가로 스크롤 없음).
- 마지막으로 본 서비스는 `settings.spActiveView`에 저장되어 패널을 다시 열면 그대로 복원되고, 어느 서비스에 있든 검색 버튼을 누르면 검색 서비스로 전환됩니다.

### Added — 유저 차단 · 도배 필터 · 작성 편의 · 목록 보기 (Phase 21)
- **IP/닉네임 메모 및 차단** (`src/core/filters/user-rule-manager.js`, `src/features/user-block-feature.js`): 고닉(uid)·닉네임·IP·**IP 대역**·정규식 단위로 등록해 글/댓글을 블라인드(펼치기 가능)·숨김·흐리게 처리하고, 메모는 작성자 옆 라벨로 표시합니다. 갤러리별 적용, 규칙별 적중 횟수 집계 지원.
- **도배/패턴 감지 숨김** (`src/core/filters/spam-detector.js`, `src/features/spam-filter-feature.js`): 동일 제목 N회 반복, 사용자 정규식, 특수문자 비율, 같은 글자 연속 반복을 감지해 목록에서 접고 "N건 숨김" 줄로 펼쳐 볼 수 있게 합니다.
- **작성 중 자동 임시저장** (`src/features/draft-autosave-feature.js`): 글쓰기 화면에서 제목·본문(서머노트 `.note-editable`)·첨부 파일명을 주기적으로 `localStorage`에 저장하고, 새로 들어오면 복구 바를 띄웁니다. 사이드패널이 목록을 볼 수 있도록 요약본을 확장 저장소에 미러링합니다.
- **디시콘 즐겨찾기 및 `/단축어`** (`src/features/dccon-favorites-feature.js`): 사용한 디시콘을 자동 수집(3회 이상이면 자동 핀 고정)해 댓글창 위에 핀 바로 띄우고, `/이름` 입력 시 팔레트에서 골라 삽입합니다. 삽입은 디시 자체 피커(`#div_con`의 `package_idx`/`detail_idx` 버튼)를 그대로 눌러 처리하므로 전송 형식이 깨지지 않습니다.
- **마크다운 및 코드 하이라이팅** (`src/core/markdown/*`, `src/features/markdown-code-feature.js`): 본문의 ```` ```언어 ```` 코드 펜스를 하이라이팅된 복사 가능한 블록으로 렌더링하고, 마크다운 글은 토글로 렌더링해 볼 수 있습니다. 글쓰기 화면에는 **마크다운 → 본문 변환** 버튼을 추가했습니다. (외부 CDN 없이 자체 구현, 항상 HTML 이스케이프)
- **무한 스크롤 및 프리페칭** (`src/features/infinite-scroll-feature.js`): 목록 하단 도달 시 다음 페이지를 비동기로 붙이고 그다음 페이지를 미리 받아둡니다. 글 번호 기준 중복 제거, 페이지 구분선, 최대 페이지 제한 포함.
- **반응형 하이라이트** (`src/features/hot-highlight-feature.js`): 추천/댓글 수가 기준을 넘는 화제 글을 색상과 뱃지로 강조하고, 기준의 3배를 넘으면 더 강한 색으로 표시합니다.
- **사이드패널 UI**: `유저 메모·차단`(등록 폼/목록/적중 횟수), `도배·패턴 숨김`(임계값·정규식), `목록 보기 옵션`(무한스크롤·하이라이트·마크다운·임시저장·디시콘 토글 및 기준값), `작성 도우미`(임시저장 목록·디시콘 즐겨찾기 핀 관리) 섹션을 추가했습니다. 유저 규칙과 디시콘 변경은 열려 있는 디시 탭에 즉시 브로드캐스트됩니다.
- `tests/phase21.test.js` 회귀 테스트 추가.

### Added — 테마 연동 (다크 / 라이트 / 시스템)
- 팝업에 **라이트 / 다크 / 시스템** 3단 선택 버튼을 추가했습니다. 시스템 모드는 OS 설정(`prefers-color-scheme`)을 따라가며 OS 테마가 바뀌면 열려 있는 디시 탭에도 즉시 반영됩니다.
- `src/content/dc-dark-sync.js` (신규, `document_start`): 확장프로그램 테마를 디시인사이드 야간모드(`darkmode` 쿠키 + `#css-darkmode` 스타일시트)에 그대로 적용합니다. 페이지가 그려지기 전에 실행되어 깜빡임이 없고, 다음 페이지부터는 디시 서버가 알아서 야간모드로 렌더링합니다.
- 역방향 연동: 디시 페이지의 **야간모드** 버튼을 누르면 (캡처 단계에서 가로채) 확장프로그램 테마가 함께 바뀝니다. 두 설정이 서로 되돌리는 문제가 없습니다.
- 설정 → 일반, 팝업에 **DC 야간모드 연동** 스위치 (`settings.syncDcDarkMode`, 기본 켜짐).

### Added — DC 자동 로그인
- 설정에 **DC 로그인** 탭 추가: 아이디/비밀번호 저장, 자동 로그인 스위치, 비밀번호 변경 안내 건너뛰기, 상태·실패 사유 표시.
- 로그아웃 상태가 감지되면 저장된 계정으로 `sign.dcinside.com` 로그인 폼을 채워 제출하고, 로그인 후 원래 보던 페이지로 돌아옵니다.
- 로그인 후 **비밀번호 변경 안내**가 뜨면 `나중에 변경` 계열 버튼을 자동으로 눌러 바로 로그인 상태로 진입합니다.
- **직접 로그아웃하면 그 탭에서는 로그아웃 상태를 유지**하고, 새 탭이나 다른 사이트를 거쳐 디시에 다시 들어오면 자동 로그인이 다시 동작합니다 (`chrome.storage.session` 기반, 브라우저 종료 시 초기화).
- 안전장치: 보안문자(캡차)·추가 인증이 뜨면 우회하지 않고 즉시 중단 후 알림, 연속 3회 실패 시 자동 중단, 탭당 30초 쿨다운, 계정 정보는 `sign.dcinside.com` 출처의 요청에만 전달.
- `tests/auto-login.test.js` 회귀 테스트 추가.

### Fixed — 키워드 알림 (Keyword Alerts)
- **배경 스캔이 항상 0건이던 문제**: 서비스 워커에는 `DOMParser`가 없어 `ArticleParser`가 언제나 빈 목록을 반환했습니다. DOM 없이 동작하는 `src/core/keyword-alert/list-page-parser.js`를 추가해 백그라운드에서도 갤러리 목록을 파싱합니다. (공지 행은 제외)
- **마이너/미니 갤러리 URL 오류**: `mgallery` / `mini` 타입이 `major`로 처리되어 잘못된 목록을 조회했습니다. `normalizeGalleryType()`을 도입해 사이드패널 검색(`QueryBuilder`)과 알림 스캔이 동일한 규칙을 사용합니다.
- **데스크톱 알림이 뜨지 않던 문제**: 존재하지 않는 아이콘 경로(`icons/icon128.png`)로 `chrome.notifications.create`가 실패했습니다. `chrome.runtime.getURL()` 기반 절대 경로로 교체하고 실패 시 로그를 남깁니다.
- **알람이 영원히 발화하지 않던 문제**: 서비스 워커가 깨어날 때마다 알람을 전부 지우고 다시 만들어 주기가 초기화됐습니다. `initAlarms()`가 멱등적으로 동작하도록 변경했습니다.
- **콜드 스타트 경합**: 메시지 핸들러가 비동기 초기화 이후에 등록되어, 사이드패널의 첫 요청이 핸들러를 찾지 못했습니다. 핸들러를 동기 등록하고 각 핸들러가 초기화 완료를 기다리도록 했습니다.
- **사이드패널에서 알림 추가가 동작하지 않던 문제**: 사이드패널은 `window.prompt()` / `confirm()` / `alert()` 대화상자를 표시하지 않습니다. 인라인 등록 폼, 2단계 삭제 확인, 인라인 상태/오류 메시지로 교체했습니다.

### Added
- 알림 규칙별 **지금 검사** 및 전체 **지금 검사** 버튼 (`KEYWORD_ALERT_SCAN_NOW`) — 수집/신규/알림 건수와 실패 사유를 사이드패널에 표시합니다.
- 알림 규칙 검증(키워드 필수, 정규식 유효성, 갤러리 필수), 최근 오류 표시, 누적 알림 건수 표시.
- `tests/keyword-alert.test.js` 회귀 테스트 (파서 / 갤러리 타입 / 매칭 / 스캔 파이프라인 / 검증).

## [1.0.0-RC] - 2026-08-09 (Release Candidate)

### Complete Features Delivered across Phases 1 - 20
- **Phase 1 (Core Architecture)**: Manifest V3, Storage v1.0.0, Logger, EventBus, CacheManager, FeatureManager, MessageRouter.
- **Phase 2 (Parser + Reading + Navigation)**: Dedicated parsers, 300ms hover preview popover, multi-column reader, keyboard shortcuts, mobile URL redirect.
- **Phase 3 & 14 (Search Engine)**: Multi-page collection, rate limiter (250ms), composite key deduplication, virtual pagination (20/50/100/200), hash query caching, Search Profiles presets.
- **Phase 4 (Filters, User Notes, Comments, Media, Data)**: Centralized FilterEngine (`HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK`), UserNotesFeature CRUD, CommentToolsFeature JSON/CSV export, MediaToolsFeature image hash deduplication & batch downloader, DataManager backup/restore.
- **Phase 5 (Automation & Notifications)**: `chrome.alarms` background monitoring tasks, keyword alerts, NotificationManager cooldown throttler.
- **Phase 6 (MD3 UI & Dashboard)**: Material Design 3 component subsystem, system dashboard, 14 settings categories, gallery profiles override manager.
- **Phase 7 (Auth & AI)**: Session auth state detection (`Logged in`, `Logged out`, `Unknown`), official login navigation URL, local rule-based offline NLP provider, OpenAI / Gemini / Custom API adapters, PII masking & user confirmation privacy pipeline.
- **Phase 8 - 20 (Security, QA & Release Candidate)**: XSS `escapeHTML` / `sanitizeText` security sanitization, full regression test suite (19 test modules), zero remaining P0/P1/P2/P3 defects.
