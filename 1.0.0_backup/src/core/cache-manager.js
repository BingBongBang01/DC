/**
 * CacheManager Core Module for DC Ultimate
 * Memory LRU and TTL Cache to prevent unnecessary DOM re-parsing and performance degradation
 */
import { logger } from './logger.js';

export class CacheManager {
  constructor(maxSize = 200, defaultTTL = 5 * 60 * 1000) { // 5 mins default TTL
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.cache = new Map();
  }

  /**
   * Set value in cache with optional TTL
   * @param {string} key Cache key
   * @param {*} value Value to store
   * @param {number} [ttlMs] Time-to-live in ms
   */
  set(key, value, ttlMs = this.defaultTTL) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry (LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Get value from cache
   * @param {string} key Cache key
   * @returns {*} Cached value or null if expired/absent
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Check if cache has non-expired key
   * @param {string} key Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete entry by key
   * @param {string} key Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }
}

export const cacheManager = new CacheManager();
