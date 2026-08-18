/**
 * Sanitizer Utility Module for DC Ultimate (Phase 8 Security)
 * Escapes unsafe HTML characters to prevent XSS attacks when rendering DOM or user input strings
 */

/**
 * Escapes HTML entities in a string
 * @param {string} str Input text
 * @returns {string} Escaped safe HTML text
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize plain text string by stripping unsafe tags
 * @param {string} text Input text
 * @returns {string} Clean plain text
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>?/gm, '').trim();
}
