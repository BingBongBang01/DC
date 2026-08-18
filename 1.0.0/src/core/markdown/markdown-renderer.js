/**
 * Minimal, escape-first Markdown renderer.
 *
 * Everything is escaped before any markup is produced, so a post can never
 * inject HTML through the renderer. Supports the subset that matters for
 * gallery posts: fenced code, headings, lists, quotes, tables-free inline
 * emphasis, inline code, links and line breaks.
 */
import { escapeHTML } from '../../utils/sanitizer.js';
import { highlightCode } from './code-highlighter.js';

/**
 * Renders inline markdown (already-escaped text in, HTML out).
 * @param {string} escaped
 * @returns {string}
 */
function renderInline(escaped) {
  return escaped
    // `code`
    .replace(/`([^`]+)`/g, '<code class="dcu-md-code">$1</code>')
    // **bold** / __bold__
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // *italic* / _italic_
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
    // ~~strike~~
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    // [text](https://…) — http(s) only
    .replace(/\[([^\]]+)\]\((https?:&#x2F;&#x2F;[^)\s]+|https?:\/\/[^)\s]+)\)/g,
      (match, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
}

/**
 * Detects whether text is worth rendering as Markdown at all.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeMarkdown(text) {
  const source = String(text || '');
  return /```|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^>\s|\*\*[^*]+\*\*|`[^`]+`/m.test(source);
}

/**
 * Extracts fenced code blocks so the block renderer never touches them.
 * @param {string} source
 * @returns {{ text: string, blocks: Array<{lang: string, code: string}> }}
 */
const FENCE_MARK = String.fromCharCode(0xE000); // private-use char: a post can never contain it

function extractFences(source) {
  const blocks = [];
  const text = String(source || '').replace(/```([a-zA-Z0-9+#_-]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    blocks.push({ lang: lang || '', code: code.replace(/\s+$/, '') });
    return `${FENCE_MARK}FENCE${blocks.length - 1}${FENCE_MARK}`;
  });
  return { text, blocks };
}

/**
 * Renders Markdown to HTML.
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  const { text, blocks } = extractFences(source);
  const lines = String(text).split(/\r?\n/);
  const html = [];

  let listType = null;      // 'ul' | 'ol' | null
  let inQuote = false;
  let paragraph = [];

  const closeParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const closeQuote = () => {
    if (!inQuote) return;
    html.push('</blockquote>');
    inQuote = false;
  };
  const closeAll = () => {
    closeParagraph();
    closeList();
    closeQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    const fence = (line.startsWith(FENCE_MARK) && line.endsWith(FENCE_MARK))
      ? line.slice(FENCE_MARK.length, -FENCE_MARK.length)
      : null;
    if (fence) {
      closeAll();
      const block = blocks[Number(fence.replace('FENCE', ''))];
      const langLabel = block.lang ? `<span class="dcu-md-lang">${escapeHTML(block.lang)}</span>` : '';
      html.push(`<pre class="dcu-md-pre">${langLabel}<code>${highlightCode(block.code)}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      closeAll();
      continue;
    }

    const escaped = escapeHTML(line);

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      html.push(`<h${level} class="dcu-md-h">${renderInline(escapeHTML(heading[2]))}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeAll();
      html.push('<hr class="dcu-md-hr">');
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      if (!inQuote) {
        html.push('<blockquote class="dcu-md-quote">');
        inQuote = true;
      }
      html.push(`<p>${renderInline(escapeHTML(quote[1]))}</p>`);
      continue;
    }
    closeQuote();

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      closeParagraph();
      const wanted = unordered ? 'ul' : 'ol';
      if (listType !== wanted) {
        closeList();
        html.push(`<${wanted} class="dcu-md-list">`);
        listType = wanted;
      }
      html.push(`<li>${renderInline(escapeHTML((unordered || ordered)[1]))}</li>`);
      continue;
    }
    closeList();

    paragraph.push(renderInline(escaped));
  }

  closeAll();
  return html.join('');
}

/**
 * Finds fenced/indented code inside an already-rendered DC post body so it can
 * be highlighted without touching the rest of the post.
 * @param {string} text Plain text of the post body
 * @returns {Array<{lang: string, code: string}>}
 */
export function findCodeBlocks(text) {
  return extractFences(text).blocks;
}
