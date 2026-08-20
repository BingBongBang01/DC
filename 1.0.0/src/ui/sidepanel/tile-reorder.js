/**
 * 서비스 타일 롱프레스 드래그 재정렬.
 *
 * HTML5 drag-and-drop 대신 Pointer Events 로 직접 구현한다. 서비스 바는
 * scroll-snap 가로 스크롤 컨테이너이고, DnD 로는 드래그 중 자동 스크롤과
 * 터치 동작을 제어할 방법이 없다.
 *
 * 세 가지 동작이 같은 포인터를 공유하므로 롱프레스로 갈라 놓는다.
 *   짧게 탭            → 서비스 전환 (click 이 그대로 통과)
 *   옆으로 밀기        → 페이지 스와이프 (브라우저 기본 스크롤)
 *   350ms 누른 뒤 이동 → 재정렬
 *
 * 드래그 중에는 DOM 을 건드리지 않는다. 잡은 타일은 transform 으로 손가락을
 * 따라가고, 비켜 줄 타일들은 한 칸씩 밀리는 transform 만 받는다. 실제 DOM
 * 재배치는 손을 뗄 때 한 번만 일어나므로 시각적 점프가 없다.
 */

import { computeShifts } from './service-tiles.js';

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;
const EDGE_ZONE_PX = 40;
const EDGE_DWELL_MS = 300;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.bar `.sp-servicebar`
 * @param {() => {size: number, gap: number, perPage: number}} opts.metrics 현재 타일 크기/간격/페이지당 개수
 * @param {(order: string[]) => void} opts.onReorder 새 순서가 확정됐을 때
 * @returns {() => void} 해제 함수
 */
