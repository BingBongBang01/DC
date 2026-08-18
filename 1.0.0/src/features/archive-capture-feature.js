/**
 * ArchiveCaptureFeature — 원클릭 박제
 *
 * 본문 페이지에 박제 버튼을 붙이고 단축키(Shift+A)를 건다. 네 가지 방식:
 *   로컬 캐시 : 지금 글과 댓글을 IndexedDB 아카이브에 즉시 저장
 *   이미지    : 현재 화면을 PNG로 캡처해 저장 (background의 captureVisibleTab)
 *   PDF       : 글 영역만 남기는 인쇄 스타일로 인쇄 대화상자 열기 → PDF로 저장
 *   archive.today : 새 탭으로 열어 사용자가 직접 박제 (외부 서비스이므로 자동 전송하지 않음)
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { messageRouter } from '../core/message-router.js';
import { MessageAction } from '../core/message-contract.js';
import { configManager } from '../core/config-manager.js';
import { archiveCacheFeature } from './archive-cache-feature.js';

const PRINT_STYLE_ID = 'dcu-print-style';

export class ArchiveCaptureFeature extends BaseFeature {
  constructor() {
    super('enableArchiveCapture', 'One-click Archive', '현재 글을 캐시/이미지/PDF/archive.today로 박제');
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  async onEnable() {
    document.addEventListener('keydown', this._onKeyDown);
    this.mountButton();
  }

  async onDisable() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.querySelector('.dcu-archive-bar')?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
  }

  onPageChange() {
    this.mountButton();
  }

  _isPostPage() {
    return /\/board\/view\//.test(window.location.pathname);
  }

  _onKeyDown(event) {
    if (!this.enabled || !this._isPostPage()) return;
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'A' && event.key !== 'a') return;

    const tag = (event.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;

    event.preventDefault();
    this.run(configManager.get('archiveDefaultMode') || 'cache');
  }

  mountButton() {
    if (!this.enabled || !this._isPostPage()) return;
    if (document.querySelector('.dcu-archive-bar')) return;

    const anchor = document.querySelector('.gallview_head, .view_content_wrap');
    if (!anchor) return;

    const bar = document.createElement('div');
    bar.className = 'dcu-archive-bar';
    bar.innerHTML = `
      <span class="dcu-archive-bar-title">박제</span>
      <button type="button" class="dcu-archive-btn" data-mode="cache" title="로컬 캐시에 저장 (Shift+A)">캐시 저장</button>
      <button type="button" class="dcu-archive-btn" data-mode="image" title="화면을 PNG로 저장">이미지</button>
      <button type="button" class="dcu-archive-btn" data-mode="pdf" title="인쇄 → PDF로 저장">PDF</button>
      <button type="button" class="dcu-archive-btn" data-mode="archive-today" title="archive.today 새 탭에서 박제">archive.today</button>
      <span class="dcu-archive-result"></span>`;

    anchor.parentElement?.insertBefore(bar, anchor);

    bar.querySelectorAll('.dcu-archive-btn').forEach(button => {
      button.addEventListener('click', () => this.run(button.dataset.mode));
    });
  }

  _setResult(text, isError = false) {
    const slot = document.querySelector('.dcu-archive-result');
    if (!slot) return;
    slot.textContent = text;
    slot.classList.toggle('error', isError);
    if (text) setTimeout(() => { if (slot.textContent === text) slot.textContent = ''; }, 6000);
  }

  /**
   * @param {'cache'|'image'|'pdf'|'archive-today'} mode
   */
  async run(mode) {
    try {
      switch (mode) {
        case 'image':
          return await this.captureImage();
        case 'pdf':
          return this.printToPdf();
        case 'archive-today':
          return await this.openArchiveToday();
        case 'cache':
        default:
          return await this.saveToCache();
      }
    } catch (err) {
      logger.warn('ArchiveCapture: failed:', err);
      this._setResult(`박제 실패: ${err.message}`, true);
      return false;
    }
  }

  async saveToCache() {
    const saved = await archiveCacheFeature.capture();
    this._setResult(`캐시 저장 완료 (글 ${saved.posts || 0} · 댓글 ${saved.comments || 0})`);
    return true;
  }

  /**
   * 화면 캡처는 확장 권한이 필요하므로 background에 맡기고, 돌아온 데이터
   * URL을 링크로 만들어 사용자가 저장하게 한다.
   */
  async captureImage() {
    this._setResult('화면 캡처 중...');
    const res = await messageRouter.send(MessageAction.ARCHIVE_CAPTURE_IMAGE, {
      title: document.title
    });

    if (!res || !res.success || !res.data?.dataUrl) {
      throw new Error(res?.data?.error || res?.error || '캡처에 실패했습니다.');
    }

    const link = document.createElement('a');
    link.href = res.data.dataUrl;
    link.download = res.data.filename || 'dc-archive.png';
    document.body.appendChild(link);
    link.click();
    link.remove();

    this._setResult('이미지를 저장했습니다.');
    return true;
  }

  /**
   * 인쇄 시 글 영역만 남기는 스타일을 잠시 넣고 인쇄 대화상자를 연다.
   */
  printToPdf() {
    if (!document.getElementById(PRINT_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = PRINT_STYLE_ID;
      style.textContent = `
        @media print {
          body > *:not(#container) { display: none !important; }
          #container > *:not(section):not(.view_content_wrap) { display: none !important; }
          .gnb_bar, .dcwrap_head, .integrate_srch_wrap, .left_content, .right_content,
          .dcfoot, .ad_area, iframe, .dcu-archive-bar { display: none !important; }
          .view_content_wrap, .gallview_contents { width: 100% !important; }
          body { zoom: 1 !important; }
        }`;
      document.head.appendChild(style);
    }

    this._setResult('인쇄 창에서 "PDF로 저장"을 선택하세요.');
    window.print();
    return true;
  }

  /**
   * archive.today는 외부 서비스이므로 조용히 보내지 않고 새 탭에서 연다.
   */
  async openArchiveToday() {
    const url = `https://archive.today/?run=1&url=${encodeURIComponent(window.location.href)}`;
    const res = await messageRouter.send(MessageAction.ARCHIVE_OPEN_EXTERNAL, { url });

    if (!res || !res.success) {
      window.open(url, '_blank', 'noopener');
    }
    this._setResult('archive.today 탭을 열었습니다. 그곳에서 박제를 완료하세요.');
    return true;
  }
}

export const archiveCaptureFeature = new ArchiveCaptureFeature();
