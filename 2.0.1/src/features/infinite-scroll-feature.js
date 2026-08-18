/**
 * InfiniteScrollFeature — 무한 스크롤 및 프리페칭
 *
 * When the list bottom comes into view the next page is fetched in the
 * background and its rows are appended to the current table. The page after
 * that is prefetched into memory so the next append is instant.
 *
 * The next-page URL is derived from the current URL (`&page=N`) rather than
 * from the paging widget, because DC renders that widget with JavaScript and
 * it is not always present when the observer first runs.
 */
import { BaseFeature } from './base-feature.js';
import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';
import { eventBus } from '../core/event-bus.js';

export class InfiniteScrollFeature extends BaseFeature {
  constructor() {
    super('enableInfiniteScroll', 'Infinite Scroll', '목록 무한 스크롤 및 다음 페이지 프리페치');
    this.observer = null;
    this.sentinel = null;
    this.currentPage = 1;
    this.loading = false;
    this.exhausted = false;
    this.prefetched = new Map(); // page -> Promise<string html>
    this.appendedPages = 0;
  }

  get maxPages() {
    return Number(configManager.get('infiniteScrollMaxPages')) || 10;
  }

  async onEnable() {
    this.setup();
  }

  async onDisable() {
    this._teardown();
  }

  onPageChange(pageInfo) {
    this._teardown();
    if (!pageInfo || !(pageInfo.isList || String(pageInfo.type || '').includes('GALLERY'))) return;
    this.setup();
  }

  setup() {
    if (!this.enabled) return;
    const tbody = document.querySelector('.gall_list tbody, table.gall_list tbody');
    if (!tbody || typeof IntersectionObserver === 'undefined') return;

    const url = new URL(window.location.href);
    if (!/\/board\/lists\//.test(url.pathname)) return;

    this.currentPage = parseInt(url.searchParams.get('page') || '1', 10) || 1;
    this.exhausted = false;
    this.appendedPages = 0;

    this.sentinel = document.createElement('div');
    this.sentinel.className = 'dcu-infinite-sentinel';
    this.sentinel.textContent = '';
    const table = document.querySelector('.gall_list');
    (table?.parentElement || document.body).insertBefore(this.sentinel, table?.nextSibling || null);

    this.observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        this.loadNext().catch(err => logger.warn('InfiniteScroll: load failed:', err));
      }
    }, { rootMargin: '400px' });

    this.observer.observe(this.sentinel);
    this._prefetch(this.currentPage + 1);
  }

  _teardown() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.sentinel?.remove();
    this.sentinel = null;
    this.prefetched.clear();
    this.loading = false;
  }

  _pageUrl(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', String(page));
    return url.toString();
  }

  /**
   * Warms the cache for a page without touching the DOM.
   * @param {number} page
   */
  _prefetch(page) {
    if (this.prefetched.has(page) || page > this.currentPage + this.maxPages) return;
    const promise = fetch(this._pageUrl(page), { credentials: 'include' })
      .then(res => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .catch(err => {
        this.prefetched.delete(page);
        throw err;
      });
    this.prefetched.set(page, promise);
  }

  async loadNext() {
    if (this.loading || this.exhausted || !this.enabled) return;
    if (this.appendedPages >= this.maxPages) {
      this._setSentinel(`무한 스크롤 최대 ${this.maxPages}페이지까지 불러왔습니다.`);
      this.exhausted = true;
      return;
    }

    this.loading = true;
    const nextPage = this.currentPage + 1;
    this._setSentinel('다음 페이지 불러오는 중...');

    try {
      if (!this.prefetched.has(nextPage)) this._prefetch(nextPage);
      const html = await this.prefetched.get(nextPage);

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = Array.from(doc.querySelectorAll('.gall_list tbody tr.ub-content.us-post'));

      if (rows.length === 0) {
        this.exhausted = true;
        this._setSentinel('마지막 페이지입니다.');
        return;
      }

      const tbody = document.querySelector('.gall_list tbody, table.gall_list tbody');
      if (!tbody) return;

      const existing = new Set(
        Array.from(tbody.querySelectorAll('tr.ub-content.us-post')).map(r => r.getAttribute('data-no'))
      );

      const divider = document.createElement('tr');
      divider.className = 'dcu-page-divider';
      const columns = document.querySelector('.gall_list thead tr')?.children.length || 6;
      divider.innerHTML = `<td colspan="${columns}">${nextPage} 페이지</td>`;
      tbody.appendChild(divider);

      let appended = 0;
      for (const row of rows) {
        if (existing.has(row.getAttribute('data-no'))) continue;
        tbody.appendChild(document.importNode(row, true));
        appended++;
      }

      this.currentPage = nextPage;
      this.appendedPages++;
      this.prefetched.delete(nextPage);
      this._setSentinel('');

      logger.info(`InfiniteScroll: appended ${appended} row(s) from page ${nextPage}.`);

      // Let the other features (block/spam/highlight) process the new rows.
      eventBus.emit('dom:articles_added', { source: 'infinite-scroll', count: appended });

      this._prefetch(nextPage + 1);
    } catch (err) {
      // 안내가 '불러오는 중...'으로 굳지 않도록 실패를 표시하고 다시 시도할 수 있게 둔다.
      this.prefetched.delete(nextPage);
      this._setSentinel('다음 페이지를 불러오지 못했습니다. 스크롤하면 다시 시도합니다.');
      throw err;
    } finally {
      this.loading = false;
    }
  }

  _setSentinel(text) {
    if (this.sentinel) this.sentinel.textContent = text;
  }
}

export const infiniteScrollFeature = new InfiniteScrollFeature();
