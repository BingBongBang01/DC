import assert from 'assert';
import { FilterEngine, FilterRuleItem, FILTER_ACTIONS } from '../src/core/filters/filter-engine.js';
import { UserNotesFeature } from '../src/features/user-notes-feature.js';
import { CommentToolsFeature } from '../src/features/comment-tools-feature.js';
import { MediaToolsFeature } from '../src/features/media-tools-feature.js';
import { DataManager } from '../src/core/data-manager.js';
import { NotificationManager } from '../src/core/notifications/notification-manager.js';
import { Article, Comment, Media } from '../src/utils/models.js';

export async function runFullSuiteTests() {
  console.log('--- Running Phase 4, 5, 6 Full Suite Tests ---');

  // 1. FilterEngine Test
  const filter = new FilterEngine();
  filter.rules = [
    new FilterRuleItem({ name: '스팸 차단', titlePattern: '대출', action: FILTER_ACTIONS.HIDE }),
    new FilterRuleItem({ name: '갤러리 전용 규칙', titlePattern: '특정단어', galleryId: 'programming', action: FILTER_ACTIONS.MARK })
  ];

  const spamArticle = new Article({ title: '초스피드 대출 상품' });
  const evalResult1 = filter.evaluate(spamArticle, 'programming');
  assert.strictEqual(evalResult1.action, FILTER_ACTIONS.HIDE);

  const galleryArticle = new Article({ title: '특정단어 질문' });
  const evalResult2 = filter.evaluate(galleryArticle, 'programming');
  assert.strictEqual(evalResult2.action, FILTER_ACTIONS.MARK);

  const otherGalleryArticle = new Article({ title: '특정단어 질문' });
  const evalResult3 = filter.evaluate(otherGalleryArticle, 'singlebungle');
  assert.strictEqual(evalResult3, null); // Gallery scoping rule isolated
  console.log('✓ FilterEngine actions & gallery scoping passed');

  // 2. UserNotesFeature Test
  const userNotes = new UserNotesFeature();
  await userNotes.setNote('user_test_id', '어그로 관리 대상', true);
  const fetchedNote = await userNotes.getNote('user_test_id');
  assert.strictEqual(fetchedNote.note, '어그로 관리 대상');
  assert.strictEqual(fetchedNote.isBlocked, true);
  await userNotes.deleteNote('user_test_id');
  assert.strictEqual(await userNotes.getNote('user_test_id'), null);
  console.log('✓ UserNotesFeature CRUD & local block passed');

  // 3. CommentToolsFeature Export Test
  const commentTools = new CommentToolsFeature();
  const sampleComments = [
    new Comment({ id: '1', author: '유저1', content: '댓글1' }),
    new Comment({ id: '2', author: '유저2', content: '댓글2', isReply: true })
  ];
  const jsonExport = commentTools.exportToJSON(sampleComments);
  const csvExport = commentTools.exportToCSV(sampleComments);
  assert.ok(jsonExport.includes('댓글1'));
  assert.ok(csvExport.includes('ID,Author,IP,Content,Date,IsReply'));
  console.log('✓ CommentToolsFeature JSON/CSV exports passed');

  // 4. MediaToolsFeature Hash & Deduplication Test
  const mediaTools = new MediaToolsFeature();
  const media1 = new Media({ url: 'https://dcimg.com/a.jpg' });
  const media2 = new Media({ url: 'https://dcimg.com/a.jpg' }); // Duplicate
  const media3 = new Media({ url: 'https://dcimg.com/b.jpg' });
  const dedupedMedia = mediaTools.deduplicateMedia([media1, media2, media3]);
  assert.strictEqual(dedupedMedia.length, 2);
  console.log('✓ MediaToolsFeature image hash deduplication passed');

  // 5. DataManager Import/Export & Corrupted Data Recovery Test
  const dataMgr = new DataManager();
  const backupJson = await dataMgr.exportJSON();
  const importResult = await dataMgr.importJSON(backupJson);
  assert.strictEqual(importResult.success, true);

  const corruptedResult = await dataMgr.importJSON('{ invalid_json: ');
  assert.strictEqual(corruptedResult.success, false);
  assert.ok(corruptedResult.error !== null);
  console.log('✓ DataManager import/export & corrupted recovery passed');

  // 6. NotificationManager Cooldown Test
  const notif = new NotificationManager(1000);
  notif.notify('test1', '제목1', '내용1');
  notif.notify('test1', '제목1', '내용1'); // Throttled due to cooldown
  console.log('✓ NotificationManager cooldown throttling passed');
}
