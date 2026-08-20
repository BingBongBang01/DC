# DC Ultimate Configuration & Storage Schema

## Storage Schema Version: `2.0.2`

### Keys Specification
```json
{
  "schemaVersion": "2.0.2",
  "settings": {
    "theme": "system",
    "syncDcDarkMode": true,
    "enableHoverPreview": true,
    "enableReadingLayout": false,
    "hideAdWings": false,
    "enableNavigationShortcuts": true,
    "enableUrlRedirect": false,
    "enableSearchEngine": true,
    "enableUserNotes": true,
    "enableCommentTools": true,
    "enableMediaTools": true,
    "enableAutomation": true,
    "enableAIFeatures": true,
    "spActiveView": "search",
    "spTileOrder": null
  },
  "galleryProfiles": {},
  "filters": {
    "rules": [
      {
        "id": "rule_1",
        "name": "광고 차단",
        "titlePattern": "대출",
        "action": "HIDE",
        "priority": 10
      }
    ]
  },
  "userNotes": {},
  "bookmarks": [],
  "searchProfiles": [],
  "searchHistory": [],
  "automationRules": [],
  "statistics": {
    "postsViewed": 0,
    "commentsViewed": 0,
    "filteredCount": 0
  },
  "aiSettings": {
    "provider": "local",
    "apiKey": "",
    "endpoint": ""
  }
}
```

---

## 사이드패널 설정 위치 (2.0.2)

2.0.2 부터 `settings` 의 모든 사용자 설정에 사이드패널 UI 가 있습니다. 어느 패널에서
무엇을 켜고 끄는지:

| 타일 | 여기서 조절하는 설정 |
| --- | --- |
| **검색** | `enableSearchEngine` |
| **갤러리** | `enableNavigationShortcuts`, `enableUrlRedirect`, `autoRefreshInterval` |
| **알림** | `soundNotifications` |
| **차단** | `enableUserBlock`, `enableUserNotes`, `enableSpamFilter` + `spam*` |
| **작성** | `enableAutoSignature` + `autoSig*`, `enableDraftAutosave` + `draftAutosaveIntervalSec`, `enableDcconFavorites` |
| **보관** | `enableArchiveCache`, `enableArchiveCapture`, `archiveDefaultMode` |
| **분석** | `enableUserAnalytics`, `analyticsSampleSize` |
| **보기** | `enableInfiniteScroll` + `infiniteScrollMaxPages`, `enableHotHighlight` + `hot*`, `enableReadingLayout`, `hideAdWings`, `enableCleanUI`, `enableCommentTree`, `enableMarkdownCode` + `markdownRenderPosts`, `enableHoverPreview` + `preview*` |
| **설정** | `theme`, `syncDcDarkMode`, `enableAIFeatures` + `aiSettings`, `enableMediaTools`, `enableCommentTools`, `enableAutomation`, `openSidePanelOnActionClick`, `testFeature` |

모든 컨트롤은 **즉시 저장**입니다(별도 저장 버튼 없음). 예외는 API 키가 함께 가는
`설정 → AI 설정 저장` 뿐입니다. 대부분의 설정은 디시 탭을 새로고침해야 반영됩니다.

타일 순서는 드래그로 바꿀 수 있고 `settings.spTileOrder` 에 저장됩니다. 저장본에 없는
신규 타일은 뒤에 붙으므로 버전이 올라가도 사용자의 순서는 깨지지 않습니다.

---

## 테마 연동 (`settings.theme` / `settings.syncDcDarkMode`)

* `theme`: `"light"` | `"dark"` | `"system"` — 확장프로그램 UI(팝업/사이드패널/설정) 테마.
  `"system"`은 OS의 `prefers-color-scheme`을 따라가며, OS 설정이 바뀌면 즉시 반영됩니다.
