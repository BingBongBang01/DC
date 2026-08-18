# DC Ultimate System Architecture (Release Candidate v1.0.0)

DC Ultimate는 이벤트 기반(Event-driven) 및 단방향 데이터 흐름을 준수하는 모듈형 아키텍처로 설계되었습니다.

---

## 🏗️ 시스템 아키텍처 모듈 다이어그램

```text
               +-------------------------------------------------------+
               |              DC Inside Web Page (DOM)                 |
               +-------------------------------------------------------+
                                    |                   ^
                                    v                   | DOM Filter Actions
                        +-----------------------+       |
                        |      DOMObserver      |-------+
                        +-----------------------+
                                    | (Events)
                                    v
   +-----------------------------------------------------------------------+
   |                             Content Script                            |
   |                                                                       |
   |   PageDetector / Parsers ---> FeatureManager ---> TestFeature / etc.  |
   |          |                           |                                |
   |          v                           v                                |
   |     FilterEngine                EventBus                              |
   +-----------------------------------------------------------------------+
                                    ^
                                    | MessageRouter (Chrome Runtime Messaging)
                                    v
   +-----------------------------------------------------------------------+
   |           Background Service Worker / StorageManager / Alarms         |
   +-----------------------------------------------------------------------+
            ^                               ^                             ^
            |                               |                             |
            v                               v                             v
   +-----------------+             +-----------------+           +------------------+
   |    Popup UI     |             |  Side Panel UI  |           |   Options Page   |
   +-----------------+             +-----------------+           +------------------+
```

---

## 📦 모듈 역할 정의

* **`src/core/storage-manager.js`**: `chrome.storage.local` API 추상화 및 v1.0.0 버전 관리/마이그레이션.
* **`src/core/event-bus.js`**: 모듈 간 결합도를 낮추는 이벤트 발행/구독(Pub/Sub) 버스.
* **`src/core/search/search-engine.js`**: 다중 페이지 수집, 중복 제거, 필터링, 정렬, LRU 캐싱, 가상 페이지네이션 오케스트레이터.
* **`src/core/filters/filter-engine.js`**: 게시글/댓글 필터링 조건 수행 및 visual action (`HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK`) 적용기.
* **`src/adapters/ai/`**: 로컬 NLP 및 OpenAI/Gemini 클라우드 API 추상화 레이어.
* **`src/utils/sanitizer.js`**: XSS 방지용 HTML Entity Escaping 및 Text Sanitization 유틸리티.
