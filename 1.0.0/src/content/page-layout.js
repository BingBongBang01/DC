/**
 * DC 페이지 레이아웃 보정.
 *
 * 좌우 날개 광고 배너를 숨긴다. 이 배너들은 `position: absolute; left: 50%` 로
 * 중앙 기준 −780px ~ +1100px 를 차지해 페이지가 약 2200px 폭을 요구하게 만든다.
 *
 * 가로 오버플로를 clamp 하지 않는다는 점이 중요하다. `html, body` 에
 * `overflow-x: hidden` 을 걸면 디씨의 1160px 고정 레이아웃이 그보다 좁은 창에서
 * 스크롤바 없이 잘려 나가, 우측 사이드바를 볼 방법이 없어진다.
 */

/**
 * 마지막 항목은 페이지 종류별 변형(`ad_left_wing_list_top`,
 * `ad_left_wing_right_top`, 본문 페이지의 다른 이름 등)을 함께 잡는다.
 * 반드시 양쪽에 밑줄을 붙인 `_wing_` 이어야 한다 — `wing` 만 쓰면 디씨의
 * `.following` 이 걸린다.
 */
export const AD_WING_SELECTORS = [
  '#ad_floating',
  '.ad_left_wing_list_top',
  '.ad_left_wing_right_top',
  'div[class*="_wing_"]',
];

export const AD_WING_HIDE_STYLE_ID = 'dc-ultimate-ad-wing-hide-style';

export function buildAdWingHideCss() {
  return `${AD_WING_SELECTORS.join(',\n')} {\n  display: none !important;\n}\n`;
}

/** 같은 문서에 여러 번 호출해도 스타일은 한 번만 주입된다. */
export function injectAdWingHideStyles(doc = document) {
  if (doc.getElementById(AD_WING_HIDE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = AD_WING_HIDE_STYLE_ID;
  style.textContent = buildAdWingHideCss();
  doc.head.appendChild(style);
}

/**
 * 주입한 스타일을 되돌린다. 설정을 끄면 날개 광고가 다시 보이고, 그와 함께
 * 디씨 원본의 가로 스크롤도 복귀한다. 주입되지 않은 상태에서 호출해도 안전하다.
 */
export function removeAdWingHideStyles(doc = document) {
  doc.getElementById(AD_WING_HIDE_STYLE_ID)?.remove();
}
