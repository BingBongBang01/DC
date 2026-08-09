/**
 * DC Ultimate Content Script Entry Point (Phase 1 - Phase 7/8 Integrated)
 */
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { configManager } from '../core/config-manager.js';
import { eventBus } from '../core/event-bus.js';
import { messageRouter } from '../core/message-router.js';
import { featureManager } from '../core/feature-manager.js';
import { filterEngine } from '../core/filters/filter-engine.js';

// Features Import
import { testFeature } from '../features/test-feature.js';
import { hoverPreviewFeature } from '../features/hover-preview-feature.js';
import { readingLayoutFeature } from '../features/reading-layout-feature.js';
import { navigationFeature } from '../features/navigation-feature.js';
import { urlRedirectFeature } from '../features/url-redirect-feature.js';
import { searchAggregationFeature } from '../features/search-aggregation-feature.js';
import { userNotesFeature } from '../features/user-notes-feature.js';
import { commentToolsFeature } from '../features/comment-tools-feature.js';
import { mediaToolsFeature } from '../features/media-tools-feature.js';
import { aiFeature } from '../features/ai-feature.js';
import { autoSignatureFeature } from '../features/auto-signature-feature.js';

// Parsers & Adapters
import { pageDetector } from '../parser/page-detector.js';
import { GalleryDetector } from './detectors/gallery-detector.js';
import { postDetector } from './detectors/post-detector.js';
import { MessageAction } from '../core/message-contract.js';
import { domObserver } from '../adapters/dom-observer.js';
import { authManager } from '../auth/auth-manager.js';
import { articleParser } from '../parser/article-parser.js';
import { commentParser } from '../parser/comment-parser.js';
import { SELECTORS } from '../adapters/selectors.js';

logger.info('Content Script: Starting DC Ultimate content engine...');

let currentPageInfo = null;
let authState = { state: 'unknown', user: null };
let engineReady = false;
const initErrors = [];

async function runPhase(name, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error(`Content Script: Phase [${name}] failed:`, err);
    initErrors.push({ phase: name, message: err.message });
  }
}

async function initContentEngine() {
  // --- 0. 메시지 핸들러는 가장 먼저, 무조건 등록 ---
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'GET_CURRENT_GALLERY_CONTEXT') {
        const galleryInfo = GalleryDetector.detect();
        sendResponse({ payload: galleryInfo });
        return false;
      }
    });
  }

  messageRouter.register('GET_PAGE_INFO', async () => {
    if (!engineReady) {
      return { ready: false, initErrors };
    }
    return { pageInfo: currentPageInfo, authState: authState.state, user: authState.user };
  });

  messageRouter.register('RESCAN_PAGE', async () => {
    if (!currentPageInfo) {
      return { ready: false, error: 'Page not yet detected', initErrors };
    }
    try {
      const articles = articleParser.parseList(document, currentPageInfo.galleryId);
      const comments = commentParser.parseList(document);
      return { pageInfo: currentPageInfo, articlesCount: articles.length, commentsCount: comments.length };
    } catch (err) {
      logger.error('RESCAN_PAGE handler error:', err);
      return { ready: true, error: err.message };
    }
  });

  // --- 1. 각 단계를 독립적으로 실행 ---
  await runPhase('storage', () => storageManager.init());
  await runPhase('config', () => configManager.init());
  await runPhase('filterEngine', () => filterEngine.init());

  await runPhase('features', async () => {
    featureManager.register(testFeature);
    featureManager.register(hoverPreviewFeature);
    featureManager.register(readingLayoutFeature);
    featureManager.register(navigationFeature);
    featureManager.register(urlRedirectFeature);
    featureManager.register(searchAggregationFeature);
    featureManager.register(userNotesFeature);
    featureManager.register(commentToolsFeature);
    featureManager.register(mediaToolsFeature);
    featureManager.register(aiFeature);
    featureManager.register(autoSignatureFeature);
    await featureManager.init();
  });

  await runPhase('auth', () => {
    authState = authManager.detectUser(document);
    logger.info('Content Script: Session Auth State:', authState.state);
  });

  await runPhase('pageDetect', async () => {
    currentPageInfo = pageDetector.detect(window.location, document);
    logger.info('Content Script: Current page info:', currentPageInfo);
    
    // Broadcast gallery visit for Recent Galleries & Current Gallery Context
    const galleryInfo = GalleryDetector.detect();
    if (galleryInfo && typeof chrome !== 'undefined' && chrome.runtime) {
      if (galleryInfo.valid) {
        chrome.runtime.sendMessage({ action: MessageAction.CURRENT_GALLERY_CONTEXT, payload: galleryInfo }).catch(() => {});
        // Still broadcast to recent galleries
        chrome.runtime.sendMessage({ action: MessageAction.GALLERY_VISITED, payload: galleryInfo }).catch(() => {});
      }
      // Merge human readable name into legacy page detector info
      if (galleryInfo.galleryName) {
        currentPageInfo.galleryName = galleryInfo.galleryName;
      }
    }

    applyDOMFilters();
    postDetector.start(currentPageInfo); // Start observing for Keyword Alerts

    await eventBus.emit('page:detected', currentPageInfo);
    // Legacy support: Keep PAGE_NAVIGATED for components that still need it, but new UI uses CURRENT_GALLERY_CHANGED
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'PAGE_NAVIGATED', pageInfo: currentPageInfo }).catch(() => {});
    }
  });

  await runPhase('domObserver', () => {
    domObserver.observe(document);
    eventBus.on('dom:articles_added', () => applyDOMFilters());
  });

  await runPhase('adStyles', () => {
    if (currentPageInfo && currentPageInfo.type !== 'UNKNOWN') {
      injectAdWingHideStyles();
    }
  });

  await runPhase('zoomFit', () => {
    if (!currentPageInfo || currentPageInfo.type === 'UNKNOWN') return;
    
    const applyZoomToFit = () => {
      const minWidth = 1160;
      document.body.style.zoom = window.innerWidth < minWidth
        ? (window.innerWidth / minWidth).toFixed(4)
        : '1';
    };
    window.addEventListener('resize', applyZoomToFit);
    applyZoomToFit();
  });

  engineReady = true;

  if (initErrors.length > 0) {
    logger.warn(`Content Script: Initialized with ${initErrors.length} phase failure(s):`, initErrors);
  } else {
    logger.info('Content Script: DC Ultimate content engine fully operational.');
  }
}

function injectAdWingHideStyles() {
  if (document.getElementById('dc-ultimate-ad-wing-hide-style')) return;
  const style = document.createElement('style');
  style.id = 'dc-ultimate-ad-wing-hide-style';
  style.textContent = `
    .ad_left_wing_list_top,
    .ad_left_wing_right_top,
    #ad_floating.ban_floating {
      display: none !important;
    }
    html, body {
      overflow-x: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

function applyDOMFilters() {
  if (!currentPageInfo) return;
  const rows = document.querySelectorAll(SELECTORS.listRows);
  rows.forEach(row => {
    const article = articleParser.parseRow(row, currentPageInfo.galleryId);
    if (article) {
      const evalRes = filterEngine.evaluate(article, currentPageInfo.galleryId);
      if (evalRes) {
        filterEngine.applyDOMAction(row, evalRes.action);
      }
    }
  });
}

// Execute on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentEngine);
} else {
  initContentEngine();
}
