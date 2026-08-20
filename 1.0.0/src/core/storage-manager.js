/**
 * StorageManager Core Module for DC Ultimate
 * Provides schema-versioned, migration-supported storage wrapper over chrome.storage.local
 */
import { logger } from './logger.js';
import { eventBus } from './event-bus.js';
import { compareVersions } from '../utils/version-compare.js';

export const CURRENT_SCHEMA_VERSION = '2.0.2';

export const INITIAL_STORAGE_SCHEMA = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  settings: {
    theme: 'system', // 'light', 'dark', 'system'
    syncDcDarkMode: true, // Mirror the extension theme onto DCInside's 야간모드
    openSidePanelOnActionClick: false, // 툴바 아이콘 클릭 시 팝업 대신 사이드 패널
    autoRefreshInterval: 0, // 0 = disabled
    testFeature: true,
    enableHoverPreview: true,
    enableReadingLayout: false,
    hideAdWings: false, // 좌우 날개 광고 숨김. OFF 면 디씨 원본 가로 스크롤이 유지된다
    enableNavigationShortcuts: true,
    enableUrlRedirect: false,
    enableSearchEngine: true,
    enableUserNotes: true,
    enableCommentTools: true,
    enableMediaTools: true,
    enableAutomation: true,
    enableAIFeatures: true,
    enableCleanUI: false,
    soundNotifications: false,
    enableAutoSignature: false,

    // Phase 21: 유저 차단 / 도배 필터 / 작성 편의 / 목록 보기
    enableUserBlock: true,
    enableSpamFilter: true,
    enableDraftAutosave: true,
    enableDcconFavorites: true,
    enableMarkdownCode: true,
    enableInfiniteScroll: true,
    enableHotHighlight: true,
    spamDuplicateThreshold: 3,
    spamSpecialCharRatio: 0.6,
    spamRepeatedCharRun: 6,
    spamPatterns: [],
    hotRecommendThreshold: 10,
    hotCommentThreshold: 20,
    hotBlazingMultiplier: 3,
    infiniteScrollMaxPages: 10,
    draftAutosaveIntervalSec: 10,
    markdownRenderPosts: true,
    spActiveView: 'search',
    spTileOrder: null, // null = 기본 순서. 배열이면 사용자가 드래그로 지정한 순서

    // 유저 규칙 추가 폼의 기본 대상. `uid` 는 고닉·반고닉을 개인 단위로 집으므로
    // 오차단이 없다. `nick` 은 `ㅇㅇ` 처럼 겹치는 닉네임에 여러 명이 함께 걸린다.
    // 사용자가 폼에서 대상을 바꾸면 그 선택이 다음 기본값으로 기억된다.
    defaultUserRuleType: 'uid',

    // 자짤(자동 첨부) 다중 이미지
    autoSigMode: 'random', // 'random' | 'single' | 'gallery'
    autoSigSelectedId: null,
    autoSigGalleryMap: {},

    // Phase 22: 아카이빙 / 가독성 / 유저 분석
    enableArchiveCache: true,
    enableArchiveCapture: true,
    enableCommentTree: true, // 글쓴이 댓글 강조 (2.0.2에서 대댓글 재정렬은 제거됨)
    enableUserAnalytics: true,
    archiveDefaultMode: 'cache', // 'cache' | 'image' | 'pdf' | 'archive-today'
    analyticsSampleSize: 200,

    // 2.0.2: 미리보기 팝업 세부 설정 (이전에는 전부 하드코딩이었다)
    previewDelayMs: 300,
    previewBodyChars: 200,
    previewThumbCount: 4,
    previewCacheTtlMin: 10
  },
  dc_auto_sig_images: [],
  dc_user_rules: [],
  dc_dccon_favorites: [],
  dc_drafts: {},
  autoSignatureImage: null,
  galleryProfiles: {},
  filters: {
    rules: []
  },
  // 예전 유저 메모 저장소. 메모의 정본은 `dc_user_rules` 로 옮겨졌고, 여기 남은 값은
  // `UserNotesFeature.migrateFromLegacyNotes()` 가 흡수한 뒤 비운다 (백업 복원 대비).
  userNotes: {},
  bookmarks: [],
  searchProfiles: [],
  searchHistory: [],
  automationRules: [],
  statistics: {
    postsViewed: 0,
    commentsViewed: 0,
    filteredCount: 0,
    startTime: Date.now()
  },
  aiSettings: {
    enabled: false,
    provider: 'local',
    apiKey: '',
    endpoint: ''
  }
};

export class StorageManager {
  constructor() {
    this.memoryFallback = new Map();
    this.isChromeStorageAvailable = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    this._initStorageChangeListener();
  }

