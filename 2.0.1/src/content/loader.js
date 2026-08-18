/**
 * Content Script Loader for DC Ultimate ES Modules
 */
(async () => {
  try {
    const src = chrome.runtime.getURL('src/content/index.js');
    await import(src);
  } catch (err) {
    console.error('[DC Ultimate Loader] Failed to load content script module:', err);
  }
})();
