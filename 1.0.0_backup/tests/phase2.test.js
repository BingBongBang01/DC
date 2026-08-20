import assert from 'assert';
import { JSDOM } from 'jsdom';
import { galleryParser } from '../src/parser/gallery-parser.js';
import { articleParser } from '../src/parser/article-parser.js';
import { commentParser } from '../src/parser/comment-parser.js';
import { searchParser } from '../src/parser/search-parser.js';
import { mediaParser } from '../src/parser/media-parser.js';
import {
  FIXTURE_MAJOR_GALLERY_LIST,
  FIXTURE_ARTICLE_VIEW_NORMAL,
  FIXTURE_ARTICLE_VIEW_DELETED,
  FIXTURE_MINOR_GALLERY,
  FIXTURE_MINI_GALLERY
} from './fixtures/html-fixtures.js';

function createDocument(html) {
  if (typeof document !== 'undefined' && document.createElement) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }
  // Node env fallback using simulated DOM wrapper if JSDOM is unavailable
  return {
    querySelector: (sel) => null,
    querySelectorAll: (sel) => []
  };
}

export async function runPhase2Tests() {
  console.log('--- Running Phase 2 Parser & Fixture Tests (JSDOM-based, NOT real browser E2E) ---');

  // Test 1: Major Gallery List Fixture Parsing
  {
    const dom = new JSDOM(FIXTURE_MAJOR_GALLERY_LIST);
    const doc = dom.window.document;

    const header = galleryParser.parseHeader(doc);
    assert.strictEqual(header.id, 'programming');
    assert.strictEqual(header.name, '프로그래밍 갤러리');

    const articles = articleParser.parseList(doc, 'programming');
    assert.strictEqual(articles.length, 2);
    assert.strictEqual(articles[0].id, '1001');
    assert.strictEqual(articles[0].title, 'JS 비동기 질문입니다 [3]');
    assert.strictEqual(articles[0].comments, 3);
    assert.strictEqual(articles[0].author, '개발자');
    assert.strictEqual(articles[0].authorId, 'dev123');
    assert.strictEqual(articles[0].ip, '121.168');
    assert.strictEqual(articles[0].recommendations, 5);

    assert.strictEqual(articles[1].hasImage, true);
    console.log('✓ Major Gallery list fixture parsing passed');
  }

  // Test 2: Normal Article View & Media Parsing
  {
    const dom = new JSDOM(FIXTURE_ARTICLE_VIEW_NORMAL);
    const doc = dom.window.document;

    const article = articleParser.parseView(doc, 'programming');
    assert.strictEqual(article.title, 'Manifest V3 크롬 확장프로그램 개발 팁');
    assert.strictEqual(article.author, '코드마스터');
    assert.strictEqual(article.recommendations, 42);
    assert.strictEqual(article.hasImage, true);
    assert.strictEqual(article.hasVideo, true);

    const comments = commentParser.parseList(doc);
    assert.strictEqual(comments.length, 2);
    assert.strictEqual(comments[0].author, '유저A');
    assert.strictEqual(comments[1].isReply, true);
    console.log('✓ Article view & media fixture parsing passed');
  }

  // Test 3: Deleted Article Handling
  {
    const dom = new JSDOM(FIXTURE_ARTICLE_VIEW_DELETED);
    const doc = dom.window.document;
    const deletedArticle = articleParser.parseView(doc);
    assert.strictEqual(deletedArticle.sourcePage, 'article_view_deleted');
    console.log('✓ Deleted article handling passed');
  }

  // Test 4: Minor Gallery List Parsing
  {
    const dom = new JSDOM(FIXTURE_MINOR_GALLERY);
    const doc = dom.window.document;
    const articles = articleParser.parseList(doc);
    assert.strictEqual(articles.length, 1);
    assert.strictEqual(articles[0].title, '오늘자 짤방 레전드');
    console.log('✓ Minor Gallery fixture parsing passed');
  }

  // Test 5: Mini Gallery List Parsing
  {
    const dom = new JSDOM(FIXTURE_MINI_GALLERY);
    const doc = dom.window.document;
    const articles = articleParser.parseList(doc);
    assert.strictEqual(articles.length, 1);
    assert.strictEqual(articles[0].title, '미니 갤러리 글입니다');
    console.log('✓ Mini Gallery fixture parsing passed');
  }

  // Test 6: Parser Robustness & Isolation
  {
    // 6.1 Malformed HTML
    const malformedDOM = new JSDOM('<div><table class="gall_list"><tbody><tr class="ub-content"><td>Malformed</td></tr></tbody></table></div>');
    const malformedDoc = malformedDOM.window.document;
    const malformedArticles = articleParser.parseList(malformedDoc);
    assert.strictEqual(malformedArticles.length, 0); // Fails gracefully (missing title)

    // 6.2 Missing Author/Date/Image
    const missingDOM = new JSDOM('<div><table class="gall_list"><tbody><tr class="ub-content"><td class="gall_title"><a href="/board/view/?id=test&no=999">No Author</a></td></tr></tbody></table></div>');
    const missingDoc = missingDOM.window.document;
    const missingArticles = articleParser.parseList(missingDoc);
    assert.strictEqual(missingArticles.length, 1);
    assert.strictEqual(missingArticles[0].title, 'No Author');
    assert.strictEqual(missingArticles[0].author, ''); // Defaults to empty string
    assert.strictEqual(missingArticles[0].date, null); // Defaults to null
    assert.strictEqual(missingArticles[0].hasImage, false);

    // 6.3 Empty Result Page
    const emptyDOM = new JSDOM('<div><table class="gall_list"><tbody></tbody></table></div>');
    const emptyDoc = emptyDOM.window.document;
    assert.strictEqual(articleParser.parseList(emptyDoc).length, 0);

    // 6.4 Malformed Comment
    const cmtDOM = new JSDOM('<ul class="cmt_list"><li class="ub-content" data-no="1"><span class="cmt_nick">User</span></li></ul>');
    const cmtDoc = cmtDOM.window.document;
    const cmts = commentParser.parseList(cmtDoc);
    // Missing content, so gracefully returns empty or safely parses nick without content
    assert.ok(cmts.length === 1 || cmts.length === 0);
    if (cmts.length === 1) {
      assert.strictEqual(cmts[0].author, 'User');
      assert.strictEqual(cmts[0].content, '');
    }

    console.log('✓ Parser robustness (missing fields, malformed HTML, empty pages) passed');
  }
}
