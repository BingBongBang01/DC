/**
 * QueryBuilder Module for DC Ultimate Search Engine
 * Construct structured search queries and URL parameters safely without raw string concatenation
 */
import { normalizeGalleryType } from '../gallery-context.js';

export class SearchQuery {
  constructor(data = {}) {
    this.keyword = data.keyword || '';
    this.galleryId = data.galleryId || 'programming';
    // Accepted values: 'major', 'minor'/'mgallery' (마이너 갤러리), 'mini' (미니 갤러리).
    // Normalized here because the rest of the codebase (gallery-context.js,
    // dc-url-parser.js, sidepanel.js) produces 'mgallery' for minor galleries, not 'minor'.
    const rawType = data.galleryType || 'major';
    this.galleryType = rawType === 'mgallery' ? 'minor' : rawType;
    this.subject = data.subject || '';
    this.author = data.author || '';
    this.startDate = data.startDate || null;
    this.endDate = data.endDate || null;
    this.startPage = typeof data.startPage === 'number' ? data.startPage : 1;
    this.maxPages = Math.min(typeof data.maxPages === 'number' ? data.maxPages : 10, 100);
    this.maxResults = Math.min(typeof data.maxResults === 'number' ? data.maxResults : 500, 2000);
    this.sortOrder = data.sortOrder || 'newest'; // 'newest', 'oldest', 'recommendations', 'views', 'comments'
    this.searchTargets = Array.isArray(data.searchTargets) && data.searchTargets.length > 0 ? data.searchTargets : ['search_subject_memo'];
    this.currentSearchTarget = this.searchTargets[0];
  }

  /**
   * Generates a stable unique hash key for caching this query definition
   * @returns {string}
   */
  getHashKey() {
    const raw = `${this.galleryType}:${this.galleryId}:${this.keyword}:${this.subject}:${this.author}:${this.startDate}:${this.endDate}:${this.startPage}:${this.maxPages}:${this.searchTargets.join(',')}`;
    return `search_cache_${btoa(unescape(encodeURIComponent(raw)))}`;
  }
}

export class QueryBuilder {
  /**
   * Build complete DCInside target page URL for a specific page number
   * @param {SearchQuery} query SearchQuery instance
   * @param {number} pageNum Page number
   * @returns {string}
   */
  buildUrl(query, pageNum = 1, searchPos = null) {
    // Callers hand us either vocabulary ('minor' from PageDetector, 'mgallery'
    // from GalleryContext / Keyword Alerts), so normalize before branching.
    const galleryType = normalizeGalleryType(query.galleryType);

    let baseUrl = 'https://gall.dcinside.com/board/lists/';
    if (galleryType === 'minor') {
      baseUrl = 'https://gall.dcinside.com/mgallery/board/lists/';
    } else if (galleryType === 'mini') {
      baseUrl = 'https://gall.dcinside.com/mini/board/lists/';
    }

    const params = new URLSearchParams();
    params.set('id', query.galleryId);

    if (query.keyword) {
      params.set('s_type', query.currentSearchTarget || 'search_subject_memo');
      params.set('s_keyword', query.keyword);
    }

    if (query.subject) {
      // NOTE: DCInside's real gallery list/search endpoint reads the 말머리(head) filter
      // from the `search_head` query parameter (confirmed against live gall.dcinside.com
      // markup: hidden <input id="search_head" name="search_head">). It does NOT use
      // `headid` - that param is ignored by the server, which silently drops the category
      // filter. Kept `headid` as a secondary param for older cached/bookmarked links.
      params.set('search_head', query.subject);
      params.set('headid', query.subject);
    }

    if (query.keyword) {
      // Keyword search results are NOT paginated via a plain incrementing `page` number.
      // DCInside's search keeps `page=1` fixed and instead advances through results using
      // an opaque `search_pos` cursor taken from the previous response's "다음 검색" link
      // (confirmed against live gall.dcinside.com search markup). Passing page=2,3,... here
      // without a matching search_pos causes the server to return unrelated/unfiltered
      // content instead of the next chunk of search results.
      params.set('page', '1');
      if (searchPos !== null && searchPos !== undefined && searchPos !== '') {
        params.set('search_pos', String(searchPos));
      }
    } else {
      params.set('page', String(pageNum));
    }

    return `${baseUrl}?${params.toString()}`;
  }
}

export const queryBuilder = new QueryBuilder();