  /**
   * Initialize storage and perform schema migration if necessary
   */
  async init() {
    try {
      const data = await this.getAll();
      if (!data.schemaVersion) {
        logger.info('StorageManager: Initializing default storage schema...');
        await this.setAll(INITIAL_STORAGE_SCHEMA);
      } else if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        await this._migrate(data);
      }
      logger.info('StorageManager: Initialized successfully.');
    } catch (err) {
      logger.error('StorageManager: Failed to initialize storage:', err);
    }
  }

  /**
   * Migrate storage from older versions
   * @param {Object} currentData Raw stored data
   */
  async _migrate(currentData) {
    const fromVersion = currentData.schemaVersion || '0.0.0';
    logger.info(`StorageManager: Migrating storage from ${fromVersion} to ${CURRENT_SCHEMA_VERSION}`);
    
    let updated = { ...INITIAL_STORAGE_SCHEMA, ...currentData };

    const MIGRATION_STEPS = [
      {
        upTo: '1.0.0',
        migrate: (data) => {
          return data;
        }
      },
      {
        // 2.0.0: 새 기능 기본값을 채우고, 단일 자짤을 목록형으로 옮길 자리를
        // 마련한다(실제 이관은 SignatureStore가 처음 읽을 때 수행).
        upTo: '2.0.0',
        migrate: (data) => {
          const settings = { ...INITIAL_STORAGE_SCHEMA.settings, ...(data.settings || {}) };
          return {
            ...data,
            settings,
            dc_user_rules: Array.isArray(data.dc_user_rules) ? data.dc_user_rules : [],
            dc_dccon_favorites: Array.isArray(data.dc_dccon_favorites) ? data.dc_dccon_favorites : [],
            dc_auto_sig_images: Array.isArray(data.dc_auto_sig_images) ? data.dc_auto_sig_images : [],
            dc_drafts: data.dc_drafts && typeof data.dc_drafts === 'object' ? data.dc_drafts : {}
          };
        }
      },
      {
        // 2.0.2: 대댓글 재정렬 기능을 제거했다. `commentTreeEnabled` 는
        // `enableCommentTree` 와 중복된 유령 키였으므로 걷어낸다. 재정렬을 일부러
        // 껐던 사용자가 있으므로, 그 값이 false 였으면 강조 기능도 꺼진 채로 둔다.
        upTo: '2.0.2',
        migrate: (data) => {
          const settings = { ...INITIAL_STORAGE_SCHEMA.settings, ...(data.settings || {}) };
          if (settings.commentTreeEnabled === false && settings.enableCommentTree !== false) {
            settings.enableCommentTree = false;
          }
          delete settings.commentTreeEnabled;
          return { ...data, settings };
        }
      }
    ];

    try {
      for (const step of MIGRATION_STEPS) {
        if (compareVersions(fromVersion, step.upTo) < 0) {
          logger.info(`StorageManager: Applying migration step up to ${step.upTo}`);
          updated = step.migrate(updated);
        }
      }
      updated.schemaVersion = CURRENT_SCHEMA_VERSION;
      await this.setAll(updated);
      logger.info('StorageManager: Storage migration complete.');
    } catch (err) {
      logger.error('StorageManager: Migration failed — original data preserved, schemaVersion unchanged:', err);
      throw err;
    }
  }

  /**
   * Get single or multiple keys from storage
   * @param {string|string[]} keys Key or array of keys
   * @returns {Promise<Object>} Value map
   */
  async get(keys) {
    return new Promise((resolve) => {
      if (this.isChromeStorageAvailable) {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logger.error('StorageManager get error:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result || {});
          }
        });
      } else {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const res = {};
        keyArray.forEach(k => {
          if (this.memoryFallback.has(k)) {
            res[k] = this.memoryFallback.get(k);
          } else if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(`dc_ultimate_${k}`);
            if (raw !== null) {
              try { res[k] = JSON.parse(raw); } catch { res[k] = raw; }
            }
          }
        });
        resolve(res);
      }
    });
  }

  /**
   * Get all storage content
   * @returns {Promise<Object>} Entire storage object
   */
  async getAll() {
    return new Promise((resolve) => {
      if (this.isChromeStorageAvailable) {
        chrome.storage.local.get(null, (result) => {
          resolve(result || {});
        });
      } else {
        const res = {};
        this.memoryFallback.forEach((val, key) => { res[key] = val; });
        resolve(res);
      }
    });
  }

  /**
   * Set key-value pairs in storage
   * @param {Object} items Object containing key-value pairs
   * @returns {Promise<void>}
   */
  async set(items) {
    return new Promise((resolve, reject) => {
      if (!items || typeof items !== 'object') {
        return resolve();
      }

      if (this.isChromeStorageAvailable) {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logger.error('StorageManager set error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } else {
        Object.entries(items).forEach(([k, v]) => {
          this.memoryFallback.set(k, v);
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(`dc_ultimate_${k}`, JSON.stringify(v)); } catch {}
          }
        });
        eventBus.emit('storage:changed', items);
        resolve();
      }
    });
  }

  /**
   * Overwrite entire storage
   * @param {Object} fullObject Full storage object
   */
  async setAll(fullObject) {
    if (this.isChromeStorageAvailable) {
      await new Promise((resolve) => chrome.storage.local.clear(resolve));
    } else {
      this.memoryFallback.clear();
    }
    await this.set(fullObject);
  }

  /**
   * Remove specific key from storage
   * @param {string|string[]} keys Key or keys to remove
   */
  async remove(keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    return new Promise((resolve) => {
      if (this.isChromeStorageAvailable) {
        chrome.storage.local.remove(keyArray, resolve);
      } else {
        keyArray.forEach(k => {
          this.memoryFallback.delete(k);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`dc_ultimate_${k}`);
          }
        });
        resolve();
      }
    });
  }

  _initStorageChangeListener() {
    if (this.isChromeStorageAvailable && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          const changeSummary = {};
          Object.keys(changes).forEach(key => {
            changeSummary[key] = changes[key].newValue;
          });
          eventBus.emit('storage:changed', changeSummary);
        }
      });
    }
  }
}

export const storageManager = new StorageManager();
