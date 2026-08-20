/**
 * 아카이브 저장소 (IndexedDB)
 *
 * Lives in the background service worker on purpose: IndexedDB is scoped to an
 * origin, so a database opened from a content script would belong to
 * gall.dcinside.com and the Side Panel could never read it. Content scripts
 * therefore send what they see through messages and everything is stored once,
 * in the extension's own origin.
 *
 * Stores
 *   posts    — 목록/본문에서 수집한 게시글 (key: `${galleryId}:${postId}`)
 *   comments — 본문 페이지에서 수집한 댓글   (key: `${galleryId}:${postId}:${commentId}`)
 */
import { logger } from '../logger.js';
import { userKeyOf } from '../identity.js';

const DB_NAME = 'dc_ultimate_archive';
const DB_VERSION = 1;

export const STORE_POSTS = 'posts';
export const STORE_COMMENTS = 'comments';

/** 보관 한도: 오래되거나 넘치는 항목은 정리한다. */
export const RETENTION = {
  maxPosts: 8000,
  maxComments: 40000,
  maxAgeMs: 45 * 24 * 60 * 60 * 1000
};

export class ArchiveDB {
  constructor() {
    this._dbPromise = null;
  }

  get available() {
    return typeof indexedDB !== 'undefined';
  }

  /**
   * @returns {Promise<IDBDatabase|null>}
   */
  open() {
    if (!this.available) return Promise.resolve(null);
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_POSTS)) {
          const posts = db.createObjectStore(STORE_POSTS, { keyPath: 'key' });
          posts.createIndex('galleryId', 'galleryId');
          posts.createIndex('capturedAt', 'capturedAt');
          posts.createIndex('galleryAuthor', ['galleryId', 'authorKey']);
          posts.createIndex('postNo', ['galleryId', 'postNo']);
        }

        if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
          const comments = db.createObjectStore(STORE_COMMENTS, { keyPath: 'key' });
          comments.createIndex('galleryId', 'galleryId');
          comments.createIndex('post', ['galleryId', 'postId']);
          comments.createIndex('capturedAt', 'capturedAt');
          comments.createIndex('galleryAuthor', ['galleryId', 'authorKey']);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        logger.warn('ArchiveDB: failed to open IndexedDB:', request.error);
        resolve(null);
      };
    });

    return this._dbPromise;
  }

  /**
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @param {(store: IDBObjectStore) => IDBRequest|void} work
   * @returns {Promise<*>}
   */
  async _tx(storeName, mode, work) {
    const db = await this.open();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;

      try {
        const request = work(store);
        if (request) request.onsuccess = () => { result = request.result; };
      } catch (err) {
        reject(err);
        return;
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * 작성자를 하나의 키로 정규화 (고닉·반고닉은 uid, 유동닉은 IP).
   *
   * 반고닉도 uid 를 가지므로 닉네임이 `ㅇㅇ`처럼 겹쳐도 개인별로 갈라진다.
   * @param {{authorId?: string, ip?: string, author?: string}} item
   * @returns {string}
   */
  static authorKeyOf(item = {}) {
    return userKeyOf({ uid: item.authorId, ip: item.ip, nick: item.author });
  }

  /**
   * 게시글 여러 건을 저장한다. 이미 있으면 더 자세한 쪽(본문 포함)을 유지한다.
   * @param {Array<Object>} posts
   * @returns {Promise<number>} 저장된 건수
   */
  async putPosts(posts) {
    const list = (posts || []).filter(post => post && post.galleryId && post.id);
    if (list.length === 0) return 0;

    const db = await this.open();
    if (!db) return 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_POSTS, 'readwrite');
      const store = tx.objectStore(STORE_POSTS);
      let saved = 0;

      for (const post of list) {
        const key = `${post.galleryId}:${post.id}`;
        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
          const previous = getRequest.result;
          const record = {
            key,
            galleryId: post.galleryId,
            postId: String(post.id),
            postNo: parseInt(post.id, 10) || 0,
            title: post.title || previous?.title || '',
            author: post.author || previous?.author || '',
            authorId: post.authorId || previous?.authorId || '',
            ip: post.ip || previous?.ip || '',
            authorKey: ArchiveDB.authorKeyOf(post.authorId || post.ip ? post : (previous || post)),
            date: post.date || previous?.date || null,
            url: post.url || previous?.url || '',
            views: post.views ?? previous?.views ?? 0,
            recommendations: post.recommendations ?? previous?.recommendations ?? 0,
            comments: post.comments ?? previous?.comments ?? 0,
            // 본문은 상세 페이지에서만 얻을 수 있으므로 기존 값을 덮어쓰지 않는다.
            body: post.body || previous?.body || '',
            media: post.media && post.media.length ? post.media : (previous?.media || []),
            capturedAt: previous?.capturedAt || Date.now(),
            updatedAt: Date.now()
          };
          store.put(record);
          saved++;
        };
      }

      tx.oncomplete = () => resolve(saved);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * @param {string} galleryId
   * @param {string} postId
   * @returns {Promise<Object|null>}
   */
  async getPost(galleryId, postId) {
    return this._tx(STORE_POSTS, 'readonly', store => store.get(`${galleryId}:${postId}`));
  }

  /**
   * @param {Array<Object>} comments
   * @returns {Promise<number>}
   */
  async putComments(comments) {
    const list = (comments || []).filter(c => c && c.galleryId && c.postId && c.id);
    if (list.length === 0) return 0;

    const db = await this.open();
    if (!db) return 0;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COMMENTS, 'readwrite');
      const store = tx.objectStore(STORE_COMMENTS);

      for (const comment of list) {
        store.put({
          key: `${comment.galleryId}:${comment.postId}:${comment.id}`,
          galleryId: comment.galleryId,
          postId: String(comment.postId),
          commentId: String(comment.id),
          author: comment.author || '',
          authorId: comment.authorId || '',
          ip: comment.ip || '',
          authorKey: ArchiveDB.authorKeyOf(comment),
          content: comment.content || '',
          date: comment.date || null,
          parentId: comment.parentId || null,
          isReply: Boolean(comment.isReply),
          capturedAt: Date.now()
        });
      }

      tx.oncomplete = () => resolve(list.length);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * @param {string} galleryId
   * @param {string} postId
   * @returns {Promise<Array<Object>>}
   */
  async getComments(galleryId, postId) {
    const db = await this.open();
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_COMMENTS, 'readonly');
      const index = tx.objectStore(STORE_COMMENTS).index('post');
      const request = index.getAll([galleryId, String(postId)]);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 최근 수집한 게시글 (최신순).
   * @param {string} galleryId
   * @param {number} [limit=500]
   * @returns {Promise<Array<Object>>}
   */
  async recentPosts(galleryId, limit = 500) {
    const db = await this.open();
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_POSTS, 'readonly');
      const index = tx.objectStore(STORE_POSTS).index('galleryId');
      const request = index.getAll(galleryId);
      request.onsuccess = () => {
        const rows = (request.result || []).sort((a, b) => (b.postNo || 0) - (a.postNo || 0));
        resolve(rows.slice(0, limit));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 한 유저(고닉/유동)의 글과 댓글.
   * @param {string} galleryId
   * @param {string} authorKey
   * @returns {Promise<{posts: Array<Object>, comments: Array<Object>}>}
   */
  async userActivity(galleryId, authorKey) {
    const db = await this.open();
    if (!db) return { posts: [], comments: [] };

    const read = (storeName) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).index('galleryAuthor').getAll([galleryId, authorKey]);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    const [posts, comments] = await Promise.all([read(STORE_POSTS), read(STORE_COMMENTS)]);
    return { posts, comments };
  }

  /**
   * 한 갤러리에서 특정 닉네임으로 관측된 글·댓글.
   *
   * `nick` 규칙이 실제로 몇 명에게 걸리는지 세기 위한 조회다 (`nicknameHolders`).
   * 닉네임 자체는 인덱스가 아니므로 갤러리 인덱스로 읽고 메모리에서 걸러낸다 —
   * `recentPosts()` 와 같은 방식이다.
   *
   * @param {string} galleryId
   * @param {string} nickname
   * @returns {Promise<Array<Object>>}
   */
  async nicknameActivity(galleryId, nickname) {
    const want = String(nickname || '').trim();
    if (!galleryId || !want) return [];

    const db = await this.open();
    if (!db) return [];

    const read = (storeName) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).index('galleryId').getAll(galleryId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    const [posts, comments] = await Promise.all([read(STORE_POSTS), read(STORE_COMMENTS)]);
    return [...posts, ...comments].filter(row => String(row.author || '').trim() === want);
  }

  /**
   * @returns {Promise<{posts: number, comments: number, galleries: number}>}
   */
  async stats() {
    const db = await this.open();
    if (!db) return { posts: 0, comments: 0, galleries: 0 };

    const count = (storeName) => new Promise((resolve) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    });

    // 서로 다른 갤러리 수: 인덱스 키를 unique 커서로 훑는다
    // (index.getAllKeys()는 기본키를 돌려주므로 갤러리 수 계산에 쓸 수 없다).
    const galleries = await new Promise((resolve) => {
      const request = db.transaction(STORE_POSTS, 'readonly')
        .objectStore(STORE_POSTS).index('galleryId').openKeyCursor(null, 'nextunique');
      let distinct = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(distinct);
        distinct++;
        cursor.continue();
      };
      request.onerror = () => resolve(0);
    });

    const [posts, comments] = await Promise.all([count(STORE_POSTS), count(STORE_COMMENTS)]);
    return { posts, comments, galleries };
  }

  /**
   * 오래되었거나 한도를 넘은 항목을 정리한다.
   * @returns {Promise<{posts: number, comments: number}>} 삭제 건수
   */
  async prune() {
    const db = await this.open();
    if (!db) return { posts: 0, comments: 0 };

    const cutoff = Date.now() - RETENTION.maxAgeMs;

    const pruneStore = (storeName, maxRows) => new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.index('capturedAt').getAll();
      let removed = 0;

      request.onsuccess = () => {
        const rows = request.result || [];
        const old = rows.filter(row => (row.capturedAt || 0) < cutoff);
        const excess = rows.length - old.length > maxRows
          ? rows.filter(row => (row.capturedAt || 0) >= cutoff)
              .sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0))
              .slice(0, rows.length - old.length - maxRows)
          : [];

        [...old, ...excess].forEach(row => {
          store.delete(row.key);
          removed++;
        });
      };

      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => resolve(removed);
    });

    const posts = await pruneStore(STORE_POSTS, RETENTION.maxPosts);
    const comments = await pruneStore(STORE_COMMENTS, RETENTION.maxComments);

    if (posts || comments) {
      logger.info(`ArchiveDB: pruned ${posts} post(s) and ${comments} comment(s).`);
    }
    return { posts, comments };
  }

  /**
   * @param {string} [galleryId] 생략하면 전체 삭제
   */
  async clear(galleryId = null) {
    const db = await this.open();
    if (!db) return;

    const clearStore = (storeName) => new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (!galleryId) {
        store.clear();
      } else {
        const request = store.index('galleryId').getAllKeys(galleryId);
        request.onsuccess = () => (request.result || []).forEach(key => store.delete(key));
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    await clearStore(STORE_POSTS);
    await clearStore(STORE_COMMENTS);
  }
}

export const archiveDB = new ArchiveDB();
