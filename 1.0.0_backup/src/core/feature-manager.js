/**
 * FeatureManager Core Module for DC Ultimate
 * Lifecycle registry for extension features
 */
import { logger } from './logger.js';
import { eventBus } from './event-bus.js';
import { configManager } from './config-manager.js';

export class FeatureManager {
  constructor() {
    this.features = new Map();
    this._initialized = false;
  }

  /**
   * Register a feature instance
   * @param {BaseFeature} feature Feature instance inheriting from BaseFeature
   */
  register(feature) {
    if (!feature || !feature.id) {
      logger.warn('FeatureManager: Cannot register invalid feature');
      return;
    }

    if (this.features.has(feature.id)) {
      logger.warn(`FeatureManager: Feature [${feature.id}] already registered`);
      return;
    }

    this.features.set(feature.id, feature);
    logger.info(`FeatureManager: Registered feature [${feature.id}] (${feature.name})`);
  }

  /**
   * Initialize all registered features and bind config settings
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;

    await configManager.init();

    const results = [];
    for (const [id, feature] of this.features.entries()) {
      try {
        await feature.init();
        const isConfigEnabled = configManager.get(id) ?? true;
        if (isConfigEnabled) {
          await feature.enable();
        }
        results.push({ id, ok: true });
      } catch (err) {
        logger.error(`FeatureManager: Feature [${id}] failed to initialize, skipping:`, err);
        results.push({ id, ok: false, error: err.message });
      }
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      logger.warn(`FeatureManager: ${failed.length}/${results.length} features failed to init.`, failed.map(f => f.id));
      eventBus.emit('features:init_partial_failure', failed);
    }

    // Listen to config updates
    eventBus.on('config:updated', async (newConfig) => {
      for (const [id, feature] of this.features.entries()) {
        try {
          const shouldBeEnabled = newConfig[id] ?? true;
          if (shouldBeEnabled && !feature.enabled) {
            await feature.enable();
          } else if (!shouldBeEnabled && feature.enabled) {
            await feature.disable();
          }
        } catch (err) {
          logger.error(`FeatureManager: config update failed for [${id}]:`, err);
        }
      }
    });

    // Listen for page detection changes
    eventBus.on('page:detected', async (pageInfo) => {
      for (const feature of this.features.values()) {
        if (!feature.enabled) continue;
        try {
          await feature.onPageChange(pageInfo);
        } catch (err) {
          logger.error(`FeatureManager: onPageChange failed for [${feature.id}]:`, err);
        }
      }
    });

    logger.info(`FeatureManager: Initialized ${results.filter(r=>r.ok).length}/${results.length} features.`);
  }

  /**
   * Manually enable feature by ID
   * @param {string} id Feature ID
   */
  async enable(id) {
    const feature = this.features.get(id);
    if (feature) {
      await feature.enable();
    }
  }

  /**
   * Manually disable feature by ID
   * @param {string} id Feature ID
   */
  async disable(id) {
    const feature = this.features.get(id);
    if (feature) {
      await feature.disable();
    }
  }

  /**
   * Get feature instance by ID
   * @param {string} id Feature ID
   * @returns {BaseFeature|null}
   */
  get(id) {
    return this.features.get(id) || null;
  }

  /**
   * Get all registered feature IDs and states
   * @returns {Array<{id: string, name: string, enabled: boolean}>}
   */
  getAllStatus() {
    return Array.from(this.features.values()).map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      enabled: f.enabled,
      lastError: f.lastError
    }));
  }
}

export const featureManager = new FeatureManager();
