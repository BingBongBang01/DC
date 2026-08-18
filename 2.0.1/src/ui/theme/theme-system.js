/**
 * ThemeSystem Module for DC Ultimate
 * Manages light, dark, and system theme modes across Popup, SidePanel, and Options UI
 */

export class ThemeSystem {
  constructor() {
    this.currentTheme = 'system';
  }

  /**
   * Apply theme mode to document element
   * @param {'light'|'dark'|'system'} mode Theme mode
   */
  applyTheme(mode = 'system') {
    this.currentTheme = mode;
    const docEl = document.documentElement;

    if (mode === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      docEl.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      docEl.setAttribute('data-theme', mode);
    }
  }

  /**
   * Initialize auto theme updates
   * @param {string} mode Theme mode
   */
  init(mode = 'system') {
    this.applyTheme(mode);

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }
}

export const themeSystem = new ThemeSystem();
