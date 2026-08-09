/**
 * Notification Manager for Keyword Alerts
 * Handles deduplication, persistence, and dispatching UI/OS notifications.
 */
import { storageRepository } from '../storage-repository.js';
import { messageRouter } from '../message-router.js';
import { MessageAction } from '../message-contract.js';

export class NotificationManager {
  /**
   * Process a confirmed match, creating a notification if not a duplicate.
   * @param {import('./types.js').KeywordAlert} alert 
   * @param {import('./types.js').KeywordNotification['post']} post 
   * @param {string[]} matchedKeywords 
   */
  async processMatch(alert, post, matchedKeywords) {
    if (!alert || !post || matchedKeywords.length === 0) return;

    // Deduplication check
    const existing = await storageRepository.getKeywordNotifications();
    const isDuplicate = existing.some(
      n => n.alertId === alert.id && n.post.id === post.id
    );

    if (isDuplicate) {
      return;
    }

    const notification = {
      id: crypto.randomUUID(),
      alertId: alert.id,
      post: {
        id: post.id,
        title: post.title,
        url: post.url,
        author: post.author,
        createdAt: post.createdAt,
        galleryId: alert.gallery.id,
        galleryName: alert.gallery.name
      },
      matchedKeywords,
      detectedAt: Date.now(),
      read: false
    };

    // Save to storage
    await storageRepository.addKeywordNotification(notification);

    // Broadcast to open Side Panels
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: MessageAction.KEYWORD_NOTIFICATION_CREATED,
        payload: notification
      }).catch(() => {}); // Ignore if Side Panel is closed
    }

    // Trigger OS Notification if requested
    if (alert.notifyChrome && typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create(notification.id, {
        type: 'basic',
        iconUrl: 'icons/icon128.png', // Assuming this exists or falls back safely
        title: `DC 키워드: [${alert.gallery.name}]`,
        message: post.title,
        contextMessage: `키워드: ${matchedKeywords.join(', ')}`
      });
    }
  }

  /**
   * Setup Chrome OS notification click handler
   */
  initOSNotificationClick() {
    if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.onClicked) {
      chrome.notifications.onClicked.addListener(async (notificationId) => {
        const existing = await storageRepository.getKeywordNotifications();
        const notification = existing.find(n => n.id === notificationId);
        if (notification) {
          await storageRepository.markNotificationRead(notificationId);
          chrome.tabs.create({ url: notification.post.url });
        }
      });
    }
  }
}

export const notificationManager = new NotificationManager();
