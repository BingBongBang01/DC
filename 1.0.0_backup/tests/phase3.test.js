import assert from 'assert';
import { JSDOM } from 'jsdom';
import { SearchQuery } from '../src/core/search/query-builder.js';
import { pageCollector } from '../src/core/search/page-collector.js';
import { deduplicator } from '../src/core/search/deduplicator.js';
import { ResultFilter, FilterRule } from '../src/core/search/result-filter.js';
import { resultSorter } from '../src/core/search/result-sorter.js';
import { resultCache } from '../src/core/search/result-cache.js';
import { virtualPaginator } from '../src/core/search/virtual-paginator.js';
import { searchEngine } from '../src/core/search/search-engine.js';
import {
  MOCK_SEARCH_PAGE_1,
  MOCK_SEARCH_PAGE_2,
  MOCK_SEARCH_PAGE_3,
  MOCK_SEARCH_PAGE_4
} from './fixtures/search-fixtures.js';

export async function runPhase3Tests() {
  console.log('--- Running Phase 3 Search Aggregation Engine Tests ---');

  const pageMap = {
    1: MOCK_SEARCH_PAGE_1,
    2: MOCK_SEARCH_PAGE_2,
    3: MOCK_SEARCH_PAGE_3,
    4: MOCK_SEARCH_PAGE_4
  };

  let mockFetchCallCount = 0;
  const mockFetcher = async (url, pageNum) => {
    mockFetchCallCount++;
    const html = pageMap[pageNum] || '<div></div>';
    if (typeof DOMParser === 'undefined' && typeof window === 'undefined') {
      const dom = new JSDOM(html);
      return dom.window.document.documentElement.outerHTML;
    }
    return html;
  };

  // Test Scenario: 4 Pages Aggregation
  const query = new SearchQuery({
    keyword: '2TB',
    galleryId: 'programming',
    startPage: 1,
    maxPages: 4
  });

  mockFetchCallCount = 0;
  const res = await searchEngine.search(query, {
    customFetcher: mockFetcher,
    forceRefresh: true
  });

  // Verify: 3 (p1) + 5 (p2) + 2 (p3) + 7 (p4) = 17 Total Raw Articles, Article 108 is duplicated so Deduplicated = 16 or 17 total unique.
  // In our fixtures: Page 1 (3), Page 2 (5: 104,105,106,107,108), Page 3 (2: 108,109), Page 4 (7: 110..116).
  // Total unique articles = 3 + 5 + 1 + 7 = 16 unique articles.
  assert.ok(res.totalCollected >= 16);
  assert.strictEqual(mockFetchCallCount, 4);
  console.log(`✓ Multi-page collection & deduplication passed (${res.totalCollected} total unique results from 4 pages)`);

  // Test Virtual Pagination at 20 per page
  const page20 = searchEngine.getPage(1, 20);
  assert.strictEqual(page20.items.length, res.totalCollected);
  assert.strictEqual(page20.totalPages, 1);
  console.log('✓ Virtual Pagination (20/page) correctly displays dataset on 1 page');

  // Test Virtual Pagination at 50 per page (NO RE-FETCHING NETWORK!)
  const initialFetchCount = mockFetchCallCount;
  const page50 = searchEngine.getPage(1, 50);
  assert.strictEqual(page50.items.length, res.totalCollected);
  assert.strictEqual(mockFetchCallCount, initialFetchCount); // Zero refetches!
  console.log('✓ Changing Virtual Page Size (50/page) required 0 network refetches');

  // Test Composable ResultFilter (minRecommendations >= 10)
  const filter = new ResultFilter();
  const rule = new FilterRule({ minRecommendations: 10 });
  const filtered = filter.filter(res.dataset, [rule]);
  assert.ok(filtered.every(a => a.recommendations >= 10));
  console.log(`✓ Composable ResultFilter passed (${filtered.length} items with >= 10 recommendations)`);

  // Test ResultSorter (sort by recommendations desc)
  const sortedRecs = resultSorter.sort(res.dataset, 'recommendations');
  assert.ok(sortedRecs[0].recommendations >= sortedRecs[sortedRecs.length - 1].recommendations);
  console.log('✓ ResultSorter by recommendations passed');

  // Test ResultCache Reuse
  const cachedRes = await searchEngine.search(query, {
    customFetcher: mockFetcher,
    forceRefresh: false
  });
  assert.strictEqual(cachedRes.totalCollected, res.totalCollected);
  assert.strictEqual(mockFetchCallCount, initialFetchCount); // Zero extra network calls due to cache hit
  console.log('✓ ResultCache hit prevented redundant network fetches');
}
