/**
 * QueryBuilder Module for DC Ultimate Search Engine
 * Construct structured search queries and URL parameters safely without raw string concatenation
 */

export class SearchQuery {
  constructor(data = {}) {
    this.keyword = data.keyword || '';
    this.galleryId = data.galleryId || 'programming';
    this.galleryType = data.galleryType || 'major'; // 'major', 'minor', 'mini'
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
  buildUrl(query, pageNum = 1) {
    let baseUrl = 'https://gall.dcinside.com/board/lists/';
    if (query.galleryType === 'minor') {
      baseUrl = 'https://gall.dcinside.com/mgallery/board/lists/';
    } else if (query.galleryType === 'mini') {
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

    params.set('page', String(pageNum));

    return `${baseUrl}?${params.toString()}`;
  }
}

export const queryBuilder = new QueryBuilder();
