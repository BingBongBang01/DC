/**
 * DC Ultimate — DCInside 야간모드 연동 (document_start)
 *
 * Keeps DCInside's own dark mode in step with the extension's theme setting
 * (dark / light / system). Declared as a plain content script (not an ES
 * module) so it runs at `document_start`, before DC paints, which avoids a
 * white flash when the two are out of sync.
 *
 * How DCInside stores the state (verified against live markup, 2026-08):
 *   - cookie `darkmode=1` (path=/, domain=dcinside.com) turns it on;
 *     switching off deletes `darkmode` and `darkmode_dc` on `.dcinside.com`
 *   - the server then renders <link id="css-darkmode" href=".../dark.css">,
 *     <meta name="color-scheme" content="dark light"> and the dark logos
 *   - `<html class="darkmode">` is always present, so it is NOT a state flag
 */
(() => {
  'use strict';

  const DARK_CSS_URL = 'https://nstatic.dcinside.com/dc/w/css/dark.css?v=241108';
  const LOGO_LIGHT = 'https://nstatic.dcinside.com/dc/w/images/dcin_logo.png';
  const LOGO_DARK = 'https://nstatic.dcinside.com/dc/w/images/dark/dcin_logo_dark.png';
  const SETTINGS_KEY = 'settings';

  let currentMode = 'system';
  let syncEnabled = true;
  /** Guards the reverse-sync click handler against re-entry. */
  let applying = false;

  const prefersDarkQuery = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  function effectiveDark(mode) {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return Boolean(prefersDarkQuery && prefersDarkQuery.matches);
  }

  function readCookie(name) {
    const parts = document.cookie ? document.cookie.split(';') : [];
    for (let raw of parts) {
      raw = raw.trim();
      if (raw.indexOf(`${name}=`) === 0) return decodeURIComponent(raw.slice(name.length + 1));
    }
    return '';
  }

  function isDcDark() {
    // The cookie is the source of truth at document_start; the stylesheet link
    // only exists once the head has been parsed.
    if (readCookie('darkmode') === '1') return true;
    return Boolean(document.getElementById('css-darkmode'));
  }

  function writeDcCookies(dark) {
    if (dark) {
      const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = `darkmode=1; path=/; domain=dcinside.com; expires=${expires};`;
      document.cookie = 'used_darkmode=1; expires=Thu, 01 Jan 9999 00:00:00 GMT; path=/; domain=.dcinside.com;';
    } else {
      document.cookie = 'darkmode=0; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.dcinside.com;';
      document.cookie = 'darkmode_dc=0; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.dcinside.com;';
    }
  }

  /**
   * Applies the look to the page that is already loading, so the change is
   * visible without a reload. Later navigations render correctly server-side
   * because the cookie is set.
   */
  function paint(dark) {
    const run = () => {
      const head = document.head || document.documentElement;
      if (!head) return;

      const existing = document.getElementById('css-darkmode');
      if (dark && !existing) {
        const link = document.createElement('link');
        link.id = 'css-darkmode';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = DARK_CSS_URL;
        head.appendChild(link);
      } else if (!dark && existing) {
        existing.remove();
      }

      document.querySelectorAll('.logo_img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (dark && src.indexOf('/dark/') === -1) img.setAttribute('src', LOGO_DARK);
        if (!dark && src.indexOf('/dark/') !== -1) img.setAttribute('src', LOGO_LIGHT);
      });

      document.querySelectorAll('.logo_img2').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (dark && src.indexOf('/dark/') === -1) {
          img.setAttribute('src', src.replace(/\/images\/(tit_[a-z_]*gallery)\.png/, '/images/dark/$1_dark.png'));
        } else if (!dark && src.indexOf('/dark/') !== -1) {
          img.setAttribute('src', src.replace(/\/images\/dark\/(tit_[a-z_]*gallery)_dark\.png/, '/images/$1.png'));
        }
      });
    };

    run();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    }
  }

  function apply(dark) {
    applying = true;
    try {
      writeDcCookies(dark);
      paint(dark);
    } finally {
      applying = false;
    }
  }

  function syncNow() {
    if (!syncEnabled) return;
    const wanted = effectiveDark(currentMode);
    if (isDcDark() !== wanted) {
      apply(wanted);
    }
  }

  /**
   * Reverse sync: clicking DC's own 야간모드 button changes the extension
   * theme instead, so the two never fight each other. Without this the next
   * page load would simply undo the user's click.
   */
  function interceptDcToggle() {
    document.addEventListener('click', (event) => {
      if (!syncEnabled || applying) return;

      const toggle = event.target && event.target.closest
        ? event.target.closest('.darkonoff, a[onclick*="darkmode()"], [onclick*="darkmode()"]')
        : null;
      if (!toggle) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const nextDark = !isDcDark();
      currentMode = nextDark ? 'dark' : 'light';
      apply(nextDark);
      saveMode(currentMode);
    }, true);
  }

  function saveMode(mode) {
    try {
      chrome.storage.local.get(SETTINGS_KEY, (data) => {
        if (chrome.runtime.lastError) return;
        const settings = { ...(data && data[SETTINGS_KEY] ? data[SETTINGS_KEY] : {}), theme: mode };
        chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      });
    } catch (err) {
      // Extension context can be invalidated during a reload — ignore.
    }
  }

  function start() {
    try {
      chrome.storage.local.get(SETTINGS_KEY, (data) => {
        if (chrome.runtime.lastError) return;
        const settings = (data && data[SETTINGS_KEY]) || {};
        currentMode = settings.theme || 'system';
        syncEnabled = settings.syncDcDarkMode !== false;
        syncNow();
      });
    } catch (err) {
      return;
    }

    // React to theme changes made in the popup / options page.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      const settings = changes[SETTINGS_KEY].newValue || {};
      const nextMode = settings.theme || 'system';
      const nextSync = settings.syncDcDarkMode !== false;
      if (nextMode === currentMode && nextSync === syncEnabled) return;
      currentMode = nextMode;
      syncEnabled = nextSync;
      syncNow();
    });

    // Follow the OS while the extension is in system mode.
    if (prefersDarkQuery && prefersDarkQuery.addEventListener) {
      prefersDarkQuery.addEventListener('change', () => {
        if (currentMode === 'system') syncNow();
      });
    }

    interceptDcToggle();
  }

  start();
})();
