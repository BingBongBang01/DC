/**
 * Test Feature for Phase 1 Architecture Verification
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';

export class TestFeature extends BaseFeature {
  constructor() {
    super('testFeature', 'Phase 1 Core Test Feature', 'Validates feature manager lifecycle and DOM events');
    this.badgeElement = null;
  }

  async onEnable() {
    logger.info('TestFeature enabled and ready.');
    this.renderBadge();
  }

  async onDisable() {
    logger.info('TestFeature disabled.');
    if (this.badgeElement && this.badgeElement.parentNode) {
      this.badgeElement.parentNode.removeChild(this.badgeElement);
      this.badgeElement = null;
    }
  }

  async onPageChange(pageInfo) {
    logger.info(`TestFeature detected page change to: ${pageInfo?.type}`);
    if (this.enabled) {
      this.renderBadge(pageInfo);
    }
  }

  renderBadge(pageInfo = null) {
    if (typeof document === 'undefined') return;
    
    let container = document.getElementById('dc-ultimate-test-badge');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dc-ultimate-test-badge';
      container.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        background: #3f51b5;
        color: #fff;
        padding: 6px 12px;
        border-radius: 16px;
        font-family: sans-serif;
        font-size: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 999999;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    const typeStr = pageInfo ? pageInfo.type : 'Core Active';
    container.textContent = `DC Ultimate: ${typeStr}`;
    this.badgeElement = container;
  }
}

export const testFeature = new TestFeature();
