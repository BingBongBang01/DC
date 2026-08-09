/**
 * ResultCache Module for DC Ultimate Search Engine
 * Caches multi-page aggregated search results using stable query hash keys
 */
import { CURRENT_SCHEMA_VERSION } from '../storage-manager.js';
import { logger } from '../logger.js';

export class ResultCache {
  constructor(defaultTtlMs = 15 * 60 * 1000) { // 15 mins default TTL
    this.cacheMap = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Store search result dataset in cache
   * @param {string} cacheKey Hash key
   * @param {Article[]} articles Dataset
   * @param {number} [ttlMs] Custom TTL in ms
   */
  set(cacheKey, articles, ttlMs = this.defaultTtlMs) {
    if (!cacheKey) return;
    const entry = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttlMs,
      articles: Array.isArray(articles) ? [...articles] : []
    };

    this.cacheMap.set(cacheKey, entry);
    logger.info(`ResultCache: Cached ${entry.articles.length} articles for key: ${cacheKey}`);
  }

  /**
   * Retrieve cached search results if valid and unexpired
   * @param {string} cacheKey Hash key
   * @returns {Article[]|null} Cached articles array or null
   */
  get(cacheKey) {
    const entry = this.cacheMap.get(cacheKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      logger.info(`ResultCache: Cache expired for key: ${cacheKey}`);
      this.cacheMap.delete(cacheKey);
      return null;
    }

    if (entry.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      this.cacheMap.delete(cacheKey);
      return null;
    }

    return entry.articles;
  }

  has(cacheKey) {
    return this.get(cacheKey) !== null;
  }

  clear() {
    this.cacheMap.clear();
  }
}

export const resultCache = new ResultCache();
