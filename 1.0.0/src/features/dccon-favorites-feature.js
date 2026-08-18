/**
 * DcconFavoritesFeature — 디시콘 즐겨찾기 및 단축 입력
 *
 * Records which dccons you actually use, pins the favourites into a strip
 * above the comment box, and adds a `/이름` slash command that filters them.
 *
 * Insertion deliberately drives DCInside's own picker instead of writing into
 * the comment payload: a dccon is posted through DC's internal state
 * (package_idx / detail_idx), so clicking their button is the only way to send
 * a valid one. Verified live markup:
 *   button.tx_dccon                        — opens the picker (#div_con)
 *   #div_con button.dccon_btn[package_idx] — package tab
 *   #div_con button.img_dccon[detail_idx]  — a single dccon
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { escapeHTML } from '../utils/sanitizer.js';
import { dcconStore } from '../core/dccon/dccon-store.js';

const PICKER_ID = 'div_con';

export class DcconFavoritesFeature extends BaseFeature {
  constructor() {
    super('enableDcconFavorites', 'Dccon Favorites', '디시콘 즐겨찾기 및 /단축 입력');
    this.favorites = [];
    this.bar = null;
    this.palette = null;
    this.activeInput = null;
    this._clickHandler = null;
    this._inputHandler = null;
  }

  async _init() {
    this.favorites = await dcconStore.list();
  }

  async onEnable() {
    this.favorites = await dcconStore.list();
    this._bindUsageCapture();
    this._bindSlashCommand();
    this.renderBar();
  }

  async onDisable() {
    if (this._clickHandler) document.removeEventListener('click', this._clickHandler, true);
    if (this._inputHandler) document.removeEventListener('input', this._inputHandler, true);
    this._clickHandler = null;
    this._inputHandler = null;
    this.bar?.remove();
    this.bar = null;
    this._closePalette();
  }

  onPageChange() {
    this.renderBar();
  }

  async refresh() {
    this.favorites = await dcconStore.list();
    this.renderBar();
  }

  /**
   * Every dccon the user picks is counted, so the bar reflects real usage.
   */
  _bindUsageCapture() {
    this._clickHandler = (event) => {
      const button = event.target && event.target.closest
        ? event.target.closest(`#${PICKER_ID} button.img_dccon[detail_idx]`)
        : null;
      if (!button) return;

      const dccon = {
        detailIdx: button.getAttribute('detail_idx'),
        packageIdx: button.getAttribute('package_idx'),
        title: button.getAttribute('title') || '',
        img: button.querySelector('img')?.getAttribute('src') || ''
      };

      dcconStore.recordUse(dccon)
        .then(() => this.refresh())
        .catch(err => logger.debug('DcconFavorites: failed to record use:', err));
    };

    document.addEventListener('click', this._clickHandler, true);
  }

  /**
   * `/이름` inside the comment box (or the editor) opens a filtered palette.
   */
  _bindSlashCommand() {
    this._inputHandler = (event) => {
      const target = event.target;
      if (!target) return;

      const isCommentBox = target.matches && target.matches('textarea[id^="memo_"], textarea[name="memo"], .note-editable');
      if (!isCommentBox) return;

      const text = target.value !== undefined ? target.value : (target.textContent || '');
      const match = text.match(/(?:^|\s)\/([^\s/]{0,20})$/);

      if (!match) {
        this._closePalette();
        return;
      }

      this.activeInput = target;
      this._openPalette(target, match[1] || '');
    };

    document.addEventListener('input', this._inputHandler, true);
  }

  /**
   * Pinned strip under the comment write box.
   */
  renderBar() {
    if (!this.enabled) return;

    const pinned = this.favorites.filter(f => f.pinned).slice(0, 12);
    const anchor = document.querySelector('.cmt_write_box .fl, .cmt_write_box');
    if (!anchor || pinned.length === 0) {
      this.bar?.remove();
      this.bar = null;
      return;
    }

    if (!this.bar || !this.bar.isConnected) {
      this.bar = document.createElement('div');
      this.bar.className = 'dcu-dccon-bar';
      anchor.appendChild(this.bar);
    }

    this.bar.innerHTML = pinned.map(fav => `
      <button type="button" class="dcu-dccon-item" data-detail="${escapeHTML(fav.detailIdx)}" data-package="${escapeHTML(fav.packageIdx)}" title="${escapeHTML(fav.title)}">
        <img src="${escapeHTML(fav.img)}" alt="${escapeHTML(fav.title)}" loading="lazy">
      </button>`).join('');

    this.bar.querySelectorAll('.dcu-dccon-item').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        this.insert({
          detailIdx: button.dataset.detail,
          packageIdx: button.dataset.package
        });
      });
    });
  }

  _openPalette(input, query) {
    const matches = this.favorites
      .filter(fav => !query || fav.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);

    if (matches.length === 0) {
      this._closePalette();
      return;
    }

    if (!this.palette) {
      this.palette = document.createElement('div');
      this.palette.className = 'dcu-dccon-palette';
      document.body.appendChild(this.palette);
    }

    this.palette.innerHTML = matches.map((fav, index) => `
      <button type="button" class="dcu-dccon-suggestion${index === 0 ? ' active' : ''}" data-detail="${escapeHTML(fav.detailIdx)}" data-package="${escapeHTML(fav.packageIdx)}">
        <img src="${escapeHTML(fav.img)}" alt=""><span>${escapeHTML(fav.title || '(이름 없음)')}</span>
      </button>`).join('');

    const rect = input.getBoundingClientRect();
    this.palette.style.top = `${window.scrollY + rect.top - 8}px`;
    this.palette.style.left = `${window.scrollX + rect.left}px`;
    this.palette.classList.add('visible');

    this.palette.querySelectorAll('.dcu-dccon-suggestion').forEach(button => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this._stripSlashQuery(input);
        this.insert({ detailIdx: button.dataset.detail, packageIdx: button.dataset.package });
        this._closePalette();
      });
    });
  }

  _closePalette() {
    if (!this.palette) return;
    this.palette.classList.remove('visible');
    this.palette.innerHTML = '';
  }

  _stripSlashQuery(input) {
    if (input.value !== undefined) {
      input.value = input.value.replace(/(?:^|\s)\/[^\s/]{0,20}$/, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      input.textContent = (input.textContent || '').replace(/(?:^|\s)\/[^\s/]{0,20}$/, '');
    }
  }

  /**
   * Inserts a dccon by replaying the clicks DCInside's own picker expects.
   * @param {{detailIdx: string, packageIdx: string}} target
   * @returns {Promise<boolean>}
   */
  async insert({ detailIdx, packageIdx }) {
    if (!detailIdx) return false;

    const openButton = document.querySelector('button.tx_dccon, .btn_dccon');
    const picker = () => document.getElementById(PICKER_ID);

    if (!picker() || getComputedStyle(picker()).display === 'none') {
      openButton?.click();
      await this._wait(() => picker() && getComputedStyle(picker()).display !== 'none', 2000);
    }

    const root = picker();
    if (!root) {
      logger.warn('DcconFavorites: dccon picker unavailable.');
      return false;
    }

    let item = root.querySelector(`button.img_dccon[detail_idx="${detailIdx}"]`);
    if (!item && packageIdx) {
      root.querySelector(`button.dccon_btn[package_idx="${packageIdx}"]`)?.click();
      await this._wait(() => root.querySelector(`button.img_dccon[detail_idx="${detailIdx}"]`), 2500);
      item = root.querySelector(`button.img_dccon[detail_idx="${detailIdx}"]`);
    }

    if (!item) {
      logger.warn(`DcconFavorites: dccon ${detailIdx} not found in the picker.`);
      return false;
    }

    item.click(); // DC's own handler performs the actual insertion
    return true;
  }

  _wait(predicate, timeoutMs) {
    return new Promise(resolve => {
      const started = Date.now();
      const tick = () => {
        if (predicate()) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }
}

export const dcconFavoritesFeature = new DcconFavoritesFeature();
