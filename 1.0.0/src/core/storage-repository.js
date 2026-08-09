/**
 * DC Ultimate Storage Repository
 * Provides domain-specific, strongly-typed methods wrapping the underlying StorageManager.
 */
import { storageManager } from './storage-manager.js';
import { logger } from './logger.js';

const KEYS = {
  RECENT_GALLERIES: 'dc_recent_galleries',
  FAVORITE_GALLERIES: 'dc_favorite_galleries',
  SEARCH_HISTORY: 'dc_search_history',
  SEARCH_PRESETS: 'dc_search_presets',
  USER_MEMOS: 'dc_user_memos',
  FILTER_RULES: 'dc_filter_rules',
  BOOKMARKS: 'dc_bookmarks',
  KEYWORD_ALERTS: 'dc_keyword_alerts',
  KEYWORD_NOTIFICATIONS: 'dc_keyword_notifications'
};

export class StorageRepository {
  
  // ----------------------------------------------------
  // Recent Galleries
  // ----------------------------------------------------
  
  /**
   * @returns {Promise<Array>} Array of RecentGallery objects
   */
  async getRecentGalleries() {
    const data = await storageManager.get(KEYS.RECENT_GALLERIES);
    return data[KEYS.RECENT_GALLERIES] || [];
  }

  /**
   * Adds or updates a recent gallery, keeping the list bounded to maxItems.
   * @param {Object} gallery { galleryId, galleryType, name, url }
   * @param {number} maxItems default 20
   */
  async addRecentGallery(gallery, maxItems = 20) {
    if (!gallery || !gallery.galleryId) return;
    
    let recents = await this.getRecentGalleries();
    // Remove if exists to move to top
    recents = recents.filter(g => g.galleryId !== gallery.galleryId);
    
    const entry = {
      ...gallery,
      lastVisitedAt: Date.now(),
      visitCount: (recents.find(g => g.galleryId === gallery.galleryId)?.visitCount || 0) + 1
    };
    
    recents.unshift(entry);
    
    if (recents.length > maxItems) {
      recents = recents.slice(0, maxItems);
    }
    
    await storageManager.set({ [KEYS.RECENT_GALLERIES]: recents });
  }

  // ----------------------------------------------------
  // Favorite Galleries
  // ----------------------------------------------------

  async getFavorites() {
    const data = await storageManager.get(KEYS.FAVORITE_GALLERIES);
    return data[KEYS.FAVORITE_GALLERIES] || [];
  }

  /**
   * @param {Object} gallery { galleryId, type, name, url }
   */
  async addFavorite(gallery) {
    if (!gallery || !gallery.galleryId) return;
    let favorites = await this.getFavorites();
    
    if (!favorites.some(f => f.galleryId === gallery.galleryId)) {
      favorites.push({
        ...gallery,
        order: favorites.length,
        createdAt: Date.now()
      });
      await storageManager.set({ [KEYS.FAVORITE_GALLERIES]: favorites });
    }
  }

  async removeFavorite(galleryId) {
    let favorites = await this.getFavorites();
    favorites = favorites.filter(f => f.galleryId !== galleryId);
    await storageManager.set({ [KEYS.FAVORITE_GALLERIES]: favorites });
  }

  // ----------------------------------------------------
  // Placeholders for future phases
  // ----------------------------------------------------
  
  async getSearchHistory() {
    const data = await storageManager.get(KEYS.SEARCH_HISTORY);
    return data[KEYS.SEARCH_HISTORY] || [];
  }
  
  async saveSearchHistory(historyItem) {
    // Implementation deferred
  }

  async getUserMemos() {
    const data = await storageManager.get(KEYS.USER_MEMOS);
    return data[KEYS.USER_MEMOS] || {};
  }

  // ----------------------------------------------------
  // Keyword Alerts & Notifications
  // ----------------------------------------------------

  /**
   * @returns {Promise<import('./keyword-alert/types.js').KeywordAlert[]>}
   */
  async getKeywordAlerts() {
    const data = await storageManager.get(KEYS.KEYWORD_ALERTS);
    return data[KEYS.KEYWORD_ALERTS] || [];
  }

  /**
   * @param {import('./keyword-alert/types.js').KeywordAlert[]} alerts
   */
  async saveKeywordAlerts(alerts) {
    await storageManager.set({ [KEYS.KEYWORD_ALERTS]: alerts });
  }

  /**
   * @returns {Promise<import('./keyword-alert/types.js').KeywordNotification[]>}
   */
  async getKeywordNotifications() {
    const data = await storageManager.get(KEYS.KEYWORD_NOTIFICATIONS);
    return data[KEYS.KEYWORD_NOTIFICATIONS] || [];
  }

  /**
   * @param {import('./keyword-alert/types.js').KeywordNotification[]} notifications
   */
  async saveKeywordNotifications(notifications) {
    await storageManager.set({ [KEYS.KEYWORD_NOTIFICATIONS]: notifications });
  }

  /**
   * Add a single notification, capping total to maxItems
   * @param {import('./keyword-alert/types.js').KeywordNotification} notification
   * @param {number} maxItems default 200
   */
  async addKeywordNotification(notification, maxItems = 200) {
    let notifications = await this.getKeywordNotifications();
    notifications.unshift(notification);
    
    if (notifications.length > maxItems) {
      // Prioritize keeping unread notifications if we hit the limit
      const unread = notifications.filter(n => !n.read);
      if (unread.length >= maxItems) {
        notifications = unread.slice(0, maxItems);
      } else {
        const read = notifications.filter(n => n.read);
        notifications = [...unread, ...read.slice(0, maxItems - unread.length)];
      }
    }
    
    await this.saveKeywordNotifications(notifications);
  }

  /**
   * Mark a notification as read
   * @param {string} notificationId
   */
  async markNotificationRead(notificationId) {
    const notifications = await this.getKeywordNotifications();
    let updated = false;
    for (const n of notifications) {
      if (n.id === notificationId && !n.read) {
        n.read = true;
        updated = true;
      }
    }
    if (updated) {
      await this.saveKeywordNotifications(notifications);
    }
  }

  /**
   * Delete a notification
   * @param {string} notificationId
   */
  async deleteNotification(notificationId) {
    let notifications = await this.getKeywordNotifications();
    notifications = notifications.filter(n => n.id !== notificationId);
    await this.saveKeywordNotifications(notifications);
  }
}

export const storageRepository = new StorageRepository();
