/**
 * UserBlockFeature — IP/닉네임 메모 및 차단
 *
 * Applies the stored user rules to gallery lists, comment lists and the post
 * view: blocked writers get blinded (foldable), dimmed or hidden, and every
 * matched writer gets a small memo label so they are identifiable at a glance.
 *
 * DCInside writer markup (verified live):
 *   <span class="gall_writer ub-writer" data-nick="…" data-uid="…" data-ip="…">
 * Lists use `tr.ub-content`, comments use `.cmt_list li.ub-content`.
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { escapeHTML } from '../utils/sanitizer.js';
import {
  userRuleManager,
  findMatchingRule,
  USER_RULE_ACTIONS,
  USER_RULE_TYPES
} from '../core/filters/user-rule-manager.js';

const PROCESSED_ATTR = 'data-dcu-user-checked';

export class UserBlockFeature extends BaseFeature {
  constructor() {
    super('enableUserBlock', 'User Memo & Block', 'IP/닉네임 메모 및 자동 블라인드');
    this.galleryId = '';
    this.rules = [];
    this.pendingHits = {};
    this._flushTimer = null;
  }

  async _init() {
    this.rules = await userRuleManager.load(true);
  }

  async onEnable() {
    await this.refreshRules();
    this.apply();
  }

  async onDisable() {
    document.querySelectorAll('[data-dcu-blinded="true"]').forEach(el => this._restore(el));
    document.querySelectorAll('.dcu-memo-label').forEach(el => el.remove());
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
  }

  onPageChange(pageInfo) {
    this.galleryId = (pageInfo && pageInfo.galleryId) || '';
    this.apply();
  }

  async refreshRules() {
    this.rules = await userRuleManager.load(true);
    // Re-evaluate everything: a rule may have been removed.
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
    document.querySelectorAll('[data-dcu-blinded="true"]').forEach(el => this._restore(el));
    document.querySelectorAll('.dcu-memo-label').forEach(el => el.remove());
    this.apply();
  }

  /**
   * Scans the current DOM and applies rules to anything not yet processed.
   * Safe to call repeatedly (DOMObserver calls it on mutations).
   */
  apply() {
    if (!this.enabled || this.rules.length === 0) return;

    const containers = document.querySelectorAll(
      `tr.ub-content:not([${PROCESSED_ATTR}]), .cmt_list li.ub-content:not([${PROCESSED_ATTR}]), .gallview_head:not([${PROCESSED_ATTR}])`
    );

    containers.forEach(container => {
      container.setAttribute(PROCESSED_ATTR, '1');

      const writer = container.querySelector('.gall_writer, .ub-writer');
      if (!writer) return;

      const user = {
        nick: writer.getAttribute('data-nick') || '',
        uid: writer.getAttribute('data-uid') || '',
        ip: writer.getAttribute('data-ip') || ''
      };
      if (!user.nick && !user.uid && !user.ip) return;

      const rule = findMatchingRule(this.rules, user, this.galleryId);
      if (!rule) return;

      this.pendingHits[rule.id] = (this.pendingHits[rule.id] || 0) + 1;
      this._scheduleHitFlush();

      switch (rule.action) {
        case USER_RULE_ACTIONS.HIDE:
          container.style.display = 'none';
          container.setAttribute('data-dcu-hidden', 'true');
          break;
        case USER_RULE_ACTIONS.BLIND:
          // The blind box already carries the memo, and rewriting innerHTML
          // would drop a label added beforehand.
          this._blind(container, rule, user);
          break;
        case USER_RULE_ACTIONS.DIM:
          container.style.opacity = '0.35';
          if (rule.memo) this._addMemoLabel(writer, rule);
          break;
        case USER_RULE_ACTIONS.LABEL:
        default:
          if (rule.memo) this._addMemoLabel(writer, rule);
          break;
      }
    });
  }

  /**
   * Replaces the row/comment content with a one-line notice that can be
   * expanded — hiding outright makes it impossible to tell why a thread jumps.
   */
  _blind(container, rule, user) {
    if (container.getAttribute('data-dcu-blinded') === 'true') return;

    const original = container.innerHTML;
    container.setAttribute('data-dcu-blinded', 'true');
    container.dataset.dcuOriginal = original;

    const label = rule.memo
      ? `${rule.memo}`
      : `${rule.type === USER_RULE_TYPES.IP_PREFIX ? 'IP 대역' : '차단'} ${rule.value}`;
    const who = user.nick ? `${user.nick}` : (user.ip || user.uid || '');

    const isRow = container.tagName === 'TR';
    const colSpan = isRow ? container.querySelectorAll('td').length || 6 : 0;

    const inner = `
      <div class="dcu-blind-box">
        <span class="dcu-blind-text">차단됨 · ${escapeHTML(who)}${label ? ` · ${escapeHTML(label)}` : ''}</span>
        <button type="button" class="dcu-blind-toggle">펼치기</button>
      </div>`;

    container.innerHTML = isRow ? `<td colspan="${colSpan}" class="dcu-blind-cell">${inner}</td>` : inner;

    container.querySelector('.dcu-blind-toggle')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this._restore(container);
    });
  }

  _restore(container) {
    const original = container.dataset.dcuOriginal;
    if (original === undefined) return;
    container.innerHTML = original;
    delete container.dataset.dcuOriginal;
    container.removeAttribute('data-dcu-blinded');
  }

  _addMemoLabel(writer, rule) {
    if (writer.querySelector('.dcu-memo-label')) return;
    const label = document.createElement('span');
    label.className = 'dcu-memo-label';
    label.textContent = rule.memo;
    label.title = `DC Ultimate 메모 (${rule.type}: ${rule.value})`;
    writer.appendChild(label);
  }

  _scheduleHitFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(async () => {
      const hits = this.pendingHits;
      this.pendingHits = {};
      this._flushTimer = null;
      try {
        await userRuleManager.recordHits(hits);
      } catch (err) {
        logger.debug('UserBlockFeature: failed to record rule hits:', err);
      }
    }, 3000);
  }
}

export const userBlockFeature = new UserBlockFeature();
