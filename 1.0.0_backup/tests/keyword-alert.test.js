/**
 * Keyword Alert Pipeline Tests
 * Covers the DOM-free list parser used by the service worker, gallery-type
 * normalization, keyword matching, and the full baseline -> new post -> alert
 * scan flow with a mocked network layer.
 */
import assert from 'assert';
import { parseListHtml } from '../src/core/keyword-alert/list-page-parser.js';
import { normalizeGalleryType, buildGalleryListUrl } from '../src/core/gallery-context.js';
import { queryBuilder, SearchQuery } from '../src/core/search/query-builder.js';
import { matchPost } from '../src/core/keyword-alert/keyword-matcher.js';
import { keywordAlertManager } from '../src/core/keyword-alert/keyword-alert-manager.js';
import { galleryScanScheduler } from '../src/core/keyword-alert/gallery-scan-scheduler.js';
import { requestScheduler } from '../src/core/search/request-scheduler.js';
import { storageRepository } from '../src/core/storage-repository.js';

// The chrome mock in test-env.js predates these APIs; the alert manager uses
// them to reconcile alarms.
if (global.chrome && global.chrome.alarms && !global.chrome.alarms.getAll) {
  global.chrome.alarms.getAll = async () => [];
  global.chrome.alarms.clear = async () => true;
}

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
  let counter = 0;
  try {
    globalThis.crypto = {
      ...(globalThis.crypto || {}),
      randomUUID: () => `test-uuid-${++counter}`
    };
  } catch (err) {
    // Node already provides a non-writable crypto global — nothing to do.
  }
}

/**
 * Builds a DCInside-shaped gallery list page, always prefixed with a notice row
 * (which must never trigger an alert).
 * @param {Array<{id: string, title: string, author?: string, comments?: number, views?: number}>} posts
 * @returns {string}
 */
function buildListPage(posts) {
  const row = (p, dataType) => `
    <tr class="ub-content us-post" data-no="${p.id}" data-type="${dataType}">
      <td class="gall_num">${p.id}</td>
      <td class="gall_tit ub-word">
        <a href="/board/view/?id=programming&no=${p.id}&page=1"><em class="icon_img icon_txt"></em>${p.title}</a>
        <a class="reply_numbox" href="/board/view/?id=programming&no=${p.id}&t=cv"><span class="reply_num">[${p.comments || 0}]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="${p.author || '프갤러'}" data-uid="" data-ip="1.228">
        <span class="nickname"><em>${p.author || '프갤러'}</em></span>
      </td>
      <td class="gall_date" title="2026-08-09 13:02:45">13:02</td>
      <td class="gall_count">${p.views || 0}</td>
      <td class="gall_recommend">0</td>
    </tr>`;

  const notice = row({ id: '1', title: '공지 나눔 이벤트 안내', author: '운영자' }, 'icon_notice');
  return `<table class="gall_list"><tbody>${notice}${posts.map(p => row(p, 'icon_txt')).join('')}</tbody></table>`;
}

