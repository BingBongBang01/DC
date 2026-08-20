/**
 * Identity Tests — 고닉/반고닉/유동닉 판별과 메모 키 정규화
 *
 * 분류 기대값은 실제 캡처 픽스처(`tests/fixtures/dc.html`, `.gall_writer` 52건)에서
 * 나온 값이다. 근거 정리는 `SEMI_FIXED_NICKNAME_ANALYSIS.md`.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import {
  USER_IDENTITY,
  classifyIdentity,
  identityLabel,
  userKeyOf,
  parseUserKey,
  normalizeUserKey,
  isAmbiguousKey,
  readWriterIdentity
} from '../src/core/identity.js';
import { userNotesFeature } from '../src/features/user-notes-feature.js';
import { storageManager } from '../src/core/storage-manager.js';
import { nicknameHolders, ipBand } from '../src/core/archive/activity-analyzer.js';
import { userRuleManager } from '../src/core/filters/user-rule-manager.js';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf-8');

const NIK = 'https://nstatic.dcinside.com/dc/w/images/nik.gif';
const FIX_NIK = 'https://nstatic.dcinside.com/dc/w/images/fix_nik.gif';

export async function runIdentityTests() {
  console.log('--- Running Identity (고닉/반고닉/유동닉) Tests ---');

  // 1. 아이콘 파일명으로 고닉/반고닉을 가른다
  assert.strictEqual(
    classifyIdentity({ uid: 'okoil', nikconSrc: FIX_NIK }),
    USER_IDENTITY.FIXED
  );
  assert.strictEqual(
    classifyIdentity({ uid: 'guest1433', nikconSrc: NIK }),
    USER_IDENTITY.SEMI_FIXED
  );
  // `fix_nik.gif` 는 `nik` 을 부분 문자열로 포함한다 — 검사 순서가 뒤집히면 고닉이
  // 반고닉으로 오분류되므로 못을 박아 둔다.
  assert.notStrictEqual(
    classifyIdentity({ uid: 'okoil', nikconSrc: FIX_NIK }),
    USER_IDENTITY.SEMI_FIXED,
    'fix_nik 을 nik 보다 먼저 검사해야 함'
  );

  assert.strictEqual(classifyIdentity({ ip: '175.223' }), USER_IDENTITY.FLOATING);
  assert.strictEqual(classifyIdentity({}), USER_IDENTITY.UNKNOWN);
  // 아이콘을 읽을 수 없는 화면에서는 회원인 것만 확실하다 — 고닉으로 단정하지 않는다.
  assert.strictEqual(classifyIdentity({ uid: 'chartman' }), USER_IDENTITY.UNKNOWN);
  // uid 가 있으면 IP 보다 우선한다 (반고닉이 유동닉으로 새지 않도록)
  assert.strictEqual(
    classifyIdentity({ uid: 'chartman', ip: '1.2', nikconSrc: NIK }),
    USER_IDENTITY.SEMI_FIXED
  );

  assert.strictEqual(identityLabel(USER_IDENTITY.SEMI_FIXED), '반고닉');
  assert.strictEqual(identityLabel('nope'), '알 수 없음');
  console.log('✅ [Identity] fix_nik/nik 아이콘으로 고닉·반고닉이 갈리고 유동닉이 분리됨');

  // 2. 정규화 키: uid > ip > nick
  assert.strictEqual(userKeyOf({ uid: 'guest1433', ip: '1.2', nick: 'ㅇㅇ' }), 'uid:guest1433');
  assert.strictEqual(userKeyOf({ ip: '175.223', nick: 'ㅇㅇ' }), 'ip:175.223');
  assert.strictEqual(userKeyOf({ nick: ' ㅇㅇ ' }), 'nick:ㅇㅇ');
  assert.strictEqual(userKeyOf({}), 'nick:');

  assert.deepStrictEqual(parseUserKey('uid:guest1433'), { type: 'uid', value: 'guest1433' });
  // 닉네임에 콜론이 들어가도 접두로 오해하지 않는다
  assert.deepStrictEqual(parseUserKey('a:b'), { type: 'nick', value: 'a:b' });

  assert.strictEqual(normalizeUserKey('uid:guest1433'), 'uid:guest1433');
  assert.strictEqual(normalizeUserKey('  175.223 '), 'ip:175.223');
  assert.strictEqual(normalizeUserKey('ㅇㅇ'), 'nick:ㅇㅇ');
  assert.strictEqual(normalizeUserKey('   '), '', '빈 입력은 키가 되지 않음');
  assert.strictEqual(normalizeUserKey('uid:   '), '', '접두만 있고 값이 없으면 무효');

  // uid 만 개인 단위로 안전하다
  assert.strictEqual(isAmbiguousKey('uid:guest1433'), false);
  assert.strictEqual(isAmbiguousKey('ip:175.223'), true);
  assert.strictEqual(isAmbiguousKey('nick:ㅇㅇ'), true);
  console.log('✅ [Identity] 식별 키가 uid > ip > nick 순으로 정규화되고 약한 키가 표시됨');

  // 3. 실제 픽스처 분류 — 캡처된 목록 페이지의 작성자 52건
  const doc = new JSDOM(readFixture('dc.html')).window.document;
  const writers = [...doc.querySelectorAll('.gall_writer')].map(readWriterIdentity);
  assert.strictEqual(writers.length, 52);

  const tally = writers.reduce((acc, w) => {
    acc[w.identity] = (acc[w.identity] || 0) + 1;
    return acc;
  }, {});
  assert.deepStrictEqual(tally, {
    [USER_IDENTITY.FIXED]: 15,
    [USER_IDENTITY.SEMI_FIXED]: 3,
    [USER_IDENTITY.FLOATING]: 31,
    // 작성자 정보가 비어 있는 셀 2건 + 공지의 '운영자' 1건
    [USER_IDENTITY.UNKNOWN]: 3
  });

  assert.strictEqual(readWriterIdentity(null), null);
  console.log('✅ [Identity] 캡처된 목록 52건이 고닉 15 · 반고닉 3 · 유동닉 31 로 분류됨');

  // 4. 핵심 시나리오: 닉네임 `ㅇㅇ` 10명이 서로 갈라지는가
  const oo = writers.filter(w => w.nick === 'ㅇㅇ');
  assert.strictEqual(oo.length, 10, '픽스처에 ㅇㅇ 작성자가 10건');

  const semiFixedOo = oo.filter(w => w.identity === USER_IDENTITY.SEMI_FIXED);
  assert.strictEqual(semiFixedOo.length, 3);
  assert.deepStrictEqual(
    semiFixedOo.map(w => w.key).sort(),
    ['uid:chartman', 'uid:guest1433', 'uid:table9132'],
    '반고닉은 닉네임이 겹쳐도 계정 uid 로 완전히 구분된다'
  );

  // 나머지 7건은 유동닉이다. 키가 서로 달라 보이는 것은 IP 가 우연히 달랐기 때문이며,
  // 2옥텟 IP 는 개인 식별자가 아니다 — 같은 사람이 대역을 바꾸면 다른 키가 된다.
  const floatingOo = oo.filter(w => w.identity === USER_IDENTITY.FLOATING);
  assert.strictEqual(floatingOo.length, 7);
  assert.ok(floatingOo.every(w => isAmbiguousKey(w.key)), '유동닉 키는 약한 키로 표시됨');
  console.log('✅ [Identity] 닉네임 ㅇㅇ 10건 중 반고닉 3명이 uid 로 개별 식별됨');

  // 5. 유저 메모 — 유저 규칙 저장소 하나에 정규화 키로 저장/조회
  await userRuleManager.save([]);
  await storageManager.set({ userNotes: {} });

  await userNotesFeature.setNoteFor(
    { nick: 'ㅇㅇ', uid: 'guest1433', identity: USER_IDENTITY.SEMI_FIXED },
    '어제 분탕'
  );
  await userNotesFeature.setNoteFor(
    { nick: 'ㅇㅇ', uid: 'table9132', identity: USER_IDENTITY.SEMI_FIXED },
    '질문 잘 받아줌'
  );

  const saved = await userNotesFeature.getAllNotes();
  assert.deepStrictEqual(
    Object.keys(saved).sort(),
    ['uid:guest1433', 'uid:table9132'],
    '같은 닉네임이어도 메모가 사람별로 나뉜다'
  );
  assert.strictEqual((await userNotesFeature.getNoteFor({ uid: 'guest1433' })).note, '어제 분탕');
  assert.strictEqual(saved['uid:guest1433'].label, 'ㅇㅇ');
  assert.strictEqual(saved['uid:guest1433'].identity, USER_IDENTITY.SEMI_FIXED);

  // 자유 입력도 같은 키로 수렴한다
  await userNotesFeature.setNote('uid:guest1433', '갱신됨');
  assert.strictEqual(Object.keys(await userNotesFeature.getAllNotes()).length, 2, '키가 늘어나지 않음');
  assert.strictEqual((await userNotesFeature.getNote('uid:guest1433')).note, '갱신됨');
  assert.strictEqual((await userNotesFeature.getNote('uid:guest1433')).label, 'ㅇㅇ', '갱신 시 라벨 유지');

  await userNotesFeature.setNote('', '키 없는 메모');
  assert.strictEqual(Object.keys(await userNotesFeature.getAllNotes()).length, 2, '빈 키는 저장되지 않음');

  assert.strictEqual(
    userNotesFeature.describeKey('uid:guest1433', saved['uid:guest1433']),
    'ㅇㅇ · 반고닉 (uid:guest1433)'
  );
  assert.strictEqual(userNotesFeature.describeKey('ip:175.223', {}), 'ip:175.223');

  await userNotesFeature.deleteNote('uid:guest1433');
  assert.deepStrictEqual(Object.keys(await userNotesFeature.getAllNotes()), ['uid:table9132']);
  console.log('✅ [Identity] 유저 메모가 정규화 키로 저장되어 반고닉끼리 섞이지 않음');

  // 5b. 메모는 유저 규칙과 같은 저장소를 쓴다 — 설정 화면 메모가 페이지에도 뜬다
  const asRules = await userRuleManager.load(true);
  assert.strictEqual(asRules.length, 1, '메모 1건이 규칙 1건으로 저장됨');
  assert.strictEqual(asRules[0].type, 'uid');
  assert.strictEqual(asRules[0].value, 'table9132');
  assert.strictEqual(asRules[0].action, 'label', '차단이 아닌 메모는 label 액션');
  assert.strictEqual(asRules[0].memo, '질문 잘 받아줌');

  // 반대 방향: 다른 화면(팝오버/사이드패널)에서 만든 규칙도 메모 목록에 보인다
  await userRuleManager.addRule({
    type: 'uid', value: 'chartman', action: 'blind', memo: '사이드패널에서 차단'
  });
  const merged = await userNotesFeature.getAllNotes();
  assert.deepStrictEqual(Object.keys(merged).sort(), ['uid:chartman', 'uid:table9132']);
  assert.strictEqual(merged['uid:chartman'].isBlocked, true);
  assert.strictEqual(merged['uid:chartman'].note, '사이드패널에서 차단');

  // 메모만 고칠 때 이미 걸린 차단을 강등하지 않는다
  await userNotesFeature.setNote('uid:chartman', '메모만 수정');
  const afterEdit = await userNotesFeature.getNote('uid:chartman');
  assert.strictEqual(afterEdit.note, '메모만 수정');
  assert.strictEqual(afterEdit.action, 'blind', '메모 수정이 차단을 풀지 않음');
  assert.strictEqual(afterEdit.isBlocked, true);

  // 명시적으로 차단을 걸면 올라간다
  await userNotesFeature.setNote('uid:table9132', '이제 차단', true);
  assert.strictEqual((await userNotesFeature.getNote('uid:table9132')).action, 'blind');

  assert.strictEqual(userNotesFeature.describeAction({ action: 'label' }), '메모만');
  assert.strictEqual(
    userNotesFeature.describeAction({ action: 'blind', galleryId: 'programming' }),
    '차단(펼치기 가능) · programming 갤러리'
  );

  // ipPrefix/regex 규칙은 식별자 키로 표현되지 않으므로 메모 뷰에 나오지 않는다
  await userRuleManager.addRule({ type: 'ipPrefix', value: '223.39', action: 'dim', memo: '대역' });
  await userRuleManager.addRule({ type: 'regex', value: '^분탕', action: 'dim', memo: '정규식' });
  assert.deepStrictEqual(
    Object.keys(await userNotesFeature.getAllNotes()).sort(),
    ['uid:chartman', 'uid:table9132'],
    'ipPrefix/regex 는 메모 목록에서 제외'
  );
  console.log('✅ [Identity] 메모와 유저 규칙이 하나의 저장소를 공유함');

  // 6. 예전 `userNotes` 저장소 드레인
  await userRuleManager.save([]);
  await storageManager.set({
    userNotes: {
      // 접두 없는 옛 키들
      'ㅇㅇ': { userKey: 'ㅇㅇ', note: '오래된 메모', isBlocked: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      '175.223': { userKey: '175.223', note: 'IP 메모', isBlocked: true, updatedAt: '2026-01-02T00:00:00.000Z' },
      // 같은 대상을 가리키는 신·구 키가 공존하는 경우
      'nick:ㅇㅇ': { userKey: 'nick:ㅇㅇ', note: '최신 메모', isBlocked: false, updatedAt: '2026-05-05T00:00:00.000Z' }
    }
  });

  const moved = await userNotesFeature.migrateFromLegacyNotes();
  assert.strictEqual(moved, 3, '옛 메모 3건을 흡수');

  const migrated = await userNotesFeature.getAllNotes();
  assert.deepStrictEqual(Object.keys(migrated).sort(), ['ip:175.223', 'nick:ㅇㅇ']);
  assert.strictEqual(migrated['nick:ㅇㅇ'].note, '최신 메모', '합쳐질 때 updatedAt 이 늦은 쪽이 남음');
  assert.strictEqual(migrated['ip:175.223'].isBlocked, true, '차단 상태가 보존됨');
  assert.strictEqual(migrated['ip:175.223'].action, 'blind');

  // 옛 저장소는 비워진다
  assert.deepStrictEqual((await storageManager.get('userNotes')).userNotes, {}, '드레인 후 옛 저장소는 빈다');

  // 비어 있으면 아무것도 하지 않는다
  assert.strictEqual(await userNotesFeature.migrateFromLegacyNotes(), 0);
  assert.deepStrictEqual(await userNotesFeature.getAllNotes(), migrated, '재호출이 데이터를 바꾸지 않음');

  // 백업 복원으로 옛 메모가 되살아나도 다시 흡수한다 (한 번만 도는 마이그레이션이 아니다)
  await storageManager.set({
    userNotes: {
      'nick:ㅇㅇ': { userKey: 'nick:ㅇㅇ', note: '복원된 메모', isBlocked: false, updatedAt: '2026-06-06T00:00:00.000Z' }
    }
  });
  assert.strictEqual(await userNotesFeature.migrateFromLegacyNotes(), 1, '복원된 메모를 다시 흡수');
  assert.strictEqual((await userNotesFeature.getNote('nick:ㅇㅇ')).note, '복원된 메모');

  await userRuleManager.save([]);
  await storageManager.set({ userNotes: {} });
  console.log('✅ [Identity] 옛 메모 저장소가 규칙으로 흡수되고 복원 시에도 다시 흡수됨');

  // 7. 닉네임 규칙의 사정거리 — 픽스처의 ㅇㅇ 10명을 아카이브 레코드 모양으로 옮겨 센다
  const records = writers
    .filter(w => w.nick)
    .map((w, i) => ({
      author: w.nick,
      authorId: w.uid || null,
      ip: w.ip || null,
      authorKey: w.key,
      postNo: 1000 + i
    }));

  const reach = nicknameHolders(records, 'ㅇㅇ');
  assert.strictEqual(reach.nickname, 'ㅇㅇ');
  assert.strictEqual(reach.sampled, 10, '이 닉네임으로 관측된 글이 10건');
  assert.strictEqual(reach.holders.length, 10, '식별자 10개 — 닉네임 규칙은 이들 모두에게 걸린다');
  assert.strictEqual(reach.accountCount, 3, '계정(반고닉 3명)');
  assert.strictEqual(reach.ipCount, 7, '유동닉 IP 7개');

  // 고닉은 닉네임이 곧 개인이라 사정거리가 1이다
  const single = nicknameHolders(records, '헤르 미온느');
  assert.strictEqual(single.holders.length, 1);
  assert.strictEqual(single.accountCount, 1);
  assert.ok(single.sampled > 1, '같은 사람의 글이 여러 건이어도 식별자는 하나');

  // 한 사람이 여러 건 써도 식별자 수는 늘지 않고, 건수만 쌓인다
  assert.strictEqual(single.holders[0].count, single.sampled);

  assert.deepStrictEqual(
    nicknameHolders(records, '없는닉'),
    { nickname: '없는닉', sampled: 0, holders: [], accountCount: 0, ipCount: 0 }
  );
  assert.strictEqual(nicknameHolders(records, '   ').nickname, '', '빈 닉네임은 집계하지 않음');
  assert.strictEqual(nicknameHolders(null, 'ㅇㅇ').sampled, 0, '레코드가 없어도 안전');

  // authorKey 가 없는 옛 레코드도 uid/ip 로 키를 만들어 센다
  const legacyRecords = [
    { author: 'ㅇㅇ', authorId: 'guest1433' },
    { author: 'ㅇㅇ', authorId: 'guest1433' },
    { author: 'ㅇㅇ', ip: '175.223' }
  ];
  const legacyReach = nicknameHolders(legacyRecords, 'ㅇㅇ');
  assert.strictEqual(legacyReach.holders.length, 2);
  assert.strictEqual(legacyReach.accountCount, 1);
  assert.strictEqual(legacyReach.ipCount, 1);
  console.log('✅ [Identity] 닉네임 ㅇㅇ 규칙이 식별자 10개(계정 3 · IP 7)에 걸리는 것을 셈');

  // 8. IP 대역 비교 — 2옥텟 입력에서 접두 비교가 깨지던 회귀 방지
  assert.strictEqual(ipBand('175.223'), '175.223', '이미 2옥텟이면 그대로');
  assert.strictEqual(ipBand('175.223.45.1'), '175.223');
  assert.strictEqual(ipBand(''), '');
  assert.strictEqual(ipBand(null), '');

  // 디시 목록의 IP 는 2옥텟이라 `startsWith(band + '.')` 는 늘 거짓이었다.
  // 대역끼리 비교해야 같은 대역을 찾아낸다.
  const band = ipBand('175.223');
  assert.strictEqual('175.223'.startsWith(`${band}.`), false, '옛 접두 비교가 실패하는 이유');
  assert.strictEqual(ipBand('175.223') === band, true, '대역끼리 비교하면 매칭됨');
  console.log('✅ [Identity] 2옥텟 IP 에서도 같은 대역이 매칭됨');

  console.log('--- Identity Tests Passed ---');
}
