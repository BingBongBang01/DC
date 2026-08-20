/**
 * OpenAI API Provider for DC Ultimate (Phase 7 AI)
 */
import { BaseAIProvider } from './ai-provider.js';

export class OpenAIProvider extends BaseAIProvider {
  constructor(apiKey = '') {
    super('OpenAI');
    this.apiKey = apiKey;
  }

  async _callAPI(prompt, text) {
    if (!this.apiKey) throw new Error('OpenAI API 키가 설정되지 않았습니다.');

    const data = await this._fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text }
        ],
        max_tokens: 200
      })
    }, 15000);

    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  async summarize(text) {
    return await this._callAPI('다음 한국어 게시글 본문을 3줄로 요약해주세요.', text);
  }

  async classify(text) {
    return await this._callAPI('다음 게시글의 주제를 한 단어로 분류해주세요 (예: 질문, 정보, 잡담, 거래).', text);
  }

  async extractKeywords(text) {
    const raw = await this._callAPI('다음 글에서 핵심 키워드 5개를 쉼표로 구분하여 추출해주세요.', text);
    return raw.split(',').map(k => k.trim()).filter(Boolean);
  }

  async analyzeComments(comments) {
    const text = comments.map(c => `${c.author}: ${c.content}`).join('\n');
    return await this._callAPI('다음 댓글 목록의 분위기와 핵심 의견을 요약해주세요.', text);
  }
}
