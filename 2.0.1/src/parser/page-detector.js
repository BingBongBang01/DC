/**
 * PageDetector Module for DC Ultimate
 * Analyzes URL patterns and DOM structures to detect exact DCInside page type
 */
import { SELECTORS } from '../adapters/selectors.js';
import { logger } from '../core/logger.js';

export const PAGE_TYPES = {
  UNKNOWN: 'UNKNOWN',
  GALLERY_LIST: 'GALLERY_LIST',
  ARTICLE_VIEW: 'ARTICLE_VIEW',
  SEARCH_RESULT: 'SEARCH_RESULT',
  MINOR_GALLERY: 'MINOR_GALLERY',
  MINI_GALLERY: 'MINI_GALLERY',
  REALTIME_BEST: 'REALTIME_BEST',
  GALLOG: 'GALLOG'
};

export class PageDetector {
  /**
   * Detect page type from location and DOM
   * @param {Location} [loc=window.location] Location object
   * @param {Document} [doc=document] Document object
   * @returns {Object} { type, galleryId, galleryType, isArticle, isList, isSearch }
   */
  detect(loc = (typeof window !== 'undefined' ? window.location : null), doc = (typeof document !== 'undefined' ? document : null)) {
    if (!loc) {
      return { type: PAGE_TYPES.UNKNOWN, galleryId: null, galleryType: 'major' };
    }

    const href = loc.href || '';
    const pathname = loc.pathname || '';
    const search = loc.search || '';

    // Extract gallery ID parameter
    const urlParams = new URLSearchParams(search);
    const galleryId = urlParams.get('id') || this._extractGalleryIdFromDOM(doc);

    let galleryType = 'major';
    if (pathname.includes('/mgallery/')) {
      galleryType = 'minor';
    } else if (pathname.includes('/mini/')) {
      galleryType = 'mini';
    }

    const isRealtimeBest = galleryId === 'dcbest' || href.includes('realtime_best') || Boolean(doc && doc.querySelector(SELECTORS.realtimeBestHead));
    const isSearch = urlParams.has('s_keyword') || href.includes('/search/') || Boolean(doc && doc.querySelector(SELECTORS.searchResultHead));

    let type = PAGE_TYPES.UNKNOWN;

    if (isRealtimeBest) {
      type = PAGE_TYPES.REALTIME_BEST;
    } else if (isSearch) {
      type = PAGE_TYPES.SEARCH_RESULT;
    } else if (pathname.includes('/board/view') || urlParams.has('no')) {
      type = PAGE_TYPES.ARTICLE_VIEW;
    } else if (pathname.includes('/board/lists') || galleryId) {
      if (galleryType === 'minor') type = PAGE_TYPES.MINOR_GALLERY;
      else if (galleryType === 'mini') type = PAGE_TYPES.MINI_GALLERY;
      else type = PAGE_TYPES.GALLERY_LIST;
    } else if (pathname.includes('/gallog')) {
      type = PAGE_TYPES.GALLOG;
    }

    const info = {
      type,
      galleryId,
      galleryType,
      isArticle: type === PAGE_TYPES.ARTICLE_VIEW,
      isList: type === PAGE_TYPES.GALLERY_LIST || type === PAGE_TYPES.MINOR_GALLERY || type === PAGE_TYPES.MINI_GALLERY,
      isSearch,
      isRealtimeBest,
      url: href,
      categories: this._extractCategories(doc)
    };

    logger.debug('PageDetector detected:', info);
    return info;
  }

  _extractGalleryIdFromDOM(doc) {
    if (!doc) return null;
    const input = doc.querySelector(SELECTORS.galleryIdInput);
    if (input && input.value) return input.value;

    const link = doc.querySelector('.gall_title_name a, .page_head a');
    if (link && link.href) {
      const match = link.href.match(/id=([a-zA-Z0-9_]+)/);
      if (match) return match[1];
    }
    return null;
  }

  // Known-gallery hardcoded 말머리(head) tables, used as a last-resort fallback when
  // dynamic DOM extraction finds nothing (e.g. the gallery renders its head tab bar via
  // onclick/JS navigation rather than plain `<a href="...search_head=...">` links, or the
  // tab bar is injected client-side after our content script has already scanned the DOM).
  // Confirmed directly from the user against gall.dcinside.com/mgallery/board/lists/?id=sff.
  static KNOWN_GALLERY_HEADS = {
    sff: [
      { id: '0', name: '일반' },
      { id: '110', name: '🛒살거' },
      { id: '10', name: '📊정보' },
      { id: '90', name: 'SFF후기' },
      { id: '170', name: '📦거래' },
      { id: '160', name: '🔥핫딜' },
      { id: '70', name: '💏빅첩' },
      { id: '50', name: '🥳이벤트' },
      { id: '180', name: '.' },
      { id: '190', name: '.' }
    ]
  };

