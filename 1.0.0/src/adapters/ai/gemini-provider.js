/**
 * Google Gemini API Provider for DC Ultimate (Phase 7 AI)
 */
import { BaseAIProvider } from './ai-provider.js';

export class GeminiProvider extends BaseAIProvider {
  constructor(apiKey = '') {
    super('Gemini');
    this.apiKey = apiKey;
  }

  _notImplemented() {
    throw new Error('Gemini 연동은 아직 지원되지 않습니다. 설정에서 다른 AI 제공자를 선택해주세요.');
  }

  async summarize(text) { this._notImplemented(); }
  async classify(text) { this._notImplemented(); }
  async extractKeywords(text) { this._notImplemented(); }
  async analyzeComments(comments) { this._notImplemented(); }
}
