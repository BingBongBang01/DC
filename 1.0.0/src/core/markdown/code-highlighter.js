/**
 * Minimal syntax highlighter.
 *
 * The extension's CSP forbids loading a highlighter from a CDN, so this is a
 * small tokenizer that covers the languages a DCInside dev gallery actually
 * posts (JS/TS, Python, Java/C-family, SQL, shell) plus a generic fallback.
 * It emits escaped HTML with `dcu-tok-*` classes — never raw input.
 */
import { escapeHTML } from '../../utils/sanitizer.js';

const KEYWORDS = {
  common: [
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return',
    'function', 'class', 'new', 'this', 'try', 'catch', 'finally', 'throw', 'import',
    'from', 'export', 'default', 'const', 'let', 'var', 'async', 'await', 'yield',
    'def', 'elif', 'lambda', 'pass', 'with', 'as', 'in', 'is', 'not', 'and', 'or',
    'public', 'private', 'protected', 'static', 'void', 'int', 'float', 'double',
    'boolean', 'char', 'long', 'short', 'struct', 'enum', 'interface', 'extends',
    'implements', 'package', 'null', 'true', 'false', 'None', 'True', 'False',
    'select', 'insert', 'update', 'delete', 'where', 'join', 'group', 'order', 'by',
    'echo', 'fi', 'then', 'elsif', 'end', 'module', 'require', 'type', 'typeof'
  ]
};

const KEYWORD_SET = new Set(KEYWORDS.common.map(k => k.toLowerCase()));

/**
 * Splits source into typed tokens. Strings and comments win over everything
 * else so keywords inside them are not highlighted.
 * @param {string} code
 * @returns {Array<{type: string, text: string}>}
 */
export function tokenize(code) {
  const source = String(code || '');
  const tokens = [];
  let buffer = '';

  const flush = () => {
    if (!buffer) return;
    const lower = buffer.toLowerCase();
    if (KEYWORD_SET.has(lower)) {
      tokens.push({ type: 'keyword', text: buffer });
    } else if (/^[0-9][0-9a-fx._]*$/i.test(buffer)) {
      tokens.push({ type: 'number', text: buffer });
    } else {
      tokens.push({ type: 'plain', text: buffer });
    }
    buffer = '';
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    // Line comments: // ... , # ... , -- ...
    if ((ch === '/' && next === '/') || ch === '#' || (ch === '-' && next === '-')) {
      flush();
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      tokens.push({ type: 'comment', text: source.slice(i, end) });
      i = end - 1;
      continue;
    }

    // Block comments
    if (ch === '/' && next === '*') {
      flush();
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      tokens.push({ type: 'comment', text: source.slice(i, stop) });
      i = stop - 1;
      continue;
    }

    // Strings (single, double, backtick) — no escapes across newlines
    if (ch === '"' || ch === "'" || ch === '`') {
      flush();
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === ch) break;
        if (source[j] === '\n' && ch !== '`') break;
        j++;
      }
      tokens.push({ type: 'string', text: source.slice(i, Math.min(j + 1, source.length)) });
      i = j;
      continue;
    }

    if (/[A-Za-z0-9_$]/.test(ch)) {
      buffer += ch;
      continue;
    }

    flush();
    tokens.push({ type: /[{}()[\].,;:]/.test(ch) ? 'punct' : 'plain', text: ch });
  }

  flush();
  return tokens;
}

/**
 * Highlights code into escaped HTML.
 * @param {string} code
 * @returns {string} HTML safe to inject
 */
export function highlightCode(code) {
  return tokenize(code)
    .map(({ type, text }) => {
      const safe = escapeHTML(text);
      return type === 'plain' ? safe : `<span class="dcu-tok-${type}">${safe}</span>`;
    })
    .join('');
}
