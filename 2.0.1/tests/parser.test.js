import assert from 'assert';
import { PageDetector, PAGE_TYPES } from '../src/parser/page-detector.js';
import { Article, Comment, Gallery, User } from '../src/utils/models.js';

export async function runParserTests() {
  console.log('--- Running Parser & Page Detector Tests ---');

  const detector = new PageDetector();

  // Test Major Gallery List URL
  const listInfo = detector.detect({
    href: 'https://gall.dcinside.com/board/lists/?id=programming',
    pathname: '/board/lists/',
    search: '?id=programming'
  });
  assert.strictEqual(listInfo.type, PAGE_TYPES.GALLERY_LIST);
  assert.strictEqual(listInfo.galleryId, 'programming');
  assert.strictEqual(listInfo.galleryType, 'major');
  console.log('✓ Major Gallery list detection passed');

  // Test Minor Gallery Article View URL
  const viewInfo = detector.detect({
    href: 'https://gall.dcinside.com/mgallery/board/view/?id=singlebungle&no=100',
    pathname: '/mgallery/board/view/',
    search: '?id=singlebungle&no=100'
  });
  assert.strictEqual(viewInfo.type, PAGE_TYPES.ARTICLE_VIEW);
  assert.strictEqual(viewInfo.galleryId, 'singlebungle');
  assert.strictEqual(viewInfo.galleryType, 'minor');
  console.log('✓ Minor Gallery view detection passed');

  // Test Realtime Best Detection
  const bestInfo = detector.detect({
    href: 'https://gall.dcinside.com/board/lists/?id=dcbest',
    pathname: '/board/lists/',
    search: '?id=dcbest'
  });
  assert.strictEqual(bestInfo.type, PAGE_TYPES.REALTIME_BEST);
  console.log('✓ Realtime Best detection passed');

  // Test Model Instantiations with Null Safety & Data Loss Regression
  const article = new Article({ 
    title: 'Test Article', 
    views: 50,
    body: 'This is the article body.',
    media: [{ type: 'image', url: 'http://test.com/img.jpg' }]
  });
  assert.strictEqual(article.title, 'Test Article');
  assert.strictEqual(article.views, 50);
  assert.strictEqual(article.hasImage, false);
  assert.strictEqual(article.body, 'This is the article body.', 'Regression: Article body data loss');
  assert.strictEqual(article.media.length, 1, 'Regression: Article media data loss');
  console.log('✓ Article model instantiation & data preservation passed');

  const comment = new Comment({
    content: 'Test comment',
    recommendations: 42
  });
  assert.strictEqual(comment.content, 'Test comment');
  assert.strictEqual(comment.recommendations, 42, 'Regression: Comment recommendations data loss');
  
  const nullComment = new Comment({});
  assert.strictEqual(nullComment.recommendations, 0, 'Comment recommendations should default to 0');
  console.log('✓ Comment model instantiation & data preservation passed');
}
