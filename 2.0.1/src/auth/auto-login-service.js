/**
 * Auto Login Service (background side)
 *
 * Decides whether the extension may sign the user back in, and remembers when
 * the user signed out on purpose.
 *
 * Session rules for this feature:
 *  - Signing out manually keeps that tab signed out for as long as the user
 *    stays on DCInside in it.
 *  - Entering DCInside fresh (a new tab, or returning after browsing elsewhere
 *    in the same tab) arms auto login again.
 *  - Everything resets when Chrome restarts, because the state lives in
 *    `chrome.storage.session`.
 */
import { logger } from '../core/logger.js';
import { isDcInsideUrl } from './dc-login-page.js';
import {
  getAutoLoginState,
  updateAutoLoginState,
  canAttemptLogin,
  BLOCK_REASONS,
  MAX_CONSECUTIVE_FAILURES
} from './credential-store.js';

const SESSION_KEY = 'dc_auto_login_session';

/** Minimum gap between two login attempts in the same tab. */
const ATTEMPT_COOLDOWN_MS = 30 * 1000;

/** An attempt older than this is treated as abandoned, not failed. */
const ATTEMPT_TTL_MS = 3 * 60 * 1000;

export const ATTEMPT_PHASE = {
  NAVIGATED: 'navigated', // We sent the tab to the login page
  SUBMITTED: 'submitted'  // We filled the form and submitted it
};

export class AutoLoginService {
  constructor() {
    /** Fallback for Chrome builds without chrome.storage.session. */
    this.memorySession = { suppressedTabs: {}, attempts: {} };
    this.hasSessionStorage = typeof chrome !== 'undefined' && chrome.storage && !!chrome.storage.session;
  }

  async _readSession() {
    if (!this.hasSessionStorage) return this.memorySession;
    try {
      const data = await chrome.storage.session.get(SESSION_KEY);
      return { suppressedTabs: {}, attempts: {}, ...(data[SESSION_KEY] || {}) };
    } catch (err) {
      logger.warn('AutoLoginService: session storage unavailable, using memory:', err);
      this.hasSessionStorage = false;
      return this.memorySession;
    }
  }

  async _writeSession(session) {
    this.memorySession = session;
    if (!this.hasSessionStorage) return;
    try {
      await chrome.storage.session.set({ [SESSION_KEY]: session });
    } catch (err) {
      logger.warn('AutoLoginService: failed to persist session state:', err);
      this.hasSessionStorage = false;
    }
  }

  /**
   * Marks a tab as "the user signed out here on purpose".
   * @param {number} tabId
   */
  async suppressTab(tabId) {
    if (typeof tabId !== 'number') return;
    const session = await this._readSession();
    session.suppressedTabs[String(tabId)] = Date.now();
    delete session.attempts[String(tabId)];
    await this._writeSession(session);
    logger.info(`AutoLoginService: auto login suppressed for tab ${tabId} (manual logout).`);
  }

  /**
   * Re-arms auto login for a tab (it left DCInside, or was closed).
   * @param {number} tabId
   */
  async releaseTab(tabId) {
    if (typeof tabId !== 'number') return;
    const session = await this._readSession();
    const key = String(tabId);
    if (session.suppressedTabs[key] === undefined && session.attempts[key] === undefined) {
      return;
    }
    delete session.suppressedTabs[key];
    delete session.attempts[key];
    await this._writeSession(session);
  }

  /**
   * @param {number} tabId
   * @returns {Promise<boolean>}
   */
  async isTabSuppressed(tabId) {
    const session = await this._readSession();
    return session.suppressedTabs[String(tabId)] !== undefined;
  }

