import assert from 'assert';
import { authManager, AUTH_STATES } from '../src/auth/auth-manager.js';
import { localAIProvider } from '../src/adapters/ai/local-provider.js';
import { aiFeature } from '../src/features/ai-feature.js';
import { escapeHTML, sanitizeText } from '../src/utils/sanitizer.js';
import { searchAggregationFeature } from '../src/features/search-aggregation-feature.js';
import { FilterRuleItem } from '../src/core/filters/filter-engine.js';

export async function runPhase7And8Tests() {
  console.log('--- Running Phase 7 & 8 Auth, AI, Security Tests ---');

  // 1. Session Auth Test
  const nullAuth = authManager.detectUser(null);
  assert.strictEqual(nullAuth.state, AUTH_STATES.UNKNOWN);
  console.log('✓ AuthManager session state detection passed');

  // 2. Local AI Provider Test
  const sampleArticleText = '크롬 확장프로그램 개발 중입니다. Manifest V3 규격을 준수해야 합니다. 비동기 메시지 통신을 추천합니다.';
  const summary = await localAIProvider.summarize(sampleArticleText);
  const keywords = await localAIProvider.extractKeywords(sampleArticleText);
  const classification = await localAIProvider.classify(sampleArticleText);

  assert.ok(summary.length > 0);
  assert.ok(keywords.length > 0);
  assert.strictEqual(typeof classification, 'string');
  console.log('✓ LocalAIProvider summary, keywords, classification passed');

  // 3. Privacy Pipeline & Masking Test
  const rawSensitiveText = '게시글 문의 IP 223.39.1.1 및 전화 010-1234-5678 참고하세요.';
  const maskedText = await aiFeature.preprocessAndMask(rawSensitiveText, false);
  assert.ok(!maskedText.includes('223.39.1.1'));
  assert.ok(!maskedText.includes('010-1234-5678'));
  assert.ok(maskedText.includes('[IP_MASKED]'));
  assert.ok(maskedText.includes('[PHONE_MASKED]'));
  console.log('✓ Privacy Pipeline PII masking passed');

  // 4. XSS Security Sanitizer Test
  const maliciousString = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
  const escaped = escapeHTML(maliciousString);
  const sanitized = sanitizeText(maliciousString);

  assert.strictEqual(escaped.includes('<script>'), false);
  assert.ok(escaped.includes('&lt;script&gt;'));
  assert.strictEqual(sanitized, 'alert("xss")');
  console.log('✓ XSS Sanitizer HTML escaping & text sanitization passed');

  // 5. Search Cancel Signal Verification
  assert.strictEqual(typeof searchAggregationFeature.cancel, 'function');
  searchAggregationFeature.cancel();
  console.log('✓ SearchAggregationFeature.cancel() signal delegation passed');

  // 6. FilterEngine Rule Evaluation & Safety Test
  const mockArticle = { title: 'Safe Content', author: 'Anon', views: 5, comments: 2, recommendations: 1 };
  
  // Test minViews and minComments
  const ruleViews = new FilterRuleItem({ minViews: 10 });
  assert.strictEqual(ruleViews.matches(mockArticle), true, 'Article with views 5 should match minViews 10 rule');
  
  const ruleComments = new FilterRuleItem({ minComments: 5 });
  assert.strictEqual(ruleComments.matches(mockArticle), true, 'Article with comments 2 should match minComments 5 rule');
  
  // Test regex safety
  const ruleRegex = new FilterRuleItem({ regexPattern: '[' }); // invalid regex
  assert.doesNotThrow(() => ruleRegex.matches(mockArticle), 'Invalid regex should not throw exception');
  console.log('✓ FilterEngine regex safety, minViews, and minComments evaluation passed');
}
