/**
 * DC Ultimate Manifest V3 Background Service Worker Entry Point
 */
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { configManager } from '../core/config-manager.js';
import { messageRouter } from '../core/message-router.js';
import { storageRepository } from '../core/storage-repository.js';
import { MessageAction } from '../core/message-contract.js';
import { keywordAlertManager } from '../core/keyword-alert/keyword-alert-manager.js';
import { notificationManager } from '../core/keyword-alert/notification-manager.js';
import { matchPost } from '../core/keyword-alert/keyword-matcher.js';
import { parseGalleryUrl } from '../core/gallery-context.js';
import { autoLoginService } from '../auth/auto-login-service.js';
import { getAutoLoginState, updateAutoLoginState, toPublicStatus } from '../auth/credential-store.js';
import { isDcInsideUrl, isLogoutUrl, LOGIN_ORIGIN } from '../auth/dc-login-page.js';
import { userRuleManager } from '../core/filters/user-rule-manager.js';
import { draftStore } from '../core/draft/draft-store.js';
import { dcconStore } from '../core/dccon/dccon-store.js';
import { archiveDB, ArchiveDB } from '../core/archive/archive-db.js';
import { summarizeUserActivity, galleryShareStats, suspiciousIpBands, nicknameHolders, ipBand } from '../core/archive/activity-analyzer.js';
import { isDCInsideUrl } from '../core/site-detector.js';

logger.info('Service Worker: Starting DC Ultimate background process...');

// Canonical GalleryContext storage per tab
const currentContexts = new Map();

// Helper to broadcast context change to side panel
async function broadcastContextChange(tabId, context) {
  currentContexts.set(tabId, context);
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: MessageAction.CURRENT_GALLERY_CHANGED,
      payload: context,
      tabId: tabId
    }).catch(() => {});
  }
}

/**
 * Notifies every open DCInside tab and extension page that shared data changed,
 * so content scripts can re-apply rules without a reload.
 * @param {string} type MessageAction value
 * @param {Object} [payload]
 */
function broadcast(type, payload = {}) {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;

  try {
    const sent = chrome.runtime.sendMessage({ type, payload });
    if (sent && typeof sent.catch === 'function') sent.catch(() => {});
  } catch (err) {
    // No listener — fine.
  }

  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ url: '*://*.dcinside.com/*' }, (tabs) => {
      if (chrome.runtime.lastError) return;
      (tabs || []).forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, { type, payload }, () => void chrome.runtime.lastError);
        } catch (err) {
          // Tab without a content script — ignore.
        }
      });
    });
  }
}

// Refresh context based on tab URL
async function refreshGalleryContext(tabId, explicitUrl = null) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return null;
    const url = explicitUrl || tab.url || '';
    
    const urlContext = parseGalleryUrl(url);
    if (!urlContext.valid) {
      currentContexts.delete(tabId);
      await broadcastContextChange(tabId, null);
      return null;
    }

    const previous = currentContexts.get(tabId);
    const context = {
      ...urlContext,
      galleryName: (previous?.galleryId === urlContext.galleryId) ? previous.galleryName : null,
      categories: (previous?.galleryId === urlContext.galleryId) ? (previous.categories || []) : []
    };

    currentContexts.set(tabId, context);
    await broadcastContextChange(tabId, context);

    try {
      if (chrome.tabs.sendMessage) {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_GALLERY_CONTEXT' });
        if (response && response.payload && response.payload.galleryId === context.galleryId) {
          const merged = {
            ...context,
            galleryName: response.payload.galleryName || context.galleryName,
            categories: response.payload.categories || context.categories || [],
            source: response.payload.galleryName ? 'combined' : 'url',
            detectedAt: Date.now()
          };
          currentContexts.set(tabId, merged);
          await broadcastContextChange(tabId, merged);
          return merged;
        }
      }
    } catch (e) {
      // Content script may not be ready, ignore
    }
    
    return context;
  } catch (e) {
    // Ignore errors for invalid/closed tabs
    return null;
  }
}