  /**
   * Central decision for a content script asking "should I sign in here?".
   * @param {{tabId: number, state: string, isLoginPage: boolean, referrer?: string}} context
   * @returns {Promise<{action: 'none'|'navigate'|'fill', reason: string|null}>}
   */
  async evaluate({ tabId, state, isLoginPage, referrer = '' }) {
    const stored = await getAutoLoginState();

    if (state === 'logged_in') {
      await this.noteResult(tabId, true);
      return { action: 'none', reason: 'already_logged_in' };
    }

    const allowed = canAttemptLogin(stored);
    if (!allowed.ok) {
      return { action: 'none', reason: allowed.reason };
    }

    if (typeof tabId !== 'number') {
      return { action: 'none', reason: 'no_tab' };
    }

    const session = await this._readSession();
    const key = String(tabId);
    const now = Date.now();

    if (session.suppressedTabs[key] !== undefined) {
      // 디시 밖에서(또는 새 창/새 탭으로) 다시 들어온 경우는 "새로 들어온 것"이므로
      // 로그아웃 유지 상태를 풀어 준다. 탭 URL 추적(tabs 권한)에 의존하지 않는 판단이다.
      const cameFromOutside = !referrer || !isDcInsideUrl(referrer);
      if (!cameFromOutside) {
        return { action: 'none', reason: 'user_logged_out' };
      }

      delete session.suppressedTabs[key];
      await this._writeSession(session);
      logger.info(`AutoLoginService: tab ${tabId} re-entered DCInside from outside — auto login re-armed.`);
    }

    let attempt = session.attempts[key];
    if (attempt && now - attempt.at > ATTEMPT_TTL_MS) {
      delete session.attempts[key];
      attempt = undefined;
    }

    if (isLoginPage) {
      // Landing back on the login page after we submitted means the sign-in
      // did not go through.
      if (attempt && attempt.phase === ATTEMPT_PHASE.SUBMITTED) {
        delete session.attempts[key];
        await this._writeSession(session);
        await this._noteFailure('로그인에 실패했습니다. 아이디/비밀번호를 확인해 주세요.');
        return { action: 'none', reason: 'login_failed' };
      }

      session.attempts[key] = { at: now, phase: ATTEMPT_PHASE.SUBMITTED };
      await this._writeSession(session);
      return { action: 'fill', reason: null };
    }

    if (state !== 'logged_out') {
      return { action: 'none', reason: 'state_unknown' };
    }

    if (attempt && now - attempt.at < ATTEMPT_COOLDOWN_MS) {
      return { action: 'none', reason: 'cooldown' };
    }

    session.attempts[key] = { at: now, phase: ATTEMPT_PHASE.NAVIGATED };
    await this._writeSession(session);
    return { action: 'navigate', reason: null };
  }

  /**
   * Records the outcome of a login attempt.
   * @param {number} tabId
   * @param {boolean} success
   * @param {string} [message]
   */
  async noteResult(tabId, success, message = null) {
    const session = await this._readSession();
    const key = String(tabId);

    if (session.attempts[key] !== undefined) {
      delete session.attempts[key];
      await this._writeSession(session);
    }

    if (success) {
      const stored = await getAutoLoginState();
      if (stored.failures || stored.lastError || !stored.lastSuccessAt) {
        await updateAutoLoginState({ failures: 0, lastError: null, lastSuccessAt: Date.now() });
      }
      return;
    }

    if (message) {
      await this._noteFailure(message);
    }
  }

  /**
   * Blocks auto login when DCInside asks for a CAPTCHA — solving or working
   * around one is deliberately out of scope.
   */
  async blockForCaptcha() {
    await updateAutoLoginState({
      blockedReason: BLOCK_REASONS.CAPTCHA,
      lastError: '보안문자(캡차)가 표시되어 자동 로그인을 중단했습니다. 직접 로그인해 주세요.'
    });
    this._notify('자동 로그인 중단', '보안문자가 표시되어 직접 로그인이 필요합니다.');
  }

  async _noteFailure(message) {
    const stored = await getAutoLoginState();
    const failures = (stored.failures || 0) + 1;
    const blockedReason = failures >= MAX_CONSECUTIVE_FAILURES ? BLOCK_REASONS.FAILURES : null;

    await updateAutoLoginState({ failures, lastError: message, blockedReason });

    if (blockedReason) {
      this._notify(
        '자동 로그인 중단',
        `연속 ${failures}회 실패하여 자동 로그인을 멈췄습니다. 설정에서 계정을 확인해 주세요.`
      );
    }
  }

  _notify(title, message) {
    if (typeof chrome === 'undefined' || !chrome.notifications || !chrome.notifications.create) return;
    const iconUrl = chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL('assets/icons/icon128.png')
      : 'assets/icons/icon128.png';
    try {
      chrome.notifications.create(`auto_login_${Date.now()}`, {
        type: 'basic', iconUrl, title, message, priority: 2
      }, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) logger.warn('AutoLoginService: notification failed:', lastError.message);
      });
    } catch (err) {
      logger.warn('AutoLoginService: notification threw:', err);
    }
  }
}

export const autoLoginService = new AutoLoginService();
