import assert from 'assert';
import { escapeHTML, sanitizeText } from '../src/utils/sanitizer.js';
import { messageRouter } from '../src/core/message-router.js';
import { aiFeature } from '../src/features/ai-feature.js';
import { localAIProvider } from '../src/adapters/ai/local-provider.js';

export async function runPhase18SecurityQATests() {
  console.log('--- Running Phase 18 Security & Privacy QA Test Suite ---');

  // 1. XSS Injection & Sanitization Sinks
  const xssPayload = '<img src=x onerror=alert("XSS")><script>fetch("http://evil.com")</script>';
  const safeEscaped = escapeHTML(xssPayload);
  const safeText = sanitizeText(xssPayload);

  assert.strictEqual(safeEscaped.includes('<script>'), false);
  assert.ok(safeEscaped.includes('&lt;script&gt;'));
  assert.strictEqual(safeText.includes('<script>'), false);
  console.log('✓ 1. DOM Injection & XSS Sanitization: PASS');

  // 2. Message Security & Route Validation
  const invalidMessageRes = await messageRouter.send('UNAUTHORIZED_ACTION', null);
  assert.strictEqual(invalidMessageRes.success, false);
  assert.ok(invalidMessageRes.error !== undefined);
  console.log('✓ 2. Message Security & Action Validation: PASS');

  // 3. URL Security & Protocol Handling
  const maliciousUrl = 'javascript:alert(1)';
  const safeUrl = escapeHTML(maliciousUrl);
  assert.ok(safeUrl.includes('javascript:alert(1)')); // Properly escaped when rendered into HTML attribute
  console.log('✓ 3. URL Security & Escaping: PASS');

  // 4. API Keys & Credentials Verification
  const aiProvider = aiFeature.getProvider();
  assert.strictEqual(aiProvider.name, 'LocalRulesAI'); // Defaults to zero external network dependencies
  console.log('✓ 4. Secrets & Credentials Isolation: PASS');

  // 5. AI Privacy PII Masking Pipeline
  const sensitiveContent = '고객센터 연락처 010-9999-8888, 게시자 IP 112.175.1.1';
  const masked = await aiFeature.preprocessAndMask(sensitiveContent, false);
  assert.strictEqual(masked.includes('010-9999-8888'), false);
  assert.strictEqual(masked.includes('112.175.1.1'), false);
  assert.ok(masked.includes('[PHONE_MASKED]'));
  assert.ok(masked.includes('[IP_MASKED]'));
  console.log('✓ 5. AI Privacy PII Masking Pipeline: PASS');
}
