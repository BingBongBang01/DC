/**
 * Abstract AI Provider Interface for DC Ultimate (Phase 7 AI)
 */

export class BaseAIProvider {
  constructor(name = 'GenericAI') {
    this.name = name;
  }

  async _fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`${this.name}: 응답 시간이 ${timeoutMs / 1000}초를 초과했습니다.`);
      }
      throw new Error(`${this.name}: 네트워크 오류 — ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.message || detail;
      } catch {
        // body가 JSON이 아니면 상태 코드만 사용
      }

      if (response.status === 401) {
        throw new Error(`${this.name}: API 키가 유효하지 않습니다. (${detail})`);
      }
      if (response.status === 429) {
        throw new Error(`${this.name}: 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요. (${detail})`);
      }
      throw new Error(`${this.name} API 오류: ${detail}`);
    }

    return response.json();
  }

  async summarize(text) { throw new Error('summarize() must be implemented by provider'); }
  async classify(text) { throw new Error('classify() must be implemented by provider'); }
  async extractKeywords(text) { throw new Error('extractKeywords() must be implemented by provider'); }
  async analyzeComments(comments) { throw new Error('analyzeComments() must be implemented by provider'); }
}
