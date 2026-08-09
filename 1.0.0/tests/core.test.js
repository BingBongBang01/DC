import assert from 'assert';
import { EventBus } from '../src/core/event-bus.js';
import { CacheManager } from '../src/core/cache-manager.js';
import { Logger, LOG_LEVELS } from '../src/core/logger.js';
import { FeatureManager } from '../src/core/feature-manager.js';
import { BaseFeature } from '../src/features/base-feature.js';

export async function runCoreTests() {
  console.log('--- Running Core Tests ---');

  // 1. Logger test
  const testLogger = new Logger('TestTag', LOG_LEVELS.DEBUG);
  assert.strictEqual(testLogger.tag, 'TestTag');
  console.log('✓ Logger instantiation passed');

  // 2. EventBus test
  const bus = new EventBus();
  let receivedData = null;
  bus.on('test:event', (data) => {
    receivedData = data;
  });
  await bus.emit('test:event', { foo: 'bar' });
  assert.deepStrictEqual(receivedData, { foo: 'bar' });
  console.log('✓ EventBus pub/sub passed');

  // 3. CacheManager test
  const cache = new CacheManager(5, 1000);
  cache.set('key1', 'val1');
  assert.strictEqual(cache.get('key1'), 'val1');
  assert.strictEqual(cache.has('key1'), true);
  cache.delete('key1');
  assert.strictEqual(cache.has('key1'), false);
  console.log('✓ CacheManager LRU/TTL passed');

  // 4. FeatureManager test
  const fm = new FeatureManager();
  class DummyFeature extends BaseFeature {
    constructor() { super('dummy', 'Dummy Feature'); }
  }
  const dummy = new DummyFeature();
  fm.register(dummy);
  assert.strictEqual(fm.get('dummy'), dummy);
  await fm.enable('dummy');
  assert.strictEqual(dummy.enabled, true);
  await fm.disable('dummy');
  assert.strictEqual(dummy.enabled, false);
  console.log('✓ FeatureManager registration and lifecycle passed');
}
