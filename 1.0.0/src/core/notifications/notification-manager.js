/**
 * NotificationManager Module for DC Ultimate (Phase 5)
 * Controls Chrome desktop notifications with cooldown and anti-spam deduplication
 */
import { logger } from '../logger.js';

export class NotificationManager {
  constructor(cooldownMs = 30 * 1000) { // 30 sec cooldown default
    this.cooldownMs = cooldownMs;
    this.recentNotifications = new Map();
    this.isChromeNotificationsAvailable = typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create;
  }

  /**
   * Send notification if not in cooldown
   * @param {string} id Unique notification ID
   * @param {string} title Notification title
   * @param {string} message Notification message body
   */
  notify(id, title, message) {
    const key = `${id}_${title}`;
    const lastSent = this.recentNotifications.get(key);

    if (lastSent && Date.now() - lastSent < this.cooldownMs) {
      logger.info(`NotificationManager: Throttled notification [${key}] due to cooldown.`);
      return;
    }

    this.recentNotifications.set(key, Date.now());

    if (this.isChromeNotificationsAvailable) {
      chrome.notifications.create(id || `notif_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/dc_ultimate_icon_transparent.png'),
        title: title || 'DC Ultimate 알림',
        message: message || '',
        priority: 1
      });
    } else {
      logger.info(`[Notification Simulation] ${title}: ${message}`);
    }
  }
}

export const notificationManager = new NotificationManager();
