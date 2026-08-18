/**
 * Keyword Alert Manager
 * Handles CRUD operations for Alert Rules and manages background alarms.
 */
import { storageRepository } from '../storage-repository.js';
import { galleryScanScheduler } from './gallery-scan-scheduler.js';
import { logger } from '../logger.js';

const ALARM_PREFIX = 'kw_alert:';

/** Chrome clamps periodic alarms below 1 minute, so don't pretend to go faster. */
const MIN_INTERVAL_MINUTES = 1;
const DEFAULT_INTERVAL_MINUTES = 5;

export class KeywordAlertManager {

  constructor() {
    this.isAlarmsAvailable = typeof chrome !== 'undefined' && !!chrome.alarms;
  }

  /**
   * Reconciles background alarms with the stored alert rules.
   *
   * Must stay idempotent: the MV3 service worker is torn down and restarted
   * constantly, so clearing and re-creating alarms on every startup would keep
   * resetting each alarm's period and it might never fire. Existing alarms with
   * the right period are therefore left completely untouched.
   */
  async initAlarms() {
    if (!this.isAlarmsAvailable) return;

    try {
      const alerts = await storageRepository.getKeywordAlerts();
      const existingAlarms = await chrome.alarms.getAll();
      const existingByName = new Map(
        existingAlarms
          .filter(a => a.name.startsWith(ALARM_PREFIX))
          .map(a => [a.name, a])
      );

      const wanted = new Set();
      for (const alert of alerts) {
        if (!alert.enabled || !alert.id) continue;

        const name = `${ALARM_PREFIX}${alert.id}`;
        wanted.add(name);

        const period = this._intervalOf(alert);
        const current = existingByName.get(name);
        if (current && Math.abs((current.periodInMinutes || 0) - period) < 0.001) {
          continue; // Already scheduled correctly — leave the timer running.
        }
        this._createAlarm(alert);
      }

      // Drop alarms whose rule was deleted or disabled.
      for (const name of existingByName.keys()) {
        if (!wanted.has(name)) {
          await chrome.alarms.clear(name);
        }
      }

      logger.info(`KeywordAlertManager: ${wanted.size} alert alarm(s) active.`);
    } catch (err) {
      logger.error('KeywordAlertManager: failed to sync alarms:', err);
    }
  }

  /**
   * Called by the background service worker when an alarm fires.
   * @param {string} alarmName
   * @returns {Promise<Object|null>} Scan summary, or null when nothing ran
   */
  async handleAlarm(alarmName) {
    if (!alarmName || !alarmName.startsWith(ALARM_PREFIX)) return null;
    const alertId = alarmName.slice(ALARM_PREFIX.length);

    const alerts = await storageRepository.getKeywordAlerts();
    const alert = alerts.find(a => a.id === alertId);

    if (!alert || !alert.enabled) {
      // Rule was deleted or paused while the alarm was pending.
      if (this.isAlarmsAvailable) {
        await chrome.alarms.clear(alarmName);
      }
      return null;
    }

    return galleryScanScheduler.scanGallery(alert.gallery?.id, alert.gallery?.type);
  }

  // --- CRUD Operations ---

  /**
   * @param {Partial<import('./types.js').KeywordAlert>} alertData
   * @returns {Promise<import('./types.js').KeywordAlert>}
   */
  async addAlert(alertData) {
    const normalized = this._normalize(alertData);
    const alerts = await storageRepository.getKeywordAlerts();

    const newAlert = {
      id: crypto.randomUUID(),
      ...normalized,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      initialized: false, // First scan only records the baseline
      lastSeenPostId: null,
      lastCheckedAt: null,
      lastError: null,
      consecutiveFailures: 0,
      matchCount: 0
    };

    alerts.push(newAlert);
    await storageRepository.saveKeywordAlerts(alerts);

    if (newAlert.enabled) {
      this._createAlarm(newAlert);
      // Baseline immediately so the very next new post can trigger an alert.
      galleryScanScheduler
        .scanGallery(newAlert.gallery.id, newAlert.gallery.type)
        .catch(e => logger.error('KeywordAlertManager: initial scan failed:', e));
    }

    return newAlert;
  }

