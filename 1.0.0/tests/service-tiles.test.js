/**
 * 서비스 타일 테스트 — 순서 정규화 / 동적 페이지 계산 / 페이지 렌더
 *
 * 타일이 패널 폭에 다 안 들어가면 페이지로 나뉘고, 순서는 사용자가 드래그로
 * 바꿀 수 있다. 저장된 순서가 버전 업(타일 추가/제거)을 넘어서도 깨지지 않는
 * 것과, 페이지 계산이 좁은 패널에서도 최소 1개는 보장하는 것을 지킨다.
 */
import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  SERVICE_TILES,
  DEFAULT_TILE_ORDER,
  TILE_SIZE,
  TILE_GAP,
  BAR_PADDING,
  normalizeTileOrder,
  tilesPerPage,
  pageCount,
  renderServiceBar,
  readOrderFromDom,
  renderPageDots,
  computeShifts,
  createWheelPager,
  WHEEL_PAGE_THRESHOLD,
  WHEEL_PAGE_COOLDOWN_MS,
  WHEEL_IDLE_RESET_MS
} from '../src/ui/sidepanel/service-tiles.js';

export async function runServiceTilesTests() {
  console.log('--- Service Tiles Tests (상단바 페이징/재정렬) ---');

  // 1. 타일 정의가 온전하다
  assert.ok(SERVICE_TILES.length >= 8, '서비스 타일이 8개보다 적습니다.');
  for (const t of SERVICE_TILES) {
    assert.ok(t.view && t.label && t.icon, `타일 정의가 불완전합니다: ${JSON.stringify(t)}`);
  }
  assert.strictEqual(
    new Set(DEFAULT_TILE_ORDER).size,
    DEFAULT_TILE_ORDER.length,
    'data-view 키가 중복됩니다.'
  );
  console.log('✅ [Tiles] 타일 정의와 기본 순서가 온전하다');

  // 2. 순서 정규화 — 저장본이 어떻게 망가져 있어도 항상 전체 타일을 한 번씩 낸다
  const cases = [
    [null, '저장본이 없을 때'],
    [undefined, 'undefined 일 때'],
    ['garbage', '배열이 아닐 때'],
    [[], '빈 배열일 때'],
    [['alerts', 'alerts', 'search'], '중복이 있을 때'],
    [['deleted-tile', 'write'], '없는 키가 섞였을 때'],
    [DEFAULT_TILE_ORDER.slice().reverse(), '완전히 뒤집혔을 때']
  ];
  for (const [input, label] of cases) {
    const out = normalizeTileOrder(input);
    assert.strictEqual(out.length, DEFAULT_TILE_ORDER.length, `${label}: 타일 개수가 다릅니다.`);
    assert.strictEqual(new Set(out).size, out.length, `${label}: 중복이 남았습니다.`);
    for (const view of DEFAULT_TILE_ORDER) {
      assert.ok(out.includes(view), `${label}: "${view}" 타일이 사라졌습니다.`);
    }
  }
  // 저장된 부분 순서는 앞에서 존중되고, 나머지는 기본 순서로 뒤에 붙는다
  const partial = normalizeTileOrder(['write', 'alerts']);
  assert.deepStrictEqual(partial.slice(0, 2), ['write', 'alerts'], '저장된 순서가 앞에 오지 않습니다.');
  assert.deepStrictEqual(
    partial.slice(2),
    DEFAULT_TILE_ORDER.filter(v => v !== 'write' && v !== 'alerts'),
    '신규 타일이 기본 순서대로 뒤에 붙지 않았습니다.'
  );
  // 뒤집힌 순서는 그대로 보존된다 (드래그 결과가 무시되면 안 된다)
  const reversed = DEFAULT_TILE_ORDER.slice().reverse();
  assert.deepStrictEqual(normalizeTileOrder(reversed), reversed, '사용자 지정 순서가 보존되지 않았습니다.');
  console.log('✅ [Tiles] 순서 정규화가 중복/미지원 키/신규 타일을 모두 처리한다');

  // 3. 페이지당 타일 수 — 좁아도 최소 1개, 한 칸이 더 들어갈 폭이면 늘어난다
  assert.strictEqual(tilesPerPage(0), 1, '폭이 0일 때도 1개는 나와야 합니다.');
  assert.strictEqual(tilesPerPage(-100), 1, '음수 폭에서도 1개는 나와야 합니다.');
  const w4 = BAR_PADDING * 2 + TILE_SIZE * 4 + TILE_GAP * 3;
  assert.strictEqual(tilesPerPage(w4), 4, '딱 4개가 들어가는 폭에서 4가 아닙니다.');
  assert.strictEqual(tilesPerPage(w4 - 1), 3, '4개가 1px 모자란 폭에서 3이 아닙니다.');
  assert.strictEqual(tilesPerPage(w4 + TILE_GAP + TILE_SIZE), 5, '한 칸 더 넓어졌는데 5가 아닙니다.');
  // 폭이 넓어질 때 개수가 줄어드는 구간이 없어야 한다 (단조 증가)
  let prev = 0;
  for (let w = 0; w <= 1200; w += 7) {
    const n = tilesPerPage(w);
    assert.ok(n >= prev, `폭 ${w}px 에서 페이지당 타일 수가 줄었습니다: ${prev} → ${n}`);
    prev = n;
  }
  console.log('✅ [Tiles] 페이지당 타일 수가 폭에 따라 단조 증가하고 최소 1개를 보장한다');

  // 4. 페이지 수
  assert.strictEqual(pageCount(8, 3), 3, '8개/3칸이 3페이지가 아닙니다.');
  assert.strictEqual(pageCount(8, 8), 1, '전부 들어가는데 1페이지가 아닙니다.');
  assert.strictEqual(pageCount(8, 20), 1, '칸이 남을 때도 1페이지여야 합니다.');
  assert.strictEqual(pageCount(0, 4), 1, '타일이 없어도 페이지 수는 1 이어야 합니다.');
  assert.strictEqual(pageCount(8, 0), 8, 'perPage 가 0 이면 1로 보정돼야 합니다.');
  console.log('✅ [Tiles] 페이지 수 계산이 경계값에서 무너지지 않는다');

  // 5. 렌더 — 타일이 페이지로 나뉘고, 순서/개수/배지가 유지된다
  const dom = new JSDOM('<!doctype html><body><nav id="bar"></nav><div id="dots"></div></body>');
  global.document = dom.window.document;
  const bar = dom.window.document.getElementById('bar');
  const dots = dom.window.document.getElementById('dots');

  const order = normalizeTileOrder(['write', 'alerts']);
  renderServiceBar(bar, order, 3);
  assert.strictEqual(bar.querySelectorAll('.sp-tile-page').length, 3, '8개/3칸이 3페이지로 나뉘지 않았습니다.');
  assert.strictEqual(bar.querySelectorAll('.sp-tile').length, order.length, '타일이 누락됐습니다.');
  assert.deepStrictEqual(readOrderFromDom(bar), order, 'DOM 순서가 요청한 순서와 다릅니다.');
  assert.strictEqual(
    bar.querySelectorAll('.sp-tile-page')[2].children.length,
    2,
    '마지막 페이지에 나머지 2개가 들어가지 않았습니다.'
  );
  assert.ok(
    bar.querySelector('.sp-tile[data-view="alerts"] #sp-tile-badge-alerts'),
    '알림 배지 노드가 렌더되지 않았습니다 — 미읽음 카운트를 표시할 곳이 없어집니다.'
  );
  assert.ok(
    bar.querySelector('.sp-tile[data-view="search"] svg path[d]'),
    '아이콘 path 가 렌더되지 않았습니다.'
  );
  assert.strictEqual(
    bar.querySelector('.sp-tile[data-view="search"]').getAttribute('role'),
    'tab',
    '타일에 role="tab" 이 없습니다.'
  );

  // 재렌더는 이전 타일을 남기지 않는다
  renderServiceBar(bar, order, 8);
  assert.strictEqual(bar.querySelectorAll('.sp-tile-page').length, 1, '재렌더 후 페이지가 정리되지 않았습니다.');
  assert.strictEqual(bar.querySelectorAll('.sp-tile').length, order.length, '재렌더가 타일을 중복 생성했습니다.');
  console.log('✅ [Tiles] 페이지 렌더가 순서/배지/아이콘을 유지하고 재렌더 시 중복되지 않는다');

  // 6. 점 인디케이터는 2페이지 이상일 때만 보인다
  renderPageDots(dots, 1, 0);
  assert.ok(dots.classList.contains('hidden'), '1페이지일 때 점이 숨겨지지 않았습니다.');
  assert.strictEqual(dots.children.length, 0, '1페이지인데 점이 렌더됐습니다.');

  renderPageDots(dots, 3, 1);
  assert.ok(!dots.classList.contains('hidden'), '여러 페이지인데 점이 숨겨져 있습니다.');
  assert.strictEqual(dots.children.length, 3, '점 개수가 페이지 수와 다릅니다.');
  assert.ok(dots.children[1].classList.contains('active'), '현재 페이지의 점이 활성화되지 않았습니다.');
  assert.strictEqual(dots.querySelectorAll('.active').length, 1, '활성 점이 하나가 아닙니다.');

  // 개수가 같으면 노드를 다시 만들지 않고 활성 표시만 옮긴다 (트랜지션 유지)
  const dotNodes = [...dots.children];
  renderPageDots(dots, 3, 2);
  assert.deepStrictEqual([...dots.children], dotNodes, '개수가 같은데 점 노드를 다시 만들었습니다.');
  assert.ok(dots.children[2].classList.contains('active'), '활성 점이 옮겨지지 않았습니다.');
  assert.ok(!dots.children[1].classList.contains('active'), '이전 활성 점이 남아 있습니다.');

  // 개수가 달라지면 다시 만든다
  renderPageDots(dots, 4, 0);
  assert.strictEqual(dots.children.length, 4, '페이지 수가 늘었는데 점이 따라오지 않았습니다.');
  renderPageDots(dots, 1, 0);
  assert.strictEqual(dots.children.length, 0, '1페이지로 줄었는데 점이 남아 있습니다.');
  console.log('✅ [Tiles] 점 인디케이터가 페이지 수/현재 위치를 반영하고 불필요한 재생성을 피한다');

  // 6.5 드래그 중 밀림 애니메이션이 "실제로 갈 자리" 를 가리켜야 한다
  const STEP = TILE_SIZE + TILE_GAP;
  assert.deepStrictEqual(
    computeShifts(8, 4, 2, 2, STEP),
    new Array(8).fill(0),
    '제자리에 놓을 때는 아무것도 움직이면 안 됩니다.'
  );
  // 한 페이지 안에서 오른쪽으로: 사이 타일들이 한 칸 왼쪽으로 비켜 준다
  assert.deepStrictEqual(
    computeShifts(4, 4, 0, 2, STEP),
    [0, -STEP, -STEP, 0],
    '오른쪽으로 옮길 때 사이 타일이 왼쪽으로 비켜 주지 않습니다.'
  );
  // 왼쪽으로: 사이 타일들이 한 칸 오른쪽으로
  assert.deepStrictEqual(
    computeShifts(4, 4, 3, 1, STEP),
    [0, STEP, STEP, 0],
    '왼쪽으로 옮길 때 사이 타일이 오른쪽으로 비켜 주지 않습니다.'
  );
  // 드래그하지 않는 타일은 건드리지 않는다
  assert.deepStrictEqual(
    computeShifts(8, 4, 5, 6, STEP).filter((v, i) => v !== 0 && (i < 5 || i > 6)),
    [],
    '이동 구간 밖의 타일이 움직였습니다.'
  );

  /**
   * 가장 중요한 불변식: 밀림량이 가리키는 자리가 손을 뗀 뒤 실제로 놓이는
   * 자리와 같아야 한다. 어긋나면 사용자는 A 를 보고 B 에 놓게 된다.
   * 각 타일의 (페이지, 칸) 좌표를 밀림량으로 계산해 실제 재배치 결과와 맞춘다.
   */
  function slotOf(index, perPage) {
    return { page: Math.floor(index / perPage), col: index % perPage };
  }
  for (const perPage of [1, 2, 3, 4, 5, 8]) {
    const n = 8;
    for (let from = 0; from < n; from += 1) {
      for (let to = 0; to < n; to += 1) {
        const shifts = computeShifts(n, perPage, from, to, STEP);
        // 실제 재배치 결과
        const arr = Array.from({ length: n }, (_, i) => i);
        const [held] = arr.splice(from, 1);
        arr.splice(to, 0, held);
        for (let i = 0; i < n; i += 1) {
          if (i === from) continue;
          const finalIndex = arr.indexOf(i);
          const startSlot = slotOf(i, perPage);
          const endSlot = slotOf(finalIndex, perPage);
          // 애니메이션은 같은 페이지 안의 가로 이동으로만 표현된다. 페이지가
          // 바뀌는 타일은 되감기(wrap)로 반대쪽 끝을 가리켜야 한다.
          const expected = (endSlot.col - startSlot.col) * STEP;
          assert.strictEqual(
            shifts[i],
            expected,
            `perPage=${perPage} ${from}→${to}: 타일 ${i} 의 밀림량이 실제 착지 칸과 다릅니다 `
              + `(밀림 ${shifts[i]}px, 착지 칸 차이 ${expected}px)`
          );
        }
      }
    }
  }
  console.log('✅ [Tiles] 드래그 밀림 애니메이션이 실제 착지 위치와 일치한다 (perPage 1~8 전수)');

  // 7. CSS 상수와 JS 상수가 어긋나면 페이지 계산이 틀어진다
  const fs = await import('fs');
  const css = fs.readFileSync(new URL('../src/ui/sidepanel/sidepanel.css', import.meta.url), 'utf-8');
  // 규칙만 보도록 주석을 걷어낸다 — 주석에 적힌 설명이 규칙으로 오인되면 안 된다.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    css.includes(`width: ${TILE_SIZE}px`) && css.includes(`grid-auto-columns: ${TILE_SIZE}px`),
    `sidepanel.css 의 타일 크기가 TILE_SIZE(${TILE_SIZE}px) 와 다릅니다 — 페이지 계산이 어긋납니다.`
  );
  assert.ok(
    css.includes(`padding: 0 ${BAR_PADDING}px`),
    `sidepanel.css 의 페이지 좌우 패딩이 BAR_PADDING(${BAR_PADDING}px) 와 다릅니다.`
  );
  // 좌우 패딩이 스크롤 컨테이너에 있으면 `flex: 0 0 100%` 가 패딩을 뺀 폭으로
  // 풀려서 페이지 폭 != clientWidth 가 되고 페이지 스크롤이 어긋난다.
  assert.ok(
    /\.sp-servicebar \{[^}]*padding: 8px 0;/.test(rules),
    '서비스 바에 좌우 패딩이 남아 있습니다 — 페이지 폭이 clientWidth 와 어긋납니다.'
  );
  assert.ok(
    // `overscroll-behavior-x` 가 부분 문자열로 걸리지 않게 속성 시작을 고정한다.
    !/\.sp-servicebar \{[^}]*[\s;]scroll-behavior\s*:/.test(rules),
    '서비스 바에 scroll-behavior 가 걸려 있습니다 — 재렌더 후 위치 복원이 애니메이션으로 새어 나갑니다.'
  );
  assert.ok(css.includes('scroll-snap-type: x mandatory'), '서비스 바에 scroll-snap 이 없습니다.');
  assert.ok(css.includes('scroll-snap-align: start'), '페이지에 scroll-snap-align 이 없습니다.');
  console.log('✅ [Tiles] CSS 의 타일 크기/패딩이 JS 페이지 계산 상수와 일치한다');


  // 8. 휠/트랙패드 페이징 — 세로 휠도 가로 이동으로 받는다
  let clock = 1000;
  let landedOn = -1;
  let page = 0;
  let pages = 3;
  const pager = createWheelPager({
    pages: () => pages,
    currentPage: () => page,
    goToPage: (p) => { landedOn = p; page = p; },
    now: () => clock
  });
  /** 이벤트 대신 델타만 넘긴다 — 핸들러가 읽는 것은 deltaX/deltaY/deltaMode 뿐이다. */
  const wheel = (dy, { dx = 0, mode = 0 } = {}) => pager({ deltaX: dx, deltaY: dy, deltaMode: mode });
  const reset = () => { landedOn = -1; };

  // 한 페이지뿐이면 아무것도 하지 않고 이벤트를 넘긴다 (본문이 스크롤돼야 한다)
  pages = 1;
  assert.strictEqual(wheel(120), false, '1페이지인데 휠 이벤트를 삼켰습니다.');
  assert.strictEqual(landedOn, -1, '1페이지인데 페이지를 넘겼습니다.');
  pages = 3;

  // 세로 휠 한 노치로 다음 페이지
  reset();
  assert.strictEqual(wheel(120), true, '세로 휠이 처리되지 않았습니다.');
  assert.strictEqual(landedOn, 1, '세로 휠로 다음 페이지로 넘어가지 않았습니다.');

  // 방금 넘겼으면 관성 델타는 삼키고 페이지는 그대로 (한 제스처에 두 페이지 금지)
  reset();
  clock += 50;
  assert.strictEqual(wheel(120), true, '관성 델타가 본문으로 새어 나갑니다.');
  assert.strictEqual(landedOn, -1, `한 제스처로 두 페이지를 넘겼습니다 (page=${page}).`);

  // 쿨다운이 지나면 다시 넘어간다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(120), true, '쿨다운 후 휠이 처리되지 않았습니다.');
  assert.strictEqual(landedOn, 2, '쿨다운 후 다음 페이지로 넘어가지 않았습니다.');

  // 마지막 페이지에서 더 굴리면 막지 않는다 — 본문이 대신 스크롤돼야 한다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(120), false, '마지막 페이지에서 이벤트를 삼켰습니다.');
  assert.strictEqual(landedOn, -1, '마지막 페이지를 넘어갔습니다.');

  // 거꾸로 굴리면 이전 페이지로, 첫 페이지에서 더 거꾸로는 넘기지 않는다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(-120), true, '역방향 휠이 처리되지 않았습니다.');
  assert.strictEqual(landedOn, 1, '역방향 휠로 이전 페이지로 가지 않았습니다.');
  page = 0;
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(-120), false, '첫 페이지에서 역방향 이벤트를 삼켰습니다.');
  assert.strictEqual(landedOn, -1, '첫 페이지 앞으로 넘어갔습니다.');

  // 트랙패드: 자잘한 델타는 누적해서 임계값을 넘을 때 한 번만 넘긴다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  const smallStep = Math.ceil(WHEEL_PAGE_THRESHOLD / 3);
  assert.strictEqual(wheel(smallStep), true, '작은 델타가 처리되지 않았습니다.');
  assert.strictEqual(landedOn, -1, '임계값 미만인데 페이지를 넘겼습니다.');
  clock += 20;
  wheel(smallStep);
  assert.strictEqual(landedOn, -1, '임계값 미만인데 페이지를 넘겼습니다.');
  clock += 20;
  wheel(smallStep);
  assert.strictEqual(landedOn, 1, '누적 델타가 임계값을 넘었는데 페이지가 넘어가지 않았습니다.');

  // 방향이 바뀌면 누적을 버린다 (아래로 조금 → 위로 조금이 합쳐져 넘어가면 안 된다)
  page = 1;
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  wheel(WHEEL_PAGE_THRESHOLD - 1);
  clock += 20;
  wheel(-(WHEEL_PAGE_THRESHOLD - 1));
  assert.strictEqual(landedOn, -1, '방향이 바뀌었는데 누적이 살아 있습니다.');

  // 오래 쉬면 누적을 버린다 (살살 굴린 두 제스처가 합쳐지면 안 된다)
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  wheel(WHEEL_PAGE_THRESHOLD - 1);
  clock += WHEEL_IDLE_RESET_MS + 1;
  wheel(WHEEL_PAGE_THRESHOLD - 1);
  assert.strictEqual(landedOn, -1, '오래 쉰 뒤에도 이전 누적이 합쳐졌습니다.');

  // 가로 델타(트랙패드 두 손가락 좌우)가 더 크면 그쪽을 따른다
  page = 0;
  reset();
  clock += WHEEL_IDLE_RESET_MS + 1;
  assert.strictEqual(wheel(-10, { dx: 120 }), true, '가로 델타가 처리되지 않았습니다.');
  assert.strictEqual(landedOn, 1, '가로 델타 방향으로 넘어가지 않았습니다.');

  // 줄 단위(deltaMode=1, 파이어폭스/리눅스) 델타도 픽셀로 환산해 받는다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(3, { mode: 1 }), true, '줄 단위 델타가 처리되지 않았습니다.');
  assert.strictEqual(landedOn, 2, '줄 단위 델타가 픽셀로 환산되지 않았습니다.');

  // 델타가 0인 이벤트는 그냥 흘려보낸다
  reset();
  clock += WHEEL_PAGE_COOLDOWN_MS + 1;
  assert.strictEqual(wheel(0), false, '델타 0 인 이벤트를 삼켰습니다.');
  console.log('✅ [Tiles] 휠/트랙패드가 페이지 단위로 좌우 이동한다 (누적·쿨다운·끝 페이지 통과)');

  // 8.5 배선 가드 — 핸들러가 붙어 있고 기본 스크롤을 막을 수 있어야 한다
  const panelJs = fs.readFileSync(new URL('../src/ui/sidepanel/sidepanel.js', import.meta.url), 'utf-8');
  assert.ok(
    /addEventListener\('wheel'[\s\S]{0,600}?\{ passive: false \}\)/.test(panelJs),
    "sidepanel.js 의 wheel 리스너가 { passive: false } 로 붙어 있지 않습니다 — preventDefault 가 무시되고 본문이 함께 스크롤됩니다."
  );
  assert.ok(
    /wheelPager\(e\)\) e\.preventDefault\(\)/.test(panelJs),
    'wheel 리스너가 처리한 이벤트의 기본 동작을 막지 않습니다 — 바를 넘길 때 본문도 함께 스크롤됩니다.'
  );
  console.log('✅ [Tiles] 사이드패널이 휠 페이저를 passive:false 로 배선한다');

  delete global.document;
  console.log('✓ Service Tiles tests passed');
}
