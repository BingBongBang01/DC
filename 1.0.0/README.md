# DC Ultimate — Production Grade Chrome Extension for DCInside

**DC Ultimate v1.0.0 (Release Candidate)**는 디씨인사이드(DCInside) 이용 경험을 극대화하기 위해 개발된 크롬 확장 프로그램입니다.

Manifest V3 규격을 만족하며, 성능 최적화(Debounce/Throttle/LRU Cache/Virtual Pagination)와 XSS 보안 타격 방지(Sanitization) 조치가 적용되어 있습니다.

---

## 🚀 주요 기능 요약

* **다중 페이지 수집 엔진 (Phase 3 & 14)**: 여러 소스 페이지의 검색 결과를 1개 가상 결과로 수집하며 20 / 50 / 100 / 200개 단위 가상 페이지네이션 제공 (화면 조절 시 추가 네트워크 요청 0건).
* **읽기 모드 & 호버 미리보기 (Phase 2)**: 글 제목 마우스 호버 시 300ms 딜레이 후 본문/미디어/댓글 미리보기 팝오버 표시, 다단 독서 모드 지원.
* **중앙 필터 엔진 (Phase 4A)**: 제목, 내용, 작성자, IP, 추천수, 조회수, 미디어 유무, 정규식 기반 `HIDE`, `DIM`, `BLUR`, `COLLAPSE`, `MARK` 비주얼 액션 지원.
* **유저 노트 & 로컬 차단 (Phase 4B)**: 특정 유저 메모 작성, 로컬 차단 및 활동 내역 분석.
* **미디어 갤러리 (Phase 4D)**: 원본 이미지 팝업, 이미지 해시 기반 중복 감지.
* **백업 & 복원 (Phase 4E)**: 설정, 북마크, 유저 노트, 필터 규칙 JSON / CSV / HTML 백업 및 안전 복원.
* **알람 자동화 & 모니터링 (Phase 5)**: `chrome.alarms` 기반 배경 모니터링 및 쿨다운 데스크톱 알림.
* **AI 요약 & 분석 (Phase 7)**: 오프라인 로컬 규칙 기반 NLP 요약 및 OpenAI/Gemini 클라우드 API 연동 (프라이버시 PII 마스킹 처리 적용).

---

## 🛠️ 설치 방법 (Unpacked Load)

1. 이 저장소를 클론하거나 다운로드합니다.
2. 구글 크롬 브라우저를 열고 `chrome://extensions` 주소로 이동합니다.
3. 우측 상단의 **개발자 모드(Developer mode)** 스위치를 켭니다.
4. 왼쪽 상단의 **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 버튼을 클릭합니다.
5. `DC` 프로젝트 폴더를 선택합니다.

---

## 🧪 단원 테스트 실행

```bash
npm test
```
또는 `node tests/release-candidate.test.js` 명령어로 Phase 1부터 Phase 20까지의 전체 회귀 테스트를 수행할 수 있습니다.
