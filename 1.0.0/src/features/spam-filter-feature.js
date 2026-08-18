/**
 * SpamFilterFeature — 도배/패턴 감지 숨김
 *
 * Hides list rows that look like spam: the same title repeated, a title that
 * matches a user pattern, or a title that is mostly symbols / one repeated
 * character. Hidden rows collapse into a single "N건 숨김" strip that can be
 * expanded, so nothing disappears silently.
 */
import { BaseFeature } from './base-feature.js';
import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';
import { escapeHTML } from '../utils/sanitizer.js';
import {
  detectSpam,
  buildDuplicateIndex,
  compilePatterns,
  DEFAULT_SPAM_OPTIONS
} from '../core/filters/spam-detector.js';

const PROCESSED_ATTR = 'data-dcu-spam-checked';

export class SpamFilterFeature extends BaseFeature {
  constructor() {
    super('enableSpamFilter', 'Spam Filter', '도배/패턴 글 자동 숨김');
    this.hiddenCount = 0;
    this.summaryRow = null;
  }

  get options() {
    return {
      duplicateThreshold: Number(configManager.get('spamDuplicateThreshold')) || DEFAULT_SPAM_OPTIONS.duplicateThreshold,
      specialCharRatio: Number(configManager.get('spamSpecialCharRatio')) || DEFAULT_SPAM_OPTIONS.specialCharRatio,
      repeatedCharRun: Number(configManager.get('spamRepeatedCharRun')) || DEFAULT_SPAM_OPTIONS.repeatedCharRun,
      patterns: configManager.get('spamPatterns') || []
    };
  }

  async onEnable() {
    this.apply();
  }

  async onDisable() {
    document.querySelectorAll('[data-dcu-spam="true"]').forEach(row => {
      row.style.display = '';
      row.removeAttribute('data-dcu-spam');
      row.removeAttribute(PROCESSED_ATTR);
    });
    this._removeSummary();
  }

  onPageChange() {
    this.apply();
  }

  /**
   * Re-scans the visible list. Duplicate detection needs the whole list, so
   * every row is re-evaluated while only unprocessed rows are re-styled.
   */
  apply() {
    if (!this.enabled) return;

    const rows = Array.from(document.querySelectorAll('tr.ub-content.us-post'));
    if (rows.length === 0) return;

    const options = this.options;
    const entries = rows.map(row => ({
      row,
      title: (row.querySelector('.gall_tit a, .gall_title a')?.textContent || '').replace(/\s+/g, ' ').trim()
    }));

    const context = {
      duplicateIndex: buildDuplicateIndex(entries.map(e => ({ title: e.title }))),
      compiledPatterns: compilePatterns(options.patterns)
    };

    let hidden = 0;
    for (const { row, title } of entries) {
      if (row.getAttribute(PROCESSED_ATTR) === '1') {
        if (row.getAttribute('data-dcu-spam') === 'true') hidden++;
        continue;
      }
      row.setAttribute(PROCESSED_ATTR, '1');

      const verdict = detectSpam({ title }, context, options);
      if (!verdict.spam) continue;

      row.style.display = 'none';
      row.setAttribute('data-dcu-spam', 'true');
      row.setAttribute('data-dcu-spam-reason', `${verdict.reason}: ${verdict.detail || ''}`);
      hidden++;
    }

    this.hiddenCount = hidden;
    this._renderSummary();
    if (hidden > 0) logger.debug(`SpamFilterFeature: hid ${hidden} row(s).`);
  }

  _renderSummary() {
    const tbody = document.querySelector('.gall_list tbody, table.gall_list tbody');
    if (!tbody) return;

    if (this.hiddenCount === 0) {
      this._removeSummary();
      return;
    }

    if (!this.summaryRow || !this.summaryRow.isConnected) {
      this.summaryRow = document.createElement('tr');
      this.summaryRow.className = 'dcu-spam-summary';
      tbody.appendChild(this.summaryRow);
    }

    const columns = document.querySelector('.gall_list thead tr')?.children.length || 6;
    this.summaryRow.innerHTML = `
      <td colspan="${columns}">
        <button type="button" class="dcu-spam-toggle">도배로 숨긴 글 ${escapeHTML(String(this.hiddenCount))}건 · 펼치기</button>
      </td>`;

    this.summaryRow.querySelector('.dcu-spam-toggle')?.addEventListener('click', () => {
      const hiddenRows = document.querySelectorAll('tr[data-dcu-spam="true"]');
      const showing = hiddenRows.length > 0 && hiddenRows[0].style.display === 'none';
      hiddenRows.forEach(row => {
        row.style.display = showing ? '' : 'none';
        row.style.opacity = showing ? '0.55' : '';
        if (showing && !row.querySelector('.dcu-spam-reason')) {
          const cell = row.querySelector('.gall_tit, .gall_title');
          if (cell) {
            const tag = document.createElement('span');
            tag.className = 'dcu-spam-reason';
            tag.textContent = row.getAttribute('data-dcu-spam-reason') || '도배';
            cell.appendChild(tag);
          }
        }
      });
      this.summaryRow.querySelector('.dcu-spam-toggle').textContent =
        `도배로 숨긴 글 ${this.hiddenCount}건 · ${showing ? '접기' : '펼치기'}`;
    });
  }

  _removeSummary() {
    if (this.summaryRow && this.summaryRow.isConnected) this.summaryRow.remove();
    this.summaryRow = null;
  }
}

export const spamFilterFeature = new SpamFilterFeature();
