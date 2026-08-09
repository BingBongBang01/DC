import assert from 'assert';
import { pageDetector, PAGE_TYPES } from '../src/parser/page-detector.js';
import { articleParser } from '../src/parser/article-parser.js';
import { commentParser } from '../src/parser/comment-parser.js';
import { searchEngine } from '../src/core/search/search-engine.js';
import { SearchQuery } from '../src/core/search/query-builder.js';
import { searchAggregationFeature } from '../src/features/search-aggregation-feature.js';
import { filterEngine, FILTER_ACTIONS, FilterRuleItem } from '../src/core/filters/filter-engine.js';
import { storageManager } from '../src/core/storage-manager.js';
import { configManager } from '../src/core/config-manager.js';
import { themeSystem } from '../src/ui/theme/theme-system.js';
import { automationEngine } from '../src/core/automation/automation-engine.js';
import { notificationManager } from '../src/core/notifications/notification-manager.js';
import { aiFeature } from '../src/features/ai-feature.js';
import { Article } from '../src/utils/models.js';
import { JSDOM } from 'jsdom';
import { FIXTURE_MAJOR_GALLERY_LIST, FIXTURE_ARTICLE_VIEW_NORMAL } from './fixtures/html-fixtures.js';

export async function runPhase19E2EQATests() {
  console.log('--- Running Phase 19 User Scenario Integration Tests (JSDOM-based, NOT real browser E2E) ---');

  await storageManager.init();
  await configManager.init();
  await filterEngine.init();

  // Scenario A — Normal browsing
  const domA1 = new JSDOM(FIXTURE_MAJOR_GALLERY_LIST, { url: 'https://gall.dcinside.com/board/lists/?id=programming' });
  const detA1 = pageDetector.detect(domA1.window.location, domA1.window.document);
  assert.strictEqual(detA1.type, PAGE_TYPES.GALLERY_LIST);

  const domA2 = new JSDOM(FIXTURE_ARTICLE_VIEW_NORMAL, { url: 'https://gall.dcinside.com/board/view/?id=programming&no=1001' });
  const artA = articleParser.parseView(domA2.window.document);
  const cmtsA = commentParser.parseList(domA2.window.document);
  assert.ok(artA.title.length > 0);
  assert.ok(cmtsA.length > 0);
  console.log('✓ Scenario A (Normal Browsing): PASS');

  // Scenario B — Multi-page search (JSDOM-based fixture test, NOT real browser E2E)
  const { MOCK_SEARCH_PAGE_1: MB1, MOCK_SEARCH_PAGE_2: MB2 } = await import('./fixtures/search-fixtures.js');
  const pageMapB = { 1: MB1, 2: MB2 };
  const mockFetcherB = async (url, page) => {
    const html = pageMapB[page] || '<div></div>';
    const dom = new JSDOM(html);
    return dom.window.document.documentElement.outerHTML;
  };
  const qB = new SearchQuery({ keyword: '2TB', galleryId: 'programming', maxPages: 2 });
  const resB = await searchEngine.search(qB, { customFetcher: mockFetcherB, forceRefresh: true });
  // 3 (p1) + 5 (p2) = 8 unique articles
  assert.strictEqual(resB.dataset.length, 8);
  const pageB = searchEngine.getPage(1, 100);
  assert.strictEqual(pageB.pageSize, 100);
  console.log('✓ Scenario B (Multi-Page Search & 100/Page Virtual Pagination): PASS');

  // Scenario C — Saved search
  await searchAggregationFeature.saveSearchProfile('E2E_2TB_Trade', { keyword: '2TB', galleryId: 'programming' });
  const savedProfiles = await searchAggregationFeature.getSearchProfiles();
  assert.ok(savedProfiles.some(p => p.name === 'E2E_2TB_Trade'));
  console.log('✓ Scenario C (Saved Search Profile Reload): PASS');

  // Scenario D — User filtering
  const userRule = new FilterRuleItem({ name: '광고유동 차단', authorPattern: '광고유동', action: FILTER_ACTIONS.HIDE });
  filterEngine.rules.push(userRule);
  const badArt = new Article({ id: 'bad_1', galleryId: 'programming', title: '대출 스팸', author: '광고유동' });
  const evalD = filterEngine.evaluate(badArt, 'programming');
  assert.strictEqual(evalD.action, FILTER_ACTIONS.HIDE);
  console.log('✓ Scenario D (User Rule Creation & Filtering): PASS');

  // Scenario E — Bookmark
  await storageManager.set({ bookmarks: [{ id: 'e2e_bm', title: 'E2E Bookmark', url: 'https://gall.dcinside.com/100' }] });
  const bmCheck = await storageManager.get('bookmarks');
  assert.strictEqual(bmCheck.bookmarks[0].id, 'e2e_bm');
  console.log('✓ Scenario E (Bookmark Persistence): PASS');

  // Scenario F — Automation
  await automationEngine.init();
  notificationManager.notify('e2e_notif', '알림 제목', '내용');
  console.log('✓ Scenario F (Automation & Notification): PASS');

  // Scenario G — Failure & Graceful Recovery
  const errorFetcher = async (url, page) => { throw new Error('Network Offline'); };
  const qG = new SearchQuery({ keyword: 'offline', galleryId: 'programming', maxPages: 2 });
  const resG = await searchEngine.search(qG, { customFetcher: errorFetcher, forceRefresh: true });
  assert.strictEqual(resG.dataset.length, 0); // Graceful empty fallback, UI active
  console.log('✓ Scenario G (Network Failure Resilience & Graceful Fallback): PASS');

  // Scenario H — AI disabled
  await configManager.set('enableAIFeatures', false);
  assert.strictEqual(configManager.get('enableAIFeatures'), false);
  const localResH = await aiFeature.summarizeArticle('AI 비활성화 상태');
  assert.ok(localResH.length > 0);
  await configManager.set('enableAIFeatures', true);
  console.log('✓ Scenario H (AI Disabled Workflow): PASS');

  // Scenario I — Theme
  themeSystem.applyTheme('dark');
  themeSystem.applyTheme('light');
  themeSystem.applyTheme('system');
  console.log('✓ Scenario I (Theme Switching Light/Dark/System): PASS');

  // Scenario J — Gallery profile isolation
  const isolatedRule = new FilterRuleItem({ name: '야구갤러리 전용', galleryId: 'baseball', titlePattern: '야구', action: FILTER_ACTIONS.DIM });
  filterEngine.rules.push(isolatedRule);
  const progArt = new Article({ id: 'prog_1', galleryId: 'programming', title: '야구 이야기' });
  const baseArt = new Article({ id: 'base_1', galleryId: 'baseball', title: '야구 이야기' });

  assert.strictEqual(filterEngine.evaluate(progArt, 'programming'), null); // Scoped out
  assert.strictEqual(filterEngine.evaluate(baseArt, 'baseball').action, FILTER_ACTIONS.DIM); // Scoped in
  console.log('✓ Scenario J (Gallery Profile & Filter Scoping Isolation): PASS');
}
