/**
 * Dccon favourites store.
 *
 * Keeps the dccons the user actually sends, with a usage counter so the most
 * used ones can be pinned automatically, plus an explicit pin flag managed
 * from the Side Panel.
 */
import { storageManager } from '../storage-manager.js';

export const DCCON_KEY = 'dc_dccon_favorites';

/** Auto-pin threshold: sending the same dccon this often pins it. */
const AUTO_PIN_USES = 3;
const MAX_ENTRIES = 100;

export class DcconStore {
  /**
   * @returns {Promise<Array<{detailIdx: string, packageIdx: string, title: string, img: string, uses: number, pinned: boolean}>>}
   */
  async list() {
    const data = await storageManager.get(DCCON_KEY);
    const items = Array.isArray(data[DCCON_KEY]) ? data[DCCON_KEY] : [];
    return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.uses || 0) - (a.uses || 0));
  }

  async save(items) {
    await storageManager.set({ [DCCON_KEY]: items.slice(0, MAX_ENTRIES) });
  }

  /**
   * @param {{detailIdx: string, packageIdx: string, title?: string, img?: string}} dccon
   */
  async recordUse(dccon) {
    if (!dccon || !dccon.detailIdx) return null;

    const items = await this.list();
    const existing = items.find(item => item.detailIdx === dccon.detailIdx);

    if (existing) {
      existing.uses = (existing.uses || 0) + 1;
      existing.lastUsedAt = Date.now();
      if (dccon.img) existing.img = dccon.img;
      if (dccon.title) existing.title = dccon.title;
      if (!existing.pinned && existing.uses >= AUTO_PIN_USES) existing.pinned = true;
      await this.save(items);
      return existing;
    }

    const entry = {
      detailIdx: String(dccon.detailIdx),
      packageIdx: String(dccon.packageIdx || ''),
      title: dccon.title || '',
      img: dccon.img || '',
      uses: 1,
      pinned: false,
      lastUsedAt: Date.now()
    };
    items.push(entry);
    await this.save(items);
    return entry;
  }

  async setPinned(detailIdx, pinned) {
    const items = await this.list();
    const entry = items.find(item => item.detailIdx === String(detailIdx));
    if (!entry) return null;
    entry.pinned = Boolean(pinned);
    await this.save(items);
    return entry;
  }

  async remove(detailIdx) {
    const items = await this.list();
    await this.save(items.filter(item => item.detailIdx !== String(detailIdx)));
  }

  async clear() {
    await this.save([]);
  }
}

export const dcconStore = new DcconStore();
