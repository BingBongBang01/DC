/**
 * DC Ultimate Gallery Detector
 * Runs within the content script to detect and extract gallery information from the DOM.
 */
import { parseGalleryUrl } from '../../core/gallery-context.js';
import { extractCategoriesFromDOM } from '../../parser/page-detector.js';

export class GalleryDetector {
  /**
   * Extracts current gallery info from the URL and DOM
   * @returns {Object|null} Gallery information or null if not a gallery
   */
  static detect() {
    const context = parseGalleryUrl(window.location.href);
    
    if (!context.valid) {
      return context;
    }

    // Attempt to extract the human-readable gallery name from the DOM.
    let name = context.galleryId; // Fallback
    
    try {
      const titleEl = document.querySelector('.page_head .title h2 a') || 
                      document.querySelector('.page_head .title h2') ||
                      document.querySelector('title');
                      
      if (titleEl) {
        let extracted = titleEl.textContent.trim();
        if (extracted.includes('-')) {
          extracted = extracted.split('-')[0].trim();
        }
        if (extracted) {
          name = extracted;
        }
      }
    } catch (e) {
      console.warn('GalleryDetector: Failed to extract gallery name from DOM', e);
    }

    context.galleryName = name;

    // Attempt to extract the categories (말머리) from the DOM.
    context.categories = GalleryDetector.detectCategories();

    context.source = 'content';
    return context;
  }

  /**
   * Extracts the 말머리 (post category / subject) list from the current gallery page.
   *
   * This delegates to PageDetector's `extractCategoriesFromDOM` (src/parser/page-detector.js),
   * the real-markup-verified extraction logic (`a[onclick*="listSearchHead("]` based, with
   * href-based and select-box fallbacks). Do NOT re-implement a second selector set here -
   * that previously drifted out of sync and caused category detection to silently return
   * nothing on real DCInside pages, whose head tab bar is JS-driven
   * (`<a href="javascript:;" onclick="listSearchHead(N)">라벨</a>`), not plain href links.
   * @returns {Array<{id: string, name: string}>}
   */
  static detectCategories() {
    try {
      return extractCategoriesFromDOM(document, parseGalleryUrl(window.location.href).galleryId);
    } catch (e) {
      console.warn('GalleryDetector: Failed to extract categories from DOM', e);
      return [];
    }
  }
}
