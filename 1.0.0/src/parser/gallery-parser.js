/**
 * GalleryParser Module for DC Ultimate
 * Parses Gallery headers and article lists with full safety for missing fields
 */
import { Gallery } from '../utils/models.js';
import { articleParser } from './article-parser.js';
import { SELECTORS } from '../adapters/selectors.js';
import { logger } from '../core/logger.js';

export class GalleryParser {
  /**
   * Parse gallery details from Document node
   * @param {Document} [doc=document] Document node
   * @returns {Gallery}
   */
  parseHeader(doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc) return null;

    try {
      const titleElem = doc.querySelector(SELECTORS.galleryTitle);
      const name = titleElem ? titleElem.textContent.trim() : '';

      const href = typeof window !== 'undefined' && window.location ? window.location.href : '';
      let type = 'major';
      if (href.includes('/mgallery/')) type = 'minor';
      else if (href.includes('/mini/')) type = 'mini';

      let id = '';
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id') || '';
      }

      if (!id && doc) {
        const input = doc.querySelector(SELECTORS.galleryIdInput);
        if (input && input.value) id = input.value;
      }

      return new Gallery({
        id,
        name,
        type,
        url: href
      });
    } catch (err) {
      logger.error('GalleryParser.parseHeader: parsing failed:', err);
      return null;
    }
  }

  /**
   * Parse full article list from gallery table container
   * @param {Document|Element} [container=document] Document or table element
   * @param {string} [galleryId=''] Gallery ID
   * @returns {Article[]} Array of normalized Article objects
   */
  parseArticleList(container = (typeof document !== 'undefined' ? document : null), galleryId = '') {
    return articleParser.parseList(container, galleryId);
  }
}

export const galleryParser = new GalleryParser();
