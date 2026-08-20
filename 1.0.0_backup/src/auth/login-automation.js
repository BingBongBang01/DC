/**
 * Login Automation (content script side)
 *
 * Runs on DCInside pages and, when the user has switched auto login on:
 *  - sends a signed-out page to DC's login form,
 *  - fills the stored account into that form and submits it,
 *  - postpones DC's "change your password" interstitial ("나중에 변경"),
 *  - reports the outcome back to the background service.
 *
 * The background service owns every policy decision (manual logout, cooldown,
 * failure limits); this module only observes the page and acts on the answer.
 * CAPTCHA challenges are never worked around — the attempt stops instead.
 */
import { logger } from '../core/logger.js';
import { messageRouter } from '../core/message-router.js';
import { MessageAction } from '../core/message-contract.js';
import {
  AUTH_STATE,
  detectAuthState,
  isLoginPage,
  isLogoutUrl,
  buildLoginUrl,
  findLoginForm,
  hasCaptcha,
  findPostponeButton,
  isPasswordChangePrompt
} from './dc-login-page.js';

export class LoginAutomation {
  constructor() {
    this.hasRun = false;
  }

  /**
   * Entry point, called once per page load.
   * @param {Document} [doc]
   * @param {string} [url]
   */
  async run(doc = document, url = (typeof location !== 'undefined' ? location.href : '')) {
    if (this.hasRun) return { action: 'none', reason: 'already_ran' };
    this.hasRun = true;

    try {
      this._watchLogout(doc);

      // DC can show the password-change prompt on any page after sign-in.
      const postponed = await this._postponePasswordChange(doc, url);
      if (postponed) return { action: 'postponed_password_change' };

      const state = detectAuthState(doc);
      const onLoginPage = isLoginPage(url);

      const response = await messageRouter.send(MessageAction.AUTO_LOGIN_REQUEST, {
        state,
        isLoginPage: onLoginPage,
        url,
        // 디시 밖에서 새로 들어왔는지 판단하는 근거. tabs 권한 없이도 알 수 있도록
        // 페이지가 직접 알려 준다(백그라운드의 changeInfo.url은 권한에 따라 비어 있을 수 있음).
        referrer: typeof document !== 'undefined' ? document.referrer || '' : ''
      });

      const decision = (response && response.success && response.data) || { action: 'none' };

      if (decision.action === 'fill') {
        return this._fillAndSubmit(doc, url);
      }

      if (decision.action === 'navigate') {
        const loginUrl = buildLoginUrl(doc, url);
        logger.info('LoginAutomation: signed out — navigating to DC login.');
        window.location.assign(loginUrl);
        return { action: 'navigate' };
      }

      return { action: 'none', reason: decision.reason || null };
    } catch (err) {
      logger.warn('LoginAutomation: run failed:', err);
      return { action: 'none', reason: 'error' };
    }
  }

  /**
   * Signing out by hand must stick, so tell the background as soon as the user
   * heads for the logout link (the navigation itself is also watched there).
   * @param {Document} doc
   */
  _watchLogout(doc) {
    if (!doc || typeof doc.addEventListener !== 'function') return;

    doc.addEventListener('click', (event) => {
      const target = event.target && event.target.closest
        ? event.target.closest('a[href*="logout"], a.btn_top_loginout')
        : null;
      if (!target) return;

      const href = target.getAttribute('href') || '';
      if (!isLogoutUrl(href)) return;

      logger.info('LoginAutomation: manual logout detected — auto login paused for this tab.');
      messageRouter.send(MessageAction.AUTO_LOGIN_SUPPRESS, { reason: 'logout_click' });
    }, true);
  }

  /**
   * Clicks DC's "나중에 변경" button so a password-change reminder cannot block
   * the session right after signing in.
   * @param {Document} doc
   * @param {string} url
   * @returns {Promise<boolean>} true when a button was clicked
   */
  async _postponePasswordChange(doc, url) {
    if (!isPasswordChangePrompt(url, doc)) return false;

    const status = await messageRouter.send(MessageAction.AUTO_LOGIN_STATUS, {});
    const skip = status && status.success ? status.data?.status?.skipPasswordChange !== false : true;
    if (!skip) return false;

    const button = findPostponeButton(doc);
    if (!button) return false;

    logger.info('LoginAutomation: postponing DC password change prompt.');
    button.click();
    return true;
  }

  /**
   * @param {Document} doc
   * @param {string} url
   */
  async _fillAndSubmit(doc, url) {
    const form = findLoginForm(doc);
    if (!form) {
      logger.warn('LoginAutomation: login form not found on', url);
      return { action: 'none', reason: 'no_form' };
    }

    if (hasCaptcha(doc)) {
      logger.warn('LoginAutomation: CAPTCHA present — stopping and handing control back to the user.');
      await messageRouter.send(MessageAction.AUTO_LOGIN_RESULT, { success: false, captcha: true });
      return { action: 'none', reason: 'captcha' };
    }

    const credentialsRes = await messageRouter.send(MessageAction.AUTO_LOGIN_CREDENTIALS, {});
    const credentials = credentialsRes && credentialsRes.success ? credentialsRes.data?.credentials : null;

    if (!credentials || !credentials.userId || !credentials.password) {
      return { action: 'none', reason: 'no_credentials' };
    }

    // If something is already typed in (the user is signing in as someone else),
    // leave the form alone.
    const typedId = (form.idInput.value || '').trim();
    if (typedId && typedId !== credentials.userId) {
      logger.info('LoginAutomation: another account is being typed in — skipping.');
      return { action: 'none', reason: 'user_typing' };
    }

    this._setValue(form.idInput, credentials.userId);
    this._setValue(form.pwInput, credentials.password);

    logger.info('LoginAutomation: submitting stored DC account.');

    // Prefer the real button so DC's own onsubmit validation runs.
    if (form.submit && typeof form.submit.click === 'function') {
      form.submit.click();
    } else if (typeof form.form.submit === 'function') {
      form.form.submit();
    }

    return { action: 'fill' };
  }

  /**
   * Writes a value the way a user would, so any framework listeners react.
   * @param {HTMLInputElement} input
   * @param {string} value
   */
  _setValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export const loginAutomation = new LoginAutomation();
export { AUTH_STATE };
