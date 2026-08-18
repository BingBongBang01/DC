/**
 * DC Ultimate Auto Login Credential Store
 *
 * Holds the DCInside account used for auto login. The values live in
 * `chrome.storage.local`, which is readable by anyone with access to this
 * Chrome profile on this machine — the Options page states that plainly. The
 * password is only ever written into the login form on `sign.dcinside.com`
 * and is never logged or sent anywhere else.
 */
import { storageManager } from '../core/storage-manager.js';

export const AUTO_LOGIN_KEY = 'dc_auto_login';

/** Consecutive failures after which auto login blocks itself. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export const BLOCK_REASONS = {
  FAILURES: 'consecutive_failures',
  CAPTCHA: 'captcha_required',
  MANUAL: 'manual'
};

const DEFAULT_STATE = {
  enabled: false,
  userId: '',
  password: '',
  skipPasswordChange: true,
  failures: 0,
  blockedReason: null,
  lastError: null,
  lastSuccessAt: null,
  updatedAt: null
};

/**
 * @returns {Promise<typeof DEFAULT_STATE>}
 */
export async function getAutoLoginState() {
  const data = await storageManager.get(AUTO_LOGIN_KEY);
  return { ...DEFAULT_STATE, ...(data[AUTO_LOGIN_KEY] || {}) };
}

/**
 * @param {Partial<typeof DEFAULT_STATE>} updates
 * @returns {Promise<typeof DEFAULT_STATE>}
 */
export async function updateAutoLoginState(updates = {}) {
  const current = await getAutoLoginState();
  const next = { ...current, ...updates, updatedAt: Date.now() };
  await storageManager.set({ [AUTO_LOGIN_KEY]: next });
  return next;
}

/**
 * Stores the account used for auto login.
 * @param {{userId: string, password: string}} credentials
 */
export async function saveCredentials({ userId, password }) {
  const id = String(userId || '').trim();
  if (!id) throw new Error('아이디를 입력해 주세요.');
  if (!password) throw new Error('비밀번호를 입력해 주세요.');

  return updateAutoLoginState({
    userId: id,
    password: String(password),
    failures: 0,
    blockedReason: null,
    lastError: null
  });
}

/**
 * Removes the stored account and turns auto login off.
 */
export async function clearCredentials() {
  return updateAutoLoginState({
    userId: '',
    password: '',
    enabled: false,
    failures: 0,
    blockedReason: null,
    lastError: null
  });
}

/**
 * A view of the state that never contains the password — safe for UI.
 * @param {typeof DEFAULT_STATE} state
 */
export function toPublicStatus(state) {
  return {
    enabled: Boolean(state.enabled),
    hasCredentials: Boolean(state.userId && state.password),
    userId: state.userId || '',
    skipPasswordChange: state.skipPasswordChange !== false,
    failures: state.failures || 0,
    blockedReason: state.blockedReason || null,
    lastError: state.lastError || null,
    lastSuccessAt: state.lastSuccessAt || null
  };
}

/**
 * Auto login may only run when it is switched on, has an account, and is not
 * blocked after repeated failures or a CAPTCHA challenge.
 * @param {typeof DEFAULT_STATE} state
 * @returns {{ok: boolean, reason: string|null}}
 */
export function canAttemptLogin(state) {
  if (!state.enabled) return { ok: false, reason: 'disabled' };
  if (!state.userId || !state.password) return { ok: false, reason: 'no_credentials' };
  if (state.blockedReason) return { ok: false, reason: state.blockedReason };
  if ((state.failures || 0) >= MAX_CONSECUTIVE_FAILURES) return { ok: false, reason: BLOCK_REASONS.FAILURES };
  return { ok: true, reason: null };
}
