/**
 * SearchParser Module for DC Ultimate
 * Extracts search keywords, total result count, and matching Article models
 */
import { SearchResult } from '../utils/models.js';
import { articleParser } from './article-parser.js';

export class SearchParser {
  /**
   * Parse Search Result page from Document
   * @param {Document} [doc=document] Document node
   * @returns {SearchResult}
   */
  parse(doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc) return new SearchResult();

    try {
      const keywordInput = doc.querySelector('input[name="s_keyword"], #s_keyword, .sch_input');
      const keyword = keywordInput ? keywordInput.value : '';

      const countElem = doc.querySelector('.sch_result_count, .total_num');
      let totalCount = 0;
      if (countElem) {
        const countText = countElem.textContent.replace(/[^0-9]/g, '');
        totalCount = parseInt(countText, 10) || 0;
      }

      const articles = articleParser.parseList(doc);

      return new SearchResult({
        keyword,
        totalCount,
        articles
      });
    } catch (err) {
      return new SearchResult();
    }
  }
}

export const searchParser = new SearchParser();
