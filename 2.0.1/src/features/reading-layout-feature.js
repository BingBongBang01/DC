/**
 * ReadingLayoutFeature Module for DC Ultimate
 * Provides multi-column reading layout (List | Article | Comments)
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';

export class ReadingLayoutFeature extends BaseFeature {
  constructor() {
    super('enableReadingLayout', 'Multi-Column Reading Layout', 'Arranges List, Article, and Comments in a modern side-by-side reading view');
    this.styleElement = null;
  }

  async onEnable() {
    if (typeof document === 'undefined') return;

    logger.info('ReadingLayoutFeature enabled.');
    document.body.classList.add('dc-ultimate-reading-mode');
    this.injectStyles();
  }

  async onDisable() {
    if (typeof document === 'undefined') return;

    logger.info('ReadingLayoutFeature disabled.');
    document.body.classList.remove('dc-ultimate-reading-mode');
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
      this.styleElement = null;
    }
  }

  injectStyles() {
    if (document.getElementById('dc-ultimate-reading-layout-style')) return;

    const style = document.createElement('style');
    style.id = 'dc-ultimate-reading-layout-style';
    style.textContent = `
      body.dc-ultimate-reading-mode .wrap_inner {
        max-width: 1400px !important;
        width: 96% !important;
      }
      
      body.dc-ultimate-reading-mode .gallview_contents {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 16px;
      }

      body.dc-ultimate-reading-mode .comment_box {
        position: sticky;
        top: 20px;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        background: var(--md-sys-color-surface-variant, #f8fafc);
        padding: 12px;
        border-radius: 12px;
      }
    `;
    document.head.appendChild(style);
    this.styleElement = style;
  }
}

export const readingLayoutFeature = new ReadingLayoutFeature();
