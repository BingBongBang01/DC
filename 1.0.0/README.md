# DC Ultimate — Production Grade Chrome Extension for DCInside

**DC Ultimate v2.0.3**는 디씨인사이드(DCInside) 이용 경험을 극대화하기 위해 개발된 크롬 확장 프로그램입니다.

Manifest V3 규격을 만족하며, 성능 최적화(Debounce/Throttle/LRU Cache/Virtual Pagination)와 XSS 보안 타격 방지(Sanitization) 조치가 적용되어 있습니다.

---

## 🚀 주요 기능 요약

* **다중 페이지 수집 엔진 (Phase 3 & 14)**: 여러 소스 페이지의 검색 결과를 1개 가상 결과로 수집하며 20 / 50 / 100 / 200개 단위 가상 페이지네이션 제공 (화면 조절 시 추가 네트워크 요청 0건).
* **읽기 모드 & 호버 미리보기 (Phase 2)**: 글 제목 마우스 호버 시 본문/미디어/댓글 미리보기 팝오버 표시(지연·본문 길이·썸네일 수·캐시 시간 조절 가능), 다단 독서 모드 지원.
* **중앙 필터 엔진 (Phase 4A)**: 제목, 내용, 작성자, IP, 추천수, 조회수, 미디어 유무, 정규식 기반 `HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK` 비주얼 액션 지원.
* **유저 노트 & 로컬 차단 (Phase 4B)**: 특정 유저 메모 작성, 로컬 차단 및 활동 내역 분석.
* **미디어 갤러리 (Phase 4D)**: 원본 이미지 팝업, 이미지 해시 기반 중복 감지.
* **백업 & 복원 (Phase 4E)**: 설정, 북마크, 유저 노트, 필터 규칙 JSON / CSV / HTML 백업 및 안전 복원.
* **알람 자동화 & 모니터링 (Phase 5)**: `chrome.alarms` 기반 배경 모니터링 및 쿨다운 데스크톱 알림.
* **AI 요약 & 분석 (Phase 7)**: 오프라인 로컬 규칙 기반 NLP 요약 및 OpenAI/Gemini 클라우드 API 연동 (프라이버시 PII 마스킹 처리 적용).

---

### v2.0.0 신규 기능

* **키워드 알림**: 갤러리별 키워드 감시, 새 글 감지 시 데스크톱 알림.
* **테마 연동**: 라이트/다크/시스템 3모드 + 디시 야간모드 자동 연동.
* **자동 로그인**: 로그아웃 감지 시 저장된 계정으로 로그인, 비밀번호 변경 안내 자동 건너뛰기.
* **유저 메모·차단**: 고닉/유동/IP 대역/정규식 단위 블라인드 및 메모 라벨.
* **도배·패턴 숨김**: 동일 제목 반복, 정규식, 특수문자 도배 자동 필터링.
* **작성 도우미**: 자동 임시저장, 디시콘 즐겨찾기와 `/단축어`, 마크다운·코드 하이라이팅, 자짤 다중 등록(랜덤/지정/갤러리별).
* **아카이빙**: 삭제된 글·댓글 로컬 캐시 복구, 원클릭 박제(캐시/PNG/PDF/archive.today).
* **유저 분석**: 활동 히스토리 팝오버, 갤러리 지분율 통계, 통피 의심 대역 감지.
* **목록 UX**: 무한 스크롤·프리페치, 화제 글 하이라이트, 글쓴이 댓글 강조·모아보기.

---

## 🛠️ 설치 방법 (Unpacked Load)

1. 이 저장소를 클론하거나 다운로드합니다.
2. 구글 크롬 브라우저를 열고 `chrome://extensions` 주소로 이동합니다.
3. 우측 상단의 **개발자 모드(Developer mode)** 스위치를 켭니다.
4. 왼쪽 상단의 **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 버튼을 클릭합니다.
5. `DC` 프로젝트 폴더를 선택합니다.

---

## 🎨 아이콘

`assets/icons/master/icon-2048.png`(2048×2048 원본)에서 크기별 아이콘을 생성합니다.

```bash
npm run icons
```

`icon16.png` / `icon48.png` / `icon128.png` 세 파일을 만듭니다(알림 `iconUrl` 도 `icon128.png` 사용).
생성된 PNG는 `IHDR` / `IDAT` / `IEND` 청크만 담고 있습니다 — 이미지 편집기가 남기는
사설 청크(`caBX` 등)나 과대 해상도가 섞이면 크롬이 확장 프로그램 설치 시점에
`'icon.png' 이미지를 디코딩하지 못했습니다` 오류를 냅니다. `manifest.json`의
`icons` / `action.default_icon` 경로는 반드시 이 스크립트가 만든 파일을 가리켜야 합니다.

## 📦 스토어 업로드용 압축

```bash
npm run pack        # → dist/dc-ultimate-<version>.zip
```

`manifest.json`의 버전으로 이름을 붙이고, 다음을 제외한 나머지를 담습니다.

* `node_modules/`, `package.json`, `package-lock.json` — 개발 의존성
* `tests/`, `scripts/`, `docs/`, `.gitattributes` — 개발용 파일
* `assets/icons/master/` — 아이콘 원본 (약 3.2 MB)
* `dist/`, `*.zip` — 패키지 산출물

압축 파일 내부 경로 구분자는 **반드시 슬래시(`/`)** 여야 합니다 — ZIP 스펙(APPNOTE 4.4.17)이
요구하는 형식입니다. 역슬래시로 저장하는 도구를 쓰면 크롬이 `assets\icons\icon128.png`를
폴더가 아닌 하나의 파일명으로 읽어, manifest가 가리키는 경로가 사라지고 같은 디코딩 오류로
설치가 실패합니다. `npm run pack`은 항상 슬래시로 기록하고, 역슬래시가 섞이면 실패합니다.
`manifest.json`과 `package.json`의 버전이 어긋나거나 manifest가 선언한 아이콘이 패키지에
없을 때도 압축을 중단합니다.

직접 압축한다면 슬래시를 쓰는 도구로 하세요.

```bash
zip -r ../dc-ultimate.zip . -x 'node_modules/*' 'tests/*' 'assets/icons/master/*' '*.zip'
```

---

## 🧪 단원 테스트 실행

```bash
npm test
```
또는 `node tests/release-candidate.test.js` 명령어로 Phase 1부터 Phase 20까지의 전체 회귀 테스트를 수행할 수 있습니다.