export function attachTileReorder({ bar, metrics, onReorder }) {
  /** @type {HTMLElement|null} */
  let dragged = null;
  let pressTimer = 0;
  let edgeTimer = 0;
  let rafId = 0;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  /** 드래그를 실제로 시작했는지 — click 을 삼킬지 판단하는 데도 쓴다. */
  let dragging = false;
  /** 드래그를 시작할 때의 타일 순서(문자열 배열)와 잡은 타일의 인덱스. */
  let order = [];
  let fromIndex = -1;
  let toIndex = -1;

  const tiles = () => Array.from(bar.querySelectorAll('.sp-tile'));

  function clearTimers() {
    clearTimeout(pressTimer);
    clearTimeout(edgeTimer);
    cancelAnimationFrame(rafId);
    pressTimer = 0;
    edgeTimer = 0;
    rafId = 0;
  }

  /** 비켜 줄 타일들에 한 칸 밀림을 적용한다. 잡은 타일은 손가락 델타만 받는다. */
  function paint() {
    rafId = 0;
    if (!dragging || !dragged) return;
    const { size, gap, perPage } = metrics();
    const list = tiles();
    const shifts = computeShifts(list.length, perPage, fromIndex, toIndex, size + gap);

    dragged.style.transform = `translate(${lastX - startX}px, ${lastY - startY}px) scale(1.08)`;
    list.forEach((tile, i) => {
      if (tile === dragged) return;
      tile.style.transform = shifts[i] === 0 ? '' : `translateX(${shifts[i]}px)`;
    });
  }

  /** 포인터 위치에서 삽입 대상 인덱스를 고른다. 각 타일 중심을 기준선으로 쓴다. */
  function computeTarget() {
    const list = tiles();
    let target = fromIndex;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] === dragged) continue;
      const r = list[i].getBoundingClientRect();
      // 세로로 벗어난 타일(다른 페이지의 같은 행은 없으므로 사실상 화면 밖)은 건너뛴다.
      if (lastY < r.top - r.height || lastY > r.bottom + r.height) continue;
      if (lastX > r.left + r.width / 2) target = Math.max(target, i);
      else if (lastX < r.left + r.width / 2) target = Math.min(target, i);
    }
    return target;
  }

  /** 드래그 중 바 끝에 머무르면 인접 페이지로 넘긴다. */
  function scheduleEdgeScroll() {
    const r = bar.getBoundingClientRect();
    const pageWidth = bar.clientWidth;
    const dir = lastX < r.left + EDGE_ZONE_PX ? -1 : lastX > r.right - EDGE_ZONE_PX ? 1 : 0;
    if (dir === 0) {
      clearTimeout(edgeTimer);
      edgeTimer = 0;
      return;
    }
    if (edgeTimer) return;
    edgeTimer = setTimeout(() => {
      edgeTimer = 0;
      const next = Math.round(bar.scrollLeft / pageWidth) + dir;
      const maxPage = Math.round((bar.scrollWidth - pageWidth) / pageWidth);
      if (next < 0 || next > maxPage) return;
      bar.scrollTo({ left: next * pageWidth, behavior: 'smooth' });
      // 스크롤이 끝난 뒤 대상 인덱스를 다시 잡고, 계속 머물면 한 페이지 더 넘긴다.
      setTimeout(() => {
        if (!dragging) return;
        toIndex = computeTarget();
        paint();
        scheduleEdgeScroll();
      }, 260);
    }, EDGE_DWELL_MS);
  }

  function startDrag() {
    if (!dragged) return;
    dragging = true;
    order = tiles().map(el => el.dataset.view);
    fromIndex = tiles().indexOf(dragged);
    toIndex = fromIndex;
    bar.classList.add('sp-reordering');
    dragged.classList.add('sp-tile-dragging');
    try { dragged.setPointerCapture(pointerId); } catch { /* 캡처 실패해도 이동은 추적된다 */ }
    navigator.vibrate?.(10);
    paint();
  }

  function finishDrag() {
    if (!dragging) {
      cleanup();
      return;
    }
    const moved = order.slice();
    const [held] = moved.splice(fromIndex, 1);
    moved.splice(toIndex, 0, held);

    // transform 을 지우기 전에 DOM 을 재배치해야 점프가 보이지 않는다.
    bar.classList.remove('sp-reordering');
    tiles().forEach(tile => { tile.style.transform = ''; });
    dragged?.classList.remove('sp-tile-dragging');
    cleanup();

    const changed = moved.some((v, i) => v !== order[i]);
    if (changed) onReorder(moved);
  }

  function cleanup() {
    clearTimers();
    if (dragged && pointerId !== -1) {
      try { dragged.releasePointerCapture(pointerId); } catch { /* 이미 해제됨 */ }
    }
    if (!dragging && dragged) dragged.style.transform = '';
    dragged = null;
    pointerId = -1;
    dragging = false;
    fromIndex = -1;
    toIndex = -1;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const tile = e.target.closest?.('.sp-tile');
    if (!tile || !bar.contains(tile)) return;
    dragged = tile;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    pressTimer = setTimeout(startDrag, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    if (!dragged || e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;

    if (!dragging) {
      // 롱프레스가 성립하기 전에 움직였다면 스와이프/클릭으로 넘긴다.
      if (Math.abs(lastX - startX) > MOVE_CANCEL_PX || Math.abs(lastY - startY) > MOVE_CANCEL_PX) {
        cleanup();
      }
      return;
    }

    e.preventDefault(); // 드래그 중에는 바가 같이 스크롤되지 않게 한다
    toIndex = computeTarget();
    if (!rafId) rafId = requestAnimationFrame(paint);
    scheduleEdgeScroll();
  }

  function onPointerUp(e) {
    if (!dragged || e.pointerId !== pointerId) return;
    finishDrag();
  }

  /** 롱프레스로 드래그했다면 이어서 오는 click 을 삼켜 서비스 전환을 막는다. */
  function onClickCapture(e) {
    if (!bar.classList.contains('sp-just-reordered')) return;
    bar.classList.remove('sp-just-reordered');
    e.stopPropagation();
    e.preventDefault();
  }

  function onPointerUpMark(e) {
    if (dragging && dragged && e.pointerId === pointerId) {
      bar.classList.add('sp-just-reordered');
    }
  }

  bar.addEventListener('pointerdown', onPointerDown);
  // 손가락이 바를 벗어나도 계속 추적해야 하므로 window 에 붙인다.
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUpMark, true);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  bar.addEventListener('click', onClickCapture, true);
  // 롱프레스 중 컨텍스트 메뉴가 뜨면 드래그가 끊긴다.
  bar.addEventListener('contextmenu', e => { if (dragging) e.preventDefault(); });

  return function detach() {
    clearTimers();
    bar.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUpMark, true);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    bar.removeEventListener('click', onClickCapture, true);
  };
}
