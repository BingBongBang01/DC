/**
 * Safe DOMObserver Adapter for DC Ultimate
 * Efficient MutationObserver with throttling and target subtree scoping to avoid CPU overhead
 */
import { throttle } from '../utils/throttle.js';
import { debounce } from '../utils/debounce.js';
import { eventBus } from '../core/event-bus.js';
import { SELECTORS } from './selectors.js';
import { logger } from '../core/logger.js';

export class DOMObserver {
  constructor(throttleMs = 200) {
    this.observer = null;
    this.throttleMs = throttleMs;
    this.isObserving = false;
    this._lastErrorLoggedAt = 0;
    this._throttledMutations = throttle(this._safeHandleMutations.bind(this), this.throttleMs);
  }

  /**
   * Start observing DOM changes on specific target or document body
   * @param {Document|Element} [root=document] Root element to observe
   */
  observe(root = (typeof document !== 'undefined' ? document : null)) {
    if (!root || this.isObserving) return;

    if (typeof MutationObserver === 'undefined') {
      logger.warn('DOMObserver: MutationObserver API not available in environment.');
      return;
    }

    // Try finding specific list or comment container to minimize observation scope
    const target = root.querySelector(SELECTORS.galleryTable) || 
                   root.querySelector(SELECTORS.commentContainer) || 
                   root.body || 
                   root;

    this.observer = new MutationObserver((mutations) => {
      this._throttledMutations(mutations);
    });

    this.observer.observe(target, {
      childList: true,
      subtree: true
    });

    this.isObserving = true;
    logger.info('DOMObserver: Started observing target:', target.nodeName);
  }

  _safeHandleMutations(mutations) {
    try {
      this._handleMutations(mutations);
    } catch (err) {
      const now = Date.now();
      if (now - this._lastErrorLoggedAt > 5000) {
        logger.error('DOMObserver: _handleMutations threw — observation continues, but this mutation batch was skipped:', err);
        this._lastErrorLoggedAt = now;
      }
    }
  }

  /**
   * Internal mutation handler to identify added nodes
   * @param {MutationRecord[]} mutations
   */
  _handleMutations(mutations) {
    let addedArticles = false;
    let updatedComments = false;

    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Only element nodes

        try {
          // Check if node is or contains list rows
          if (node.matches && (node.matches(SELECTORS.listRows) || node.querySelector(SELECTORS.listRows))) {
            addedArticles = true;
          }

          // Check if node is or contains comment items
          if (node.matches && (node.matches(SELECTORS.commentItems) || node.querySelector(SELECTORS.commentItems))) {
            updatedComments = true;
          }
        } catch (nodeErr) {
          logger.debug('DOMObserver: node check failed, skipping node:', nodeErr);
        }
      }
    }

    if (addedArticles) {
      logger.debug('DOMObserver detected new articles dynamically added.');
      eventBus.emit('dom:articles_added');
    }

    if (updatedComments) {
      logger.debug('DOMObserver detected comment changes.');
      eventBus.emit('dom:comments_updated');
    }
  }

  /**
   * Stop observing and clean up resources
   */
  disconnect() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this._throttledMutations.cancel();
    this.isObserving = false;
    logger.info('DOMObserver: Disconnected.');
  }
}

export const domObserver = new DOMObserver();
