/**
 * SearchEngine Orchestrator Module for DC Ultimate
 * Unified multi-page search collection, deduplication, filtering, sorting, caching, and virtual pagination
 */
import { SearchQuery } from './query-builder.js';
import { pageCollector } from './page-collector.js';
import { deduplicator } from './deduplicator.js';
import { resultFilter, FilterRule } from './result-filter.js';
import { resultSorter } from './result-sorter.js';
import { resultCache } from './result-cache.js';
import { virtualPaginator } from './virtual-paginator.js';
import { logger } from '../logger.js';

export class SearchEngine {
  constructor() {
    this.currentQuery = null;
    this.currentRawDataset = [];
    this.currentProcessedDataset = [];
  }

  /**
   * Execute multi-page search aggregation
   * @param {SearchQuery} query SearchQuery parameters
   * @param {Object} options Options { filterRules, sortOrder, onProgress, customFetcher, forceRefresh }
   */
  async search(query, options = {}) {
    const {
      filterRules = [],
      sortOrder = 'newest',
      onProgress = null,
      customFetcher = null,
      forceRefresh = false
    } = options;

    this.currentQuery = query;
    const cacheKey = query.getHashKey();

    let rawArticles = null;
    let allFailedPages = [];
    let isPartial = false;

    if (!forceRefresh) {
      rawArticles = resultCache.get(cacheKey);
    }

    if (rawArticles) {
      logger.info('SearchEngine: Cache hit for query hash:', cacheKey);
      if (typeof onProgress === 'function') {
        const totalPages = query.maxPages * query.searchTargets.length;
        onProgress({ currentPage: totalPages, totalPages: totalPages, collectedCount: rawArticles.length, status: 'CACHE_HIT' });
      }
    } else {
      logger.info('SearchEngine: Cache miss. Executing multi-target collection...');
      rawArticles = [];
      const totalTargets = query.searchTargets.length;
      let targetIndex = 0;

      for (const target of query.searchTargets) {
        query.currentSearchTarget = target;
        
        const progressWrapper = onProgress ? (info) => {
          const basePage = targetIndex * query.maxPages;
          onProgress({
            ...info,
            currentPage: basePage + info.currentPage,
            totalPages: query.maxPages * totalTargets,
            collectedCount: rawArticles.length + info.collectedCount
          });
        } : null;

        try {
          const collectResult = await pageCollector.collect(query, progressWrapper, customFetcher);
          rawArticles.push(...collectResult.articles);

          if (collectResult.isPartial) {
            isPartial = true;
            if (collectResult.failedPages) {
              allFailedPages.push(...collectResult.failedPages.map(page => ({ target, page })));
            }
          }
        } catch (err) {
          logger.error(`SearchEngine: Target [${target}] collection failed entirely:`, err);
          isPartial = true;
          allFailedPages.push({ target, page: 'ALL', error: err.message });
        }

        targetIndex++;
      }

      rawArticles = deduplicator.deduplicate(rawArticles);

      if (!isPartial) {
        resultCache.set(cacheKey, rawArticles);
      }
    }

    this.currentRawDataset = rawArticles;

    let filtered = rawArticles;
    if (filterRules && filterRules.length > 0) {
      filtered = resultFilter.filter(rawArticles, filterRules);
    }

    const sorted = resultSorter.sort(filtered, sortOrder || query.sortOrder);
    this.currentProcessedDataset = sorted;

    logger.info(`SearchEngine: Total collected: ${rawArticles.length}, Filtered: ${sorted.length}, Partial: ${isPartial}`);

    return {
      totalCollected: rawArticles.length,
      totalFiltered: sorted.length,
      dataset: sorted,
      isPartial,
      failedPages: allFailedPages
    };
  }

  /**
   * Get virtual paginated view from cached dataset without re-fetching
   * @param {number} page 1-based page
   * @param {number} pageSize Results per page (20, 50, 100, 200)
   */
  getPage(page = 1, pageSize = 20) {
    return virtualPaginator.paginate(this.currentProcessedDataset, page, pageSize);
  }

  /**
   * Cancel ongoing search collection
   */
  cancel() {
    pageCollector.cancel();
  }
}

export const searchEngine = new SearchEngine();
