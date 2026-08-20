# Remote Code Audit

## 1. eval() 검사
- **검색 패턴**: `eval(`, `window.eval(`, `globalThis.eval(`
- **검색 결과**: `node_modules/whatwg-url`, `node_modules/jsdom` 등 테스트 관련 모듈에서 발견.
- **발견 파일**: `node_modules/whatwg-url/lib/utils.js`, `node_modules/jsdom/lib/jsdom/browser/parser/xml.js` 등
- **분류**: 3. node_modules/외부 라이브러리 코드
- **실행 여부**: 확장 프로그램 실제 런타임(`src/`)에서는 실행되지 않음.
- **조치**: 스토어 제출용 패키지(ZIP) 생성 시 `node_modules` 전체를 제외 처리함. 런타임 코드 수정 불필요.

## 2. new Function() 검사
- **검색 패턴**: `new Function(`, `Function(`, `window.Function(`
- **검색 결과**: `node_modules/tough-cookie`, `node_modules/nwsapi`, `node_modules/@csstools` 등에서 발견.
- **발견 파일**: `node_modules/tough-cookie/lib/validators.js`, `node_modules/nwsapi/src/nwsapi.js` 등
- **분류**: 3. node_modules/외부 라이브러리 코드
- **실행 여부**: 확장 프로그램 실제 런타임(`src/`)에서는 실행되지 않음.
- **조치**: 스토어 패키지에서 제외 (`node_modules` 미포함).

## 3. 원격 script 삽입 검사
- **검색 패턴**: `<script src=`, `document.createElement('script')`, `script.src =`
- **검색 결과**: 테스트 HTML 파일(`dc.html`, `dc_search.html`) 내부의 정적 DCInside 소스 코드 및 `node_modules` 내부에서 발견.
- **발견 파일**: `tests/fixtures/dc.html`, `tests/fixtures/dc_search.html`, `node_modules/jsdom/lib/jsdom/level3/xpath.js` 등
- **분류**: 2. 개발/테스트 코드
- **실행 여부**: 런타임에서 실행되지 않음.
- **조치**: 테스트 파일(`dc.html`, `dc_search.html`)을 `tests/fixtures/`로 이동시키고, ZIP에서 제외 처리함.

## 4. AI API 통신 검사
- **검색 패턴**: `fetch(`
- **검색 결과**: `src/adapters/ai/ai-provider.js` 등에서 사용.
- **조치**: OpenAI/Gemini로 보내는 단순 HTTPS POST 데이터 통신(`fetch`)이며, 반환받은 JSON 데이터를 코드로 실행(`eval`)하지 않고 텍스트/데이터로만 처리함을 코드 수준에서 확인. Remote Code Execution이 아님.

## 5. auto-signature MAIN world 검사
- **검색 패턴**: MAIN world 설정 검증, `auto-sig-bridge.js` 로직 확인.
- **검색 결과**: `src/features/auto-signature-feature.js` 및 `src/content/auto-sig-bridge.js` 확인.
- **분류**: 1. 실제 확장 프로그램 코드
- **실행 여부**: 정적 JS 파일(`auto-sig-bridge.js`)로 메인 월드에 격리된 채 실행되며, `window.postMessage`로 안전하게 통신. 동적으로 외부 코드를 다운로드하거나 삽입하지 않음.
- **조치**: 안전한 구조이므로 기능 유지.

## 6. web_accessible_resources 검사
- **검색 결과**: 기존 `src/*`와 같이 포괄적으로 열려 있던 리소스 범위를 분석.
- **조치**: ES Module 동적 import(`loader.js`)에서 실제 로딩에 필요한 경로인 `src/content/*`, `src/core/*`, `src/features/*`, `src/adapters/*` 로 좁혀 명시함. 백그라운드 스크립트와 UI 스크립트는 차단됨.

## 7. node_modules 검사
- **조치**: 최종 스토어 업로드 ZIP 아카이브 빌드 시 `node_modules/` 자체를 완벽히 배제하도록 설정.

## 8. 최종 결론
- 본 확장 프로그램은 `eval()`, `new Function()` 등 동적 코드 평가 함수를 런타임에서 일절 사용하지 않습니다.
- 외부 자바스크립트를 런타임에 동적으로 삽입하거나 실행하는 코드가 전혀 존재하지 않습니다.
- AI 기능은 순수 데이터 통신 API로 구성되어 있으며 Remote Code와 무관함을 증명합니다.
- 최종 패키지는 순수 확장 프로그램 구동에 필수적인 파일만으로 깔끔하게 구성되어 Chrome Web Store 정책을 완전히 준수합니다.
