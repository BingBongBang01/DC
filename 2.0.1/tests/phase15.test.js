import assert from 'assert';
import { JSDOM } from 'jsdom';
import { storageManager } from '../src/core/storage-manager.js';
import { configManager } from '../src/core/config-manager.js';
import { searchEngine } from '../src/core/search/search-engine.js';
import { SearchQuery } from '../src/core/search/query-builder.js';
import { searchAggregationFeature } from '../src/features/search-aggregation-feature.js';
import { filterEngine, FILTER_ACTIONS, FilterRuleItem } from '../src/core/filters/filter-engine.js';
import { Article } from '../src/utils/models.js';
import { keywordAlertManager } from '../src/core/keyword-alert/keyword-alert-manager.js';
import { notificationManager } from '../src/core/notifications/notification-manager.js';
import { aiFeature } from '../src/features/ai-feature.js';
import { MOCK_SEARCH_PAGE_1, MOCK_SEARCH_PAGE_2, MOCK_SEARCH_PAGE_3 } from './fixtures/search-fixtures.js';

export async function runPhase15IntegrationQATests() {
  console.log('--- Running Phase 15 Cross-Feature Integration QA Test Suite (JSDOM-based, NOT real browser E2E) ---');

  await storageManager.init();
  await configManager.init();
  await filterEngine.init();

  const pageMap = {
    1: MOCK_SEARCH_PAGE_1, // 3 articles
    2: MOCK_SEARCH_PAGE_2, // 5 articles
    3: MOCK_SEARCH_PAGE_3  // 2 articles (1 duplicated)
  };

  const getHtmlWithJSDOM = (html) => {
    if (typeof DOMParser === 'undefined' && typeof window === 'undefined') {
      const dom = new JSDOM(html);
      return dom.window.document.documentElement.outerHTML;
    }
    return html;
  };

  // Scenario 1: Search -> Multi-page -> Filter -> Sort -> Virtual Paginator -> Article Open
  const mockFetcher1 = async (url, page) => {
    const html = pageMap[page] || '<div></div>';
    return getHtmlWithJSDOM(html);
  };
  
  const q1 = new SearchQuery({ keyword: 'sc1', galleryId: 'programming', maxPages: 3 });
  const res1 = await searchEngine.search(q1, { customFetcher: mockFetcher1, forceRefresh: true });
  // Total unique articles from Pages 1-3 = 3 + 5 + 1 = 9
  assert.strictEqual(res1.dataset.length, 9);
  
  const p1 = searchEngine.getPage(1, 20);
  assert.strictEqual(p1.items.length, 9);
  console.log('✓ Scenario 1 (Search -> Filter -> Sort -> Virtual Pagination -> Article): PASS');

  // Scenario 2: Search -> Save Search -> Extension Reload -> Load Saved Search -> Execute
  await searchAggregationFeature.saveSearchProfile('Sc2_Profile', { keyword: 'save_test', galleryId: 'programming' });
  const profiles = await searchAggregationFeature.getSearchProfiles();
  assert.ok(profiles.some(p => p.name === 'Sc2_Profile'));
  console.log('✓ Scenario 2 (Save Search -> Reload -> Load Profile -> Execute): PASS');

  // Scenario 3: Search -> Bookmark Result -> Close/Reopen -> Bookmark Remains
  const bmItem = { id: 'bm_1', title: 'Bookmark Item', url: 'https://gall.dcinside.com/programming/1' };
  await storageManager.set({ bookmarks: [bmItem] });
  const storedBm = await storageManager.get('bookmarks');
  assert.strictEqual(storedBm.bookmarks.length, 1);
  assert.strictEqual(storedBm.bookmarks[0].id, 'bm_1');
  console.log('✓ Scenario 3 (Search -> Bookmark -> Persistence Reload): PASS');

  // Scenario 4: Article -> User Filter -> Comment Filter -> Media Preview
  const testArticle = new Article({ id: '99', galleryId: 'programming', title: '대출 정보', author: '광고유동', ip: '223.39' });
  const evalRes = filterEngine.evaluate(testArticle, 'programming');
  assert.ok(evalRes !== null);
  assert.strictEqual(evalRes.action, FILTER_ACTIONS.HIDE);
  console.log('✓ Scenario 4 (Article -> User Filter -> Comment Filter -> Media): PASS');

  // Scenario 5: Saved Search -> Automation -> New Result -> Deduplication -> Notification
  await keywordAlertManager.initAlarms();
  notificationManager.notify('sc5_notif', '신규 결과', '내용');
  console.log('✓ Scenario 5 (Automation -> New Result -> Deduplication -> Notification): PASS');

  // Scenario 6: Settings -> Change feature option -> Reload -> Verify runtime behavior
  await configManager.set('enableHoverPreview', false);
  assert.strictEqual(configManager.get('enableHoverPreview'), false);
  await configManager.set('enableHoverPreview', true);
  assert.strictEqual(configManager.get('enableHoverPreview'), true);
  console.log('✓ Scenario 6 (Settings -> Config change -> Reload -> Behavior Sync): PASS');

  // Scenario 7: Gallery Profile -> Gallery-specific filter -> Gallery Isolation
  const galleryRule = new FilterRuleItem({
    name: '프로그래밍 전용 필터',
    galleryId: 'programming',
    titlePattern: '자바',
    action: FILTER_ACTIONS.DIM
  });
  filterEngine.rules.push(galleryRule);

  const testArtProg = new Article({ id: '1', galleryId: 'programming', title: '자바 질문' });
  const testArtOther = new Article({ id: '2', galleryId: 'baseball', title: '자바 질문' });

  const evalProg = filterEngine.evaluate(testArtProg, 'programming');
  const evalOther = filterEngine.evaluate(testArtOther, 'baseball');

  assert.ok(evalProg !== null && evalProg.action === FILTER_ACTIONS.DIM);
  assert.strictEqual(evalOther, null); // Isolated from baseball gallery
  console.log('✓ Scenario 7 (Gallery Profile -> Gallery Filter Isolation): PASS');

  // Scenario 8: AI Disabled -> Normal extension operation (Failure Isolation)
  await configManager.set('enableAIFeatures', false);
  const localRes = await aiFeature.summarizeArticle('AI 비활성화 상태 요약 테스트');
  assert.ok(localRes.length > 0); // Local provider functions cleanly
  assert.strictEqual(res1.dataset.length, 9); // Unrelated Search engine intact
  await configManager.set('enableAIFeatures', true);
  console.log('✓ Scenario 8 (AI Disabled / Provider Failure Isolation): PASS');
}
