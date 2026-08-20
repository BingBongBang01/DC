/**
 * AIFeature Module for DC Ultimate (Phase 7 AI & Privacy Pipeline)
 * Manages local preprocessing, masking, user confirmation, and provider dispatch
 */
import { BaseFeature } from './base-feature.js';
import { localAIProvider } from '../adapters/ai/local-provider.js';
import { OpenAIProvider } from '../adapters/ai/openai-provider.js';
import { GeminiProvider } from '../adapters/ai/gemini-provider.js';
import { CustomAIProvider } from '../adapters/ai/custom-provider.js';
import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';
import { SELECTORS } from '../adapters/selectors.js';
import { PAGE_TYPES } from '../parser/page-detector.js';

export class AIFeature extends BaseFeature {
  constructor() {
    super('enableAIFeatures', 'AI Summarizer & Analyzer', 'Article summarization, keyword extraction, and comment sentiment analysis');
  }

  async onEnable() {
    logger.info('AIFeature enabled.');
    this._injectSummaryButton();
  }

  async onDisable() {
    const btn = document.getElementById('dc-ultimate-ai-summary-btn');
    if (btn) btn.remove();
  }

  async onPageChange(pageInfo) {
    const btn = document.getElementById('dc-ultimate-ai-summary-btn');
    if (pageInfo?.type === PAGE_TYPES.ARTICLE_VIEW) {
      if (!btn) this._injectSummaryButton();
    } else if (btn) {
      btn.remove();
    }
  }

  _injectSummaryButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('dc-ultimate-ai-summary-btn')) return;
    const titleArea = document.querySelector('.title_headtext') || document.querySelector('.gallview_head');
    if (!titleArea) return;

    const btn = document.createElement('button');
    btn.id = 'dc-ultimate-ai-summary-btn';
    btn.textContent = '🤖 AI 요약';
    btn.className = 'dc-ultimate-ai-btn';
    btn.addEventListener('click', () => this._handleSummaryClick(btn));
    titleArea.appendChild(btn);
  }

  async _handleSummaryClick(btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '요약 중...';

    try {
      const bodyElem = document.querySelector(SELECTORS.articleBody);
      const text = bodyElem ? bodyElem.textContent.trim() : '';
      if (!text) {
        throw new Error('요약할 본문을 찾을 수 없습니다.');
      }

      const summary = await this.summarizeArticle(text, true);
      this._showResultPopover(btn, summary);
    } catch (err) {
      logger.error('AIFeature: summary button failed:', err);
      this._showResultPopover(btn, `오류: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  _showResultPopover(anchorEl, text, isError = false) {
    let popover = document.getElementById('dc-ultimate-ai-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'dc-ultimate-ai-popover';
      document.body.appendChild(popover);
    }
    popover.className = isError ? 'dc-ultimate-ai-popover error' : 'dc-ultimate-ai-popover';
    popover.textContent = text;
    popover.style.display = 'block';

    const rect = anchorEl.getBoundingClientRect();
    popover.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popover.style.left = `${rect.left + window.scrollX}px`;

    const close = () => {
      popover.style.display = 'none';
      document.removeEventListener('click', outsideClick);
    };
    const outsideClick = (e) => {
      if (!popover.contains(e.target) && e.target !== anchorEl) close();
    };
    setTimeout(close, 8000);
    document.addEventListener('click', outsideClick);
  }

  /**
   * Get configured AI Provider instance
   * @returns {BaseAIProvider}
   */
  getProvider() {
    const aiConfig = configManager.get('aiSettings') || {};
    const providerType = aiConfig.provider || 'local';

    switch (providerType) {
      case 'openai':
        return new OpenAIProvider(aiConfig.apiKey);
      case 'gemini':
        return new GeminiProvider(aiConfig.apiKey);
      case 'custom':
        return new CustomAIProvider(aiConfig.endpoint, aiConfig.apiKey);
      case 'local':
      default:
        return localAIProvider;
    }
  }

  /**
   * Privacy Pipeline: Local preprocessing -> Masking -> User Confirmation -> AI Dispatch
   * @param {string} rawText Raw content string
   * @param {boolean} [requiresUserConfirmation=false] User confirmation flag
   * @returns {Promise<string>} Masked safe content
   */
  async preprocessAndMask(rawText, requiresUserConfirmation = false) {
    if (!rawText) return '';

    // 1. Local preprocessing: strip HTML tags
    let text = rawText.replace(/<[^>]*>?/gm, '').trim();

    // 2. Optional PII masking (mask IP addresses and phone numbers)
    text = text.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_MASKED]');
    text = text.replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, '[PHONE_MASKED]');

    // 3. User Confirmation check if external provider is used
    const provider = this.getProvider();
    if (provider.name !== 'LocalRulesAI' && requiresUserConfirmation) {
      const confirmed = confirm(`외부 AI 서비스(${provider.name})로 마스킹된 데이터가 전송됩니다. 계속할까요?`);
      if (!confirmed) {
        throw new Error('사용자에 의해 외부 AI 전송이 취소되었습니다.');
      }
    }

    return text;
  }

  async summarizeArticle(text, userConfirm = false) {
    const safeText = await this.preprocessAndMask(text, userConfirm);
    const provider = this.getProvider();
    return await provider.summarize(safeText);
  }

  async extractKeywords(text, userConfirm = false) {
    const safeText = await this.preprocessAndMask(text, userConfirm);
    const provider = this.getProvider();
    return await provider.extractKeywords(safeText);
  }

  async classifyArticle(text, userConfirm = false) {
    const safeText = await this.preprocessAndMask(text, userConfirm);
    const provider = this.getProvider();
    return await provider.classify(safeText);
  }

  async analyzeComments(comments, userConfirm = false) {
    const provider = this.getProvider();
    return await provider.analyzeComments(comments);
  }
}

export const aiFeature = new AIFeature();
