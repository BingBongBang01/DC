/**
 * Draft mirror store (background side).
 *
 * The authoritative copy of a draft lives in the page's `localStorage`, which
 * only dcinside.com can read. This mirror lets the Side Panel list drafts and
 * jump back to the write page that owns each one.
 */
import { storageManager } from '../storage-manager.js';

export const DRAFT_KEY = 'dc_drafts';
const MAX_DRAFTS = 30;
/** The mirror only needs enough body text to recognise the draft. */
const PREVIEW_LIMIT = 200;

export class DraftStore {
  /**
   * @returns {Promise<Array<Object>>} newest first
   */
  async list() {
    const data = await storageManager.get(DRAFT_KEY);
    const map = data[DRAFT_KEY] || {};
    return Object.values(map).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  /**
   * @param {Object} draft
   */
  async save(draft) {
    if (!draft || !draft.key) return null;

    const data = await storageManager.get(DRAFT_KEY);
    const map = data[DRAFT_KEY] || {};

    // Store a summary only — the full HTML body stays in the page.
    map[draft.key] = {
      key: draft.key,
      url: draft.url || '',
      galleryId: draft.galleryId || '',
      subject: (draft.subject || '').slice(0, 200),
      preview: (draft.preview || '').slice(0, PREVIEW_LIMIT),
      attachments: Array.isArray(draft.attachments) ? draft.attachments.slice(0, 20) : [],
      savedAt: draft.savedAt || Date.now()
    };

    const entries = Object.values(map).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const trimmed = {};
    entries.slice(0, MAX_DRAFTS).forEach(entry => { trimmed[entry.key] = entry; });

    await storageManager.set({ [DRAFT_KEY]: trimmed });
    return map[draft.key];
  }

  async remove(key) {
    const data = await storageManager.get(DRAFT_KEY);
    const map = data[DRAFT_KEY] || {};
    delete map[key];
    await storageManager.set({ [DRAFT_KEY]: map });
  }

  async clear() {
    await storageManager.set({ [DRAFT_KEY]: {} });
  }
}

export const draftStore = new DraftStore();
