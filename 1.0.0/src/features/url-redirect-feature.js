/**
 * UrlRedirectFeature Module for DC Ultimate
 * Automatically redirects mobile m.dcinside.com URLs to desktop DCInside URLs
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';

export class UrlRedirectFeature extends BaseFeature {
  constructor() {
    super('enableUrlRedirect', 'Mobile URL Redirector', 'Automatically redirects m.dcinside.com links to desktop version');
  }

  async onEnable() {
    if (typeof window === 'undefined' || !window.location) return;

    const href = window.location.href;
    if (href.includes('m.dcinside.com')) {
      const desktopUrl = href.replace('m.dcinside.com', 'gall.dcinside.com');
      logger.info(`UrlRedirectFeature: Redirecting mobile URL to desktop URL: ${desktopUrl}`);
      window.location.replace(desktopUrl);
    }
  }
}

export const urlRedirectFeature = new UrlRedirectFeature();
