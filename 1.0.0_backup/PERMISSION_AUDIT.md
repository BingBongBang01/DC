# Permission Audit

| Permission    | 사용 API               | 사용 파일 | 실제 필요성 | 최종 상태 |
| ------------- | -------------------- | ----- | ------ | ----- |
| storage       | chrome.storage       | src/core/storage-manager.js, src/core/storage-repository.js 등 | 설정 및 캐시 저장에 필수 | 유지    |
| sidePanel     | chrome.sidePanel     | src/background/index.js, src/ui/sidepanel/sidepanel.js 등 | 사이드 패널 UI 구동에 필수 | 유지    |
| activeTab     | 없음                   | -     | 사용 안 함 (Host Permissions + matches 로 충분) | 제거    |
| tabs          | chrome.tabs.query 등 | src/background/index.js, src/ui/sidepanel/sidepanel.js 등 | Host Permissions(*://*.dcinside.com/*)로 DCInside 탭의 URL 및 Context 접근이 가능하므로 불필요 | 제거    |
| alarms        | chrome.alarms        | src/core/keyword-alert/keyword-alert-manager.js 등 | 키워드 알림 주기적 폴링 및 예약 작업에 필수 | 유지    |
| notifications | chrome.notifications | src/core/keyword-alert/notification-manager.js 등 | 데스크톱 알림 발생에 필수 | 유지    |
