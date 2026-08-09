/**
 * Base Feature Class for DC Ultimate Extension
 */
import { logger } from '../core/logger.js';

export class BaseFeature {
  /**
   * @param {string} id Feature unique ID
   * @param {string} name Feature readable name
   * @param {string} description Feature description
   */
  constructor(id, name, description = '') {
    this.id = id;
    this.name = name;
    this.description = description;
    this.enabled = false;
    this.initialized = false;
    this.lastError = null;
  }

  async init() {
    if (this.initialized) return;
    try {
      await this._init();
      this.initialized = true;
      this.lastError = null;
      logger.debug(`Feature [${this.id}] initialized.`);
    } catch (err) {
      this.lastError = { message: err.message, at: Date.now() };
      logger.error(`Feature [${this.id}] init failed:`, err);
      throw err;
    }
  }

  // 하위 클래스가 실제 초기화 로직을 넣는 곳
  async _init() {}

  async enable() {
    if (this.enabled) return;
    await this.init();
    this.enabled = true;
    logger.info(`Feature [${this.id}] enabled.`);
    try {
      await this.onEnable();
    } catch (err) {
      logger.error(`Error in onEnable for feature [${this.id}]:`, err);
    }
  }

  async disable() {
    if (!this.enabled) return;
    this.enabled = false;
    logger.info(`Feature [${this.id}] disabled.`);
    try {
      await this.onDisable();
    } catch (err) {
      logger.error(`Error in onDisable for feature [${this.id}]:`, err);
    }
  }

  // Abstract lifecycle hooks
  async onEnable() {}
  async onDisable() {}
  async onPageChange(pageInfo) {}
}