/**
 * Storage/config initialization runs once per service-worker lifetime.
 *
 * MV3 tears the worker down aggressively, so a message from the Side Panel can
 * arrive while init is still pending. Message handlers are therefore registered
 * synchronously (see registerMessageHandlers below) and each one awaits this
 * promise instead of relying on init having already finished — otherwise the
 * very first request after a cold start finds no handler and the panel renders
 * an empty list.
 * @type {Promise<void>|null}
 */
let backgroundReady = null;

function ensureReady() {
  if (!backgroundReady) {
    backgroundReady = initializeBackground();
  }
  return backgroundReady;
}

// Initialize Storage & Configuration
async function initializeBackground() {
  try {
    await storageManager.init();
    await configManager.init();

    // --- Legacy Migration for AutomationEngine -> Keyword Alerts ---
    const legacyRules = await storageManager.get('automationRules');
    if (legacyRules && legacyRules.automationRules && Array.isArray(legacyRules.automationRules) && legacyRules.automationRules.length > 0) {
      const existingAlerts = await storageRepository.getKeywordAlerts();
      if (existingAlerts.length === 0) {
        logger.info('Migrating legacy automationRules to Keyword Alerts...');
        for (const rule of legacyRules.automationRules) {
          await keywordAlertManager.addAlert({
            gallery: {
              id: rule.queryData?.galleryId || 'programming',
              type: 'board', // Default assumption
              name: rule.name || rule.queryData?.galleryId,
              url: `https://gall.dcinside.com/board/lists/?id=${rule.queryData?.galleryId || 'programming'}`
            },
            keywords: [rule.queryData?.keyword || ''],
            target: 'title',
            matchMode: 'contains',
            enabled: rule.enabled,
            pollingIntervalMinutes: rule.intervalMinutes || 10,
            notifyPanel: true,
            notifyChrome: true
          });
        }
        await storageManager.remove('automationRules'); // Cleanup
      }
    }
    // -------------------------------------------------------------

    await keywordAlertManager.initAlarms();
    notificationManager.initOSNotificationClick();

    // 오래된 아카이브 정리 (실패해도 초기화는 계속된다)
    archiveDB.prune().catch(err => logger.warn('ArchiveDB prune failed:', err));

    // Configure SidePanel Behavior
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      chrome.sidePanel.setOptions({ enabled: false }).catch(console.warn);
      
      const openPanelOnAction = configManager.get('openSidePanelOnActionClick') === true;
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openPanelOnAction }).catch(console.warn);
      if (chrome.action && chrome.action.setPopup) {
        chrome.action.setPopup({ popup: openPanelOnAction ? '' : 'src/ui/popup/popup.html' }).catch(console.warn);
      }
      
      // Listen for runtime config changes to update immediately
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes['config']) {
          const newConfig = changes['config'].newValue || {};
          const openPanel = newConfig.openSidePanelOnActionClick === true;
          chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openPanel }).catch(console.warn);
          if (chrome.action && chrome.action.setPopup) {
            chrome.action.setPopup({ popup: openPanel ? '' : 'src/ui/popup/popup.html' }).catch(console.warn);
          }
        }
      });
    }

    logger.info('Service Worker: Background modules initialized successfully.');
  } catch (err) {
    logger.error('Service Worker initialization failed:', err);
  }
}

/**
 * Registers every runtime message handler.
 * Called synchronously at module evaluation so no request can race init.
 */
