import assert from 'assert';
import { storageManager } from '../src/core/storage-manager.js';
import { configManager } from '../src/core/config-manager.js';
import { eventBus } from '../src/core/event-bus.js';
import { logger } from '../src/core/logger.js';
import { messageRouter } from '../src/core/message-router.js';
import { cacheManager } from '../src/core/cache-manager.js';
import { featureManager } from '../src/core/feature-manager.js';

import { galleryParser } from '../src/parser/gallery-parser.js';
import { articleParser } from '../src/parser/article-parser.js';
import { commentParser } from '../src/parser/comment-parser.js';
import { searchParser } from '../src/parser/search-parser.js';
import { mediaParser } from '../src/parser/media-parser.js';

import { searchEngine } from '../src/core/search/search-engine.js';
import { filterEngine, FILTER_ACTIONS } from '../src/core/filters/filter-engine.js';

import { hoverPreviewFeature } from '../src/features/hover-preview-feature.js';
import { readingLayoutFeature } from '../src/features/reading-layout-feature.js';
import { navigationFeature } from '../src/features/navigation-feature.js';
import { userNotesFeature } from '../src/features/user-notes-feature.js';
import { commentToolsFeature } from '../src/features/comment-tools-feature.js';
import { mediaToolsFeature } from '../src/features/media-tools-feature.js';
import { dataManager } from '../src/core/data-manager.js';
import { keywordAlertManager } from '../src/core/keyword-alert/keyword-alert-manager.js';
import { storageRepository } from '../src/core/storage-repository.js';
import { notificationManager } from '../src/core/notifications/notification-manager.js';
import { authManager } from '../src/auth/auth-manager.js';
import { aiFeature } from '../src/features/ai-feature.js';

export async function runPhase13QATests() {
  console.log('--- Running Phase 13 Exhaustive QA Test Suite (17 Feature Categories) ---');

  // 1. Core QA
  await storageManager.init();
  await configManager.init();
  assert.ok(configManager.get('theme') !== undefined);
  console.log('✓ 1. Core QA: PASS');

  // 2. Parser QA
  const nullArt = articleParser.parseRow(null);
  assert.strictEqual(nullArt, null);
  const emptyCmtList = commentParser.parseList(null);
  assert.deepStrictEqual(emptyCmtList, []);
  console.log('✓ 2. Parser QA: PASS');

  // 3. Search QA
  searchEngine.cancel();
  const emptyPage = searchEngine.getPage(99, 20);
  assert.strictEqual(emptyPage.items.length, 0);
  console.log('✓ 3. Search QA: PASS');

  // 4. Filter QA
  const nullEval = filterEngine.evaluate(null);
  assert.strictEqual(nullEval, null);
  console.log('✓ 4. Filter QA: PASS');

  // 5. Reading QA
  await hoverPreviewFeature.enable();
  hoverPreviewFeature.closePreview();
  await hoverPreviewFeature.disable();
  await readingLayoutFeature.enable();
  await readingLayoutFeature.disable();
  console.log('✓ 5. Reading QA: PASS');

  // 6. Navigation QA
  await navigationFeature.enable();
  navigationFeature.navigateArticle(1);
  await navigationFeature.disable();
  console.log('✓ 6. Navigation QA: PASS');

  // 7. User Notes QA
  await userNotesFeature.setNote('qa_user', 'QA 메모', false);
  const qaNote = await userNotesFeature.getNote('qa_user');
  assert.strictEqual(qaNote.note, 'QA 메모');
  await userNotesFeature.deleteNote('qa_user');
  console.log('✓ 7. User Notes QA: PASS');

  // 8. Comments QA
  const emptyCSV = commentToolsFeature.exportToCSV([]);
  assert.ok(emptyCSV.includes('ID,Author,IP'));
  console.log('✓ 8. Comments QA: PASS');

  // 9. Media QA
  const emptyMedia = mediaToolsFeature.deduplicateMedia([]);
  assert.deepStrictEqual(emptyMedia, []);
  console.log('✓ 9. Media QA: PASS');

  // 10. Bookmarks QA
  await storageManager.set({ bookmarks: [{ title: 'Bookmark QA', url: 'https://gall.dcinside.com/1' }] });
  const bmData = await storageManager.get('bookmarks');
  assert.strictEqual(bmData.bookmarks.length, 1);
  console.log('✓ 10. Bookmarks QA: PASS');

  // 11. History QA
  await navigationFeature.saveRecentGallery('programming');
  const histData = await storageManager.get('searchHistory');
  assert.ok(histData.searchHistory.includes('programming'));
  console.log('✓ 11. History QA: PASS');

  // 12. Import/Export QA
  const jsonExport = await dataManager.exportJSON();
  assert.ok(jsonExport.includes('schemaVersion'));
  console.log('✓ 12. Import/Export QA: PASS');

  // 13. Automation QA (AutomationEngine은 KeywordAlert 시스템으로 대체됨)
  await keywordAlertManager.initAlarms();
  await keywordAlertManager.handleAlarm('kw_alert:nonexistent'); // 없는 규칙은 조용히 무시
  assert.ok(Array.isArray(await storageRepository.getKeywordAlerts()));
  console.log('✓ 13. Automation QA: PASS');

  // 14. Notifications QA
  notificationManager.notify('qa_notif', 'QA 알림', '내용');
  console.log('✓ 14. Notifications QA: PASS');

  // 15. Authentication QA
  const loginUrl = authManager.getLoginUrl();
  assert.ok(loginUrl.includes('login.php'));
  console.log('✓ 15. Authentication QA: PASS');

  // 16. AI QA
  const localSummary = await aiFeature.summarizeArticle('테스트 본문 텍스트입니다. 단원 테스트 진행 중.');
  assert.ok(localSummary.length > 0);
  console.log('✓ 16. AI QA: PASS');

  // 17. UI Settings QA
  await configManager.reset();
  assert.strictEqual(configManager.get('theme'), 'system');
  console.log('✓ 17. UI Settings QA: PASS');
}
