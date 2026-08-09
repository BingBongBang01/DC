/**
 * PageCollector Module for DC Ultimate Search Engine
 * Collects raw HTML pages sequentially across multiple DC search pages
 */
import { requestScheduler } from './request-scheduler.js';
import { queryBuilder } from './query-builder.js';
import { articleParser } from '../../parser/article-parser.js';
import { logger } from '../logger.js';

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

      const pageUrl = queryBuilder.buildUrl(query, p);
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