  /**
   * @param {string} alertId
   * @param {Partial<import('./types.js').KeywordAlert>} updates
   */
  async updateAlert(alertId, updates = {}) {
    const alerts = await storageRepository.getKeywordAlerts();
    const index = alerts.findIndex(a => a.id === alertId);

    if (index === -1) throw new Error('Alert not found');

    const oldAlert = alerts[index];
    const merged = { ...oldAlert, ...updates };
    const newAlert = {
      ...merged,
      ...this._normalize(merged, oldAlert),
      id: oldAlert.id,
      createdAt: oldAlert.createdAt,
      updatedAt: Date.now()
    };

    const galleryChanged = newAlert.gallery.id !== oldAlert.gallery?.id;
    const reEnabled = newAlert.enabled && !oldAlert.enabled;

    // Re-baseline when the target changes, or when a paused rule is resumed:
    // its `lastSeenPostId` may be far behind, which would otherwise fire a burst
    // of notifications for posts the user already scrolled past.
    if (galleryChanged || reEnabled) {
      newAlert.initialized = false;
      newAlert.lastSeenPostId = null;
      newAlert.lastError = null;
      newAlert.consecutiveFailures = 0;
    }

    alerts[index] = newAlert;
    await storageRepository.saveKeywordAlerts(alerts);

    if (this.isAlarmsAvailable) {
      await chrome.alarms.clear(`${ALARM_PREFIX}${alertId}`);
      if (newAlert.enabled) {
        this._createAlarm(newAlert);
      }
    }

    if (newAlert.enabled && !newAlert.initialized) {
      galleryScanScheduler
        .scanGallery(newAlert.gallery.id, newAlert.gallery.type)
        .catch(e => logger.error('KeywordAlertManager: re-baseline scan failed:', e));
    }

    return newAlert;
  }

  async deleteAlert(alertId) {
    const alerts = await storageRepository.getKeywordAlerts();
    const filtered = alerts.filter(a => a.id !== alertId);
    await storageRepository.saveKeywordAlerts(filtered);

    if (this.isAlarmsAvailable) {
      await chrome.alarms.clear(`${ALARM_PREFIX}${alertId}`);
    }
  }

  async toggleAlert(alertId, enabled) {
    return this.updateAlert(alertId, { enabled: Boolean(enabled) });
  }

  /**
   * Runs a scan right now, ignoring the alarm schedule.
   * @param {string} [alertId] Scan just this rule's gallery; omit to scan all
   * @returns {Promise<Object|Object[]>} Scan summary/summaries
   */
  async scanNow(alertId = null) {
    if (!alertId) {
      return galleryScanScheduler.scanAll();
    }

    const alerts = await storageRepository.getKeywordAlerts();
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) throw new Error('Alert not found');

    return galleryScanScheduler.scanGallery(alert.gallery?.id, alert.gallery?.type);
  }

  /**
   * Validates and fills in an alert rule.
   * @param {Object} data
   * @param {Object} [previous] Existing rule, when updating
   * @returns {Object}
   */
  _normalize(data, previous = null) {
    const source = data || {};
    const gallery = source.gallery || previous?.gallery;

    if (!gallery || !gallery.id) {
      throw new Error('갤러리 정보(gallery.id)가 필요합니다.');
    }

    const keywords = Array.from(
      new Set(
        (Array.isArray(source.keywords) ? source.keywords : [source.keywords])
          .filter(k => typeof k === 'string')
          .map(k => k.trim())
          .filter(Boolean)
      )
    );

    if (keywords.length === 0) {
      throw new Error('키워드를 1개 이상 입력해 주세요.');
    }

    const matchMode = ['contains', 'exact', 'regex'].includes(source.matchMode) ? source.matchMode : 'contains';
    if (matchMode === 'regex') {
      for (const keyword of keywords) {
        try {
          new RegExp(keyword, 'i');
        } catch (err) {
          throw new Error(`정규식이 올바르지 않습니다: ${keyword}`);
        }
      }
    }

    return {
      gallery: {
        id: gallery.id,
        type: gallery.type || 'board',
        name: gallery.name || gallery.id,
        url: gallery.url || ''
      },
      keywords,
      target: source.target === 'title_content' ? 'title_content' : 'title',
      matchMode,
      enabled: source.enabled !== false,
      pollingIntervalMinutes: this._intervalOf(source),
      notifyPanel: source.notifyPanel !== false,
      notifyChrome: source.notifyChrome !== false
    };
  }

  _intervalOf(alert) {
    const raw = Number(alert?.pollingIntervalMinutes);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MINUTES;
    return Math.max(MIN_INTERVAL_MINUTES, Math.round(raw));
  }

  _createAlarm(alert) {
    if (!this.isAlarmsAvailable) return;
    const periodInMinutes = this._intervalOf(alert);
    chrome.alarms.create(`${ALARM_PREFIX}${alert.id}`, {
      periodInMinutes,
      delayInMinutes: periodInMinutes
    });
  }
}

export const keywordAlertManager = new KeywordAlertManager();
