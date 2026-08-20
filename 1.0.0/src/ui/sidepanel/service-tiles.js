/**
 * 사이드패널 상단 서비스 바 — 타일 정의, 순서 정규화, 페이지 단위 렌더.
 *
 * 타일은 원래 sidepanel.html 에 8개가 하드코딩돼 있었다. 순서를 사용자가
 * 바꿀 수 있어야 하고, 패널이 좁을 때 타일을 페이지로 나눠 스와이프로
 * 넘겨야 하므로 데이터 기반 렌더로 옮겼다.
 *
 * 페이지는 패널 폭에 따라 동적으로 계산한다. 타일 크기는 고정이고, 한 페이지에
 * 몇 개가 들어가는지만 폭에 따라 달라진다. 각 페이지는 `flex: 0 0 100%` +
 * `scroll-snap-align: start` 라서 가로 스크롤이 페이지 단위로 딱 떨어진다.
 */

/** 타일 크기/간격은 CSS 와 같은 값을 써야 페이지 계산이 어긋나지 않는다. */
export const TILE_SIZE = 62;
export const TILE_GAP = 6;
export const BAR_PADDING = 12;

export const SERVICE_TILES = [
  {
    view: 'search',
    label: '검색',
    icon: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'
  },
  {
    view: 'gallery',
    label: '갤러리',
    icon: 'M12 3L2 9v2h20V9L12 3zM4 13v6H2v2h20v-2h-2v-6h-2v6h-3v-6h-2v6h-3v-6H4z'
  },
  {
    view: 'alerts',
    label: '알림',
    badgeId: 'sp-tile-badge-alerts',
    icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z'
  },
  {
    view: 'guard',
    label: '차단',
    icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z'
  },
  {
    view: 'write',
    label: '작성',
    icon: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
  },
  {
    view: 'archive',
    label: '보관',
    icon: 'M20.54 5.23l-1.39-1.68A1.45 1.45 0 0018 3H6c-.47 0-.88.21-1.16.55L3.46 5.23A1.99 1.99 0 003 6.5V19a2 2 0 002 2h14a2 2 0 002-2V6.5c0-.49-.17-.94-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z'
  },
  {
    view: 'analytics',
    label: '분석',
    icon: 'M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z'
  },
  {
    view: 'view',
    label: '보기',
    icon: 'M3 17h18v2H3v-2zm0-6h18v2H3v-2zm0-6h18v2H3V5zm17.5 12.5l2 2 3.5-3.5'
  }
];

export const DEFAULT_TILE_ORDER = SERVICE_TILES.map(t => t.view);

const TILE_BY_VIEW = new Map(SERVICE_TILES.map(t => [t.view, t]));

/**
 * 저장된 순서를 실제로 쓸 수 있는 배열로 정리한다. 알 수 없는 키와 중복은
 * 버리고, 저장본에 없는(=버전 업으로 새로 추가된) 타일은 뒤에 붙인다.
 * 덕분에 타일이 추가/제거돼도 사용자의 저장본이 깨지지 않는다.
 *
 * @param {unknown} saved configManager 의 `spTileOrder`
 * @returns {string[]}
 */
export function normalizeTileOrder(saved) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(saved)) {
    for (const view of saved) {
      if (TILE_BY_VIEW.has(view) && !seen.has(view)) {
        seen.add(view);
        out.push(view);
      }
    }
  }
  for (const view of DEFAULT_TILE_ORDER) {
    if (!seen.has(view)) out.push(view);
  }
  return out;
}

/**
 * 주어진 바 폭에 타일이 몇 개 들어가는지. 최소 1개는 보장한다.
 * @param {number} barWidth `.sp-servicebar` 의 clientWidth
 * @returns {number}
 */
export function tilesPerPage(barWidth) {
  const usable = barWidth - BAR_PADDING * 2 + TILE_GAP;
  return Math.max(1, Math.floor(usable / (TILE_SIZE + TILE_GAP)));
}

/**
 * @param {number} total 타일 개수
 * @param {number} perPage 한 페이지당 타일 수
 * @returns {number} 페이지 수 (최소 1)
 */
export function pageCount(total, perPage) {
  return Math.max(1, Math.ceil(total / Math.max(1, perPage)));
}

