/**
 * Local Rule-based AI Provider for DC Ultimate (Phase 7 AI)
 * Provides offline local summaries, keyword extraction, and classification with zero network calls
 */
import { BaseAIProvider } from './ai-provider.js';

export class LocalAIProvider extends BaseAIProvider {
  constructor() {
    super('LocalRulesAI');
  }

  async summarize(text) {
    if (!text) return '내용이 없습니다.';
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);
    if (sentences.length === 0) return text.substring(0, 100);
    // Extract first 3 key sentences as local summary
    return sentences.slice(0, 3).join('. ') + '.';
  }

  async classify(text) {
    if (!text) return '일반';
    const lower = text.toLowerCase();
    if (lower.includes('질문') || lower.includes('왜') || lower.includes('어떻게')) return '질문';
    if (lower.includes('팝니다') || lower.includes('삽니다') || lower.includes('거래')) return '거래/중고';
    if (lower.includes('정보') || lower.includes('팁') || lower.includes('공략')) return '정보/팁';
    return '일반 수다';
  }

  async extractKeywords(text) {
    if (!text) return [];
    const words = text.match(/[가-힣a-zA-Z0-9]{2,}/g) || [];
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 5);
  }

  async analyzeComments(comments) {
    if (!Array.isArray(comments) || comments.length === 0) return '댓글이 없습니다.';
    const count = comments.length;
    const replies = comments.filter(c => c.isReply).length;
    return `총 ${count}개의 댓글이 존재하며, 답글 비율은 ${Math.round((replies / count) * 100)}% 입니다.`;
  }
}

export const localAIProvider = new LocalAIProvider();