function registerMessageHandlers() {
  // --- Keyword Alerts ---
  messageRouter.register(MessageAction.KEYWORD_ALERT_LIST, async () => {
    await ensureReady();
    return { alerts: await storageRepository.getKeywordAlerts() };
  });

  messageRouter.register(MessageAction.KEYWORD_ALERT_CREATE, async (payload) => {
    await ensureReady();
    const newAlert = await keywordAlertManager.addAlert(payload);
    return { success: true, alert: newAlert };
  });

  messageRouter.register(MessageAction.KEYWORD_ALERT_UPDATE, async (payload) => {
    await ensureReady();
    const updated = await keywordAlertManager.updateAlert(payload.id, payload.updates);
    return { success: true, alert: updated };
  });

  messageRouter.register(MessageAction.KEYWORD_ALERT_DELETE, async (payload) => {
    await ensureReady();
    await keywordAlertManager.deleteAlert(payload.id);
    return { success: true };
  });

  messageRouter.register(MessageAction.KEYWORD_ALERT_TOGGLE, async (payload) => {
    await ensureReady();
    const updated = await keywordAlertManager.toggleAlert(payload.id, payload.enabled);
    return { success: true, alert: updated };
  });

  messageRouter.register(MessageAction.KEYWORD_ALERT_SCAN_NOW, async (payload) => {
    await ensureReady();
    const result = await keywordAlertManager.scanNow(payload && payload.id ? payload.id : null);
    return { success: true, result };
  });

  messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_LIST, async () => {
    await ensureReady();
    return { notifications: await storageRepository.getKeywordNotifications() };
  });

  messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_READ, async (payload) => {
    await ensureReady();
    await storageRepository.markNotificationRead(payload.id);
    return { success: true };
  });

  messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_CLEAR, async (payload) => {
    await ensureReady();
    if (payload && payload.id) {
      await storageRepository.deleteNotification(payload.id);
    } else {
      await storageRepository.saveKeywordNotifications([]); // Clear all
    }
    return { success: true };
  });

  // --- Canonical Gallery Context Routing ---
  messageRouter.register(MessageAction.GET_CURRENT_GALLERY, async (payload, sender) => {
    // Side Panel requests current context
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const ctx = currentContexts.get(tab.id) || parseGalleryUrl(tab.url);
        return { context: ctx };
      }
    }
    return { context: parseGalleryUrl(null) };
  });

  messageRouter.register(MessageAction.CURRENT_GALLERY_CONTEXT, async (payload, sender) => {
    // Content Script provides rich context (with galleryName)
    if (sender && sender.tab && sender.tab.id) {
      if (payload && payload.galleryId) { // Basic validation
        const tabId = sender.tab.id;
        const urlContext = parseGalleryUrl(sender.tab.url);
        // Check for stale response
        if (urlContext.valid && urlContext.galleryId !== payload.galleryId) {
          return { success: false, reason: 'stale' };
        }
        currentContexts.set(tabId, payload);
        await broadcastContextChange(tabId, payload);
      }
    }
    return { success: true };
  });
  // ------------------------------------------

  messageRouter.register(MessageAction.KEYWORD_MATCH_CANDIDATE, async (payload) => {
    // Content Script found a new post; check if it matches any active alert
    await ensureReady();
    if (!payload || !payload.post) return { success: false };

    const alerts = await storageRepository.getKeywordAlerts();
    const activeAlerts = alerts.filter(a => a.enabled && a.gallery?.id === payload.galleryId);

    let processed = false;
    for (const alert of activeAlerts) {
      const matched = matchPost(payload.post, alert);
      if (matched.length > 0) {
        const created = await notificationManager.processMatch(alert, payload.post, matched);
        if (created) processed = true;
      }
    }
    return { success: processed };
  });

  // --- User rules (IP/닉네임 메모 및 차단) ---
  messageRouter.register(MessageAction.USER_RULE_LIST, async () => {
    await ensureReady();
    return { rules: await userRuleManager.load(true) };
  });

  messageRouter.register(MessageAction.USER_RULE_ADD, async (payload) => {
    await ensureReady();
    const rule = await userRuleManager.addRule(payload);
    broadcast(MessageAction.USER_RULES_CHANGED);
    return { success: true, rule };
  });

  messageRouter.register(MessageAction.USER_RULE_UPDATE, async (payload) => {
    await ensureReady();
    const rule = await userRuleManager.updateRule(payload.id, payload.updates || {});
    broadcast(MessageAction.USER_RULES_CHANGED);
    return { success: true, rule };
  });

  messageRouter.register(MessageAction.USER_RULE_DELETE, async (payload) => {
    await ensureReady();
    await userRuleManager.deleteRule(payload.id);
    broadcast(MessageAction.USER_RULES_CHANGED);
    return { success: true };
  });

  // --- Drafts (작성 중 임시저장 미러) ---
  messageRouter.register(MessageAction.DRAFT_SAVE, async (payload) => {
    await ensureReady();
    const draft = await draftStore.save(payload && payload.draft);
    return { success: true, draft };
  });

  messageRouter.register(MessageAction.DRAFT_LIST, async () => {
    await ensureReady();
    return { drafts: await draftStore.list() };
  });

  messageRouter.register(MessageAction.DRAFT_DELETE, async (payload) => {
    await ensureReady();
    if (payload && payload.key) {
      await draftStore.remove(payload.key);
    } else {
      await draftStore.clear();
    }
    return { success: true };
  });

  // --- Dccon favourites ---
  messageRouter.register(MessageAction.DCCON_LIST, async () => {
    await ensureReady();
    return { dccons: await dcconStore.list() };
  });

  messageRouter.register(MessageAction.DCCON_PIN, async (payload) => {
    await ensureReady();
    const entry = await dcconStore.setPinned(payload.detailIdx, payload.pinned);
    broadcast(MessageAction.DCCON_CHANGED);
    return { success: true, entry };
  });

  messageRouter.register(MessageAction.DCCON_DELETE, async (payload) => {
    await ensureReady();
    if (payload && payload.detailIdx) {
      await dcconStore.remove(payload.detailIdx);
    } else {
      await dcconStore.clear();
    }
    broadcast(MessageAction.DCCON_CHANGED);
    return { success: true };
  });

  // --- Archive (삭제 글/댓글 캐시 · 유저 분석) ---
  messageRouter.register(MessageAction.ARCHIVE_PUT, async (payload) => {
    await ensureReady();
    const posts = await archiveDB.putPosts(payload?.posts || []);
    const comments = await archiveDB.putComments(payload?.comments || []);
    return { posts, comments };
  });

  messageRouter.register(MessageAction.ARCHIVE_GET_POST, async (payload) => {
    await ensureReady();
    return { post: await archiveDB.getPost(payload.galleryId, payload.postId) };
  });

  messageRouter.register(MessageAction.ARCHIVE_GET_COMMENTS, async (payload) => {
    await ensureReady();
    return { comments: await archiveDB.getComments(payload.galleryId, payload.postId) };
  });

  messageRouter.register(MessageAction.ARCHIVE_USER_STATS, async (payload) => {
    await ensureReady();
    const { galleryId, authorKey } = payload || {};
    const activity = await archiveDB.userActivity(galleryId, authorKey);
    const summary = summarizeUserActivity(activity);

    const sampleSize = Number(configManager.get('analyticsSampleSize')) || 200;
    const recent = await archiveDB.recentPosts(galleryId, sampleSize);
    const stats = galleryShareStats(recent, sampleSize);
    const share = stats.entries.find(entry => entry.authorKey === authorKey) || { share: 0, count: 0 };

    // 같은 IP 대역에서 관측된 다른 닉네임 (통피/다중 계정 신호)
    // 대역끼리 비교해야 한다. 디시가 유동닉 IP 를 2옥텟까지만 공개하므로 예전의
    // `startsWith(`${band}.`)` 는 `175.223` 이 `175.223.` 으로 시작하지 않아 늘 빈 배열이었다.
    const band = ipBand(summary.ips[0] || '');
    const sameIpNicknames = band
      ? Array.from(new Set(recent.filter(post => post.ip && ipBand(post.ip) === band).map(post => post.author).filter(Boolean)))
      : [];

    return { summary, share: { ...share, sampled: stats.sampled }, sameIpNicknames };
  });

  messageRouter.register(MessageAction.ARCHIVE_NICK_HOLDERS, async (payload) => {
    await ensureReady();
    const { galleryId, nickname } = payload || {};
    const records = await archiveDB.nicknameActivity(galleryId, nickname);
    return nicknameHolders(records, nickname);
  });

  messageRouter.register(MessageAction.ARCHIVE_GALLERY_STATS, async (payload) => {
    await ensureReady();
    const sampleSize = Number(payload?.sampleSize) || Number(configManager.get('analyticsSampleSize')) || 200;
    const posts = await archiveDB.recentPosts(payload?.galleryId, sampleSize);
    return {
      stats: galleryShareStats(posts, sampleSize),
      suspicious: suspiciousIpBands(posts)
    };
  });

  messageRouter.register(MessageAction.ARCHIVE_DB_STATS, async () => {
    await ensureReady();
    return { stats: await archiveDB.stats() };
  });

  messageRouter.register(MessageAction.ARCHIVE_CLEAR, async (payload) => {
    await ensureReady();
    await archiveDB.clear(payload?.galleryId || null);
    return { success: true };
  });

  messageRouter.register(MessageAction.ARCHIVE_CAPTURE_IMAGE, async (payload, sender) => {
    await ensureReady();
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.captureVisibleTab) {
      return { error: '이 브라우저에서는 화면 캡처를 지원하지 않습니다.' };
    }

    const windowId = sender?.tab?.windowId;
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const safeTitle = String(payload?.title || 'dc-archive').replace(/[\/:*?"<>|]/g, '_').slice(0, 60);
      return { dataUrl, filename: `${safeTitle}_${stamp}.png` };
    } catch (err) {
      logger.warn('Archive: captureVisibleTab failed:', err);
      return { error: err.message };
    }
  });

  messageRouter.register(MessageAction.ARCHIVE_OPEN_EXTERNAL, async (payload) => {
    await ensureReady();
    const url = payload?.url || '';
    if (!/^https:\/\/archive\.(today|ph|is|li|vn)\//.test(url)) {
      return { success: false, error: 'archive.today 주소만 열 수 있습니다.' };
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      await chrome.tabs.create({ url });
    }
    return { success: true };
  });

  // --- Auto Login ---
  messageRouter.register(MessageAction.AUTO_LOGIN_REQUEST, async (payload, sender) => {
    await ensureReady();
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (!isDcInsideUrl(sender && sender.url)) {
      return { action: 'none', reason: 'not_dcinside' };
    }
    return autoLoginService.evaluate({
      tabId,
      state: payload && payload.state,
      isLoginPage: Boolean(payload && payload.isLoginPage),
      referrer: (payload && payload.referrer) || ''
    });
  });

  messageRouter.register(MessageAction.AUTO_LOGIN_CREDENTIALS, async (payload, sender) => {
    await ensureReady();
    // The account is only ever handed to the genuine DCInside sign-in page.
    const senderUrl = sender && sender.url ? sender.url : '';
    if (!senderUrl.startsWith(`${LOGIN_ORIGIN}/`)) {
      logger.warn('Auto login: credential request rejected from', senderUrl);
      return { credentials: null, reason: 'bad_origin' };
    }

    const state = await getAutoLoginState();
    if (!state.enabled || !state.userId || !state.password) {
      return { credentials: null, reason: 'unavailable' };
    }
    return { credentials: { userId: state.userId, password: state.password } };
  });

  messageRouter.register(MessageAction.AUTO_LOGIN_RESULT, async (payload, sender) => {
    await ensureReady();
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (payload && payload.captcha) {
      await autoLoginService.blockForCaptcha();
      return { success: true };
    }
    await autoLoginService.noteResult(tabId, Boolean(payload && payload.success), payload && payload.message);
    return { success: true };
  });

  messageRouter.register(MessageAction.AUTO_LOGIN_SUPPRESS, async (payload, sender) => {
    await ensureReady();
    const tabId = sender && sender.tab ? sender.tab.id : null;
    await autoLoginService.suppressTab(tabId);
    return { success: true };
  });

  messageRouter.register(MessageAction.AUTO_LOGIN_STATUS, async (payload, sender) => {
    await ensureReady();
    // Only the extension's own pages (Options/Popup) may change the account;
    // content scripts are read-only here.
    const fromExtensionPage = !sender || !sender.tab;
    if (payload && payload.updates && fromExtensionPage) {
      await updateAutoLoginState(payload.updates);
    }
    const state = await getAutoLoginState();
    return { status: toPublicStatus(state) };
  });

  messageRouter.register(MessageAction.GALLERY_VISITED, async (payload) => {
    await ensureReady();
    await storageRepository.addRecentGallery(payload);
    return { success: true };
  });

  messageRouter.register(MessageAction.GET_RECENT_GALLERIES, async () => {
    await ensureReady();
    return { galleries: await storageRepository.getRecentGalleries() };
  });

  messageRouter.register(MessageAction.GET_FAVORITE_GALLERIES, async () => {
    await ensureReady();
    return { favorites: await storageRepository.getFavorites() };
  });

  messageRouter.register(MessageAction.ADD_FAVORITE_GALLERY, async (payload) => {
    await ensureReady();
    await storageRepository.addFavorite(payload);
    return { success: true };
  });

  messageRouter.register(MessageAction.REMOVE_FAVORITE_GALLERY, async (payload) => {
    await ensureReady();
    await storageRepository.removeFavorite(payload.galleryId);
    return { success: true };
  });
}

