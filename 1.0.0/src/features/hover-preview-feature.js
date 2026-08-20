/**
 * HoverPreviewFeature Module for DC Ultimate
 * Shows lightweight debounced preview popup on article link hover using AbortController and LRU Cache
 */
import { BaseFeature } from './base-feature.js';
import { cacheManager } from '../core/cache-manager.js';
import { articleParser } from '../parser/article-parser.js';
import { commentParser } from '../parser/comment-parser.js';
import { SELECTORS } from '../adapters/selectors.js';
import { escapeHTML } from '../utils/sanitizer.js';
import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';

export class HoverPreviewFeature extends BaseFeature {
  constructor() {
    super('enableHoverPreview', 'Hover Article Preview', 'Displays popover preview on hovering article links');
    this.hoverTimeout = null;
    this.currentAbortController = null;
    this.previewModal = null;
    this.activeAnchor = null;
    
    this._handleMouseOver = this._handleMouseOver.bind(this);
    this._handleMouseOut = this._handleMouseOut.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * 미리보기 세부 설정. 사이드패널 [보기] 패널에서 조절한다.
   * 값이 비었거나 이상하면 기본값으로 되돌린다.
   */
  _options() {
    const int = (key, fallback, min, max) => {
      const raw = Number(configManager.get(key));
      if (!Number.isFinite(raw)) return fallback;
      return Math.min(max, Math.max(min, Math.round(raw)));
    };
    return {
      delayMs: int('previewDelayMs', 300, 0, 2000),
      bodyChars: int('previewBodyChars', 200, 50, 1000),
      thumbCount: int('previewThumbCount', 4, 0, 8),
      cacheTtlMs: int('previewCacheTtlMin', 10, 1, 120) * 60 * 1000
    };
  }

  async onEnable() {
    if (typeof document === 'undefined') return;
    document.addEventListener('mouseover', this._handleMouseOver);
    document.addEventListener('mouseout', this._handleMouseOut);
    document.addEventListener('keydown', this._handleKeyDown);
  }

  async onDisable() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('mouseover', this._handleMouseOver);
    document.removeEventListener('mouseout', this._handleMouseOut);
    document.removeEventListener('keydown', this._handleKeyDown);
    this._clearHoverTimeout();
    this._cancelFetch();
    this.closePreview();
  }

  _clearHoverTimeout() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  _cancelFetch() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  _handleMouseOver(e) {
    const anchor = e.target.closest('a');
    if (!anchor || !anchor.href) return;

    // Verify anchor points to a gallery article view
    if (!anchor.href.includes('/board/view/')) return;

    this.activeAnchor = anchor;
    this._clearHoverTimeout();

    this.hoverTimeout = setTimeout(() => {
      this._showPreviewFor(anchor);
    }, this._options().delayMs);
  }

  _handleMouseOut(e) {
    const anchor = e.target.closest('a');
    if (anchor && anchor === this.activeAnchor) {
      this._clearHoverTimeout();
      this._cancelFetch();
      this.activeAnchor = null;
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.closePreview();
    }
  }

  /**
   * 목록 행에 이미 찍혀 있는 `[12]` 를 읽는다. 본문을 받아오기 전에 쓸 임시값이고,
   * fetch 한 문서에는 댓글이 AJAX 라 목록이 없으므로 최종 폴백으로도 쓴다.
   * @param {HTMLAnchorElement} anchor
   * @returns {number|null}
   */
  _commentCountFromRow(anchor) {
    const row = anchor.closest('tr, li');
    const badge = row ? row.querySelector('.reply_num, .cmt_num') : null;
    if (!badge) return null;
    const digits = badge.textContent.replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  async _showPreviewFor(anchor) {
    const url = anchor.href;
    const cacheKey = `preview_${url}`;
    const rowCount = this._commentCountFromRow(anchor);

    // 1. Check cache
    let cachedData = cacheManager.get(cacheKey);
    if (!cachedData) {
      this._cancelFetch();
      this.currentAbortController = new AbortController();

      try {
        const response = await fetch(url, { signal: this.currentAbortController.signal });
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const article = articleParser.parseView(doc);
        // 댓글은 AJAX 로 채워지므로 fetch 한 문서에서는 거의 항상 0건이 나온다.
        // 파싱된 목록 → 헤더의 "댓글 N" → 목록 행의 [N] 순으로 믿을 수 있는 값을 쓴다.
        const parsedComments = commentParser.parseList(doc).length;
        const commentsCount = parsedComments
          || (article && Number(article.comments))
          || rowCount
          || 0;

        cachedData = { article, commentsCount };
        cacheManager.set(cacheKey, cachedData, this._options().cacheTtlMs);
      } catch (err) {
        if (err.name === 'AbortError') return;
        logger.warn('Failed to fetch preview for URL:', url, err);
        return;
      }
    }

    if (cachedData && cachedData.article) {
      this.renderPreviewModal(anchor, cachedData.article, cachedData.commentsCount);
    }
  }

  renderPreviewModal(anchor, article, commentsCount) {
    this.closePreview();

    const rect = anchor.getBoundingClientRect();
    const modal = document.createElement('div');
    modal.className = 'dc-ultimate-preview-modal';
    modal.style.cssText = `
      position: absolute;
      top: ${rect.bottom + window.scrollY + 6}px;
      left: ${Math.min(rect.left + window.scrollX, window.innerWidth - 360)}px;
      width: 340px;
      max-height: 260px;
      background: var(--md-sys-color-surface, #ffffff);
      color: var(--md-sys-color-on-surface, #1e293b);
      border: 1px solid var(--md-sys-color-outline, #cbd5e1);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      z-index: 999999;
      overflow-y: auto;
      font-size: 13px;
      line-height: 1.4;
    `;

    const { bodyChars, thumbCount } = this._options();
    const safeTitle = escapeHTML(article.title);
    const safeAuthor = escapeHTML(article.author || '익명');
    const bodyText = article.body
      ? article.body.substring(0, bodyChars) + (article.body.length > bodyChars ? '...' : '')
      : '본문 텍스트가 없습니다.';
    const safeBody = escapeHTML(bodyText);

    // 첨부 이미지는 텍스트 안내 대신 실제 썸네일로 보여준다.
    const thumbs = (article.media || [])
      .filter(item => item && item.url && (item.type === 'image' || item.type === 'gif'))
      .slice(0, thumbCount)
      .map(item => `<img class="dcu-preview-thumb" src="${escapeHTML(item.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`)
      .join('');
    const safeIp = article.ip ? `(${escapeHTML(article.ip)})` : '';

    modal.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:6px; color:#1d4ed8;">${safeTitle}</div>
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
        작성자: <b>${safeAuthor}</b> ${safeIp} | 댓글: ${commentsCount}개 | 추천: ${article.recommendations}
      </div>
      <div style="color:#334155; max-height:120px; overflow:hidden; text-overflow:ellipsis;">
        ${safeBody}
      </div>
      ${thumbs
        ? `<div class="dcu-preview-thumbs">${thumbs}</div>`
        : (article.hasImage ? '<div style="margin-top:6px; font-size:11px; color:#059669;">📷 이미지 첨부됨</div>' : '')}
    `;

    modal.addEventListener('mouseleave', () => this.closePreview());

    document.body.appendChild(modal);
    this.previewModal = modal;
  }

  closePreview() {
    if (this.previewModal && this.previewModal.parentNode) {
      this.previewModal.parentNode.removeChild(this.previewModal);
      this.previewModal = null;
    }
  }
}

export const hoverPreviewFeature = new HoverPreviewFeature();
