/**
 * Phase 22 Tests — 아카이빙 / 유저 분석 / 댓글 트리
 */
import assert from 'assert';
import {
  parseDcDate,
  summarizeUserActivity,
  galleryShareStats,
  suspiciousIpBands,
  buildCommentTree
} from '../src/core/archive/activity-analyzer.js';
import { ArchiveDB } from '../src/core/archive/archive-db.js';

export async function runPhase22Tests() {
  console.log('--- Running Phase 22 (Archive / Analytics) Tests ---');

  // 1. DC 날짜 표기 파싱
  const now = new Date(2026, 7, 19, 12, 0, 0).getTime(); // 2026-08-19 12:00
  assert.strictEqual(
    parseDcDate('2026-08-09 13:02:45', now),
    new Date(2026, 7, 9, 13, 2, 45).getTime(),
    '전체 날짜 문자열'
  );
  assert.strictEqual(parseDcDate('13:02', now), new Date(2026, 7, 19, 13, 2).getTime(), '오늘 글은 시:분만 표기');
  assert.strictEqual(parseDcDate('08.09', now), new Date(2026, 7, 9, 0, 0).getTime(), '지난 글은 월.일 표기');
  assert.strictEqual(parseDcDate('12.31', now), new Date(2025, 11, 31, 0, 0).getTime(), '연말 글은 작년으로 해석');
  assert.strictEqual(parseDcDate(null), null);
  console.log('✅ [Phase22] 디시 날짜 표기(전체/시각/월일)를 정확히 해석함');

  // 2. 작성자 키 정규화 — 고닉은 uid, 유동은 IP
  assert.strictEqual(ArchiveDB.authorKeyOf({ authorId: 'abc', ip: '1.2' }), 'uid:abc');
  assert.strictEqual(ArchiveDB.authorKeyOf({ ip: '223.39' }), 'ip:223.39');
  assert.strictEqual(ArchiveDB.authorKeyOf({ author: 'ㅇㅇ' }), 'nick:ㅇㅇ');

  // 3. 유저 활동 요약
  const summary = summarizeUserActivity({
    posts: [
      { postNo: 10, title: '글1', author: '분탕러', ip: '223.39.1', date: '2026-08-19 03:10:00' },
      { postNo: 12, title: '글2', author: '분탕러2', ip: '223.39.1', date: '2026-08-19 03:40:00' }
    ],
    comments: [
      { author: '분탕러', ip: '223.39.1', date: '2026-08-19 14:00:00' }
    ]
  }, now);

  assert.strictEqual(summary.postCount, 2);
  assert.strictEqual(summary.commentCount, 1);
  assert.strictEqual(summary.hours[3], 2, '새벽 3시대 2건');
  assert.strictEqual(summary.hours[14], 1);
  assert.deepStrictEqual(summary.nicknames.sort(), ['분탕러', '분탕러2']);
  assert.strictEqual(summary.recentPosts[0].postNo, 12, '최신 글이 앞에');
  console.log('✅ [Phase22] 유저 활동(글/댓글/시간대/닉네임)이 집계됨');

  // 4. 갤러리 지분율
  const posts = [
    { authorKey: 'uid:heavy', author: '고닉', postNo: 5 },
    { authorKey: 'uid:heavy', author: '고닉', postNo: 4 },
    { authorKey: 'uid:heavy', author: '고닉', postNo: 3 },
    { authorKey: 'ip:1.2', author: 'ㅇㅇ', ip: '1.2', postNo: 2 },
    { authorKey: 'nick:익명', author: '익명', postNo: 1 }
  ];
  const share = galleryShareStats(posts, 200);
  assert.strictEqual(share.sampled, 5);
  assert.strictEqual(share.entries[0].authorKey, 'uid:heavy');
  assert.strictEqual(share.entries[0].count, 3);
  assert.ok(Math.abs(share.entries[0].share - 0.6) < 1e-9, '3/5 = 60%');

  const limited = galleryShareStats(posts, 2);
  assert.strictEqual(limited.sampled, 2, '표본 수를 넘겨 계산하지 않음');
  console.log('✅ [Phase22] 갤러리 지분율이 표본 기준으로 계산됨');

  // 5. 통피/다중 닉 의심 대역
  const bands = suspiciousIpBands([
    { ip: '223.39.1', author: 'A' },
    { ip: '223.39.2', author: 'B' },
    { ip: '223.39.3', author: 'C' },
    { ip: '1.2.3', author: 'D' }
  ], 3);
  assert.strictEqual(bands.length, 1);
  assert.strictEqual(bands[0].band, '223.39');
  assert.deepStrictEqual(bands[0].nicknames.sort(), ['A', 'B', 'C']);
  console.log('✅ [Phase22] 같은 IP 대역의 다중 닉네임을 의심 신호로 잡아냄');

  // 6. 대댓글 트리 (@닉네임 + parentId)
  const tree = buildCommentTree([
    { id: '1', author: '갑', content: '원 댓글' },
    { id: '2', author: '을', content: '@갑 답글입니다' },
    { id: '3', author: '병', content: '@을 답글의 답글' },
    { id: '4', author: '정', content: '독립 댓글' },
    { id: '5', author: '무', content: '지정 답글', parentId: '4' }
  ]);

  const depthOf = (id) => tree.find(node => node.id === id).depth;
  assert.strictEqual(depthOf('1'), 0);
  assert.strictEqual(depthOf('2'), 1, '@갑 → 갑의 댓글 아래');
  assert.strictEqual(depthOf('3'), 2, '@을 → 을의 답글 아래');
  assert.strictEqual(depthOf('4'), 0);
  assert.strictEqual(depthOf('5'), 1, 'parentId가 있으면 그대로 사용');
  assert.deepStrictEqual(tree.map(node => node.id), ['1', '2', '3', '4', '5'], '트리 순서로 평탄화');
  assert.strictEqual(tree.find(node => node.id === '1').childCount, 1);

  // 자기 자신을 부모로 지정해도 순환하지 않는다
  const selfRef = buildCommentTree([{ id: '1', author: '갑', content: 'x', parentId: '1' }]);
  assert.strictEqual(selfRef[0].depth, 0);

  // 존재하지 않는 닉네임 호출은 최상위로 남는다
  const unknownMention = buildCommentTree([{ id: '1', author: '갑', content: '@없는사람 안녕' }]);
  assert.strictEqual(unknownMention[0].depth, 0);
  console.log('✅ [Phase22] @닉네임/parentId 기반 대댓글 트리가 구성됨');

  console.log('--- Phase 22 Tests Passed ---');
}
