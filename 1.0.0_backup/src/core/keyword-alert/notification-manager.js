/**
 * Notification Manager for Keyword Alerts
 * Handles deduplication, persistence, and dispatching UI/OS notifications.
 */
import { storageRepository } from '../storage-repository.js';
import { MessageAction } from '../message-contract.js';
import { logger } from '../logger.js';

const NOTIFICATION_ICON = 'assets/icons/dc_ultimate_icon_transparent.png';

export class NotificationManager {
  /**
   * Process a confirmed match, creating a notification if not a duplicate.
   * @param {import('./types.js').KeywordAlert} alert
   * @param {import('./types.js').KeywordNotification['post']} post
   * @param {string[]} matchedKeywords
   * @returns {Promise<import('./types.js').KeywordNotification|null>} The stored
   *   notification, or null when it was a duplicate / invalid input.
   */
  async processMatch(alert, post, matchedKeywords) {
    if (!alert || !post || !post.id || !Array.isArray(matchedKeywords) || matchedKeywords.length === 0) {
      return null;
    }

    // Deduplication check
    const existing = await storageRepository.getKeywordNotifications();
    const isDuplicate = existing.some(
      n => n.alertId === alert.id && n.post?.id === post.id
    );

    if (isDuplicate) {
      return null;
    }

    const notification = {
      id: crypto.randomUUID(),
      alertId: alert.id,
      post: {
        id: post.id,
        title: post.title,
        url: post.url,
        author: post.author,
        createdAt: post.createdAt || post.date || null,
        galleryId: alert.gallery?.id || post.galleryId || null,
        galleryName: alert.gallery?.name || post.galleryName || alert.gallery?.id || ''
      },
      matchedKeywords,
      detectedAt: Date.now(),
      read: false
    };

    // Save to storage
    await storageRepository.addKeywordNotification(notification);

    // Broadcast to open Side Panels. Fails harmlessly when nothing is listening.
    if (alert.notifyPanel !== false && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const sent = chrome.runtime.sendMessage({
          type: MessageAction.KEYWORD_NOTIFICATION_CREATED,
          payload: notification
        });
        if (sent && typeof sent.catch === 'function') sent.catch(() => {});
      } catch (err) {
        // No receiver (Side Panel closed) — nothing to do.
      }
    }

    if (alert.notifyChrome !== false) {
      this._createOSNotification(notification, alert, matchedKeywords);
    }

    return notification;
  }

  /**
   * @param {import('./types.js').KeywordNotification} notification
   * @param {import('./types.js').KeywordAlert} alert
   * @param {string[]} matchedKeywords
   */
  _createOSNotification(notification, alert, matchedKeywords) {
    if (typeof chrome === 'undefined' || !chrome.notifications || !chrome.notifications.create) {
      return;
    }

    // iconUrl must be an extension-absolute URL: a bare relative path silently
    // fails with "Unable to download all specified images" and no notification
    // is ever shown.
    const iconUrl = chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL(NOTIFICATION_ICON)
      : NOTIFICATION_ICON;

    try {
      chrome.notifications.create(notification.id, {
        type: 'basic',
        iconUrl,
        title: `DC 키워드: [${alert.gallery?.name || alert.gallery?.id || '갤러리'}]`,
        message: notification.post.title || '(제목 없음)',
        contextMessage: `키워드: ${matchedKeywords.join(', ')}`,
        priority: 2
      }, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) {
          logger.warn('NotificationManager: OS notification failed:', lastError.message);
        }
      });
    } catch (err) {
      logger.warn('NotificationManager: OS notification threw:', err);
    }
  }

  /**
   * Setup Chrome OS notification click handler
   */
  initOSNotificationClick() {
    if (typeof chrome === 'undefined' || !chrome.notifications || !chrome.notifications.onClicked) {
      return;
    }

    chrome.notifications.onClicked.addListener(async (notificationId) => {
      try {
        const existing = await storageRepository.getKeywordNotifications();
        const notification = existing.find(n => n.id === notificationId);
        if (!notification) return;

        await storageRepository.markNotificationRead(notificationId);
        if (notification.post?.url && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: notification.post.url });
        }
        if (chrome.notifications.clear) {
          chrome.notifications.clear(notificationId);
        }
      } catch (err) {
        logger.warn('NotificationManager: click handling failed:', err);
      }
    });
  }
}

export const notificationManager = new NotificationManager();
