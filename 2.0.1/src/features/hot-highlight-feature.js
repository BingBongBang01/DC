/**
 * HotHighlightFeature — 반응형 하이라이트
 *
 * Colours list rows whose recommend/comment counts are above the configured
 * thresholds, with a hotter tint for the runaway threads.
 */
import { BaseFeature } from './base-feature.js';
import { configManager } from '../core/config-manager.js';

const PROCESSED_ATTR = 'data-dcu-hot-checked';

export class HotHighlightFeature extends BaseFeature {
  constructor() {
    super('enableHotHighlight', 'Hot Post Highlight', '추천/댓글 많은 화제 글 강조');
  }

  get thresholds() {
    return {
      recommend: Number(configManager.get('hotRecommendThreshold')) || 10,
      comment: Number(configManager.get('hotCommentThreshold')) || 20,
      blazing: Number(configManager.get('hotBlazingMultiplier')) || 3
    };
  }

  async onEnable() {
    this.apply();
  }

  async onDisable() {
    document.querySelectorAll('[data-dcu-hot]').forEach(row => {
      row.classList.remove('dcu-hot', 'dcu-hot-blazing');
      row.removeAttribute('data-dcu-hot');
      row.removeAttribute(PROCESSED_ATTR);
      row.querySelector('.dcu-hot-badge')?.remove();
    });
  }

  onPageChange() {
    this.apply();
  }

  apply() {
    if (!this.enabled) return;

    const { recommend, comment, blazing } = this.thresholds;
    const rows = document.querySelectorAll(`tr.ub-content.us-post:not([${PROCESSED_ATTR}])`);

    rows.forEach(row => {
      row.setAttribute(PROCESSED_ATTR, '1');

      const recText = row.querySelector('.gall_recommend')?.textContent || '0';
      const cmtText = row.querySelector('.reply_num')?.textContent || '0';
      const recs = parseInt(recText.replace(/[^0-9]/g, ''), 10) || 0;
      const comments = parseInt(cmtText.replace(/[^0-9]/g, ''), 10) || 0;

      const isHot = recs >= recommend || comments >= comment;
      if (!isHot) return;

      const isBlazing = recs >= recommend * blazing || comments >= comment * blazing;
      row.classList.add('dcu-hot');
      if (isBlazing) row.classList.add('dcu-hot-blazing');
      row.setAttribute('data-dcu-hot', isBlazing ? 'blazing' : 'hot');

      const titleCell = row.querySelector('.gall_tit, .gall_title');
      if (titleCell && !titleCell.querySelector('.dcu-hot-badge')) {
        const badge = document.createElement('span');
        badge.className = 'dcu-hot-badge';
        badge.textContent = isBlazing ? '🔥' : '↑';
        badge.title = `추천 ${recs} · 댓글 ${comments}`;
        titleCell.prepend(badge);
      }
    });
  }
}

export const hotHighlightFeature = new HotHighlightFeature();
