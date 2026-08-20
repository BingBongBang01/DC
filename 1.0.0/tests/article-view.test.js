/**
 * 2.0.2 회귀 테스트 — 본문 파싱 / 댓글 순서
 *
 * 두 가지 실제 버그를 고정한다.
 *  1. 제목에 "앱에서 작성"/"모바일에서 작성" 이 붙던 문제. 원인은 querySelector 의
 *     셀렉터 목록이 문서 순서를 우선해 `.title_subject` 의 부모 h3(`.ub-word`)를
 *     먼저 돌려준 것. 조회/추천도 라벨과 하단 목록표 때문에 0 이 되고 있었다.
 *  2. 대댓글이 전부 목록 맨 위로 올라가던 문제. 원인은 디시가 depth 0 댓글의
 *     <li> 를 닫지 않아 답글 묶음이 형제 <li>(클래스 없음)로 파싱되는데,
 *     `:scope > li.ub-content` 만 appendChild 로 옮겨 답글 묶음만 제자리에
 *     남았던 것. 이제 순서를 아예 건드리지 않는다.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { articleParser } from '../src/parser/article-parser.js';
import { SELECTORS, queryFirst, cleanText, textToInt } from '../src/adapters/selectors.js';
import { CommentAuthorFeature } from '../src/features/comment-author-feature.js';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf-8');

/** `.cmt_list` 자식들의 신원을 순서대로 뽑는다. 답글 묶음은 클래스가 없어 id 도 없다. */
function childOrder(list) {
  return Array.from(list.children).map(li => li.id || '[reply-block]');
}