  _extractCategories(doc, galleryId) {
    return extractCategoriesFromDOM(doc, galleryId);
  }
}

// Extracted as a standalone function (not just a class method) so other modules —
// e.g. content/detectors/gallery-detector.js's GalleryDetector.detectCategories() —
// can import and reuse this exact, real-markup-verified extraction logic instead of
// maintaining a second, weaker selector set that drifts out of sync.
export function extractCategoriesFromDOM(doc, galleryId) {
    if (!doc) return [];
    const categories = [];

    // Ground truth (confirmed against a real saved page for
    // gall.dcinside.com/mgallery/board/lists/?id=sff, "전체" tab): the 말머리(head)
    // tab bar is NOT rendered as plain `<a href="...search_head=...">` links at all.
    // It is JS-driven - every tab is `<a href="javascript:;" onclick="listSearchHead(N)">
    // 라벨</a>`, e.g.:
    //   <div class="center_box"><div class="inner">
    //     <ul><li><a href="javascript:;" onclick="listSearchHead(0)" class="">일반</a></li>
    //     <li><a href="javascript:;" onclick="listSearchHead(110)" class="">🛒살거</a></li>
    //     ...</ul>
    //     <div class="subject_morelist" id="subject_morelist" style="display:none;">
    //       <ul><li><a href="javascript:;" onclick="listSearchHead(50)" class="">🥳이벤트</a></li>
    //       ...</ul>
    //     </div>
    //   </div></div>
    // The previous selector (`a[href*="search_head="]`) matched zero elements against
    // this real markup - hence the "only 전체" under-matching regression. There is no
    // `href*="search_head="` or `href*="headid="` anchor anywhere in the real page; the
    // only literal "search_head" in the DOM is the hidden search-form input
    // (`<input id="search_head" name="search_head" value="">`), which carries no tabs.
    //
    // Post-row links (e.g. a pinned notice) never use this onclick pattern - they are
    // plain `<a href="/mgallery/board/view/?id=sff&no=123&...">` anchors - so matching
    // on `onclick*="listSearchHead("` naturally excludes them without needing the old
    // no=/board-lists href checks.
    const onclickLinks = doc.querySelectorAll('a[onclick*="listSearchHead("]');
    onclickLinks.forEach(link => {
      const onclick = link.getAttribute('onclick') || '';
      const match = onclick.match(/listSearchHead\(\s*['"]?([0-9]+)['"]?\s*\)/);
      if (match) {
        const id = match[1];
        const name = link.textContent.trim();
        if (name && name.length < 20 && !categories.some(c => c.id === id)) {
          categories.push({ id, name });
        }
      }
    });

    if (categories.length === 0) {
      // Fallback for galleries/pages that DO render plain href-based head-filter links
      // (older markup or a different template). Kept for compatibility with the
      // original href*="search_head=" detection, including its post-row exclusion
      // logic (real head-filter tabs point at the list view and never carry "no=").
      const categoryLinks = doc.querySelectorAll('a[href*="search_head="], a[href*="headid="]');
      categoryLinks.forEach(link => {
        const href = link.getAttribute('href') || link.href || '';
        if (/[?&]no=[0-9]/.test(href)) return;
        if (!/board\/lists/.test(href)) return;
        const match = link.href.match(/[?&](?:search_head|headid)=([0-9]+)/);
        if (match) {
          const id = match[1];
          const name = link.textContent.trim();
          if (name && name.length < 20 && !categories.some(c => c.id === id)) {
            categories.push({ id, name });
          }
        }
      });
    }

    if (categories.length === 0) {
      // Fallback to select box if it exists
      const select = doc.querySelector('select[name="search_head"], select[name="headid"], #head_id, #search_head');
      if (select && select.tagName === 'SELECT') {
        select.querySelectorAll('option').forEach(opt => {
          if (opt.value && !categories.some(c => c.id === opt.value)) {
            categories.push({ id: opt.value, name: opt.textContent.trim() });
          }
        });
      }
    }
    return categories;
}

export const pageDetector = new PageDetector();
