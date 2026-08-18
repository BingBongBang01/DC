/**
 * Global Test Environment Setup for DC Ultimate
 * Mocks browser APIs (DOMParser, window, document) and Chrome Extension APIs
 */
import { JSDOM } from 'jsdom';

// Real DOMParser backed by jsdom, so code paths that call `new DOMParser()`
// (e.g. PageCollector parsing fetched HTML) actually parse real markup in
// tests instead of silently returning empty results.
if (typeof global.DOMParser === 'undefined') {
  global.DOMParser = class DOMParser {
    parseFromString(str, type) {
      const dom = new JSDOM(str, { contentType: type || 'text/html' });
      return dom.window.document;
    }
  };
}

if (typeof global.document === 'undefined') {
  global.document = {
    addEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({ classList: { add: () => {}, remove: () => {} }, style: {}, setAttribute: () => {} }),
    documentElement: { style: { setProperty: () => {} }, setAttribute: () => {}, getAttribute: () => null },
    body: { classList: { add: () => {}, remove: () => {} } }
  };
}

if (typeof global.window === 'undefined') {
  global.window = {
    addEventListener: () => {},
    location: { href: 'https://gall.dcinside.com/' },
    matchMedia: () => ({ matches: false })
  };
}

// Global deterministic mock for chrome API
if (typeof global.chrome === 'undefined') {
  const listeners = {
    onMessage: [],
    onAlarm: [],
    onChanged: []
  };

  const storageData = new Map();

  global.chrome = {
    runtime: {
      lastError: null,
      getURL: (path) => `chrome-extension://mock-id/${path}`,
      // Simulate real Chrome message dispatch: route through registered
      // onMessage listeners instead of always synthesizing success, so
      // MessageRouter's own handler-lookup/validation logic is exercised.
      sendMessage: (msg, cb) => {
        let responded = false;
        let asyncHandled = false;
        const sendResponse = (resp) => {
          responded = true;
          if (cb) cb(resp);
        };
        for (const fn of listeners.onMessage) {
          const keepOpen = fn(msg, { id: 'mock-sender' }, sendResponse);
          if (keepOpen === true) asyncHandled = true;
        }
        if (!responded && !asyncHandled) {
          global.chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
          if (cb) cb(undefined);
          global.chrome.runtime.lastError = null;
        }
      },
      onMessage: {
        addListener: (fn) => listeners.onMessage.push(fn),
        removeListener: (fn) => { listeners.onMessage = listeners.onMessage.filter(f => f !== fn); }
      },
      onInstalled: { addListener: () => {} },
      openOptionsPage: () => {}
    },
    storage: {
      local: {
        get: (keys, cb) => {
          if (!keys) {
            const all = {};
            storageData.forEach((v, k) => all[k] = v);
            if (cb) cb(all);
            return;
          }
          const keyArray = Array.isArray(keys) ? keys : [keys];
          const res = {};
          keyArray.forEach(k => { if (storageData.has(k)) res[k] = storageData.get(k); });
          if (cb) cb(res);
        },
        set: (items, cb) => {
          Object.entries(items).forEach(([k, v]) => storageData.set(k, v));
          if (cb) cb();
        },
        remove: (keys, cb) => {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          keyArray.forEach(k => storageData.delete(k));
          if (cb) cb();
        },
        clear: (cb) => {
          storageData.clear();
          if (cb) cb();
        }
      },
      onChanged: {
        addListener: (fn) => listeners.onChanged.push(fn)
      }
    },
    alarms: {
      create: () => {},
      getAll: async () => [],
      clear: async () => true,
      clearAll: (cb) => { if (cb) cb(); },
      onAlarm: { addListener: (fn) => listeners.onAlarm.push(fn) }
    },
    notifications: {
      create: (id, options, cb) => { if (cb) cb(id); }
    },
    tabs: {
      query: (opts, cb) => { if (cb) cb([{ id: 1, url: 'https://gall.dcinside.com' }]); },
      sendMessage: (id, msg, cb) => {
        // Simulate real Chrome behavior: sending to a closed/nonexistent tab
        // sets chrome.runtime.lastError instead of invoking the callback with data.
        if (id !== 1) {
          global.chrome.runtime.lastError = { message: `Could not establish connection. Receiving end does not exist (tabId: ${id}).` };
          if (cb) cb(undefined);
          global.chrome.runtime.lastError = null;
          return;
        }
        if (cb) cb({ success: true });
      }
    },
    sidePanel: {
      open: () => Promise.resolve()
    }
  };
}
