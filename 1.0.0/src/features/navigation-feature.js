/**
 * NavigationFeature Module for DC Ultimate
 * Keyboard shortcuts navigation, article bookmarking, and recent history tracking
 */
import { BaseFeature } from './base-feature.js';
import { storageManager } from '../core/storage-manager.js';
import { SELECTORS, queryFirst, cleanText } from '../adapters/selectors.js';
import { logger } from '../core/logger.js';

export class NavigationFeature extends BaseFeature {
  constructor() {
    super('enableNavigationShortcuts', 'Keyboard & History Navigation', 'Keyboard shortcuts for prev/next article, paging, and history tracking');
    this.currentIndex = -1;
    this.articlesList = [];
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  async onEnable() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', this._handleKeyDown);
    this.refreshArticleLinks();
  }

  async onDisable() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  async onPageChange(pageInfo) {
    this.refreshArticleLinks();
    if (pageInfo && pageInfo.galleryId) {
      await this.saveRecentGallery(pageInfo.galleryId);
    }
  }

  refreshArticleLinks() {
    if (typeof document === 'undefined') return;
    const links = document.querySelectorAll(SELECTORS.rowTitle);
    this.articlesList = Array.from(links);
  }

  _isInputTarget(target) {
    if (!target) return false;
    const tagName = target.tagName ? target.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || 
           tagName === 'TEXTAREA' || 
           target.isContentEditable || 
           target.classList.contains('write_div');
  }

  _handleKeyDown(e) {
    if (this._isInputTarget(e.target)) return; // Ignore input fields

    switch (e.key.toLowerCase()) {
      case 'j':
        this.navigateArticle(1);
        break;
      case 'k':
        this.navigateArticle(-1);
        break;
      case 'h':
        this.navigatePage(-1);
        break;
      case 'l':
        this.navigatePage(1);
        break;
      case 'b':
        this.bookmarkCurrentArticle();
        break;
    }
  }

  navigateArticle(direction) {
    if (this.articlesList.length === 0) this.refreshArticleLinks();
    if (this.articlesList.length === 0) return;

    this.currentIndex += direction;
    if (this.currentIndex < 0) this.currentIndex = 0;
    if (this.currentIndex >= this.articlesList.length) this.currentIndex = this.articlesList.length - 1;

    const targetLink = this.articlesList[this.currentIndex];
    if (targetLink) {
      targetLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetLink.focus();
    }
  }

  navigatePage(direction) {
    const prevBtn = document.querySelector('.bottom_paging_box .prev, .page_prev');
    const nextBtn = document.querySelector('.bottom_paging_box .next, .page_next');

    if (direction === -1 && prevBtn) {
      prevBtn.click();
    } else if (direction === 1 && nextBtn) {
      nextBtn.click();
    }
  }

  async bookmarkCurrentArticle() {
    const titleElem = queryFirst(document, SELECTORS.articleTitle);
    if (!titleElem) return;

    const bookmark = {
      title: cleanText(titleElem, SELECTORS.articleTitleNoise),
      url: window.location.href,
      date: new Date().toISOString()
    };

    const data = await storageManager.get('bookmarks');
    const bookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
    
    if (!bookmarks.some(b => b.url === bookmark.url)) {
      bookmarks.unshift(bookmark);
      await storageManager.set({ bookmarks: bookmarks.slice(0, 50) });
      logger.info('NavigationFeature: Bookmarked article:', bookmark.title);
      alert('게시글이 북마크에 저장되었습니다!');
    }
  }

  async saveRecentGallery(galleryId) {
    const data = await storageManager.get('searchHistory');
    const history = Array.isArray(data.searchHistory) ? data.searchHistory : [];
    if (!history.includes(galleryId)) {
      history.unshift(galleryId);
      await storageManager.set({ searchHistory: history.slice(0, 20) });
    }
  }
}

export const navigationFeature = new NavigationFeature();
