# DC Ultimate Detailed Feature Specifications (Release Candidate v1.0.0)

## 1. Core Architecture (Phase 1)
* Manifest V3 비동기 서비스 워커 지원
* 스토리지 버전 관리 및 마이그레이션 프레임워크 (v1.0.0)
* LRU & TTL 2단계 메모리 캐시 지원

## 2. Dedicated Parsers & Navigation (Phase 2)
* 메이저, 마이너, 미니 갤러리 파서
* 호버 미리보기 팝오버 (지연·본문 길이·썸네일 수·캐시 시간 조절 가능, AbortController, Esc 닫기)
* 키보드 단축키 (`j`/`k` 이전/다음 글, `h`/`l` 이전/다음 페이지, `b` 북마크)
* 모바일 URL (`m.dcinside.com`) -> 데스크톱 URL 자동 전환

## 3. Multi-Page Search Aggregation Engine (Phases 3 & 14)
* 다중 페이지 순차 수집 및 250ms Rate Limiter 적용
* 게시글 고유 키 (`galleryId:articleId`) 기반 중복 제거
* 20 / 50 / 100 / 200개 가상 페이지네이션 (재요청 0건)
* 해시 쿼리 키 캐싱 및 저장된 검색 프로필 프리셋 지원

## 4. Filters, User Notes, Comments, Media & Data (Phase 4)
* 중앙 필터 엔진: `HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK` 비주얼 액션
* 유저 노트 & 로컬 차단 관리
* 댓글 파싱, 검색, 답글 접기 및 JSON/CSV 내보내기
* 이미지 갤러리 팝업, 이미지 해시 중복 감지
* 스토리 전체 JSON, CSV, HTML 백업/복원

## 5. Automation & Notifications (Phase 5)
* `chrome.alarms` 기반 배경 모니터링
* 저장된 검색어 및 신규 게시글 감지
* 쿨다운 데스크톱 알림 (스팸 방지)

## 6. MD3 UI & Dashboard (Phase 6)
* Navigation Rail 기반 14개 환경설정 카테고리
* 시스템 상태 대시보드
* 갤러리별 오버라이드 프로필 지원

## 7. Session Auth & AI Pipeline (Phase 7)
* 세션 로그인 감지 (`Logged in`, `Logged out`, `Unknown`)
* 로컬 오프라인 NLP 및 OpenAI / Gemini 클라우드 API 연동
* 프라이버시 파이프라인 (IP/전화번호 마스킹 및 사용자 전송 승인)

## 8. Security & QA (Phases 8 - 20)
* XSS 방지 `escapeHTML` / `sanitizeText` 적용
* 전체 19개 파이프라인 단원 및 연동 테스트 수트

## 9. 유저 차단 · 도배 필터 · 작성 편의 (Phase 21)
* IP/닉네임/고닉·반고닉(uid)/IP 대역/정규식 기반 메모 및 자동 블라인드 (글 + 댓글)
* 신분 3분류 (고닉 / 반고닉 / 유동닉): 닉 아이콘 `fix_nik.gif` vs `nik.gif` 로 고닉과 반고닉을 갈라 활동 팝오버에 표시. 반고닉은 계정 uid 가 있어 닉네임이 `ㅇㅇ` 처럼 겹쳐도 사람별로 구분되고, uid 가 없는 약한 키(닉네임·유동닉 IP)로 조회하면 여러 명이 섞일 수 있다고 경고 (`SEMI_FIXED_NICKNAME_ANALYSIS.md`)
* 유저 메모는 `uid:`/`ip:`/`nick:` 정규화 키로 저장 — 같은 닉네임을 쓰는 다른 사람에게 메모가 번지지 않음
* 닉네임 규칙의 사정거리 표시: `nick` 규칙을 만들 때 그 닉네임을 쓰는 식별자 수를 세어 보여주고(예: `ㅇㅇ` → 식별자 10개 = 계정 3 · 유동닉 IP 7), 2개 이상이면 등록 전에 확인
* 도배 감지: 동일 제목 반복, 사용자 정규식, 특수문자 비율, 같은 글자 연속 반복
* 작성 중 자동 임시저장 (`localStorage`) 및 복구 바, 사이드패널 임시저장 목록
* 디시콘 즐겨찾기 자동 수집·핀 고정, `/이름` 단축 입력
* 마크다운 렌더링 및 코드 블록 문법 하이라이팅 (외부 라이브러리 없음)
* 목록 무한 스크롤 + 다음 페이지 프리페치
* 추천/댓글 기준 화제 글 하이라이트
* 자짤 다중 등록 및 랜덤 / 지정 1개 / 갤러리별 적용

## 10. 아카이빙 · 가독성 · 유저 분석 (Phase 22)
* 삭제 글/댓글 로컬 캐시(IndexedDB) 복구
* 원클릭 박제: 로컬 캐시 / PNG 캡처 / PDF 인쇄 / archive.today (Shift+A)
* 호버 미리보기 첨부 이미지 썸네일 렌더링
* 글쓴이 댓글 배지·강조 및 모아보기 토글 (최상위 댓글과 대댓글 모두)
  * 대댓글 재정렬은 2.0.2에서 제거했습니다 — 디시가 depth 0 댓글의 `<li>` 를 닫지 않아
    답글 묶음이 형제 `<li>` 로 파싱되고, 최상위 댓글만 옮기면 대댓글이 맨 위로 올라갑니다.
    정렬은 디시 네이티브(`등록순 / 최신순 / 답글순`)를 씁니다.
* 닉네임/IP Alt+클릭 활동 히스토리 팝오버 (글·댓글 수, 시간대 분포, 동일 IP 대역 닉네임)
* 갤러리 활동 지분율 통계 및 통피/다중 계정 의심 대역 감지

## 11. 사이드패널 설정 노출 (2.0.2)
* 서비스 타일 9개 (검색 / 갤러리 / 알림 / 차단 / 작성 / 보관 / 분석 / 보기 / **설정**)
* `settings` 의 모든 사용자 설정에 UI 제공 — 어느 패널에 무엇이 있는지는 `CONFIGURATION.md` 참조
* AI 제공자·API 키·엔드포인트 입력 (2.0.1까지는 입력 수단이 없어 AI 기능을 쓸 수 없었습니다)
* 전 패널 즉시 저장 (AI 설정만 명시적 저장 버튼)