registerMessageHandlers();
ensureReady();

// Listen for Extension Installation or Update
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    logger.info(`Service Worker: Extension installed / updated (Reason: ${details.reason})`);
    if (details.reason === 'update' || details.reason === 'install') {
      await ensureReady();
      await keywordAlertManager.initAlarms();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await ensureReady();
    await keywordAlertManager.initAlarms();
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    // An alarm is usually what wakes the worker back up, so wait for storage
    // init before touching the alert rules.
    ensureReady()
      .then(() => keywordAlertManager.handleAlarm(alarm.name))
      .catch(e => logger.error('Service Worker: alarm handling failed:', e));
  });
}

// Track active tab changes for Canonical GalleryContext
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab && typeof chrome.sidePanel !== 'undefined') {
        const isDc = (tab.url && isDCInsideUrl(tab.url)) ? true : false;
        chrome.sidePanel.setOptions({ tabId, path: 'src/ui/sidepanel/sidepanel.html', enabled: isDc }).catch(() => {});
      }
    } catch(e) {
      // Ignore
    }
    await refreshGalleryContext(tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab.url;
    if (url && typeof chrome.sidePanel !== 'undefined') {
      const isDc = isDCInsideUrl(url);
      chrome.sidePanel.setOptions({ tabId, path: 'src/ui/sidepanel/sidepanel.html', enabled: isDc }).catch(() => {});
    }

    if (changeInfo.url) {
      // Auto login bookkeeping: a manual logout pauses this tab, and leaving
      // DCInside altogether re-arms it, so coming back counts as a fresh visit.
      if (isLogoutUrl(changeInfo.url)) {
        await autoLoginService.suppressTab(tabId);
      } else if (!isDcInsideUrl(changeInfo.url)) {
        await autoLoginService.releaseTab(tabId);
      }

      await refreshGalleryContext(tabId, changeInfo.url);
      return;
    }
    if (changeInfo.status === 'complete') {
      await refreshGalleryContext(tabId, tab.url);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    currentContexts.delete(tabId);
    autoLoginService.releaseTab(tabId).catch(() => {});
  });
}
