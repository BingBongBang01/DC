/**
 * MessageRouter Core Module for DC Ultimate
 * Unified asynchronous messaging between Service Worker, Content Scripts, Popup, SidePanel, and Options Page
 */
import { logger } from './logger.js';

export class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.isChromeRuntimeAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    this._initListener();
  }

  /**
   * Register a handler for a specific message action
   * @param {string} action Message action identifier
   * @param {Function} handler Handler function (payload, sender) => responseData or Promise<responseData>
   */
  register(action, handler) {
    if (typeof handler !== 'function') {
      logger.warn(`MessageRouter: Handler for action '${action}' must be a function`);
      return;
    }
    this.handlers.set(action, handler);
  }

  /**
   * Unregister handler for an action
   * @param {string} action Message action identifier
   */
  unregister(action) {
    this.handlers.delete(action);
  }

  /**
   * Send a message to background service worker or target tab
   * @param {string} action Action string
   * @param {Object} [payload={}] Payload data
   * @param {number} [tabId=null] Target tab ID if sending to a specific tab
   * @returns {Promise<Object>} Response from handler
   */
  async send(action, payload = {}, tabId = null) {
    const message = { action, payload, timestamp: Date.now() };

    if (this.isChromeRuntimeAvailable) {
      return new Promise((resolve, reject) => {
        const callback = (response) => {
          if (chrome.runtime.lastError) {
            logger.warn(`MessageRouter send error [${action}]:`, chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: true });
          }
        };

        if (tabId !== null && chrome.tabs) {
          chrome.tabs.sendMessage(tabId, message, callback);
        } else {
          chrome.runtime.sendMessage(message, callback);
        }
      });
    } else {
      // Local fallback for testing / non-extension context
      const handler = this.handlers.get(action);
      if (handler) {
        try {
          const res = await handler(payload, { tab: null, id: 'local' });
          return { success: true, data: res };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
      return { success: false, error: `No handler registered for action: ${action}` };
    }
  }

  _initListener() {
    if (this.isChromeRuntimeAvailable && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || typeof message.action !== 'string') {
          return false;
        }

        const handler = this.handlers.get(message.action);
        if (handler) {
          Promise.resolve(handler(message.payload, sender))
            .then((result) => sendResponse({ success: true, data: result }))
            .catch((error) => {
              logger.error(`MessageRouter execution error on '${message.action}':`, error);
              sendResponse({ success: false, error: error.message });
            });
          return true; // Keep channel open for async response
        }
        return false;
      });
    }
  }
}

export const messageRouter = new MessageRouter();
