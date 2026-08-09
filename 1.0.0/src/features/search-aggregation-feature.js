/**
 * SearchAggregationFeature Module for DC Ultimate
 * Manages search engine execution, search profiles persistence, and UI events
 */
import { BaseFeature } from './base-feature.js';
import { searchEngine } from '../core/search/search-engine.js';
import { SearchQuery } from '../core/search/query-builder.js';
import { FilterRule } from '../core/search/result-filter.js';
import { storageManager } from '../core/storage-manager.js';
import { logger } from '../core/logger.js';

export class SearchAggregationFeature extends BaseFeature {
  constructor() {
    super('enableSearchEngine', 'Multi-Page Search Engine', 'Aggregates search results across multiple pages with virtual pagination and filters');
  }

  async onEnable() {
    logger.info('SearchAggregationFeature enabled.');
  }

  /**
   * Run multi-page search aggregation
   * @param {Object} queryOptions Query data
   * @param {Object} filterOptions Filter criteria
   * @param {Function} [onProgress] Progress reporting callback
   */
  async executeSearch(queryOptions = {}, filterOptions = {}, onProgress = null) {
    const query = new SearchQuery(queryOptions);
    
    const rules = [];
    if (filterOptions.titleContains || filterOptions.minRecommendations || filterOptions.minComments) {
      rules.push(new FilterRule(filterOptions));
    }

    const sortOrder = queryOptions.sortOrder || 'newest';

    return await searchEngine.search(query, {
      filterRules: rules,
      sortOrder,
      onProgress
    });
  }

  /**
   * Get virtual page without refetching network
   * @param {number} page Page number
   * @param {number} pageSize Items per page
   */
  getVirtualPage(page = 1, pageSize = 20) {
    return searchEngine.getPage(page, pageSize);
  }

  /**
   * Cancel background multi-page search collection
   */
  cancel() {
    searchEngine.cancel();
  }

  /**
   * Save a reusable search profile to storage
   * @param {string} profileName Name tag
   * @param {Object} profileData Query/Filter params
   */
  async saveSearchProfile(profileName, profileData) {
    const data = await storageManager.get('searchProfiles');
    const profiles = Array.isArray(data.searchProfiles) ? data.searchProfiles : [];
    
    profiles.push({
      name: profileName,
      data: profileData,
      createdAt: new Date().toISOString()
    });

    await storageManager.set({ searchProfiles: profiles });
    logger.info('SearchAggregationFeature: Saved search profile:', profileName);
  }

  /**
   * Get all saved search profiles
   */
  async getSearchProfiles() {
    const data = await storageManager.get('searchProfiles');
    return Array.isArray(data.searchProfiles) ? data.searchProfiles : [];
  }
}

export const searchAggregationFeature = new SearchAggregationFeature();
