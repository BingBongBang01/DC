# DC Ultimate Testing Guide (Release Candidate v1.0.0)

## Test Suite Architecture

테스트 수트는 Node.js 환경 및 DOM 픽스처(jsdom / mock DOM)를 기반으로 작성되어 있으며 외부 서버 연결 없이 오프라인으로 완벽하게 동작합니다.

### Test Modules (19 Test Suites)

1. **`tests/core.test.js`**: Logger, EventBus, CacheManager, FeatureManager 검증
2. **`tests/storage.test.js`**: StorageManager v1.0.0 스키마 마이그레이션 및 ConfigManager 검증
3. **`tests/parser.test.js`**: PageDetector 정규식 패턴 및 정규화 데이터 모델 검증
4. **`tests/dom-observer.test.js`**: Debounce, Throttle 및 DOMObserver 분동 검증
5. **`tests/phase2.test.js`**: 갤러리 파서, 본문 파서, 댓글 파서, 미디어 파서 및 픽스처 검증
6. **`tests/phase3.test.js`**: 다중 페이지 수집, 중복 제거, 가상 페이지네이션 검증
7. **`tests/full-suite.test.js`**: 필터 비주얼 액션, 유저 노트, 댓글 내보내기, 이미지 해시 중복 감지, 데이터 백업/복원 검증
8. **`tests/phase7-8.test.js`**: 세션 인증 감지, 로컬 AI 요약, XSS Sanitizer 및 보안 검증
9. **`tests/phase12.test.js`**: 13개 실제 DCInside 카테고리 페이지 파싱 검증
10. **`tests/phase13.test.js`**: 17개 피처 영역 개별 QA 검증
11. **`tests/phase14.test.js`**: 다중 페이지 검색 수집 엔진 10대 심층 QA 검증
12. **`tests/phase15.test.js`**: 8대 크로스 피처 엔드투엔드 시스템 연동 시나리오 검증
13. **`tests/phase16.test.js`**: 스토리지 지속성, 손상 데이터 복구, SW 재시작 생명주기 검증
14. **`tests/phase17.test.js`**: 시동 속도, CPU/메모리, 검색 스케일링, 가상 페이지네이션 노드 절감 성능 측정
15. **`tests/phase18.test.js`**: DOM 주입 XSS 방지, API키 노출 0건, PII 마스킹 프라이버시 검증
16. **`tests/phase19.test.js`**: 10대 엔드투엔드 실제 유저 워크플로우 시나리오 검증
17. **`tests/release-candidate.test.js`**: Release Candidate 마스터 회귀 테스트 수트

---

## Running Tests

```bash
node tests/release-candidate.test.js
```
