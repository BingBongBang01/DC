/**
 * Gallery Scan Scheduler
 * Optimizes network requests by grouping Keyword Alerts by target gallery.
 */
import { storageRepository } from '../storage-repository.js';
import { searchEngine } from '../search/search-engine.js';
import { SearchQuery } from '../search/query-builder.js';
import { matchPost } from './keyword-matcher.js';
import { notificationManager } from './notification-manager.js';
import { logger } from '../logger.js';

export class GalleryScanScheduler {
  /**
   * Scans a gallery and evaluates all relevant alerts.
   * @param {string} galleryId 
   */
  async scanGallery(galleryId) {
    const alerts = await storageRepository.getKeywordAlerts();
    const activeAlerts = alerts.filter(a => a.enabled && a.gallery.id === galleryId);

    if (activeAlerts.length === 0) {
      return;
    }

    try {
      // Fetch only the first page using the existing search/collector engine
      // Here we assume galleryType is uniform for a given galleryId, taking from first alert
      const galleryType = activeAlerts[0].gallery.type;
      
      const query = new SearchQuery({
        galleryId,
        galleryType,
        maxPages: 1
      });

      // Execute a quick search to get the first page of posts
      const res = await searchEngine.search(query, { forceRefresh: true });
      const posts = res.dataset || [];

      if (posts.length === 0) {
        logger.debug(`GalleryScanScheduler: No posts found for gallery ${galleryId}`);
        return;
      }

      // Process baseline initialization and new posts for each alert
      let alertsUpdated = false;

      for (const alert of activeAlerts) {
        const currentMaxId = posts.reduce((max, p) => {
          const id = parseInt(p.id, 10) || 0;
          return id > max ? id : max;
        }, 0);

        if (!alert.initialized) {
          alert.initialized = true;
          alert.lastSeenPostId = currentMaxId.toString();
          alert.lastCheckedAt = Date.now();
          alert.errorState = null;
          alert.consecutiveFailures = 0;
          alertsUpdated = true;
          continue; // Do not notify on first run
        }

        const previousMaxId = parseInt(alert.lastSeenPostId, 10) || 0;
        
        // Find strictly newer posts
        const newPosts = posts.filter(p => (parseInt(p.id, 10) || 0) > previousMaxId);

        for (const post of newPosts) {
          const matched = matchPost(post, alert);
          if (matched.length > 0) {
            await notificationManager.processMatch(alert, post, matched);
          }
        }

        if (currentMaxId > previousMaxId) {
           alert.lastSeenPostId = currentMaxId.toString();
        }
        
        alert.lastCheckedAt = Date.now();
        alert.errorState = null;
        alert.consecutiveFailures = 0;
        alertsUpdated = true;
      }

      if (alertsUpdated) {
        await storageRepository.saveKeywordAlerts(alerts);
      }

    } catch (err) {
      logger.error(`GalleryScanScheduler error for ${galleryId}:`, err);
      // Mark failure on all alerts targeting this gallery
      let alertsUpdated = false;
      for (const alert of activeAlerts) {
        alert.consecutiveFailures = (alert.consecutiveFailures || 0) + 1;
        alert.errorState = err.message;
        alert.lastCheckedAt = Date.now();
        alertsUpdated = true;
      }
      if (alertsUpdated) {
        await storageRepository.saveKeywordAlerts(alerts);
      }
    }
  }
}

export const galleryScanScheduler = new GalleryScanScheduler();