export async function runArticleViewTests() {
  console.log('--- Running 2.0.2 Regression Tests (Article View / Comment Order) ---');

  // ------------------------------------------------------------------
  // 1. queryFirst 가 우선순위를 지킨다 (버그의 근본 원인)
  // ------------------------------------------------------------------
  {
    const doc = new JSDOM(readFixture('dc-view-app.html')).window.document;

    // 부모가 폴백에 걸리는 상황을 그대로 재현한다.
    const naive = doc.querySelector('.title_subject, .ub-word');
    assert.strictEqual(naive.tagName, 'H3', 'querySelector 는 문서 순서를 우선한다(전제 확인)');

    const strict = queryFirst(doc, ['.title_subject', '.ub-word']);
    assert.strictEqual(strict.tagName, 'SPAN', 'queryFirst 는 앞선 셀렉터를 우선해야 한다');
    assert.ok(strict.classList.contains('title_subject'));

    assert.strictEqual(queryFirst(doc, '.title_subject'), strict, '문자열도 그대로 받는다');
    assert.strictEqual(queryFirst(doc, ['.nope', '.title_subject']), strict, '앞이 없으면 다음으로 넘어간다');
    assert.strictEqual(queryFirst(doc, ['.nope']), null);
    assert.strictEqual(queryFirst(null, ['.title_subject']), null, 'root 가 없으면 null');
    console.log('OK [2.0.2] queryFirst 가 셀렉터 우선순위를 지킨다');
  }

  // ------------------------------------------------------------------
  // 2. cleanText / textToInt
  // ------------------------------------------------------------------
  {
    const doc = new JSDOM('<div id="t">  줄바꿈\n 과   공백 <em class="blind">숨김</em></div>').window.document;
    const el = doc.getElementById('t');
    assert.strictEqual(cleanText(el), '줄바꿈 과 공백 숨김', '공백만 정규화');
    assert.strictEqual(cleanText(el, '.blind'), '줄바꿈 과 공백', '장식 노드는 제거');
    assert.ok(el.querySelector('.blind'), '원본 DOM 은 건드리지 않는다');
    assert.strictEqual(cleanText(null), '');

    const nums = new JSDOM('<span id="v">조회 1,234</span><span id="z">-</span>').window.document;
    assert.strictEqual(textToInt(nums.getElementById('v')), 1234, '라벨과 쉼표를 걷어낸다');
    assert.strictEqual(textToInt(nums.getElementById('z')), 0, '숫자가 없으면 0');
    assert.strictEqual(textToInt(null), 0);
    console.log('OK [2.0.2] cleanText/textToInt 가 라벨과 숨김 텍스트를 걷어낸다');
  }

  // ------------------------------------------------------------------
  // 3. 본문 파싱 — 앱/모바일 작성 표기가 제목에 붙지 않는다
  // ------------------------------------------------------------------
  {
    const cases = [
      {
        file: 'dc-view-app.html',
        marker: '앱에서 작성',
        title: '노력 안하는 자는 조선 타령할 자격도 없다.',
        subject: '일반',
        views: 16,
        recommendations: 7,
        comments: 3
      },
      {
        file: 'dc-view-mobile.html',
        marker: '모바일에서 작성',
        title: '90억인구 인간만이아니라 동물 곤충 식물들도 노력하면서 살지않음??',
        subject: '',
        views: 1234,
        recommendations: 0,
        comments: 0
      }
    ];

    for (const c of cases) {
      const doc = new JSDOM(readFixture(c.file)).window.document;

      // 픽스처가 실제로 그 표기를 담고 있는지 먼저 확인한다.
      // 안 그러면 이 테스트가 조용히 무의미해진다.
      assert.ok(doc.body.textContent.includes(c.marker), c.file + ': 픽스처에 표기가 있어야 한다');

      const article = articleParser.parseView(doc, 'programming');
      assert.ok(article, c.file + ': 파싱 실패');

      assert.strictEqual(article.title, c.title, c.file + ': 제목');
      assert.ok(!article.title.includes(c.marker), c.file + ': 제목에 디바이스 표기가 붙으면 안 된다');
      assert.ok(!article.title.includes('작성'), c.file + ': 디바이스 표기 잔여물이 없어야 한다');
      assert.ok(!/[[\]]/.test(article.title), c.file + ': 말머리 대괄호가 제목에 섞이면 안 된다');
      assert.strictEqual(article.subject, c.subject, c.file + ': 말머리는 subject 로 분리');

      assert.strictEqual(article.views, c.views, c.file + ': 조회 라벨을 벗겨야 한다');
      assert.strictEqual(article.recommendations, c.recommendations, c.file + ': 추천은 .gall_reply_num');
      assert.strictEqual(article.comments, c.comments, c.file + ': 댓글 수는 헤더 표기에서');

      assert.strictEqual(article.author, '프갤러', c.file + ': 작성자');
      assert.strictEqual(article.ip, '211.221', c.file + ': IP');
      assert.strictEqual(article.date, '2026-08-20 11:44:37', c.file + ': 날짜는 title 속성 우선');
      assert.ok(article.hasImage, c.file + ': 첨부 이미지 감지');
    }
    console.log('OK [2.0.2] 본문 제목/조회/추천/댓글이 정확히 파싱된다');
  }

  // ------------------------------------------------------------------
  // 4. 하단 "다른 글" 목록표가 본문 메타를 가로채지 않는다
  // ------------------------------------------------------------------
  {
    const doc = new JSDOM(readFixture('dc-view-app.html')).window.document;

    assert.strictEqual(doc.querySelector('td.gall_recommend').textContent, '-', '미끼 td 가 있어야 한다');
    assert.strictEqual(doc.querySelector('td.gall_count').textContent, '99999', '미끼 조회수가 있어야 한다');

    const rec = queryFirst(doc, SELECTORS.articleRecommend);
    assert.ok(rec.classList.contains('gall_reply_num'), '추천은 헤더의 .gall_reply_num 이어야 한다');
    assert.strictEqual(rec.closest('table'), null, '목록표 안의 td 를 잡으면 안 된다');

    const views = queryFirst(doc, SELECTORS.articleViews);
    assert.strictEqual(views.closest('table'), null, '조회수도 목록표 밖이어야 한다');
    console.log('OK [2.0.2] 하단 목록표의 td 가 본문 메타로 잡히지 않는다');
  }

  // ------------------------------------------------------------------
  // 5. 댓글 — 순서를 절대 바꾸지 않는다 (핵심 회귀 가드)
  // ------------------------------------------------------------------
  {
    const dom = new JSDOM(readFixture('dc-comments-with-replies.html'));
    const doc = dom.window.document;
    const list = doc.querySelector('.cmt_list');

    // 전제 확인: 디시 마크업이 평면으로 파싱되고, 답글 묶음은 클래스가 없다.
    const before = childOrder(list);
    assert.deepStrictEqual(
      before,
      ['comment_li_1', '[reply-block]', 'comment_li_2', 'comment_li_3', '[reply-block]'],
      '디시 마크업은 답글 묶음이 형제 li 로 섞인 평면 구조여야 한다(전제 확인)'
    );
    assert.strictEqual(
      list.querySelectorAll(':scope > li.ub-content').length, 3,
      '답글 묶음은 :scope > li.ub-content 로 잡히지 않는다(버그의 원인)'
    );

    const savedDocument = global.document;
    const savedObserver = global.MutationObserver;
    global.document = doc;
    global.MutationObserver = undefined; // 옵저버는 이 테스트의 대상이 아니다

    try {
      const feature = new CommentAuthorFeature();
      feature.enabled = true;

      feature.apply();
      assert.deepStrictEqual(childOrder(list), before, 'apply() 가 순서를 바꿨다');

      const ids = Array.from(list.querySelectorAll(SELECTORS.commentAnyItem)).map(li => li.id);
      assert.deepStrictEqual(
        ids,
        ['comment_li_1', 'reply_li_11', 'reply_li_12', 'comment_li_2', 'comment_li_3', 'reply_li_31'],
        '댓글/대댓글이 문서 순서 그대로여야 한다'
      );
      assert.ok(
        ids.indexOf('reply_li_11') > ids.indexOf('comment_li_1'),
        '대댓글이 부모 댓글보다 앞에 올 수 없다'
      );
      assert.ok(
        ids.indexOf('reply_li_31') > ids.indexOf('comment_li_3'),
        '마지막 답글 묶음도 제 부모 뒤에 있어야 한다'
      );

      // 글쓴이 배지: 최상위 댓글과 대댓글 양쪽에 붙어야 한다.
      assert.ok(doc.getElementById('comment_li_2').classList.contains('dcu-cmt-author'), '글쓴이 최상위 댓글');
      assert.ok(doc.getElementById('reply_li_11').classList.contains('dcu-cmt-author'), '글쓴이 대댓글');
      assert.ok(!doc.getElementById('comment_li_1').classList.contains('dcu-cmt-author'), '남의 댓글');
      assert.ok(!doc.getElementById('reply_li_12').classList.contains('dcu-cmt-author'), '남의 대댓글');
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-author-badge').length, 2, '배지는 글쓴이 것만');

      // 옵저버가 여러 번 호출해도 배지가 늘어나선 안 된다.
      feature.apply();
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-author-badge').length, 2, '배지가 중복 생성됐다');
      assert.deepStrictEqual(childOrder(list), before, '재적용이 순서를 바꿨다');

      // "글쓴이 댓글만": 부모가 숨겨진 답글 묶음은 고아로 남지 않아야 한다.
      feature.authorOnly = true;
      feature._applyFilter(list);

      assert.ok(doc.getElementById('comment_li_1').classList.contains('dcu-cmt-hidden'), '남의 댓글은 숨김');
      assert.ok(!doc.getElementById('comment_li_2').classList.contains('dcu-cmt-hidden'), '글쓴이 댓글은 유지');
      assert.ok(!doc.getElementById('reply_li_11').classList.contains('dcu-cmt-hidden'), '글쓴이 대댓글은 유지');

      const blocks = Array.from(list.querySelectorAll(SELECTORS.commentReplyBlock));
      assert.strictEqual(blocks.length, 2, '답글 묶음 2개');
      const blockOf = (replyId) => blocks.find(b => b.querySelector('#' + replyId));
      assert.ok(
        !blockOf('reply_li_11').classList.contains('dcu-cmt-hidden'),
        '글쓴이 대댓글이 남아 있는 묶음은 보여야 한다'
      );
      assert.ok(
        blockOf('reply_li_31').classList.contains('dcu-cmt-hidden'),
        '전부 숨겨진 답글 묶음은 고아로 남지 않도록 함께 숨겨야 한다'
      );
      assert.deepStrictEqual(childOrder(list), before, '필터가 순서를 바꿨다');

      // 해제하면 흔적이 남지 않는다.
      feature.clear();
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-author-badge').length, 0, '배지가 남았다');
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-hidden').length, 0, '숨김이 남았다');
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-author').length, 0, '강조가 남았다');
      assert.deepStrictEqual(childOrder(list), before, 'clear() 가 순서를 바꿨다');

      // 재정렬 기능이 되살아나지 않았는지 확인한다.
      assert.strictEqual(typeof feature._reorder, 'undefined', '_reorder 가 다시 생겼다');
      assert.strictEqual(typeof feature.restore, 'undefined', 'restore 가 다시 생겼다');
      assert.strictEqual(list.querySelectorAll('.dcu-cmt-child').length, 0, '들여쓰기 클래스가 다시 붙었다');
    } finally {
      global.document = savedDocument;
      global.MutationObserver = savedObserver;
    }
    console.log('OK [2.0.2] 댓글 순서는 유지되고 글쓴이 강조만 적용된다');
  }

  // ------------------------------------------------------------------
  // 6. 브라우저 멈춤 회귀 가드 — 옵저버가 자기 변경으로 되살아나지 않는다
  //
  // 2.0.2 초판의 MutationObserver 는 apply() 가 넣은 배지/툴바를 자기 변경으로
  // 다시 감지해 무한히 돌았다(외부 변경 1건 -> apply() 500회+). 마이크로태스크로
  // 미뤘기 때문에 이벤트 루프까지 굶어 탭이 통째로 멈췄다.
  // ------------------------------------------------------------------
  {
    const dom = new JSDOM(readFixture('dc-comments-with-replies.html'), { pretendToBeVisual: true });
    const w = dom.window;
    const savedDocument = global.document;
    const savedObserver = global.MutationObserver;
    global.document = w.document;
    global.MutationObserver = w.MutationObserver; // 진짜 옵저버여야 루프가 재현된다

    try {
      const feature = new CommentAuthorFeature();
      feature.enabled = true;

      let calls = 0;
      const realApply = feature.apply.bind(feature);
      feature.apply = function countedApply() {
        calls++;
        if (calls > 100) throw new Error(`apply() 폭주 — ${calls}회 (되먹임 루프)`);
        return realApply();
      };

      feature.apply();
      feature._watchComments();
      const baseline = calls;

      // 디시가 댓글을 새로 붙이는 상황 3회
      const list = w.document.querySelector('.cmt_list');
      for (let i = 0; i < 3; i++) {
        const li = w.document.createElement('li');
        li.id = `comment_li_9${i}`;
        li.className = 'ub-content';
        li.innerHTML = '<div class="cmt_info"><span class="gall_writer ub-writer" data-nick="글쓴이" '
          + 'data-uid="author_uid"></span><p class="usertxt">추가</p></div>';
        list.appendChild(li);
        await new Promise(r => setTimeout(r, 120));
      }
      await new Promise(r => setTimeout(r, 300));

      const triggered = calls - baseline;
      assert.ok(
        triggered <= 6,
        `외부 변경 3회에 apply() 가 ${triggered}회 돌았다 — 되먹임 루프로 보인다`
      );
      assert.ok(triggered >= 1, '외부 변경을 아예 감지하지 못했다');

      // 정착 상태에서는 apply() 를 몇 번 불러도 DOM 을 쓰지 않아야 한다.
      // 이게 깨지면 공유 domObserver 쪽 호출만으로도 다시 루프가 생긴다.
      let writes = 0;
      const probe = new w.MutationObserver(records => { writes += records.length; });
      probe.observe(w.document.querySelector('.view_comment'), { childList: true, subtree: true });
      for (let i = 0; i < 50; i++) feature.apply();
      await new Promise(r => setTimeout(r, 100));
      probe.disconnect();
      assert.strictEqual(writes, 0, `apply() 반복이 DOM 을 ${writes}회 변경했다 — 멱등하지 않다`);

      assert.strictEqual(
        w.document.querySelectorAll('.dcu-cmt-toolbar').length, 1,
        '툴바가 여러 개 생겼다'
      );

      // 툴바를 매번 다시 만들면 클릭 리스너가 쌓여 한 번 눌러도 여러 번 토글된다.
      const button = w.document.querySelector('.dcu-cmt-btn');
      button.dispatchEvent(new w.Event('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 30));
      assert.strictEqual(feature.authorOnly, true, '토글 1회가 반영되지 않았다');
      button.dispatchEvent(new w.Event('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 30));
      assert.strictEqual(feature.authorOnly, false, '클릭 리스너가 중복 등록됐다');

      feature.onDisable();
      assert.strictEqual(
        w.document.querySelectorAll('.dcu-cmt-toolbar').length, 0,
        '해제 후 툴바가 남았다'
      );
    } finally {
      global.document = savedDocument;
      global.MutationObserver = savedObserver;
    }
    console.log('OK [2.0.3] 옵저버가 자기 변경으로 되살아나지 않는다 (멈춤 회귀 가드)');
  }

  console.log('--- 2.0.2 Regression Tests Passed ---');
}
