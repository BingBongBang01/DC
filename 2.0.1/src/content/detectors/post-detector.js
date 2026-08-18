/**
 * Post Detector
 * Observes the DOM for newly added post rows (e.g. from Auto Refresh)
 * and emits candidate posts to the Background Script for Keyword Alert matching.
 */
import { articleParser } from '../../parser/article-parser.js';
import { SELECTORS } from '../../adapters/selectors.js';
import { MessageAction } from '../../core/message-contract.js';

export class PostDetector {
  constructor() {
    this.observer = null;
    this.seenPostIds = new Set();
    this.galleryInfo = null;
  }

  /**
   * Initializes the mutation observer to detect new posts.
   * @param {Object} pageInfo The current page info containing galleryId and type.
   */
  start(pageInfo) {
    if (!pageInfo || !pageInfo.galleryId) return;
    
    // Only observe on gallery list pages
    if (!pageInfo.isList && pageInfo.type !== 'GALLERY_LIST' && pageInfo.type !== 'MINOR_GALLERY' && pageInfo.type !== 'MINI_GALLERY') {
      return;
    }

    this.galleryInfo = pageInfo;
    
    // Baseline: Mark existing posts on the page as seen so we don't trigger alerts for them
    const existingRows = document.querySelectorAll(SELECTORS.listRows);
    existingRows.forEach(row => {
      const article = articleParser.parseRow(row, this.galleryInfo.galleryId);
      if (article && article.id) {
        this.seenPostIds.add(article.id);
      }
    });

    const targetNode = document.querySelector('tbody'); // Most DC lists use tbody
    if (!targetNode) return;

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          
          // It could be a tr, or multiple trs inside a tbody if injected differently
          let newRows = [];
          if (node.matches && node.matches(SELECTORS.listRows)) {
            newRows.push(node);
          } else {
            newRows = Array.from(node.querySelectorAll(SELECTORS.listRows));
          }

          for (const row of newRows) {
            this._processNewRow(row);
          }
        }
      }
    });

    this.observer.observe(targetNode, { childList: true, subtree: true });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.seenPostIds.clear();
  }

  _processNewRow(row) {
    const article = articleParser.parseRow(row, this.galleryInfo.galleryId);
    if (!article || !article.id) return;

    if (this.seenPostIds.has(article.id)) {
      return;
    }

    this.seenPostIds.add(article.id);

    // Send candidate to Background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: MessageAction.KEYWORD_MATCH_CANDIDATE,
        payload: {
          galleryId: this.galleryInfo.galleryId,
          galleryName: this.galleryInfo.galleryName || this.galleryInfo.galleryId,
          galleryType: this.galleryInfo.galleryType,
          post: {
            id: article.id,
            title: article.title,
            url: article.url,
            author: article.author,
            createdAt: article.date,
            galleryId: this.galleryInfo.galleryId,
            galleryName: this.galleryInfo.galleryName || this.galleryInfo.galleryId
          }
        }
      }).catch(() => {});
    }
  }
}

export const postDetector = new PostDetector();
