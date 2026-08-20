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
import { isDCInsideUrl } from '../core/site-detector.js';

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
import { userBlockFeature } from '../features/user-block-feature.js';
import { spamFilterFeature } from '../features/spam-filter-feature.js';
import { hotHighlightFeature } from '../features/hot-highlight-feature.js';
import { infiniteScrollFeature } from '../features/infinite-scroll-feature.js';
import { archiveCacheFeature } from '../features/archive-cache-feature.js';
import { userAnalyticsFeature } from '../features/user-analytics-feature.js';

// Parsers & Adapters
import { pageDetector } from '../parser/page-detector.js';
import { GalleryDetector } from './detectors/gallery-detector.js';
import { postDetector } from './detectors/post-detector.js';
import { MessageAction } from '../core/message-contract.js';
import { domObserver } from '../adapters/dom-observer.js';
import { authManager } from '../auth/auth-manager.js';
import { loginAutomation } from '../auth/login-automation.js';
import { articleParser } from '../parser/article-parser.js';
import { commentParser } from '../parser/comment-parser.js';
import { SELECTORS } from '../adapters/selectors.js';
import { injectAdWingHideStyles } from './page-layout.js';

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

/**
 * 페이지 종류별로만 필요한 피처는 초기 번들에서 빼고 그때 가서 불러온다.
 * 목록 페이지(가장 흔한 경우)의 콘텐츠 스크립트 그래프가 301KB -> 202KB로 줄어든다.
 * @type {Record<string, import('../features/base-feature.js').BaseFeature|null>}
 */
const lazy = {
  ai: null,
  autoSignature: null,
  draftAutosave: null,
  dcconFavorites: null,
  markdownCode: null,
  archiveCapture: null,
  commentTree: null
};

const LAZY_FEATURES = {
  ai: () => import('../features/ai-feature.js').then(m => m.aiFeature),
  autoSignature: () => import('../features/auto-signature-feature.js').then(m => m.autoSignatureFeature),
  draftAutosave: () => import('../features/draft-autosave-feature.js').then(m => m.draftAutosaveFeature),
  dcconFavorites: () => import('../features/dccon-favorites-feature.js').then(m => m.dcconFavoritesFeature),
  markdownCode: () => import('../features/markdown-code-feature.js').then(m => m.markdownCodeFeature),
  archiveCapture: () => import('../features/archive-capture-feature.js').then(m => m.archiveCaptureFeature),
  commentTree: () => import('../features/comment-tree-feature.js').then(m => m.commentTreeFeature)
};

/**
 * 현재 URL에 필요한 지연 피처 목록.
 * @returns {string[]}
 */
function lazyFeaturesForPage() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';

  if (/\/board\/(write|modify)/.test(path)) {
    return ['autoSignature', 'draftAutosave', 'markdownCode', 'dcconFavorites'];
  }
  if (/\/board\/view/.test(path)) {
    return ['archiveCapture', 'commentTree', 'dcconFavorites', 'markdownCode', 'ai'];
  }
  return []; // 목록/검색 페이지는 위 피처가 모두 불필요
}

/**
 * 필요한 지연 피처를 불러와 등록하고, 설정에서 켜져 있으면 활성화한다.
 */
async function loadPageFeatures() {
  const wanted = lazyFeaturesForPage();

  for (const key of wanted) {
    if (lazy[key]) continue;
    try {
      const feature = await LAZY_FEATURES[key]();
      lazy[key] = feature;
      featureManager.register(feature);
      if (configManager.get(feature.id) ?? true) {
        await feature.enable();
      }
    } catch (err) {
      logger.warn(`Content Script: lazy feature [${key}] failed to load:`, err);
    }
  }
}

/**
 * Re-applies the DOM-mutating list features (block / spam / highlight) plus the
 * dccon bar. Called after page detection and whenever new rows appear.
 * @param {Object} pageInfo
 */
function applyListFeatures(pageInfo) {
  for (const feature of [userBlockFeature, spamFilterFeature, hotHighlightFeature]) {
    try {
      if (!feature.enabled) continue;
      if (pageInfo) feature.onPageChange(pageInfo);
      else feature.apply();
    } catch (err) {
      logger.warn(`Content Script: feature [${feature.id}] failed to apply:`, err);
    }
  }

  try {
    if (lazy.dcconFavorites?.enabled) lazy.dcconFavorites.renderBar();
  } catch (err) {
    logger.debug('Content Script: dccon bar render failed:', err);
  }

  // 댓글은 본문 로드 후 비동기로 붙으므로 변경마다 다시 처리한다.
  try {
    if (lazy.commentTree?.enabled) lazy.commentTree.apply();
    if (lazy.archiveCapture?.enabled) lazy.archiveCapture.mountButton();
    if (archiveCacheFeature.enabled) archiveCacheFeature.captureSoon();
  } catch (err) {
    logger.debug('Content Script: archive/comment pass failed:', err);
  }
}

async function initContentEngine() {
  if (!isDCInsideUrl(window.location.href)) {
    logger.warn('Content Script: Aborted execution on non-DCInside URL.');
    return;
  }

  // --- 0. 메시지 핸들러는 가장 먼저, 무조건 등록 ---
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'GET_CURRENT_GALLERY_CONTEXT') {
        const galleryInfo = GalleryDetector.detect();
        sendResponse({ payload: galleryInfo });
        return false;
      }

      // Side Panel edited shared data — re-apply without a reload.
      if (message && message.type === MessageAction.USER_RULES_CHANGED) {
        userBlockFeature.refreshRules().catch(err => logger.warn('User rules refresh failed:', err));
        return false;
      }
      if (message && message.type === MessageAction.DCCON_CHANGED) {
        dcconFavoritesFeature.refresh().catch(err => logger.warn('Dccon refresh failed:', err));
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
    featureManager.register(userBlockFeature);
    featureManager.register(spamFilterFeature);
    featureManager.register(hotHighlightFeature);
    featureManager.register(infiniteScrollFeature);
    featureManager.register(archiveCacheFeature);
    featureManager.register(userAnalyticsFeature);
    await featureManager.init();
  });

  await runPhase('auth', async () => {
    authState = authManager.detectUser(document);
    logger.info('Content Script: Session Auth State:', authState.state);

    // Auto login runs before the heavier feature phases so a signed-out page
    // is redirected to the login form as early as possible.
    await loginAutomation.run(document, window.location.href);
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

    await loadPageFeatures();

    applyDOMFilters();
    applyListFeatures(currentPageInfo);
    postDetector.start(currentPageInfo); // Start observing for Keyword Alerts

    await eventBus.emit('page:detected', currentPageInfo);
    // Legacy support: Keep PAGE_NAVIGATED for components that still need it, but new UI uses CURRENT_GALLERY_CHANGED
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'PAGE_NAVIGATED', pageInfo: currentPageInfo }).catch(() => {});
    }
  });

  await runPhase('domObserver', () => {
    domObserver.observe(document);
    eventBus.on('dom:articles_added', () => {
      applyDOMFilters();
      applyListFeatures(currentPageInfo);
    });
  });

  await runPhase('adStyles', () => {
    if (currentPageInfo && currentPageInfo.type !== 'UNKNOWN') {
      injectAdWingHideStyles();
    }
  });

  engineReady = true;

  if (initErrors.length > 0) {
    logger.warn(`Content Script: Initialized with ${initErrors.length} phase failure(s):`, initErrors);
  } else {
    logger.info('Content Script: DC Ultimate content engine fully operational.');
  }
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
