/**
 * 페이지 레이아웃 테스트 — 좌우 잘림 / 가로 스크롤 불가 회귀 방지
 *
 * 이전에는 광고 날개를 숨기는 스타일에 `html, body { overflow-x: hidden
 * !important }` 가 함께 들어 있어서, 디씨의 1160px 고정 레이아웃이 그보다 좁은
 * 창에서 가로 스크롤 없이 잘려 나갔다. 아래 테스트는 그 규칙이 되살아나는 것과
 * `body.style.zoom` 축소 해킹이 다시 들어오는 것을 막는다.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import {
  AD_WING_SELECTORS,
  AD_WING_HIDE_STYLE_ID,
  buildAdWingHideCss,
  injectAdWingHideStyles
} from '../src/content/page-layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures/dc.html');
const CONTENT_INDEX = path.join(__dirname, '../src/content/index.js');

export async function runPageLayoutTests() {
  console.log('--- Page Layout Tests (좌우 스크롤) ---');

  // 1. 주입되는 CSS 가 페이지 전역 오버플로/줌을 건드리지 않는다
  const css = buildAdWingHideCss();
  for (const forbidden of ['overflow', 'zoom', 'html', 'body']) {
    assert.ok(
      !css.includes(forbidden),
      `광고 날개 숨김 CSS 에 "${forbidden}" 이 들어 있습니다 — 페이지 전역 레이아웃을 건드리면 안 됩니다:\n${css}`
    );
  }
  assert.ok(css.includes('display: none !important'), '날개를 숨기는 규칙이 없습니다.');
  console.log('✅ [Layout] 날개 숨김 CSS 는 html/body 오버플로를 건드리지 않는다');

  // 2. 셀렉터가 실제 디씨 마크업의 날개 배너를 잡는다
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'));
  const { document } = dom.window;
  const selector = AD_WING_SELECTORS.join(', ');
  const hidden = new Set(document.querySelectorAll(selector));

  const leftWing = document.querySelector('.ad_left_wing_list_top');
  const rightWing = document.querySelector('.ad_left_wing_right_top');
  const floating = document.getElementById('ad_floating');
  assert.ok(leftWing && rightWing && floating, 'fixture 에 날개 배너가 없습니다 — fixture 가 바뀌었는지 확인하세요.');
  assert.ok(hidden.has(leftWing), '좌측 날개 배너가 셀렉터에 잡히지 않습니다.');
  assert.ok(hidden.has(rightWing), '우측 날개 배너가 셀렉터에 잡히지 않습니다.');
  assert.ok(hidden.has(floating), '#ad_floating 이 셀렉터에 잡히지 않습니다.');
  console.log('✅ [Layout] 좌우 날개 배너와 #ad_floating 을 실제 마크업에서 잡아낸다');

  // 3. 와일드카드가 정상 요소를 잡지 않는다 (`.following` 에 "wing" 이 들어 있다)
  const following = document.querySelector('.following');
  assert.ok(following, 'fixture 에 .following 이 없습니다 — 대조군이 사라졌습니다.');
  assert.ok(
    !hidden.has(following),
    '`_wing_` 와일드카드가 .following 을 잡았습니다 — 정상 요소를 숨기게 됩니다.'
  );
  console.log('✅ [Layout] `_wing_` 와일드카드가 .following 같은 정상 요소를 숨기지 않는다');

  // 4. 주입은 멱등이다
  injectAdWingHideStyles(document);
  injectAdWingHideStyles(document);
  const injected = document.querySelectorAll(`#${AD_WING_HIDE_STYLE_ID}`);
  assert.strictEqual(injected.length, 1, '스타일이 중복 주입되었습니다.');
  assert.ok(!injected[0].textContent.includes('overflow'), '주입된 스타일에 overflow 규칙이 있습니다.');
  console.log('✅ [Layout] 스타일 주입은 멱등이다');

  // 5. 콘텐츠 스크립트가 body.style.zoom / overflow-x 를 다시 건드리지 않는다
  const source = fs.readFileSync(CONTENT_INDEX, 'utf-8');
  assert.ok(
    !/style\.zoom/.test(source),
    'src/content/index.js 가 body.style.zoom 을 다시 설정합니다 — 창 폭에 맞춘 축소 해킹은 제거되었습니다.'
  );
  assert.ok(
    !/overflow-x/.test(source),
    'src/content/index.js 가 overflow-x 를 다시 설정합니다 — 가로 스크롤을 막으면 안 됩니다.'
  );
  console.log('✅ [Layout] 콘텐츠 스크립트에 zoom/overflow-x 해킹이 없다');

  console.log('✓ Page Layout tests passed');
}