/** 한 타일 버튼을 만든다. 아이콘 path 는 이 모듈의 상수뿐이라 사용자 입력이 섞이지 않는다. */
function createTile(def) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sp-tile';
  btn.dataset.view = def.view;
  btn.setAttribute('role', 'tab');
  btn.setAttribute('aria-label', def.label);
  btn.title = def.label;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', def.icon);
  svg.appendChild(path);
  btn.appendChild(svg);

  const label = document.createElement('span');
  label.className = 'sp-tile-label';
  label.textContent = def.label;
  btn.appendChild(label);

  if (def.badgeId) {
    const badge = document.createElement('span');
    badge.className = 'sp-tile-badge hidden';
    badge.id = def.badgeId;
    badge.textContent = '0';
    btn.appendChild(badge);
  }

  return btn;
}

/**
 * 서비스 바를 페이지 단위로 다시 그린다. 기존 타일 노드는 버리고 새로 만든다.
 *
 * @param {HTMLElement} bar `.sp-servicebar`
 * @param {string[]} order 정규화된 순서
 * @param {number} perPage 한 페이지당 타일 수
 */
export function renderServiceBar(bar, order, perPage) {
  bar.replaceChildren();
  const pages = pageCount(order.length, perPage);
  for (let p = 0; p < pages; p += 1) {
    const page = document.createElement('div');
    page.className = 'sp-tile-page';
    page.dataset.page = String(p);
    for (const view of order.slice(p * perPage, (p + 1) * perPage)) {
      const def = TILE_BY_VIEW.get(view);
      if (def) page.appendChild(createTile(def));
    }
    bar.appendChild(page);
  }
  bar.style.setProperty('--sp-tiles-per-page', String(perPage));
}

/** 현재 DOM 순서를 그대로 읽어 `spTileOrder` 로 저장할 배열을 만든다. */
export function readOrderFromDom(bar) {
  return Array.from(bar.querySelectorAll('.sp-tile'), el => el.dataset.view);
}

/**
 * 점 인디케이터를 갱신한다. 페이지가 1개면 비워 둔다.
 *
 * 개수가 그대로면 노드를 다시 만들지 않고 활성 표시만 옮긴다 — 스크롤 중
 * 매 프레임 다시 만들면 활성 점의 폭 트랜지션이 계속 끊긴다.
 */
export function renderPageDots(dots, pages, activePage) {
  dots.classList.toggle('hidden', pages < 2);
  if (pages < 2) {
    dots.replaceChildren();
    return;
  }
  if (dots.children.length === pages) {
    for (const dot of dots.children) {
      dot.classList.toggle('active', Number(dot.dataset.page) === activePage);
    }
    return;
  }
  dots.replaceChildren();
  for (let p = 0; p < pages; p += 1) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'sp-servicebar-dot';
    dot.dataset.page = String(p);
    dot.setAttribute('aria-label', `서비스 ${p + 1}페이지`);
    dot.classList.toggle('active', p === activePage);
    dots.appendChild(dot);
  }
}

/**
 * 드래그 중 "여기 들어갑니다" 를 보여 주는 밀림량을 계산한다.
 *
 * 잡은 타일이 `from` 에서 `to` 로 갈 때, 그 사이의 타일들은 한 칸씩 반대로
 * 비켜 주면 된다. 다만 페이지 경계에서는 한 칸 옆이 다음/이전 페이지의 반대쪽
 * 끝이므로, 그 타일만 한 페이지 폭(-(perPage-1)칸)만큼 되감아야 실제로 가는
 * 자리로 미끄러진다.
 *
 * DOM 을 건드리지 않고 transform 으로만 표현하므로, 손을 뗄 때 한 번만 재배치
 * 하면 시각적 점프가 없다.
 *
 * @param {number} count 타일 개수
 * @param {number} perPage 한 페이지당 타일 수
 * @param {number} from 잡은 타일의 현재 인덱스
 * @param {number} to 놓을 인덱스
 * @param {number} step 한 칸 = 타일 크기 + 간격 (px)
 * @returns {number[]} 인덱스별 translateX 값 (px). 잡은 타일 자리는 0.
 */
