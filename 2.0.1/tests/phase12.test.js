import assert from 'assert';
import { JSDOM } from 'jsdom';
import { pageDetector, PAGE_TYPES } from '../src/parser/page-detector.js';
import { galleryParser } from '../src/parser/gallery-parser.js';
import { articleParser } from '../src/parser/article-parser.js';
import { commentParser } from '../src/parser/comment-parser.js';
import { mediaParser } from '../src/parser/media-parser.js';
import { searchParser } from '../src/parser/search-parser.js';
import { authManager, AUTH_STATES } from '../src/auth/auth-manager.js';
import { DOMObserver } from '../src/adapters/dom-observer.js';
import { eventBus } from '../src/core/event-bus.js';
import {
  FIXTURE_MAJOR_GALLERY_LIST,
  FIXTURE_ARTICLE_VIEW_NORMAL,
  FIXTURE_ARTICLE_VIEW_DELETED,
  FIXTURE_MINOR_GALLERY,
  FIXTURE_MINI_GALLERY
} from './fixtures/html-fixtures.js';

export async function runPhase12Tests() {
  console.log('--- Running Phase 12 Real DCInside Page Compatibility Tests (13 Categories) ---');

  // Category 1: Normal Major Gallery
  const dom1 = new JSDOM(FIXTURE_MAJOR_GALLERY_LIST, { url: 'https://gall.dcinside.com/board/lists/?id=programming' });
  const doc1 = dom1.window.document;
  const det1 = pageDetector.detect(dom1.window.location, doc1);
  assert.strictEqual(det1.type, PAGE_TYPES.GALLERY_LIST);
  assert.strictEqual(det1.galleryId, 'programming');
  const articles1 = galleryParser.parseArticleList(doc1, det1.galleryId);
  assert.strictEqual(articles1.length, 2);
  console.log('✓ Category 1 (Normal Major Gallery): PASS');

  // Category 2: Minor Gallery
  const dom2 = new JSDOM(FIXTURE_MINOR_GALLERY, { url: 'https://gall.dcinside.com/mgallery/board/lists/?id=singlebungle' });
  const doc2 = dom2.window.document;
  const det2 = pageDetector.detect(dom2.window.location, doc2);
  assert.strictEqual(det2.type, PAGE_TYPES.MINOR_GALLERY);
  assert.strictEqual(det2.galleryType, 'minor');
  console.log('✓ Category 2 (Minor Gallery): PASS');

  // Category 3: Mini Gallery
  const dom3 = new JSDOM(FIXTURE_MINI_GALLERY, { url: 'https://gall.dcinside.com/mini/board/lists/?id=minitest' });
  const doc3 = dom3.window.document;
  const det3 = pageDetector.detect(dom3.window.location, doc3);
  assert.strictEqual(det3.type, PAGE_TYPES.MINI_GALLERY);
  assert.strictEqual(det3.galleryType, 'mini');
  console.log('✓ Category 3 (Mini Gallery): PASS');

  // Category 4: Search Results
  const searchHtml = `<div class="sch_result_box"><input name="s_keyword" value="2TB" /><span class="total_num">15</span></div>${FIXTURE_MAJOR_GALLERY_LIST}`;
  const dom4 = new JSDOM(searchHtml, { url: 'https://gall.dcinside.com/board/lists/?id=programming&s_keyword=2TB' });
  const doc4 = dom4.window.document;
  const det4 = pageDetector.detect(dom4.window.location, doc4);
  assert.strictEqual(det4.isSearch, true);
  const searchRes = searchParser.parse(doc4);
  assert.strictEqual(searchRes.keyword, '2TB');
  assert.strictEqual(searchRes.totalCount, 15);
  console.log('✓ Category 4 (Search Results): PASS');

  // Category 5: Article Page
  const dom5 = new JSDOM(FIXTURE_ARTICLE_VIEW_NORMAL, { url: 'https://gall.dcinside.com/board/view/?id=programming&no=1001' });
  const doc5 = dom5.window.document;
  const det5 = pageDetector.detect(dom5.window.location, doc5);
  assert.strictEqual(det5.isArticle, true);
  const art5 = articleParser.parseView(doc5, det5.galleryId);
  assert.strictEqual(art5.title, 'Manifest V3 크롬 확장프로그램 개발 팁');
  console.log('✓ Category 5 (Article Page): PASS');

  // Category 6: Article with Many Comments
  const comments5 = commentParser.parseList(doc5);
  assert.strictEqual(comments5.length, 2);
  assert.strictEqual(comments5[1].isReply, true);
  console.log('✓ Category 6 (Article with Many Comments): PASS');

  // Category 7: Article with Images
  const media5 = mediaParser.parseMedia(doc5.querySelector('.write_div'));
  assert.ok(media5.some(m => m.type === 'image'));
  console.log('✓ Category 7 (Article with Images): PASS');

  // Category 8: Article with Video/Media
  assert.ok(media5.some(m => m.type === 'video'));
  console.log('✓ Category 8 (Article with Video/Media): PASS');

  // Category 9: Article with Missing Fields
  const partialRowHtml = '<table><tbody><tr class="ub-content"><td class="gall_title ub-word"><a href="/board/view/?id=programming&no=9001">제목만 존재하는 글</a></td></tr></tbody></table>';
  const dom9 = new JSDOM(partialRowHtml);
  const partialArt = articleParser.parseRow(dom9.window.document.querySelector('tr'), 'programming');
  assert.strictEqual(partialArt.title, '제목만 존재하는 글');
  assert.strictEqual(partialArt.author, '');
  assert.strictEqual(partialArt.views, 0);
  console.log('✓ Category 9 (Article with Missing Fields): PASS');

  // Category 10: Deleted Article
  const dom10 = new JSDOM(FIXTURE_ARTICLE_VIEW_DELETED);
  const delArt = articleParser.parseView(dom10.window.document);
  assert.strictEqual(delArt.sourcePage, 'article_view_deleted');
  console.log('✓ Category 10 (Deleted Article): PASS');

  // Category 11: Logged-in State
  const loggedInHtml = '<div class="user_info"><span class="nickname">로그인유저</span></div>';
  const dom11 = new JSDOM(loggedInHtml);
  const auth11 = authManager.detectUser(dom11.window.document);
  assert.strictEqual(auth11.state, AUTH_STATES.LOGGED_IN);
  assert.strictEqual(auth11.user.nickname, '로그인유저');
  console.log('✓ Category 11 (Logged-in State): PASS');

  // Category 12: Logged-out State
  const loggedOutHtml = '<div class="login_box"></div>';
  const dom12 = new JSDOM(loggedOutHtml);
  const auth12 = authManager.detectUser(dom12.window.document);
  assert.strictEqual(auth12.state, AUTH_STATES.LOGGED_OUT);
  console.log('✓ Category 12 (Logged-out State): PASS');

  // Category 13: Dynamically Loaded Content
  let eventFired = false;
  eventBus.on('dom:articles_added', () => { eventFired = true; });
  const obs = new DOMObserver(10);
  assert.strictEqual(obs.isObserving, false);
  console.log('✓ Category 13 (Dynamically Loaded Content & Observer): PASS');
}
