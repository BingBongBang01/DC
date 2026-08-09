/**
 * Keyword Alert Manager
 * Handles CRUD operations for Alert Rules and manages background alarms.
 */
import { storageRepository } from '../storage-repository.js';
import { galleryScanScheduler } from './gallery-scan-scheduler.js';
import { logger } from '../logger.js';

const ALARM_PREFIX = 'kw_alert:';

export class KeywordAlertManager {
  
  constructor() {
    this.isAlarmsAvailable = typeof chrome !== 'undefined' && chrome.alarms;
  }

  /**
   * Initializes and restores background alarms on startup.
   */
  async initAlarms() {
    if (!this.isAlarmsAvailable) return;
    
    // Clear legacy alarms that might belong to KeywordAlerts
    const allAlarms = await chrome.alarms.getAll();
    for (const alarm of allAlarms) {
      if (alarm.name.startsWith(ALARM_PREFIX)) {
        await chrome.alarms.clear(alarm.name);
      }
    }

    const alerts = await storageRepository.getKeywordAlerts();
    for (const alert of alerts) {
      if (alert.enabled) {
        this._createAlarm(alert);
      }
    }

    logger.info(`KeywordAlertManager: Restored alarms for active alerts.`);
  }

  /**
   * Called by the background service worker when an alarm fires.
   * @param {string} alarmName 
   */
  async handleAlarm(alarmName) {
    if (!alarmName.startsWith(ALARM_PREFIX)) return;
    const alertId = alarmName.replace(ALARM_PREFIX, '');
    
    const alerts = await storageRepository.getKeywordAlerts();
    const alert = alerts.find(a => a.id === alertId);
    
    if (alert && alert.enabled) {
      await galleryScanScheduler.scanGallery(alert.gallery.id);
    }
  }

  // --- CRUD Operations ---

  async addAlert(alertData) {
    const alerts = await storageRepository.getKeywordAlerts();
    
    const newAlert = {
      id: crypto.randomUUID(),
      ...alertData,
      enabled: alertData.enabled !== false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      initialized: false // Will be set to true on first scan
    };

    alerts.push(newAlert);
    await storageRepository.saveKeywordAlerts(alerts);
    
    if (newAlert.enabled) {
      this._createAlarm(newAlert);
      // Immediately run an initial baseline scan asynchronously
      galleryScanScheduler.scanGallery(newAlert.gallery.id).catch(e => logger.error(e));
    }
    
    return newAlert;
  }

  async updateAlert(alertId, updates) {
    const alerts = await storageRepository.getKeywordAlerts();
    const index = alerts.findIndex(a => a.id === alertId);
    
    if (index === -1) throw new Error('Alert not found');
    
    const oldAlert = alerts[index];
    const newAlert = { ...oldAlert, ...updates, updatedAt: Date.now() };
    
    // If gallery or keywords changed significantly, we might want to re-initialize baseline
    if (updates.gallery && updates.gallery.id !== oldAlert.gallery.id) {
      newAlert.initialized = false;
    }

    alerts[index] = newAlert;
    await storageRepository.saveKeywordAlerts(alerts);
    
    // Refresh Alarm
    if (this.isAlarmsAvailable) {
      await chrome.alarms.clear(`${ALARM_PREFIX}${alertId}`);
      if (newAlert.enabled) {
        this._createAlarm(newAlert);
        if (!newAlert.initialized) {
           galleryScanScheduler.scanGallery(newAlert.gallery.id).catch(e => logger.error(e));
        }
      }
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
    return this.updateAlert(alertId, { enabled });
  }

  _createAlarm(alert) {
    if (!this.isAlarmsAvailable) return;
    const intervalMinutes = Math.max(1, alert.pollingIntervalMinutes || 1);
    chrome.alarms.create(`${ALARM_PREFIX}${alert.id}`, { periodInMinutes: intervalMinutes });
  }
}

export const keywordAlertManager = new KeywordAlertManager();
