/**
 * PageCollector Module for DC Ultimate Search Engine
 * Collects raw HTML pages sequentially across multiple DC search pages
 */
import { requestScheduler } from './request-scheduler.js';
import { queryBuilder } from './query-builder.js';
import { articleParser } from '../../parser/article-parser.js';
import { logger } from '../logger.js';

/**
 * Extracts the `search_pos` cursor value from the "다음 검색" (next search page) link
 * in a parsed DC search results document. Keyword search results are paginated via this
 * opaque cursor rather than a plain incrementing page number - see QueryBuilder.buildUrl.
 * @param {Document|null} doc
 * @returns {string|null}
 */
function extractNextSearchPos(doc) {
  if (!doc) return null;
  const nextLink = doc.querySelector('a.search_next');
  if (!nextLink) return null;
  const href = nextLink.getAttribute('href') || '';
  const match = href.match(/[?&]search_pos=(-?\d+)/);
  return match ? match[1] : null;
}

export class PageCollector {
  /**
   * Collect pages sequentially based on SearchQuery
   * @param {SearchQuery} query SearchQuery parameters
   * @param {Function} [onProgress] Progress reporting callback (info) => void
   * @param {Function} [customFetcher] Optional custom fetcher for testing/mocking
   * @returns {Promise<{ articles: Article[], totalPagesCollected: number, failedPages: number[], isPartial: boolean }>}
   */
  async collect(query, onProgress = null, customFetcher = null) {
    const signal = requestScheduler.createCancellationSignal();
    const collectedArticles = [];
    const failedPages = [];

    const startPage = query.startPage || 1;
    const maxPages = query.maxPages || 10;
    const endPage = startPage + maxPages - 1;

    let actualPagesProcessed = 0;
    let successfulPages = 0;
    let searchPos = null; // cursor for DC's keyword-search pagination (see QueryBuilder.buildUrl)

    logger.info(`PageCollector: Starting multi-page collection from page ${startPage} to ${endPage}`);

    for (let p = startPage; p <= endPage; p++) {
      if (signal.aborted) {
        logger.info('PageCollector: Interrupted by user cancellation.');
        break;
      }

      if (collectedArticles.length >= query.maxResults) {
        logger.info(`PageCollector: Reached max requested results count (${query.maxResults}). Stopping.`);
        break;
      }

      // Keyword search requires the previous page's search_pos cursor to advance;
      // if we've already collected once and there's no next-page cursor, DC has no more results.
      if (query.keyword && p > startPage && !searchPos) {
        logger.info('PageCollector: No further search_pos cursor available. Halting further collection.');
        break;
      }

      const pageUrl = queryBuilder.buildUrl(query, p, searchPos);
      actualPagesProcessed++;
      
      try {
        let html = '';
        if (typeof customFetcher === 'function') {
          html = await customFetcher(pageUrl, p);
        } else {
          html = await requestScheduler.fetchPage(pageUrl, signal);
        }

        const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
        let doc = null;
        if (parser) {
          doc = parser.parseFromString(html, 'text/html');
        }

        const pageArticles = articleParser.parseList(doc, query.galleryId);

        if (query.keyword) {
          searchPos = extractNextSearchPos(doc);
        }

        // Stop if the page returned absolutely 0 articles (reached end of DC search results)
        // DC search returns empty results when paging beyond available data
        if (pageArticles.length === 0) {
           successfulPages++; // Technically successful HTTP fetch, but empty
           logger.info(`PageCollector: Page ${p} returned 0 articles. Halting further collection.`);
           break;
        }

        collectedArticles.push(...pageArticles);
        successfulPages++;

        if (typeof onProgress === 'function') {
          onProgress({
            currentPage: p,
            totalPages: maxPages,
            collectedCount: collectedArticles.length,
            status: 'COLLECTING'
          });
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          break;
        }
        logger.warn(`PageCollector: Failed to collect page ${p}:`, err);
        failedPages.push(p);
      }
    }

    const isPartial = failedPages.length > 0;
    
    if (typeof onProgress === 'function') {
      onProgress({
        currentPage: startPage + actualPagesProcessed - 1,
        totalPages: maxPages,
        collectedCount: collectedArticles.length,
        status: isPartial ? 'PARTIAL_COMPLETE' : 'COMPLETE'
      });
    }

    return {
      articles: collectedArticles,
      actualPagesProcessed,
      successfulPages,
      failedPages,
      isPartial
    };
  }

  cancel() {
    requestScheduler.cancel();
  }
}

export const pageCollector = new PageCollector();
