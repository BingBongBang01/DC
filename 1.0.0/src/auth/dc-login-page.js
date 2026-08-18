/**
 * Pure helpers describing DCInside's sign pages.
 *
 * Kept free of chrome/DOM globals (other than the passed-in Document) so the
 * login automation logic can be unit tested against captured markup.
 *
 * Reference markup (captured 2026-08 from live pages):
 *   - Header state:  <a class="btn_top_loginout" href="https://sign.dcinside.com/login?s_url=...">로그인</a>
 *                    (the same anchor points at /logout while signed in)
 *   - Login form:    <form name="login" action="https://sign.dcinside.com/login/member_check">
 *                      <input id="id" name="user_id"> <input id="pw" name="pw">
 *                      <button type="submit" class="btn_blue">로그인</button>
 */

export const AUTH_STATE = {
  LOGGED_IN: 'logged_in',
  LOGGED_OUT: 'logged_out',
  UNKNOWN: 'unknown'
};

export const LOGIN_ORIGIN = 'https://sign.dcinside.com';

/** Text on the button that postpones DC's "change your password" interstitial. */
const LATER_PATTERNS = [
  /나중에/,
  /다음에/,
  /다음\s*기회/,
  /30\s*일\s*(후|뒤)/,
  /건너뛰기/,
  /지금\s*하지\s*않/
];

const CAPTCHA_SELECTORS = [
  '#captcha',
  '.captcha',
  'img[src*="captcha" i]',
  'input[name*="captcha" i]',
  'iframe[src*="recaptcha" i]',
  '.g-recaptcha'
];

/**
 * @param {string} url
 * @returns {boolean} True on the DCInside sign-in form page.
 */
export function isLoginPage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'sign.dcinside.com' && /^\/login(\/|$)/.test(parsed.pathname);
  } catch (err) {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {boolean} True on DCInside's logout endpoint.
 */
export function isLogoutUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('dcinside.com') && /logout/i.test(parsed.pathname + parsed.search);
  } catch (err) {
    return false;
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isDcInsideUrl(url) {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('dcinside.com');
  } catch (err) {
    return false;
  }
}

/**
 * Reads the login state from the header's login/logout anchor.
 * @param {Document} doc
 * @returns {string} One of AUTH_STATE
 */
export function detectAuthState(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return AUTH_STATE.UNKNOWN;

  const anchors = doc.querySelectorAll('a.btn_top_loginout, .user_option a[href*="dcinside.com/logout"], a[href*="sign.dcinside.com/logout"]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    if (/logout/i.test(href)) return AUTH_STATE.LOGGED_IN;
    if (/\/login/i.test(href)) return AUTH_STATE.LOGGED_OUT;
  }

  // Gallog / my-page links only exist for signed-in members.
  if (doc.querySelector('.user_info .nickname, .login_box .user_name, a[href*="gallog.dcinside.com/"][class*="my"]')) {
    return AUTH_STATE.LOGGED_IN;
  }

  return AUTH_STATE.UNKNOWN;
}

/**
 * Builds the DCInside login URL that returns to `returnUrl` after signing in.
 * Prefers the anchor DC itself rendered (it carries an `s_key` token).
 * @param {Document|null} doc
 * @param {string} returnUrl
 * @returns {string}
 */
export function buildLoginUrl(doc, returnUrl) {
  const anchor = doc && typeof doc.querySelector === 'function'
    ? doc.querySelector('a.btn_top_loginout[href*="/login"]')
    : null;
  const href = anchor ? anchor.getAttribute('href') : null;
  if (href && href.startsWith(`${LOGIN_ORIGIN}/login`)) return href;

  const target = returnUrl || 'https://gall.dcinside.com/';
  return `${LOGIN_ORIGIN}/login?s_url=${encodeURIComponent(target)}`;
}

/**
 * @param {Document} doc
 * @returns {{form: Element, idInput: Element, pwInput: Element, submit: Element|null}|null}
 */
export function findLoginForm(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return null;

  const form = doc.querySelector('form[name="login"], form[action*="member_check"]');
  if (!form) return null;

  const idInput = form.querySelector('#id, input[name="user_id"]');
  const pwInput = form.querySelector('#pw, input[name="pw"], input[type="password"]');
  if (!idInput || !pwInput) return null;

  return {
    form,
    idInput,
    pwInput,
    submit: form.querySelector('button[type="submit"], input[type="submit"], .btn_blue')
  };
}

/**
 * DCInside shows a CAPTCHA after repeated failures. Auto login must stop and
 * hand control back to the user rather than try to work around it.
 * @param {Document} doc
 * @returns {boolean}
 */
export function hasCaptcha(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  if (doc.querySelector(CAPTCHA_SELECTORS.join(', '))) return true;
  const text = doc.body ? (doc.body.textContent || '') : '';
  return /보안\s*문자|자동입력\s*방지/.test(text);
}

/**
 * True when the page is DC's "please change your password" interstitial.
 * @param {string} url
 * @param {Document} doc
 * @returns {boolean}
 */
export function isPasswordChangePrompt(url, doc) {
  const text = doc && doc.body ? (doc.body.textContent || '') : '';
  const looksLikePrompt = /비밀번호[^.]{0,20}(변경|바꾸)/.test(text);
  if (!looksLikePrompt) return false;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('dcinside.com')) return false;
  } catch (err) {
    return false;
  }

  return Boolean(findPostponeButton(doc));
}

/**
 * Finds the "나중에 변경" style control on the password-change interstitial.
 * @param {Document} doc
 * @returns {Element|null}
 */
export function findPostponeButton(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;

  const candidates = doc.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
  for (const candidate of candidates) {
    const label = (candidate.tagName === 'INPUT'
      ? candidate.getAttribute('value')
      : candidate.textContent) || '';
    const text = label.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (LATER_PATTERNS.some(pattern => pattern.test(text))) return candidate;
  }

  return null;
}
