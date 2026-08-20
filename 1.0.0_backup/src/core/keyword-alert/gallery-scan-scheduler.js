/**
 * Gallery Scan Scheduler
 * Fetches a gallery's first list page and evaluates every Keyword Alert that
 * targets it, so a single network request serves all alerts on that gallery.
 *
 * This runs inside the Manifest V3 service worker, which has no DOMParser, so
 * the fetched HTML is parsed by the DOM-free parser in `list-page-parser.js`
 * instead of the DOM-based ArticleParser used by the Side Panel search engine.
 */
import { storageRepository } from '../storage-repository.js';
import { requestScheduler } from '../search/request-scheduler.js';
import { buildGalleryListUrl, normalizeGalleryType } from '../gallery-context.js';
import { parseListHtml } from './list-page-parser.js';
import { matchPost } from './keyword-matcher.js';
import { notificationManager } from './notification-manager.js';
import { logger } from '../logger.js';

/** Safety valve: never emit more than this many notifications from one scan. */
const MAX_NOTIFICATIONS_PER_SCAN = 20;

export class GalleryScanScheduler {
  constructor() {
    /** @type {Map<string, Promise<Object>>} In-flight scans keyed by gallery */
    this.inFlight = new Map();
  }

  /**
   * Scans a gallery and evaluates all enabled alerts targeting it.
   * Concurrent calls for the same gallery share a single scan.
   * @param {string} galleryId
   * @param {string} [galleryType] Optional type hint ('board'/'mgallery'/'mini')
   * @returns {Promise<{galleryId: string, scanned: boolean, posts: number, newPosts: number, notified: number, baselineMatches: number, error: string|null}>}
   */
  async scanGallery(galleryId, galleryType = null) {
    if (!galleryId) {
      return this._summary(galleryId, { error: 'galleryId is required' });
    }

    const key = `${galleryId}::${normalizeGalleryType(galleryType)}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const scan = this._scan(galleryId, galleryType).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, scan);
    return scan;
  }

  /**
   * Scans every gallery that has at least one enabled alert.
   * @returns {Promise<Object[]>} One summary per scanned gallery
   */
  async scanAll() {
    const alerts = await storageRepository.getKeywordAlerts();
    const targets = new Map();

    for (const alert of alerts) {
      if (!alert.enabled || !alert.gallery?.id) continue;
      const type = normalizeGalleryType(alert.gallery.type);
      targets.set(`${alert.gallery.id}::${type}`, { id: alert.gallery.id, type: alert.gallery.type });
    }

    const summaries = [];
    for (const target of targets.values()) {
      summaries.push(await this.scanGallery(target.id, target.type));
    }
    return summaries;
  }

  _summary(galleryId, overrides = {}) {
    return {
      galleryId: galleryId || null,
      scanned: false,
      posts: 0,
      newPosts: 0,
      notified: 0,
      baselineMatches: 0,
      error: null,
      ...overrides
    };
  }

  async _scan(galleryId, galleryTypeHint) {
    const alerts = await storageRepository.getKeywordAlerts();
    const activeAlerts = alerts.filter(a => a.enabled && a.gallery?.id === galleryId);

    if (activeAlerts.length === 0) {
      return this._summary(galleryId, { error: null });
    }

    const galleryType = galleryTypeHint || activeAlerts[0].gallery.type;
    const url = buildGalleryListUrl(galleryId, galleryType, 1);

    let posts = [];
    try {
      // A dedicated controller per scan: RequestScheduler's shared cancellation
      // signal is owned by the Side Panel search flow, and reusing it would let
      // two scans abort each other.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let html;
      try {
        html = await requestScheduler.fetchPage(url, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }
      posts = parseListHtml(html, galleryId);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      logger.error(`GalleryScanScheduler: fetch/parse failed for ${galleryId}:`, message);
      await this._recordFailure(alerts, activeAlerts, message);
      return this._summary(galleryId, { error: message });
    }

    if (posts.length === 0) {
      const message = '게시글 목록을 읽지 못했습니다 (DC 마크업 변경 또는 접근 차단).';
      logger.warn(`GalleryScanScheduler: 0 posts parsed for ${galleryId} (${url})`);
      await this._recordFailure(alerts, activeAlerts, message);
      return this._summary(galleryId, { scanned: true, error: message });
    }

    const currentMaxId = posts.reduce((max, p) => {
      const id = parseInt(p.id, 10) || 0;
      return id > max ? id : max;
    }, 0);

    let notified = 0;
    let newPostTotal = 0;
    let baselineMatches = 0;

    for (const alert of activeAlerts) {
      if (!alert.initialized) {
        // First run only establishes the baseline; notifying here would flood
        // the user with every already-visible post that matches.
        baselineMatches += posts.filter(post => matchPost(post, alert).length > 0).length;
        alert.initialized = true;
        alert.lastSeenPostId = String(currentMaxId);
        this._markSuccess(alert);
        continue;
      }

      const previousMaxId = parseInt(alert.lastSeenPostId, 10) || 0;
      const newPosts = posts.filter(p => (parseInt(p.id, 10) || 0) > previousMaxId);
      newPostTotal += newPosts.length;

      // Oldest first so notifications arrive in posting order.
      const ordered = newPosts.slice().sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));

      let notifiedForAlert = 0;
      for (const post of ordered) {
        const matched = matchPost(post, alert);
        if (matched.length === 0) continue;
        if (notified >= MAX_NOTIFICATIONS_PER_SCAN) {
          logger.warn(`GalleryScanScheduler: notification cap (${MAX_NOTIFICATIONS_PER_SCAN}) reached for ${galleryId}; remaining matches skipped this scan.`);
          break;
        }
        const created = await notificationManager.processMatch(alert, post, matched);
        if (created) {
          notified++;
          notifiedForAlert++;
        }
      }

      if (currentMaxId > previousMaxId) {
        alert.lastSeenPostId = String(currentMaxId);
      }
      alert.matchCount = (alert.matchCount || 0) + notifiedForAlert;
      this._markSuccess(alert);
    }

    await storageRepository.saveKeywordAlerts(alerts);

    logger.info(`GalleryScanScheduler: ${galleryId} scanned — posts=${posts.length}, new=${newPostTotal}, notified=${notified}`);

    return this._summary(galleryId, {
      scanned: true,
      posts: posts.length,
      newPosts: newPostTotal,
      notified,
      baselineMatches
    });
  }

  _markSuccess(alert) {
    alert.lastCheckedAt = Date.now();
    alert.lastError = null;
    alert.consecutiveFailures = 0;
  }

  /**
   * Records a failed scan on every alert that targeted this gallery.
   * @param {Object[]} allAlerts Full alert list (persisted as-is)
   * @param {Object[]} failedAlerts Alerts affected by the failure
   * @param {string} message
   */
  async _recordFailure(allAlerts, failedAlerts, message) {
    for (const alert of failedAlerts) {
      alert.consecutiveFailures = (alert.consecutiveFailures || 0) + 1;
      alert.lastError = message;
      alert.lastCheckedAt = Date.now();
    }
    try {
      await storageRepository.saveKeywordAlerts(allAlerts);
    } catch (err) {
      logger.error('GalleryScanScheduler: failed to persist scan failure state:', err);
    }
  }
}

export const galleryScanScheduler = new GalleryScanScheduler();
