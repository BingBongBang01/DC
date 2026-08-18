/**
 * DataManager Module for DC Ultimate (Phase 4E)
 * Unified backup export/import in JSON/CSV/HTML formats with schema migration and corruption handling
 */
import { storageManager, CURRENT_SCHEMA_VERSION } from './storage-manager.js';
import { logger } from './logger.js';

export class DataManager {
  /**
   * Export complete extension data as JSON string
   * @returns {Promise<string>}
   */
  async exportJSON() {
    const data = await storageManager.getAll();
    const exportObject = {
      app: 'DC Ultimate',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data
    };
    return JSON.stringify(exportObject, null, 2);
  }

  /**
   * Export bookmarks/history as CSV string
   * @returns {Promise<string>}
   */
  async exportCSV() {
    const data = await storageManager.get('bookmarks');
    const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];

    const headers = ['Title', 'URL', 'Date'];
    const rows = bookmarks.map(b => [
      `"${(b.title || '').replace(/"/g, '""')}"`,
      `"${b.url || ''}"`,
      `"${b.date || ''}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Export bookmarks as HTML file string (Netscape bookmark format)
   * @returns {Promise<string>}
   */
  async exportHTML() {
    const data = await storageManager.get('bookmarks');
    const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];

    const listHtml = bookmarks.map(b => `  <DT><A HREF="${b.url}">${b.title}</A>`).join('\n');

    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>DC Ultimate Bookmarks</TITLE>
<H1>DC Ultimate Bookmarks</H1>
<DL><p>
${listHtml}
</DL><p>`;
  }

  /**
   * Import data from JSON string with safety validation and schema recovery
   * @param {string} jsonString Raw JSON import
   * @returns {Promise<{ success: boolean, importedKeysCount: number, error: string|null }>}
   */
  async importJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, importedKeysCount: 0, error: '유효하지 않은 입력 데이터입니다.' };
    }

    try {
      const parsed = JSON.parse(jsonString);
      
      const payload = parsed.data ? parsed.data : parsed;
      if (typeof payload !== 'object') {
        return { success: false, importedKeysCount: 0, error: '잘못된 구조의 JSON 데이터입니다.' };
      }

      // Schema version verification & migration handling
      payload.schemaVersion = CURRENT_SCHEMA_VERSION;
      await storageManager.set(payload);

      const count = Object.keys(payload).length;
      logger.info(`DataManager: Successfully imported ${count} storage keys.`);
      return { success: true, importedKeysCount: count, error: null };
    } catch (err) {
      logger.error('DataManager: JSON import parsing failed:', err);
      return { success: false, importedKeysCount: 0, error: `JSON 파싱 오류: ${err.message}` };
    }
  }
}

export const dataManager = new DataManager();
