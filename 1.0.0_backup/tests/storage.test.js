import assert from 'assert';
import { StorageManager, CURRENT_SCHEMA_VERSION } from '../src/core/storage-manager.js';
import { ConfigManager } from '../src/core/config-manager.js';

export async function runStorageTests() {
  console.log('--- Running Storage & Config Tests ---');

  const storage = new StorageManager();
  await storage.init();

  // Test storage set/get
  await storage.set({ testKey: 'testVal' });
  const fetched = await storage.get('testKey');
  assert.strictEqual(fetched.testKey, 'testVal');
  console.log('✓ StorageManager fallback set/get passed');

  // Test schema versioning
  const allData = await storage.getAll();
  assert.strictEqual(allData.schemaVersion, CURRENT_SCHEMA_VERSION);
  console.log('✓ StorageManager schema versioning passed');

  // ConfigManager test
  const config = new ConfigManager();
  await config.init();
  const theme = config.get('theme');
  assert.ok(['system', 'light', 'dark'].includes(theme));
  console.log('✓ ConfigManager initialization passed');
}
