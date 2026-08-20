/**
 * DOM-free DCInside gallery list parser.
 *
 * The Manifest V3 service worker has no `DOMParser`, so background keyword
 * scans cannot reuse ArticleParser (it walks a real DOM). This module pulls the
 * same fields straight out of the raw HTML string with tolerant regexes, which
 * keeps scanning working in the worker itself even when no offscreen document
 * is available (`chrome.offscreen` requires Chrome 109+).
 */
import { Article } from '../../utils/models.js';

const ROW_RE = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

/**
 * Decodes the HTML entities DCInside actually emits in list markup.
 * @param {string} str
 * @returns {string}
 */
export function decodeEntities(str) {
  if (!str) return '';
  return str.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const num = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(num) || num < 0 || num > 0x10ffff) return match;
      try {
        return String.fromCodePoint(num);
      } catch (err) {
        return match;
      }
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

/**
 * Strips tags and collapses whitespace, mirroring `element.textContent.trim()`.
 * @param {string} html
 * @returns {string}
 */
function textOf(html) {
  if (!html) return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Reads a single attribute out of a captured tag's attribute string.
 * @param {string} attrs
 * @param {string} name Attribute name (literal, not a pattern)
 * @returns {string|null}
 */
function attr(attrs, name) {
  if (!attrs) return null;
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  const raw = match[2] !== undefined ? match[2] : match[3];
  return decodeEntities(raw || '');
}

/**
 * Finds a `<td>`/`<th>` cell by class name inside one row.
 * @param {string} rowHtml
 * @param {string} classPattern Class name (may contain regex alternation)
 * @returns {{ attrs: string, html: string }|null}
 */
function findCell(rowHtml, classPattern) {
  const re = new RegExp(
    `<t[dh]\\b([^>]*class\\s*=\\s*["'][^"']*\\b${classPattern}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/t[dh]>`,
    'i'
  );
  const match = rowHtml.match(re);
  return match ? { attrs: match[1], html: match[2] } : null;
}

function toInt(text) {
  if (!text) return 0;
  const digits = String(text).replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/**
 * Normalizes a DCInside href into an absolute URL.
 * @param {string} href
 * @returns {string}
 */
function absoluteUrl(href) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://gall.dcinside.com${href}`;
  return `https://gall.dcinside.com/${href}`;
}

/**
 * Parses one `<tr>` of a gallery list into an Article.
 * @param {string} rowAttrs Attribute string of the `<tr>` tag
 * @param {string} rowHtml Inner HTML of the row
 * @param {string} galleryId
 * @returns {Article|null} null for notices, ads and malformed rows
 */
function parseRowHtml(rowAttrs, rowHtml, galleryId) {
  const rowClass = attr(rowAttrs, 'class') || '';
  if (!/\bub-content\b/.test(rowClass)) return null;
  if (/\bub-notice\b/.test(rowClass)) return null;

  const dataType = attr(rowAttrs, 'data-type') || '';
  if (/notice/i.test(dataType)) return null;

  const titleCell = findCell(rowHtml, 'gall_tit(?:le)?');
  if (!titleCell) return null;

  // The title cell holds the post link first and (optionally) a comment-count
  // link afterwards. Pick the first anchor that points at an article.
  let href = '';
  let titleHtml = '';
  ANCHOR_RE.lastIndex = 0;
  let anchorMatch;
  while ((anchorMatch = ANCHOR_RE.exec(titleCell.html)) !== null) {
    const candidateHref = attr(anchorMatch[1], 'href') || '';
    if (/[?&]no=\d+/.test(candidateHref)) {
      href = candidateHref;
      titleHtml = anchorMatch[2];
      break;
    }
  }

  const url = absoluteUrl(href);
  const noMatch = url.match(/[?&]no=(\d+)/);
  const id = attr(rowAttrs, 'data-no') || (noMatch ? noMatch[1] : null);

  // Rows without an article number are ads / layout rows.
  if (!id) return null;

  let title = textOf(titleHtml);
  const replyMatch = rowHtml.match(/class\s*=\s*["'][^"']*\b(?:reply_num|cmt_num)\b[^"']*["'][^>]*>\s*\[?(\d+)/i);
  let comments = 0;
  if (replyMatch) {
    comments = parseInt(replyMatch[1], 10) || 0;
  } else {
    const inlineMatch = title.match(/\[(\d+)\]$/);
    if (inlineMatch) {
      comments = parseInt(inlineMatch[1], 10) || 0;
      title = title.replace(/\s*\[\d+\]$/, '').trim();
    }
  }

  const writerCell = findCell(rowHtml, 'gall_writer');
  const author = writerCell
    ? (attr(writerCell.attrs, 'data-nick') || textOf(writerCell.html))
    : '';
  const authorId = writerCell ? (attr(writerCell.attrs, 'data-uid') || null) : null;
  const ip = writerCell ? (attr(writerCell.attrs, 'data-ip') || null) : null;

  const dateCell = findCell(rowHtml, 'gall_date');
  const date = dateCell ? (attr(dateCell.attrs, 'title') || textOf(dateCell.html) || null) : null;

  const viewsCell = findCell(rowHtml, 'gall_count');
  const recommendCell = findCell(rowHtml, 'gall_recommend');
  const subjectCell = findCell(rowHtml, 'gall_subject');

  return new Article({
    id: String(id),
    galleryId,
    title,
    author,
    authorId,
    ip,
    date,
    views: viewsCell ? toInt(textOf(viewsCell.html)) : 0,
    recommendations: recommendCell ? toInt(textOf(recommendCell.html)) : 0,
    comments,
    url,
    hasImage: /\bicon_pic(_n)?\b|\bicon_recomimg\b/.test(rowHtml),
    hasVideo: /\bicon_mv\b|\bicon_movie\b/.test(rowHtml),
    subject: subjectCell ? textOf(subjectCell.html) : '',
    sourcePage: 'gallery_list'
  });
}

/**
 * Parses a fetched gallery list page without any DOM APIs.
 * @param {string} html Raw HTML of a gallery list page
 * @param {string} [galleryId='']
 * @returns {Article[]} Articles in document order (notices and ads excluded)
 */
export function parseListHtml(html, galleryId = '') {
  if (!html || typeof html !== 'string') return [];

  const articles = [];
  const seen = new Set();

  ROW_RE.lastIndex = 0;
  let rowMatch;
  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    const article = parseRowHtml(rowMatch[1], rowMatch[2], galleryId);
    if (article && !seen.has(article.id)) {
      seen.add(article.id);
      articles.push(article);
    }
  }

  return articles;
}
