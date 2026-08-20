/**
 * Phase 21 Tests — 유저 메모/차단, 도배 감지, 마크다운/코드, 디시콘/임시저장 저장소
 */
import assert from 'assert';
import {
  matchUserRule,
  findMatchingRule,
  normalizeUser,
  USER_RULE_TYPES,
  USER_RULE_ACTIONS,
  userRuleManager
} from '../src/core/filters/user-rule-manager.js';
import {
  detectSpam,
  scanPosts,
  normalizeTitle,
  specialCharRatio,
  longestCharRun,
  SPAM_REASONS
} from '../src/core/filters/spam-detector.js';
import { renderMarkdown, looksLikeMarkdown, findCodeBlocks } from '../src/core/markdown/markdown-renderer.js';
import { highlightCode, tokenize } from '../src/core/markdown/code-highlighter.js';
import { dcconStore } from '../src/core/dccon/dccon-store.js';
import {
  pickSignatureImage,
  signatureStore,
  SIGNATURE_MODES,
  MAX_IMAGES
} from '../src/core/signature/signature-store.js';
import { configManager } from '../src/core/config-manager.js';
import { draftStore } from '../src/core/draft/draft-store.js';

export async function runPhase21Tests() {
  console.log('--- Running Phase 21 (Block / Spam / Compose) Tests ---');

  // 1. 유저 규칙 매칭
  const 고닉 = { nick: '분탕러', uid: 'trollmaster', ip: '' };
  const 유동 = { nick: 'ㅇㅇ', uid: '', ip: '223.39.101' };

  assert.ok(matchUserRule({ type: USER_RULE_TYPES.UID, value: 'trollmaster', enabled: true }, 고닉));
  assert.ok(matchUserRule({ type: USER_RULE_TYPES.NICK, value: '분탕러', enabled: true }, 고닉));
  assert.ok(!matchUserRule({ type: USER_RULE_TYPES.UID, value: 'trollmaster', enabled: false }, 고닉), '중지된 규칙은 매칭되지 않음');

  assert.ok(matchUserRule({ type: USER_RULE_TYPES.IP_PREFIX, value: '223.39', enabled: true }, 유동), 'IP 대역 매칭');
  assert.ok(!matchUserRule({ type: USER_RULE_TYPES.IP_PREFIX, value: '223.3', enabled: true }, 유동), '옥텟 단위로 비교해야 함');
  assert.ok(!matchUserRule({ type: USER_RULE_TYPES.IP, value: '223.39', enabled: true }, 유동), '정확히 일치할 때만 IP 매칭');
  assert.ok(matchUserRule({ type: USER_RULE_TYPES.IP, value: '223.39.101', enabled: true }, 유동));
  assert.ok(matchUserRule({ type: USER_RULE_TYPES.REGEX, value: '^분탕', enabled: true }, 고닉));
  assert.ok(!matchUserRule({ type: USER_RULE_TYPES.REGEX, value: '[', enabled: true }, 고닉), '잘못된 정규식은 무시');

  // 갤러리 스코프
  const scoped = { type: USER_RULE_TYPES.NICK, value: '분탕러', enabled: true, galleryId: 'programming' };
  assert.ok(matchUserRule(scoped, 고닉, 'programming'));
  assert.ok(!matchUserRule(scoped, 고닉, 'baseball_new11'));
  console.log('✅ [Phase21] 닉네임/uid/IP/IP대역/정규식 규칙이 정확히 매칭됨');

  // 2. 가장 강한 액션이 우선
  const rules = [
    { id: 'a', type: USER_RULE_TYPES.NICK, value: '분탕러', action: USER_RULE_ACTIONS.LABEL, enabled: true, memo: '관종' },
    { id: 'b', type: USER_RULE_TYPES.UID, value: 'trollmaster', action: USER_RULE_ACTIONS.HIDE, enabled: true }
  ];
  assert.strictEqual(findMatchingRule(rules, 고닉).id, 'b', '차단이 라벨보다 우선');
  assert.strictEqual(findMatchingRule(rules, { nick: '일반인' }), null);
  assert.deepStrictEqual(normalizeUser({ nick: ' 닉 ', ip: ' 1.2 ' }), { nick: '닉', uid: '', ip: '1.2' });
  console.log('✅ [Phase21] 여러 규칙이 겹치면 가장 강한 처리로 결정됨');

  // 3. 도배 감지
  assert.strictEqual(normalizeTitle('  같은 글 [12]  '), '같은 글');
  assert.ok(specialCharRatio('!!!@@@###') > 0.9);
  assert.strictEqual(longestCharRun('ㅋㅋㅋㅋㅋㅋㅋ'), 7);

  const posts = [
    { title: '도배글입니다' }, { title: '도배글입니다' }, { title: '도배글입니다' },
    { title: 'ㅋㅋㅋㅋㅋㅋㅋㅋ' },
    { title: '!@#$%^&*()_+' },
    { title: '정상적인 질문글입니다' },
    { title: '대출 문의 받습니다' }
  ];
  const scanned = scanPosts(posts, { duplicateThreshold: 3, patterns: ['대출'] });

  assert.strictEqual(scanned[0].reason, SPAM_REASONS.DUPLICATE, '동일 제목 3회는 도배');
  assert.strictEqual(scanned[3].reason, SPAM_REASONS.REPEATED_CHAR);
  assert.strictEqual(scanned[4].reason, SPAM_REASONS.SPECIAL_CHARS);
  assert.strictEqual(scanned[5].spam, false, '정상 글은 통과');
  assert.strictEqual(scanned[6].reason, SPAM_REASONS.PATTERN);
  assert.strictEqual(scanned[6].detail, '대출');

  // 임계값을 올리면 같은 글이 통과해야 함
  const relaxed = scanPosts(posts, { duplicateThreshold: 5, patterns: [] });
  assert.strictEqual(relaxed[0].spam, false, '임계값 위에서는 도배로 보지 않음');
  assert.strictEqual(detectSpam({ title: '' }, {}, {}).spam, false);
  console.log('✅ [Phase21] 동일 제목/특수문자/반복문자/정규식 도배가 구분됨');

  // 4. 코드 하이라이팅 — 이스케이프 우선
  const tokens = tokenize('const x = "hi"; // note');
  assert.ok(tokens.some(t => t.type === 'keyword' && t.text === 'const'));
  assert.ok(tokens.some(t => t.type === 'string' && t.text === '"hi"'));
  assert.ok(tokens.some(t => t.type === 'comment' && t.text.includes('note')));

  const highlighted = highlightCode('const evil = "<script>alert(1)</script>";');
  assert.ok(!highlighted.includes('<script>'), '코드 하이라이팅은 항상 이스케이프해야 함');
  assert.ok(highlighted.includes('dcu-tok-keyword'));
  console.log('✅ [Phase21] 코드 하이라이터가 토큰을 구분하고 HTML을 이스케이프함');

  // 5. 마크다운 렌더링
  assert.ok(looksLikeMarkdown('# 제목\n- 항목'));
  assert.ok(!looksLikeMarkdown('그냥 평범한 글입니다'));

  const md = renderMarkdown([
    '# 제목',
    '',
    '**굵게** 그리고 `코드`',
    '',
    '- 하나',
    '- 둘',
    '',
    '```js',
    'const a = 1; // 주석',
    '```'
  ].join('\n'));

  assert.ok(md.includes('<h1 class="dcu-md-h">제목</h1>'));
  assert.ok(md.includes('<strong>굵게</strong>'));
  assert.ok(md.includes('<code class="dcu-md-code">코드</code>'));
  assert.ok(md.includes('<ul class="dcu-md-list">') && md.includes('<li>하나</li>'));
  assert.ok(md.includes('dcu-md-pre') && md.includes('dcu-tok-keyword'), '펜스 코드 블록이 하이라이팅됨');

  const injected = renderMarkdown('<img src=x onerror=alert(1)>');
  assert.ok(!injected.includes('<img'), '마크다운 렌더러는 원본 HTML을 실행 가능한 형태로 남기지 않음');

  const blocks = findCodeBlocks('설명\n```python\nprint(1)\n```\n끝');
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].lang, 'python');
  assert.strictEqual(blocks[0].code, 'print(1)');
  console.log('✅ [Phase21] 마크다운이 안전하게 렌더링되고 코드 펜스를 인식함');

  // 6. 저장소 (디시콘 / 임시저장 / 유저 규칙 CRUD)
  await dcconStore.clear();
  await dcconStore.recordUse({ detailIdx: '111', packageIdx: '9', title: '찐', img: 'https://img/1.png' });
  await dcconStore.recordUse({ detailIdx: '111', packageIdx: '9' });
  let dccons = await dcconStore.list();
  assert.strictEqual(dccons.length, 1);
  assert.strictEqual(dccons[0].uses, 2);
  assert.strictEqual(dccons[0].pinned, false, '2회 사용까지는 자동 핀 아님');

  await dcconStore.recordUse({ detailIdx: '111', packageIdx: '9' });
  dccons = await dcconStore.list();
  assert.strictEqual(dccons[0].uses, 3);
  assert.strictEqual(dccons[0].pinned, true, '3회 사용하면 자동 핀 고정');
  await dcconStore.clear();

  await draftStore.clear();
  await draftStore.save({
    key: 'dcu_draft:programming:write:new',
    url: 'https://gall.dcinside.com/board/write/?id=programming',
    galleryId: 'programming',
    subject: '테스트 글',
    body: '<p>본문</p>',
    preview: '본문',
    attachments: ['screenshot.png'],
    savedAt: 1000
  });
  const drafts = await draftStore.list();
  assert.strictEqual(drafts.length, 1);
  assert.strictEqual(drafts[0].subject, '테스트 글');
  assert.deepStrictEqual(drafts[0].attachments, ['screenshot.png']);
  assert.ok(!('body' in drafts[0]), '사이드패널 미러에는 본문 HTML을 저장하지 않음');
  await draftStore.clear();

  await userRuleManager.save([]);
  const created = await userRuleManager.addRule({ type: 'ipPrefix', value: '223.39', memo: '분탕 대역', action: 'blind' });
  assert.ok(created.id);
  const again = await userRuleManager.addRule({ type: 'ipPrefix', value: '223.39', memo: '수정된 메모' });
  assert.strictEqual(again.id, created.id, '같은 대상은 새로 만들지 않고 갱신');
  assert.strictEqual(again.memo, '수정된 메모');

  await userRuleManager.recordHits({ [created.id]: 2 });
  assert.strictEqual((await userRuleManager.load(true))[0].hitCount, 2);

  await assert.rejects(() => userRuleManager.addRule({ type: 'nick', value: '   ' }), /대상/);
  await assert.rejects(() => userRuleManager.addRule({ type: 'regex', value: '(' }), /정규식/);

  await userRuleManager.deleteRule(created.id);
  assert.strictEqual((await userRuleManager.load(true)).length, 0);
  console.log('✅ [Phase21] 디시콘/임시저장/유저 규칙 저장소가 정상 동작함');

  // 7. 자짤 선택 규칙 (랜덤 / 지정 1개 / 갤러리별)
  const sigs = [
    { id: 'a', name: '자짤A' },
    { id: 'b', name: '자짤B' },
    { id: 'c', name: '자짤C' }
  ];

  assert.strictEqual(pickSignatureImage([], { mode: SIGNATURE_MODES.RANDOM }), null, '등록된 자짤이 없으면 null');

  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.SINGLE, selectedId: 'b' }).id, 'b',
    'single 모드는 지정한 자짤만 사용'
  );
  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.SINGLE, selectedId: 'zzz' }).id, 'a',
    '지정 자짤이 삭제되었으면 첫 자짤로 대체'
  );

  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.RANDOM, random: () => 0 }).id, 'a'
  );
  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.RANDOM, random: () => 0.99 }).id, 'c',
    '난수 상한에서도 배열을 벗어나지 않음'
  );

  const galleryMap = { programming: 'c', baseball_new11: 'a' };
  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.GALLERY, galleryMap, galleryId: 'programming' }).id, 'c',
    '갤러리별 모드는 매핑된 자짤 사용'
  );
  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.GALLERY, galleryMap, galleryId: 'unmapped', selectedId: 'b' }).id, 'b',
    '매핑이 없으면 기본 자짤'
  );
  assert.strictEqual(
    pickSignatureImage(sigs, { mode: SIGNATURE_MODES.GALLERY, galleryMap, galleryId: 'unmapped', random: () => 0.99 }).id, 'c',
    '기본 자짤도 없으면 무작위'
  );
  console.log('✅ [Phase21] 자짤이 랜덤 / 지정 1개 / 갤러리별 규칙대로 선택됨');

  // 8. 자짤 저장소 CRUD + 삭제 시 설정 정리
  await signatureStore.clear();
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const added = await signatureStore.add({ dataUrl: png, name: '첫 자짤' });
  assert.ok(added.id);
  assert.strictEqual(configManager.get('autoSigSelectedId'), added.id, '첫 자짤은 기본값으로 지정됨');

  await assert.rejects(() => signatureStore.add({ dataUrl: png }), /이미 등록/, '같은 이미지는 중복 등록 불가');
  await assert.rejects(() => signatureStore.add({ dataUrl: 'not-an-image' }), /이미지 파일/);

  const second = await signatureStore.add({ dataUrl: 'data:image/png;base64,iVBORw0KGgoB' });
  await signatureStore.setGalleryImage('programming', second.id);
  assert.strictEqual((configManager.get('autoSigGalleryMap') || {}).programming, second.id);

  await configManager.set('autoSigMode', SIGNATURE_MODES.GALLERY);
  const forGallery = await signatureStore.pickFor('programming');
  assert.strictEqual(forGallery.id, second.id, '갤러리 매핑이 pickFor에 반영됨');

  await signatureStore.remove(second.id);
  assert.strictEqual((configManager.get('autoSigGalleryMap') || {}).programming, undefined, '자짤을 지우면 갤러리 매핑도 정리됨');
  assert.strictEqual((await signatureStore.list()).length, 1);

  await signatureStore.clear();
  await configManager.set('autoSigMode', SIGNATURE_MODES.RANDOM);
  assert.strictEqual(await signatureStore.pickFor('programming'), null);
  console.log('✅ [Phase21] 자짤 저장소 CRUD와 삭제 시 설정 정리가 동작함');

  console.log('--- Phase 21 Tests Passed ---');
}