* `syncDcDarkMode`: 위 테마를 디시인사이드 야간모드에도 적용할지 여부(기본 `true`).
  디시는 `darkmode=1` 쿠키(`domain=dcinside.com`)로 야간모드를 저장하므로, 확장프로그램은 같은 쿠키를
  기록하고 현재 페이지에는 `#css-darkmode` 스타일시트를 즉시 넣거나 제거합니다. 디시 페이지의
  야간모드 버튼을 누르면 확장프로그램 테마가 대신 바뀌어 두 설정이 어긋나지 않습니다.

---

## 자동 로그인 (`dc_auto_login`)

```json
{
  "dc_auto_login": {
    "enabled": false,
    "userId": "",
    "password": "",
    "skipPasswordChange": true,
    "failures": 0,
    "blockedReason": null,
    "lastError": null,
    "lastSuccessAt": null
  }
}
```

* `enabled`: 자동 로그인 사용 여부(기본 꺼짐).
* `userId` / `password`: **암호화 없이** `chrome.storage.local`에 저장되며,
  `sign.dcinside.com` 로그인 폼에만 입력됩니다. 공용 PC에서는 사용하지 마세요.
* `skipPasswordChange`: 로그인 후 비밀번호 변경 안내에서 `나중에 변경`을 자동 선택할지 여부.
* `blockedReason`: `consecutive_failures`(연속 3회 실패) 또는 `captcha_required`(보안문자 표시)일 때
  자동 로그인이 스스로 멈춥니다. 설정에서 다시 켜야 재개됩니다.

세션 상태(직접 로그아웃한 탭, 진행 중인 로그인 시도)는 `chrome.storage.session`의
`dc_auto_login_session` 키에 저장되어 브라우저를 종료하면 사라집니다.

---

## Phase 21 설정 및 저장소

`settings` 추가 키:

| 키 | 기본값 | 설명 |
| --- | --- | --- |
| `enableUserBlock` | `true` | IP/닉네임 메모 및 차단 |
| `enableSpamFilter` | `true` | 도배/패턴 자동 숨김 |
| `enableDraftAutosave` | `true` | 작성 중 자동 임시저장 |
| `enableDcconFavorites` | `true` | 디시콘 즐겨찾기 및 `/단축어` |
| `enableMarkdownCode` | `true` | 마크다운 및 코드 하이라이팅 |
| `enableInfiniteScroll` | `true` | 무한 스크롤 및 프리페치 |
| `enableHotHighlight` | `true` | 화제 글 하이라이트 |
| `spamDuplicateThreshold` | `3` | 동일 제목이 몇 건 이상이면 도배로 볼지 |
| `spamSpecialCharRatio` | `0.6` | 제목의 특수문자 비율 임계값 |
| `spamRepeatedCharRun` | `6` | 같은 글자 연속 반복 임계값 |
| `spamPatterns` | `[]` | 도배로 볼 정규식 목록 |
| `hotRecommendThreshold` / `hotCommentThreshold` | `10` / `20` | 화제 글 기준 |
| `hotBlazingMultiplier` | `3` | 이 배수를 넘으면 더 강하게 강조 |
| `infiniteScrollMaxPages` | `10` | 무한 스크롤 최대 페이지 |
| `draftAutosaveIntervalSec` | `10` | 임시저장 주기(초) |
| `markdownRenderPosts` | `true` | 본문 마크다운 렌더링 토글 제공 |

추가 저장소 키:

* `dc_user_rules`: 유저 메모/차단 규칙 배열 (`type`, `value`, `action`, `memo`, `galleryId`, `hitCount`)
* `dc_dccon_favorites`: 디시콘 사용 기록 (`detailIdx`, `packageIdx`, `title`, `img`, `uses`, `pinned`)
* `dc_drafts`: 임시저장 **요약** 미러 (본문 HTML은 페이지의 `localStorage`에만 저장)

---

## 미리보기 팝업 (2.0.2)

`settings` 추가 키. 전부 사이드패널 **보기 → 미리보기 팝업 → 미리보기 세부 설정** 에서
조절합니다. 2.0.1 까지는 모두 코드에 하드코딩돼 있었습니다.

