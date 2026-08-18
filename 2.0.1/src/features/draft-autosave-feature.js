/**
 * DraftAutosaveFeature — 작성 중 자동 임시저장 (Local Draft)
 *
 * Backs up the write form (제목 / 본문 / 첨부 파일명) to `localStorage` while
 * the user types, so a crash, refresh or accidental close does not lose the
 * post. Drafts are also mirrored into extension storage so the Side Panel can
 * list them (localStorage belongs to dcinside.com and the panel cannot read it).
 *
 * DC's write page (verified live) uses Summernote:
 *   #subject (제목), .note-editable (본문 contenteditable), #memo (hidden textarea)
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { messageRouter } from '../core/message-router.js';
import { MessageAction } from '../core/message-contract.js';
import { configManager } from '../core/config-manager.js';
import { escapeHTML } from '../utils/sanitizer.js';

const STORAGE_PREFIX = 'dcu_draft:';
const MAX_DRAFTS = 20;

export class DraftAutosaveFeature extends BaseFeature {
  constructor() {
    super('enableDraftAutosave', 'Draft Autosave', '작성 중 글 자동 임시저장');
    this.timer = null;
    this.key = null;
    this.banner = null;
    this.lastSerialized = '';
  }

  get intervalMs() {
    return (Number(configManager.get('draftAutosaveIntervalSec')) || 10) * 1000;
  }

  async onEnable() {
    this.setup();
  }

  async onDisable() {
    this._stopTimer();
    this.banner?.remove();
    this.banner = null;
  }

  onPageChange() {
    this._stopTimer();
    this.setup();
  }

  /**
   * @returns {{subject: HTMLInputElement|null, editable: Element|null, memo: HTMLTextAreaElement|null}|null}
   */
  _fields() {
    const subject = document.querySelector('#subject, input[name="subject"]');
    const editable = document.querySelector('.note-editable, [contenteditable="true"]');
    const memo = document.querySelector('#memo, textarea[name="memo"]');
    if (!subject && !editable) return null;
    return { subject, editable, memo };
  }

  _draftKey() {
    const url = new URL(window.location.href);
    const gallery = url.searchParams.get('id') || 'unknown';
    const postNo = url.searchParams.get('no') || 'new';
    const mode = /\/modify\//.test(url.pathname) ? 'modify' : 'write';
    return `${STORAGE_PREFIX}${gallery}:${mode}:${postNo}`;
  }

  setup() {
    if (!this.enabled) return;
    if (!/\/board\/(write|modify)/.test(window.location.pathname)) return;

    const fields = this._fields();
    if (!fields) {
      // Summernote builds its editor asynchronously — retry shortly.
      setTimeout(() => this.setup(), 1500);
      return;
    }

    this.key = this._draftKey();
    this._offerRestore(fields);
    this._startTimer(fields);

    // A successful submit should not leave a stale draft behind.
    document.querySelector('form')?.addEventListener('submit', () => this.clear());
    document.querySelectorAll('.btn_svc.write, button.write, #btn_submit').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(() => this.clear(), 2000));
    });
  }

  _startTimer(fields) {
    this._stopTimer();
    this.timer = setInterval(() => this.save(fields), this.intervalMs);
    window.addEventListener('beforeunload', () => this.save(fields));
  }

  _stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * @param {{subject: Element|null, editable: Element|null}} fields
   */
  save(fields) {
    if (!this.enabled || !this.key) return;

    const subject = fields.subject ? fields.subject.value : '';
    const body = fields.editable ? fields.editable.innerHTML : '';
    const plain = fields.editable ? (fields.editable.textContent || '').trim() : '';

    if (!subject.trim() && !plain) return;

    const attachments = Array.from(document.querySelectorAll('.file_list li, .attach_list li, .write_attach li'))
      .map(li => (li.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);

    const draft = {
      key: this.key,
      url: window.location.href,
      galleryId: new URL(window.location.href).searchParams.get('id') || '',
      subject,
      body,
      preview: plain.slice(0, 120),
      attachments,
      savedAt: Date.now()
    };

    const serialized = JSON.stringify(draft);
    if (serialized === this.lastSerialized) return;
    this.lastSerialized = serialized;

    try {
      localStorage.setItem(this.key, serialized);
      this._trimLocalDrafts();
    } catch (err) {
      logger.warn('DraftAutosave: localStorage write failed:', err);
    }

    // Mirror for the Side Panel (fire and forget).
    messageRouter.send(MessageAction.DRAFT_SAVE, { draft });
    this._flashBanner('임시저장됨');
  }

  clear() {
    if (!this.key) return;
    try {
      localStorage.removeItem(this.key);
    } catch (err) {
      // ignore
    }
    messageRouter.send(MessageAction.DRAFT_DELETE, { key: this.key });
    this.lastSerialized = '';
  }

  /**
   * Drops the oldest drafts so localStorage cannot grow without bound.
   */
  _trimLocalDrafts() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    if (keys.length <= MAX_DRAFTS) return;

    const parsed = keys.map(key => {
      try {
        return { key, savedAt: JSON.parse(localStorage.getItem(key)).savedAt || 0 };
      } catch (err) {
        return { key, savedAt: 0 };
      }
    }).sort((a, b) => a.savedAt - b.savedAt);

    parsed.slice(0, parsed.length - MAX_DRAFTS).forEach(item => localStorage.removeItem(item.key));
  }

  /**
   * Shows a restore bar when a draft exists for this exact write target.
   * @param {{subject: HTMLInputElement|null, editable: Element|null}} fields
   */
  _offerRestore(fields) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(this.key) || 'null');
    } catch (err) {
      stored = null;
    }
    if (!stored || (!stored.subject && !stored.preview)) return;

    // Do not nag when the user already typed something.
    const hasContent = (fields.subject && fields.subject.value.trim()) ||
      (fields.editable && (fields.editable.textContent || '').trim());
    if (hasContent) return;

    const bar = document.createElement('div');
    bar.className = 'dcu-draft-bar';
    bar.innerHTML = `
      <span class="dcu-draft-text">임시저장된 글이 있습니다 (${escapeHTML(new Date(stored.savedAt).toLocaleString('ko-KR'))})
        ${stored.subject ? `· ${escapeHTML(stored.subject)}` : ''}</span>
      <span class="dcu-draft-actions">
        <button type="button" class="dcu-draft-restore">복구</button>
        <button type="button" class="dcu-draft-discard">삭제</button>
      </span>`;

    const anchor = document.querySelector('.write_wrap, #dgn_frm, form') || document.body;
    anchor.prepend(bar);
    this.banner = bar;

    bar.querySelector('.dcu-draft-restore')?.addEventListener('click', () => {
      if (fields.subject && stored.subject) {
        fields.subject.value = stored.subject;
        fields.subject.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (fields.editable && stored.body) {
        fields.editable.innerHTML = stored.body;
        fields.editable.dispatchEvent(new Event('input', { bubbles: true }));
        const memo = document.querySelector('#memo, textarea[name="memo"]');
        if (memo) memo.value = stored.body;
      }
      bar.remove();
      this.banner = null;
    });

    bar.querySelector('.dcu-draft-discard')?.addEventListener('click', () => {
      this.clear();
      bar.remove();
      this.banner = null;
    });
  }

  _flashBanner(text) {
    let toast = document.querySelector('.dcu-draft-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'dcu-draft-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = `${text} · ${new Date().toLocaleTimeString('ko-KR')}`;
    toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('visible'), 1500);
  }
}

export const draftAutosaveFeature = new DraftAutosaveFeature();
