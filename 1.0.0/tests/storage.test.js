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

  // 2.0.2 마이그레이션 — `commentTreeEnabled` 유령 키 정리
  {
    const cases = [
      {
        label: '재정렬을 일부러 껐던 사용자',
        from: { schemaVersion: '2.0.0', settings: { commentTreeEnabled: false, enableCommentTree: true, theme: 'dark' } },
        // 재정렬을 껐다는 건 "댓글 영역 건드리지 마라"는 뜻이었으므로 강조도 꺼진 채로 둔다
        expectCommentTree: false
      },
      {
        label: '기본 상태 사용자',
        from: { schemaVersion: '2.0.0', settings: { commentTreeEnabled: true, enableCommentTree: true, theme: 'dark' } },
        expectCommentTree: true
      },
      {
        label: '1.0.0 에서 바로 올라온 사용자',
        from: { schemaVersion: '1.0.0', settings: {} },
        expectCommentTree: true
      }
    ];

    for (const c of cases) {
      const sm = new StorageManager();
      sm.isChromeStorageAvailable = false;
      await sm.setAll(c.from);
      await sm.init();
      const after = await sm.getAll();

      assert.strictEqual(after.schemaVersion, CURRENT_SCHEMA_VERSION, `${c.label}: 스키마 버전`);
      assert.ok(
        !Object.prototype.hasOwnProperty.call(after.settings, 'commentTreeEnabled'),
        `${c.label}: 유령 키 commentTreeEnabled 가 남았다`
      );
      assert.strictEqual(after.settings.enableCommentTree, c.expectCommentTree, `${c.label}: enableCommentTree`);
      assert.strictEqual(after.settings.previewDelayMs, 300, `${c.label}: 새 기본값이 채워져야 한다`);
      if (c.from.settings.theme) {
        assert.strictEqual(after.settings.theme, c.from.settings.theme, `${c.label}: 기존 설정은 보존`);
      }
    }
    console.log('✓ 2.0.2 migration drops commentTreeEnabled and keeps user intent');
  }

  // ConfigManager test
  const config = new ConfigManager();
  await config.init();
  const theme = config.get('theme');
  assert.ok(['system', 'light', 'dark'].includes(theme));
  console.log('✓ ConfigManager initialization passed');
}
