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

    // 300ms hover delay
    this.hoverTimeout = setTimeout(() => {
      this._showPreviewFor(anchor);
    }, 300);
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

  async _showPreviewFor(anchor) {
    const url = anchor.href;
    const cacheKey = `preview_${url}`;

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
        const comments = commentParser.parseList(doc);

        cachedData = { article, commentsCount: comments.length };
        cacheManager.set(cacheKey, cachedData, 10 * 60 * 1000); // 10 min TTL
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

    const safeTitle = escapeHTML(article.title);
    const safeAuthor = escapeHTML(article.author || '익명');
    const safeBody = escapeHTML(article.body ? article.body.substring(0, 200) + '...' : '본문 텍스트가 없습니다.');
    const safeIp = article.ip ? `(${escapeHTML(article.ip)})` : '';

    modal.innerHTML = `
      <div style="font-weight:700; font-size:14px; margin-bottom:6px; color:#1d4ed8;">${safeTitle}</div>
      <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
        작성자: <b>${safeAuthor}</b> ${safeIp} | 댓글: ${commentsCount}개 | 추천: ${article.recommendations}
      </div>
      <div style="color:#334155; max-height:120px; overflow:hidden; text-overflow:ellipsis;">
        ${safeBody}
      </div>
      ${article.hasImage ? '<div style="margin-top:6px; font-size:11px; color:#059669;">📷 이미지 첨부됨</div>' : ''}
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
