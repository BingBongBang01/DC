/**
 * MediaToolsFeature Module for DC Ultimate (Phase 4D)
 * Image preview, media gallery, multi-select batch download, duplicate image detection, GIF/video controls
 */
import { BaseFeature } from './base-feature.js';
import { mediaParser } from '../parser/media-parser.js';
import { logger } from '../core/logger.js';

export class MediaToolsFeature extends BaseFeature {
  constructor() {
    super('enableMediaTools', 'Media Tools', 'Duplicate media detection');
  }

  async onEnable() {
    logger.info('MediaToolsFeature enabled.');
  }

  /**
   * Generates local hash identifier for an image URL or image data
   * @param {string} url Image URL
   * @returns {string} Hash key
   */
  getImageHash(url) {
    if (!url) return '';
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Deduplicate array of Media models by image hash
   * @param {Media[]} mediaList Array of Media objects
   * @returns {Media[]} Deduplicated array
   */
  deduplicateMedia(mediaList) {
    if (!Array.isArray(mediaList)) return [];

    const seenHashes = new Set();
    const result = [];

    for (const item of mediaList) {
      const hash = this.getImageHash(item.url);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        result.push(item);
      }
    }

    return result;
  }
}

export const mediaToolsFeature = new MediaToolsFeature();