export async function runKeywordAlertTests() {
  console.log('--- Running Keyword Alert Tests ---');

  // 1. DOM-free list parser (the MV3 service worker has no DOMParser)
  const html = buildListPage([
    { id: '100', title: '그래픽카드 나눔합니다', author: 'giver', comments: 3, views: 42 },
    { id: '99', title: '오늘 날씨 잡담', author: 'chatty', comments: 0, views: 7 }
  ]);
  const parsed = parseListHtml(html, 'programming');

  assert.strictEqual(parsed.length, 2, 'Notice rows must be excluded from scans');
  assert.strictEqual(parsed[0].id, '100');
  assert.strictEqual(parsed[0].title, '그래픽카드 나눔합니다');
  assert.strictEqual(parsed[0].author, 'giver');
  assert.strictEqual(parsed[0].comments, 3);
  assert.strictEqual(parsed[0].views, 42);
  assert.strictEqual(parsed[0].date, '2026-08-09 13:02:45');
  assert.strictEqual(
    parsed[0].url,
    'https://gall.dcinside.com/board/view/?id=programming&no=100&page=1',
    'Relative hrefs must be absolutized'
  );
  assert.strictEqual(parseListHtml('', 'programming').length, 0);
  console.log('✅ [KeywordAlert] DOM-free list parser extracts posts and skips notices');

  // 2. Gallery type vocabularies must resolve to the right list URL
  assert.strictEqual(normalizeGalleryType('mgallery'), 'minor');
  assert.strictEqual(normalizeGalleryType('minor'), 'minor');
  assert.strictEqual(normalizeGalleryType('mini'), 'mini');
  assert.strictEqual(normalizeGalleryType('board'), 'major');
  assert.ok(buildGalleryListUrl('abc', 'mgallery').includes('/mgallery/board/lists/'));
  assert.ok(buildGalleryListUrl('abc', 'mini').includes('/mini/board/lists/'));
  assert.ok(
    queryBuilder.buildUrl(new SearchQuery({ galleryId: 'abc', galleryType: 'mgallery' })).includes('/mgallery/board/lists/'),
    'QueryBuilder must understand the GalleryContext vocabulary too'
  );
  console.log('✅ [KeywordAlert] Minor/mini gallery types build the correct list URL');

  // 3. Keyword matching modes
  const rule = { enabled: true, keywords: ['나눔'], target: 'title', matchMode: 'contains' };
  assert.deepStrictEqual(matchPost({ title: '그래픽카드 나눔합니다' }, rule), ['나눔']);
  assert.deepStrictEqual(matchPost({ title: '아무 관계 없는 글' }, rule), []);
  assert.deepStrictEqual(
    matchPost({ title: '나눔' }, { ...rule, matchMode: 'exact' }),
    ['나눔']
  );
  assert.deepStrictEqual(
    matchPost({ title: 'RTX 5090 나눔' }, { ...rule, keywords: ['RTX\\s?50\\d0'], matchMode: 'regex' }),
    ['RTX\\s?50\\d0']
  );
  assert.deepStrictEqual(matchPost({ title: '나눔' }, { ...rule, enabled: false }), [], 'Disabled rules never match');
  console.log('✅ [KeywordAlert] Keyword matcher honours contains/exact/regex modes');

  // 4. End-to-end scan: baseline -> new post -> notification -> dedupe
  const originalFetchPage = requestScheduler.fetchPage;
  let servedHtml = html;
  requestScheduler.fetchPage = async () => servedHtml;

  try {
    await storageRepository.saveKeywordAlerts([]);
    await storageRepository.saveKeywordNotifications([]);

    const created = await keywordAlertManager.addAlert({
      gallery: { id: 'programming', type: 'board', name: '프로그래밍', url: 'https://gall.dcinside.com/board/lists/?id=programming' },
      keywords: ['나눔'],
      matchMode: 'contains',
      pollingIntervalMinutes: 5,
      notifyPanel: false,
      notifyChrome: false
    });
    assert.ok(created.id, 'addAlert must return the stored rule');

    // addAlert kicks off its own baseline scan without awaiting it; let that
    // settle, then reset the rule so the baseline path below is deterministic.
    await new Promise(resolve => setTimeout(resolve, 20));
    const pending = await storageRepository.getKeywordAlerts();
    pending[0].initialized = false;
    pending[0].lastSeenPostId = null;
    await storageRepository.saveKeywordAlerts(pending);
    await storageRepository.saveKeywordNotifications([]);

    // The first scan only records a baseline, so nothing is notified even though
    // post 100 matches the keyword.
    const baseline = await galleryScanScheduler.scanGallery('programming', 'board');
    assert.strictEqual(baseline.error, null, `baseline scan failed: ${baseline.error}`);
    assert.strictEqual(baseline.notified, 0, 'First scan must not notify');
    assert.strictEqual(baseline.baselineMatches, 1, 'Baseline reports how many current posts match');

    let stored = await storageRepository.getKeywordAlerts();
    assert.strictEqual(stored[0].initialized, true);
    assert.strictEqual(stored[0].lastSeenPostId, '100');
    assert.strictEqual((await storageRepository.getKeywordNotifications()).length, 0);

    // A newer matching post arrives.
    servedHtml = buildListPage([
      { id: '101', title: '키보드 무료 나눔', author: 'giver2' },
      { id: '100', title: '그래픽카드 나눔합니다', author: 'giver' },
      { id: '99', title: '오늘 날씨 잡담', author: 'chatty' }
    ]);

    const scan = await galleryScanScheduler.scanGallery('programming', 'board');
    assert.strictEqual(scan.error, null, `scan failed: ${scan.error}`);
    assert.strictEqual(scan.newPosts, 1, 'Only post 101 is newer than the baseline');
    assert.strictEqual(scan.notified, 1, 'The matching new post must produce one notification');

    const notifications = await storageRepository.getKeywordNotifications();
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].post.id, '101');
    assert.deepStrictEqual(notifications[0].matchedKeywords, ['나눔']);
    assert.strictEqual(notifications[0].read, false);
    console.log('✅ [KeywordAlert] New matching post creates exactly one notification');

    // Re-scanning the same page must not duplicate anything.
    const rescan = await galleryScanScheduler.scanGallery('programming', 'board');
    assert.strictEqual(rescan.newPosts, 0);
    assert.strictEqual(rescan.notified, 0);
    assert.strictEqual((await storageRepository.getKeywordNotifications()).length, 1);

    stored = await storageRepository.getKeywordAlerts();
    assert.strictEqual(stored[0].lastSeenPostId, '101');
    assert.strictEqual(stored[0].lastError, null);
    assert.strictEqual(stored[0].consecutiveFailures, 0);
    console.log('✅ [KeywordAlert] Repeat scans are idempotent (no duplicate alerts)');

    // 5. Network failures are recorded on the rule instead of thrown away
    requestScheduler.fetchPage = async () => { throw new Error('HTTP Error status: 403'); };
    const failed = await galleryScanScheduler.scanGallery('programming', 'board');
    assert.ok(failed.error && failed.error.includes('403'));
    stored = await storageRepository.getKeywordAlerts();
    assert.strictEqual(stored[0].consecutiveFailures, 1);
    assert.ok(stored[0].lastError.includes('403'));
    console.log('✅ [KeywordAlert] Scan failures are persisted for the UI to surface');

    // 6. Input validation
    await assert.rejects(
      () => keywordAlertManager.addAlert({ gallery: { id: 'programming' }, keywords: ['   '] }),
      /키워드/,
      'Empty keywords must be rejected'
    );
    await assert.rejects(
      () => keywordAlertManager.addAlert({ gallery: { id: 'programming' }, keywords: ['('], matchMode: 'regex' }),
      /정규식/,
      'Invalid regex keywords must be rejected'
    );
    await assert.rejects(
      () => keywordAlertManager.addAlert({ keywords: ['테스트'] }),
      /갤러리/,
      'A gallery target is required'
    );
    console.log('✅ [KeywordAlert] Alert validation rejects unusable rules');

    // Pausing then resuming must re-baseline so the user is not flooded.
    const alertId = (await storageRepository.getKeywordAlerts())[0].id;
    await keywordAlertManager.toggleAlert(alertId, false);
    const resumed = await keywordAlertManager.toggleAlert(alertId, true);
    assert.strictEqual(resumed.enabled, true);
    assert.strictEqual(resumed.initialized, false, 'Resuming a paused rule re-establishes the baseline');
    console.log('✅ [KeywordAlert] Resuming a paused rule re-baselines instead of backfilling');

    // Let the re-baseline scan triggered by the resume finish before cleanup.
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    requestScheduler.fetchPage = originalFetchPage;
    await storageRepository.saveKeywordAlerts([]);
    await storageRepository.saveKeywordNotifications([]);
  }

  console.log('--- Keyword Alert Tests Passed ---');
}
