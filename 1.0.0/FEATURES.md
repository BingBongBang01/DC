# DC Ultimate Detailed Feature Specifications (Release Candidate v1.0.0)

## 1. Core Architecture (Phase 1)
* Manifest V3 비동기 서비스 워커 지원
* 스토리지 버전 관리 및 마이그레이션 프레임워크 (v1.0.0)
* LRU & TTL 2단계 메모리 캐시 지원

## 2. Dedicated Parsers & Navigation (Phase 2)
* 메이저, 마이너, 미니 갤러리 파서
* 호버 미리보기 팝오버 (300ms delay, AbortController, Esc 닫기)
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