| 키 | 기본값 | 범위 | 설명 |
| --- | --- | --- | --- |
| `enableHoverPreview` | `true` | — | 목록에서 글 제목에 마우스를 올렸을 때 팝업 표시 |
| `previewDelayMs` | `300` | 0~2000 | 마우스를 올린 뒤 팝업이 뜨기까지의 지연(ms) |
| `previewBodyChars` | `200` | 50~1000 | 팝업에 보여 줄 본문 글자 수 |
| `previewThumbCount` | `4` | 0~8 | 첨부 이미지 썸네일 최대 장수 (`0` = 숨김) |
| `previewCacheTtlMin` | `10` | 1~120 | 받아온 본문을 캐시에 유지할 시간(분) |

범위를 벗어난 값은 저장 시 경계값으로 잘리고 입력칸도 함께 되돌아갑니다.

> 팝업의 **댓글 수**는 `fetch` 한 문서에서 댓글 목록을 셀 수 없습니다(디시가 댓글을 AJAX 로
> 채웁니다). 본문 헤더의 `.gall_comment`("댓글 N") → 목록 행의 `[N]` 순으로 읽습니다.

---

## 자짤 (자동 첨부 이미지)

| 키 | 기본값 | 설명 |
| --- | --- | --- |
| `enableAutoSignature` | `false` | 자짤 자동 첨부 사용 |
| `autoSigMode` | `"random"` | `random`(무작위) / `single`(지정 1개) / `gallery`(갤러리별) |
| `autoSigSelectedId` | `null` | 지정 1개 모드에서 쓸 자짤 id (갤러리별 모드에서는 미지정 갤러리의 기본값) |
| `autoSigGalleryMap` | `{}` | `{ "갤러리ID": "자짤 id" }` 매핑 |

* `dc_auto_sig_images`: 등록된 자짤 배열 (`id`, `name`, `dataUrl`, `addedAt`) — 최대 20장, 등록 시 최대 900px로 압축(GIF 제외)
* 기존 단일 자짤 키 `autoSignatureImage`는 최초 실행 시 위 목록으로 이관된 뒤 비워집니다.

---

## 아카이브 · 분석 (Phase 22)

| 키 | 기본값 | 설명 |
| --- | --- | --- |
| `enableArchiveCache` | `true` | 글/댓글 자동 캐시 (삭제 시 복구) |
| `enableArchiveCapture` | `true` | 원클릭 박제 버튼 및 Shift+A 단축키 |
| `enableCommentTree` | `true` | 글쓴이 댓글 강조 + 글쓴이 댓글만 보기 (사이드패널 **보기** 패널) |
| `enableUserAnalytics` | `true` | 닉네임/IP Alt+클릭 활동 팝오버 |
| `archiveDefaultMode` | `"cache"` | 단축키 기본 동작 (`cache`/`image`/`pdf`/`archive-today`) |
| `analyticsSampleSize` | `200` | 지분율 계산 표본 글 수 |

> **2.0.2에서 제거됨** — `commentTreeEnabled`. `enableCommentTree` 와 중복된 키였고, 이 키가
> 켜던 "대댓글 재정렬" 자체가 제거됐습니다(디시가 depth 0 댓글의 `<li>` 를 닫지 않아 답글
> 묶음이 형제 `<li>` 로 파싱되는데, 최상위 댓글만 옮기면 답글 묶음이 제자리에 남아 대댓글이
> 목록 맨 위로 올라갔습니다). 마이그레이션이 키를 걷어내며, `commentTreeEnabled: false` 였던
> 사용자는 `enableCommentTree` 도 `false` 로 넘어갑니다. 정렬은 디시 네이티브의
> `등록순 / 최신순 / 답글순` 을 쓰세요.

아카이브 본체는 확장 프로그램 오리진의 **IndexedDB**(`dc_ultimate_archive`)에 저장됩니다.
콘텐츠 스크립트는 수집한 내용을 메시지로 넘기고 저장은 백그라운드가 전담하므로,
사이드패널에서도 같은 데이터를 읽을 수 있습니다. 보관 한도는 글 8,000건 / 댓글 40,000건 / 45일입니다.
