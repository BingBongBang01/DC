/**
 * AuthManager Module for DC Ultimate (Phase 7 Auth)
 * Detects session state without CAPTCHA bypass or credential storage
 */
import { User } from '../utils/models.js';
import { logger } from '../core/logger.js';
import { AUTH_STATE, detectAuthState } from './dc-login-page.js';

export const AUTH_STATES = {
  LOGGED_IN: 'Logged in',
  LOGGED_OUT: 'Logged out',
  UNKNOWN: 'Unknown'
};

export class AuthManager {
  constructor() {
    this.currentUser = new User({ isMember: false });
    this.authState = AUTH_STATES.UNKNOWN;
    this.officialLoginUrl = 'https://dcid.dcinside.com/join/login.php';
  }

  /**
   * Detect current login session from Document node
   * @param {Document} [doc=document] Document object
   * @returns {{ state: string, user: User }}
   */
  detectUser(doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc) {
      this.authState = AUTH_STATES.UNKNOWN;
      return { state: this.authState, user: this.currentUser };
    }

    try {
      const nicknameElem = doc.querySelector('.user_info .nickname, .login_box .user_name, .nick_name');
      const isManagerElem = doc.querySelector('.icon_gallmanager, .icon_submanager');

      // The header's login/logout anchor is the reliable signal on live DC
      // pages; the nickname markup differs between gallery skins.
      const headerState = detectAuthState(doc);

      if (nicknameElem) {
        const nickname = nicknameElem.textContent.trim();
        this.currentUser = new User({
          nickname,
          isMember: true,
          isGalleryManager: Boolean(isManagerElem)
        });
        this.authState = AUTH_STATES.LOGGED_IN;
      } else if (headerState === AUTH_STATE.LOGGED_IN) {
        this.currentUser = new User({ isMember: true, isGalleryManager: Boolean(isManagerElem) });
        this.authState = AUTH_STATES.LOGGED_IN;
      } else if (headerState === AUTH_STATE.LOGGED_OUT || doc.querySelector('.login_box, #login_box, .user_option')) {
        this.currentUser = new User({ isMember: false });
        this.authState = AUTH_STATES.LOGGED_OUT;
      } else {
        this.authState = AUTH_STATES.UNKNOWN;
      }
    } catch (err) {
      logger.error('AuthManager: Error detecting user session:', err);
      this.authState = AUTH_STATES.UNKNOWN;
    }

    return { state: this.authState, user: this.currentUser };
  }

  getLoginUrl() {
    return this.officialLoginUrl;
  }
}

export const authManager = new AuthManager();
