import assert from 'assert';
import { debounce } from '../src/utils/debounce.js';
import { throttle } from '../src/utils/throttle.js';
import { DOMObserver } from '../src/adapters/dom-observer.js';

export async function runDOMObserverTests() {
  console.log('--- Running DOM Observer & Utility Tests ---');

  // Debounce test
  let count = 0;
  const db = debounce(() => count++, 50);
  db();
  db();
  db();
  assert.strictEqual(count, 0);
  await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(count, 1);
  console.log('✓ Debounce function passed');

  // Throttle test
  let tCount = 0;
  const th = throttle(() => tCount++, 100);
  th();
  th();
  assert.strictEqual(tCount, 1);
  console.log('✓ Throttle function passed');

  // DOMObserver instantiation test
  const observer = new DOMObserver(100);
  assert.strictEqual(observer.isObserving, false);
  observer.disconnect();
  console.log('✓ DOMObserver instantiation and disconnect passed');
}