export function computeShifts(count, perPage, from, to, step = TILE_SIZE + TILE_GAP) {
  const out = new Array(count).fill(0);
  if (from === to || from < 0 || to < 0) return out;
  const cols = Math.max(1, perPage);
  for (let i = 0; i < count; i += 1) {
    if (i === from) continue;
    let shift = 0;
    if (from < to && i > from && i <= to) shift = -1;
    else if (from > to && i >= to && i < from) shift = 1;
    if (shift === 0) continue;
    const col = i % cols;
    // 왼쪽으로 밀리는데 이미 페이지 첫 칸이면, 갈 자리는 이전 페이지의 마지막 칸.
    const wraps = (shift === -1 && col === 0) || (shift === 1 && col === cols - 1);
    // `|| 0` 은 perPage 가 1일 때 나오는 -0 을 0 으로 눌러 준다.
    out[i] = (wraps ? -shift * step * (cols - 1) : shift * step) || 0;
  }
  return out;
}

/**
 * 휠 페이징의 감도. 임계값은 한 번의 휠 노치(크롬 기준 deltaY 100)보다 낮게,
 * 트랙패드의 자잘한 델타보다는 높게 잡는다.
 */
export const WHEEL_PAGE_THRESHOLD = 40;
/** 한 페이지 넘긴 뒤 이만큼은 무시한다 — 관성 델타가 두세 페이지를 지나치는 것을 막는다. */
export const WHEEL_PAGE_COOLDOWN_MS = 250;
/** 이만큼 델타가 없으면 누적을 버린다 — 살살 굴린 두 제스처가 합쳐지지 않게. */
export const WHEEL_IDLE_RESET_MS = 400;

/** deltaMode(LINE/PAGE)를 픽셀로 맞춘다. 리눅스/파이어폭스가 줄 단위로 보낸다. */
function toPixels(delta, mode) {
  if (mode === 1) return delta * 16;   // DOM_DELTA_LINE
  if (mode === 2) return delta * 300;  // DOM_DELTA_PAGE
  return delta;
}

/**
 * 서비스 바를 휠/트랙패드로 페이지 단위로 넘기는 핸들러를 만든다.
 *
 * 바는 한 줄이라 세로로 스크롤할 것이 없으므로 세로 휠도 가로 이동으로 받는다.
 * 크롬은 가로 전용 스크롤러에 세로 휠을 흘려 주기도 하지만, `scroll-snap: x
 * mandatory` 가 걸린 컨테이너에서는 스냅에 붙잡혀 제자리로 되돌아온다. 그래서
 * 스크롤을 직접 흘리지 않고 목표 페이지로 `scrollTo` 한다.
 *
 * 반환값은 "이 이벤트를 내가 썼다" 는 뜻이고, 호출부가 `preventDefault` 할지
 * 판단하는 데 쓴다. 끝 페이지에서 더 굴리면 false 를 내 본문이 대신 스크롤된다.
 *
 * 시간은 주입받아 테스트에서 타이머 없이 쿨다운을 검증할 수 있게 한다.
 *
 * @param {object} opts
 * @param {() => number} opts.pages 현재 페이지 수
 * @param {() => number} opts.currentPage 현재 페이지 인덱스
 * @param {(page: number) => void} opts.goToPage 해당 페이지로 이동
 * @param {() => number} [opts.now] 밀리초 타임스탬프
 * @returns {(e: WheelEvent) => boolean}
 */
export function createWheelPager({ pages, currentPage, goToPage, now = () => Date.now() }) {
  let accum = 0;
  let lastAt = 0;
  let lockedUntil = 0;

  return function onWheel(e) {
    if (pages() < 2) return false;

    // 가로 델타가 있으면(트랙패드 두 손가락 좌우) 그쪽을 우선한다.
    const raw = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const delta = toPixels(raw, e.deltaMode);
    if (!delta) return false;

    const at = currentPage();
    const dir = delta > 0 ? 1 : -1;
    const next = at + dir;
    if (next < 0 || next > pages() - 1) {
      accum = 0;
      return false;
    }

    const t = now();
    // 방금 넘겼다면 남은 관성은 삼킨다(본문으로 새지 않게 true).
    if (t < lockedUntil) return true;
    if (dir !== Math.sign(accum) || t - lastAt > WHEEL_IDLE_RESET_MS) accum = 0;
    lastAt = t;
    accum += delta;
    if (Math.abs(accum) < WHEEL_PAGE_THRESHOLD) return true;

    accum = 0;
    lockedUntil = t + WHEEL_PAGE_COOLDOWN_MS;
    goToPage(next);
    return true;
  };
}
