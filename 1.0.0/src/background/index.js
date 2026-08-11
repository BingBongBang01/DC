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

    // Background Message Router Handlers
    messageRouter.register(MessageAction.KEYWORD_ALERT_LIST, async () => {
      return { alerts: await storageRepository.getKeywordAlerts() };
    });

    messageRouter.register(MessageAction.KEYWORD_ALERT_CREATE, async (payload) => {
      const newAlert = await keywordAlertManager.addAlert(payload);
      return { success: true, alert: newAlert };
    });

    messageRouter.register(MessageAction.KEYWORD_ALERT_UPDATE, async (payload) => {
      const updated = await keywordAlertManager.updateAlert(payload.id, payload.updates);
      return { success: true, alert: updated };
    });

    messageRouter.register(MessageAction.KEYWORD_ALERT_DELETE, async (payload) => {
      await keywordAlertManager.deleteAlert(payload.id);
      return { success: true };
    });

    messageRouter.register(MessageAction.KEYWORD_ALERT_TOGGLE, async (payload) => {
      const updated = await keywordAlertManager.toggleAlert(payload.id, payload.enabled);
      return { success: true, alert: updated };
    });

    messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_LIST, async () => {
      return { notifications: await storageRepository.getKeywordNotifications() };
    });

    messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_READ, async (payload) => {
      await storageRepository.markNotificationRead(payload.id);
      return { success: true };
    });

    messageRouter.register(MessageAction.KEYWORD_NOTIFICATION_CLEAR, async (payload) => {
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
      if (!payload || !payload.post) return { success: false };
      
      const alerts = await storageRepository.getKeywordAlerts();
      const activeAlerts = alerts.filter(a => a.enabled && a.gallery.id === payload.galleryId);
      
      let processed = false;
      for (const alert of activeAlerts) {
        const matched = matchPost(payload.post, alert);
        if (matched.length > 0) {
          await notificationManager.processMatch(alert, payload.post, matched);
          processed = true;
        }
      }
      return { success: processed };
    });

    messageRouter.register(MessageAction.GALLERY_VISITED, async (payload) => {
      await storageRepository.addRecentGallery(payload);
      return { success: true };
    });

    messageRouter.register(MessageAction.GET_RECENT_GALLERIES, async () => {
      return { galleries: await storageRepository.getRecentGalleries() };
    });

    messageRouter.register(MessageAction.GET_FAVORITE_GALLERIES, async () => {
      return { favorites: await storageRepository.getFavorites() };
    });

    messageRouter.register(MessageAction.ADD_FAVORITE_GALLERY, async (payload) => {
      await storageRepository.addFavorite(payload);
      return { success: true };
    });

    messageRouter.register(MessageAction.REMOVE_FAVORITE_GALLERY, async (payload) => {
      await storageRepository.removeFavorite(payload.galleryId);
      return { success: true };
    });

    logger.info('Service Worker: Background modules initialized successfully.');
  } catch (err) {
    logger.error('Service Worker initialization failed:', err);
  }
}

initializeBackground();

// Listen for Extension Installation or Update
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    logger.info(`Service Worker: Extension installed / updated (Reason: ${details.reason})`);
    if (details.reason === 'update' || details.reason === 'install') {
       await keywordAlertManager.initAlarms();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    await keywordAlertManager.initAlarms();
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    keywordAlertManager.handleAlarm(alarm.name).catch(e => logger.error(e));
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
      await refreshGalleryContext(tabId, changeInfo.url);
      return;
    }
    if (changeInfo.status === 'complete') {
      await refreshGalleryContext(tabId, tab.url);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    currentContexts.delete(tabId);
  });
}
