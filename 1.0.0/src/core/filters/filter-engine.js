/**
 * FilterEngine Module for DC Ultimate (Phase 4A)
 * Centralized rule-based filtering engine with HIDE, DIM, BLUR, COLLAPSE, and MARK actions
 */
import { storageManager } from '../storage-manager.js';
import { logger } from '../logger.js';

export const FILTER_ACTIONS = {
  HIDE: 'HIDE',
  DIM: 'DIM',
  BLUR: 'BLUR',
  COLLAPSE: 'COLLAPSE',
  MARK: 'MARK'
};

export class FilterRuleItem {
  constructor(data = {}) {
    this.id = data.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    this.name = data.name || '미지정 필터';
    this.enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
    this.priority = typeof data.priority === 'number' ? data.priority : 10;
    this.galleryId = data.galleryId || null; // null = global rule, string = gallery-specific rule
    
    // Conditions
    this.titlePattern = data.titlePattern || null;
    this.authorPattern = data.authorPattern || null;
    this.authorIdPattern = data.authorIdPattern || null;
    this.ipPattern = data.ipPattern || null;
    this.regexPattern = data.regexPattern || null;
    this.minRecs = typeof data.minRecs === 'number' ? data.minRecs : null;
    this.minViews = typeof data.minViews === 'number' ? data.minViews : null;
    this.minComments = typeof data.minComments === 'number' ? data.minComments : null;
    
    // Action
    this.action = data.action || FILTER_ACTIONS.DIM; // HIDE, DIM, BLUR, COLLAPSE, MARK
  }

  /**
   * Evaluate if target article/comment matches rule
   * @param {Object} item Article or Comment normalized model
   * @param {string} [currentGalleryId=''] Current gallery ID
   * @returns {boolean}
   */
  matches(item, currentGalleryId = '') {
    if (!this.enabled || !item) return false;

    // Gallery scoping check
    if (this.galleryId && currentGalleryId && this.galleryId !== currentGalleryId) {
      return false;
    }

    const title = item.title || item.content || item.body || '';
    const author = item.author || '';
    const authorId = item.authorId || '';
    const ip = item.ip || '';

    // Regex check
    if (this.regexPattern) {
      try {
        const regex = new RegExp(this.regexPattern, 'i');
        if (regex.test(title) || regex.test(author)) return true;
      } catch (e) {}
    }

    if (this.titlePattern && title.toLowerCase().includes(this.titlePattern.toLowerCase())) {
      return true;
    }

    if (this.authorPattern && author.toLowerCase().includes(this.authorPattern.toLowerCase())) {
      return true;
    }

    if (this.authorIdPattern && authorId.toLowerCase().includes(this.authorIdPattern.toLowerCase())) {
      return true;
    }

    if (this.ipPattern && ip.includes(this.ipPattern)) {
      return true;
    }

    if (this.minRecs !== null && item.recommendations !== undefined && item.recommendations < this.minRecs) {
      return true;
    }

    if (this.minViews !== null && item.views !== undefined && item.views < this.minViews) {
      return true;
    }

    if (this.minComments !== null && item.comments !== undefined && item.comments < this.minComments) {
      return true;
    }

    return false;
  }
}

export class FilterEngine {
  constructor() {
    this.rules = [];
    this.enabled = true;
  }

  async init() {
    const data = await storageManager.get('filters');
    if (data && data.filters && Array.isArray(data.filters.rules) && data.filters.rules.length > 0) {
      this.rules = data.filters.rules.map(r => new FilterRuleItem(r));
    } else {
      // Default sample rules
      this.rules = [
        new FilterRuleItem({ name: '광고/스팸 키워드 차단', titlePattern: '대출', action: FILTER_ACTIONS.HIDE }),
        new FilterRuleItem({ name: '어그로 유동 블러', ipPattern: '223.39', action: FILTER_ACTIONS.BLUR })
      ];
      await this.saveRules();
    }
    logger.info(`FilterEngine: Loaded ${this.rules.length} rules.`);
  }

  async saveRules() {
    const data = await storageManager.get('filters');
    const filters = data.filters || {};
    filters.rules = this.rules;
    await storageManager.set({ filters });
  }

  /**
   * Evaluate article and return matching action if any
   * @param {Article|Comment} item Normalized data object
   * @param {string} galleryId Current gallery ID
   * @returns {{ match: boolean, action: string, ruleName: string }|null}
   */
  evaluate(item, galleryId = '') {
    if (!this.enabled || !this.rules.length) return null;

    // Sort by priority descending
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.matches(item, galleryId)) {
        return {
          match: true,
          action: rule.action,
          ruleName: rule.name
        };
      }
    }
    return null;
  }

  /**
   * Apply visual filter action directly to DOM node safely
   * @param {Element} domNode TR or LI element
   * @param {string} action FILTER_ACTIONS value
   */
  applyDOMAction(domNode, action) {
    if (!domNode || !domNode.style) return;

    switch (action) {
      case FILTER_ACTIONS.HIDE:
        domNode.style.display = 'none';
        break;
      case FILTER_ACTIONS.DIM:
        domNode.style.opacity = '0.35';
        break;
      case FILTER_ACTIONS.BLUR:
        domNode.style.filter = 'blur(4px)';
        domNode.style.transition = 'filter 0.2s';
        domNode.addEventListener('mouseenter', () => domNode.style.filter = 'none', { once: true });
        break;
      case FILTER_ACTIONS.COLLAPSE:
        domNode.style.maxHeight = '24px';
        domNode.style.overflow = 'hidden';
        break;
      case FILTER_ACTIONS.MARK:
        domNode.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        domNode.style.borderLeft = '4px solid #ef4444';
        break;
    }
  }
}

export const filterEngine = new FilterEngine();
