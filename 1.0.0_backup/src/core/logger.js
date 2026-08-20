/**
 * Logger Core Module for DC Ultimate
 */

export const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };

const MAX_PERSISTED_LOGS = 200;
const PERSIST_STORAGE_KEY = 'dc_ultimate_diagnostic_logs';

export class Logger {
  constructor(tag = 'DCUltimate', level = LOG_LEVELS.INFO) {
    this.tag = tag;
    this.level = level;
    this.enabled = true;
    this._persistBuffer = [];
    this._persistScheduled = false;
  }

  setLevel(level) {
    if (typeof level === 'number' && level >= LOG_LEVELS.DEBUG && level <= LOG_LEVELS.NONE) {
      this.level = level;
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  _formatMessage(levelStr, message, extra) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.tag}] [${levelStr}]`;
    return { prefix, message, extra, timestamp };
  }

  debug(message, ...extra) {
    if (!this.enabled || this.level > LOG_LEVELS.DEBUG) return;
    const f = this._formatMessage('DEBUG', message, extra);
    console.debug(f.prefix, f.message, ...extra);
  }

  info(message, ...extra) {
    if (!this.enabled || this.level > LOG_LEVELS.INFO) return;
    const f = this._formatMessage('INFO', message, extra);
    console.info(f.prefix, f.message, ...extra);
  }

  warn(message, ...extra) {
    if (!this.enabled || this.level > LOG_LEVELS.WARN) return;
    const f = this._formatMessage('WARN', message, extra);
    console.warn(f.prefix, f.message, ...extra);
    this._queuePersist('WARN', f);
  }

  error(message, ...extra) {
    if (!this.enabled || this.level > LOG_LEVELS.ERROR) return;
    const f = this._formatMessage('ERROR', message, extra);
    console.error(f.prefix, f.message, ...extra);
    this._queuePersist('ERROR', f);
  }

  _queuePersist(levelStr, formatted) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    this._persistBuffer.push({
      level: levelStr,
      tag: this.tag,
      message: String(formatted.message),
      extra: this._safeStringifyExtra(formatted.extra),
      timestamp: formatted.timestamp
    });

    if (this._persistScheduled) return;
    this._persistScheduled = true;

    setTimeout(() => {
      this._flushPersist();
      this._persistScheduled = false;
    }, 1000);
  }

  _safeStringifyExtra(extra) {
    try {
      return JSON.stringify(extra, (key, val) => {
        if (val instanceof Error) return { message: val.message, stack: val.stack };
        return val;
      }).slice(0, 2000);
    } catch {
      return '[unserializable]';
    }
  }

  _flushPersist() {
    const toWrite = this._persistBuffer.splice(0, this._persistBuffer.length);
    if (toWrite.length === 0) return;

    chrome.storage.local.get(PERSIST_STORAGE_KEY, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) return;

      const existing = (result && result[PERSIST_STORAGE_KEY]) || [];
      const merged = [...existing, ...toWrite].slice(-MAX_PERSISTED_LOGS);

      chrome.storage.local.set({ [PERSIST_STORAGE_KEY]: merged }, () => {
        void chrome.runtime?.lastError;
      });
    });
  }

  static async exportLogs() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve([]);
        return;
      }
      chrome.storage.local.get(PERSIST_STORAGE_KEY, (result) => {
        resolve((result && result[PERSIST_STORAGE_KEY]) || []);
      });
    });
  }

  static async clearLogs() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.remove(PERSIST_STORAGE_KEY, resolve);
    });
  }
}

export const logger = new Logger('DCUltimateCore');
