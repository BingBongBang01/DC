/**
 * ConfigManager Core Module for DC Ultimate
 * Manages configuration schema, defaults, validation, and real-time storage sync
 */
import { storageManager, INITIAL_STORAGE_SCHEMA } from './storage-manager.js';
import { eventBus } from './event-bus.js';
import { logger } from './logger.js';

export class ConfigManager {
  constructor() {
    this.config = { ...INITIAL_STORAGE_SCHEMA.settings };
    this._initialized = false;
  }

  /**
   * Load configurations from storage
   */
  async init() {
    if (this._initialized) return;
    try {
      const stored = await storageManager.get('settings');
      if (stored && stored.settings) {
        this.config = { ...INITIAL_STORAGE_SCHEMA.settings, ...stored.settings };
      }
      this._initialized = true;

      // Listen for storage updates (registered once only)
      eventBus.on('storage:changed', (changes) => {
        if (changes && changes.settings) {
          this.config = { ...this.config, ...changes.settings };
          eventBus.emit('config:updated', this.config);
        }
      });

      logger.info('ConfigManager: Loaded configurations successfully.');
    } catch (err) {
      logger.error('ConfigManager initialization error:', err);
    }
  }

  /**
   * Get specific setting or entire settings object
   * @param {string} [key] Optional setting key
   * @returns {*} Setting value
   */
  get(key) {
    if (!key) return { ...this.config };
    return this.config[key] !== undefined ? this.config[key] : INITIAL_STORAGE_SCHEMA.settings[key];
  }

  /**
   * Set specific config key or updates object
   * @param {string|Object} keyOrObject Setting key or object of settings
   * @param {*} [value] Setting value
   */
  async set(keyOrObject, value) {
    let updates = {};
    if (typeof keyOrObject === 'string') {
      updates[keyOrObject] = value;
    } else if (typeof keyOrObject === 'object') {
      updates = keyOrObject;
    }

    this.config = { ...this.config, ...updates };
    await storageManager.set({ settings: this.config });
    eventBus.emit('config:updated', this.config);
  }

  /**
   * Reset config to defaults
   */
  async reset() {
    this.config = { ...INITIAL_STORAGE_SCHEMA.settings };
    await storageManager.set({ settings: this.config });
    eventBus.emit('config:updated', this.config);
  }
}

export const configManager = new ConfigManager();
