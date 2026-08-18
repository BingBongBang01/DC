/**
 * Spam / 도배 Detector
 *
 * Pure detection logic for the three shapes of list spam the gallery sees:
 *   1. 동일 텍스트 반복 — the same (normalized) title posted N times
 *   2. 정규식 패턴     — user supplied patterns
 *   3. 특수문자 도배   — titles that are mostly symbols or one repeated char
 */

export const SPAM_REASONS = {
  DUPLICATE: 'duplicate',
  PATTERN: 'pattern',
  SPECIAL_CHARS: 'special_chars',
  REPEATED_CHAR: 'repeated_char'
};

export const DEFAULT_SPAM_OPTIONS = {
  duplicateThreshold: 3,     // 같은 제목이 이 횟수 이상이면 도배
  specialCharRatio: 0.6,     // 제목에서 특수문자 비율이 이 이상이면 도배
  minLengthForRatio: 6,      // 짧은 제목은 비율 판정에서 제외
  repeatedCharRun: 6,        // 같은 글자가 연속 이 횟수 이상 반복되면 도배
  patterns: []               // 사용자 정규식 목록
};

/**
 * Titles differ only by trailing decorations more often than not, so compare a
 * normalized form: lowercase, whitespace collapsed, DC's comment counter and
 * trailing punctuation removed.
 * @param {string} text
 * @returns {string}
 */
export function normalizeTitle(text) {
  return String(text || '')
    .replace(/\[\d+\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,!?~^\-_=+*#'"`\s]+$/u, '')
    .trim()
    .toLocaleLowerCase();
}

/**
 * Ratio of non-alphanumeric, non-Hangul, non-space characters.
 * @param {string} text
 * @returns {number} 0..1
 */
export function specialCharRatio(text) {
  const chars = Array.from(String(text || '').replace(/\s/g, ''));
  if (chars.length === 0) return 0;
  const special = chars.filter(ch => !/[0-9a-z가-힣ㄱ-ㆎ一-鿿぀-ヿ]/i.test(ch));
  return special.length / chars.length;
}

/**
 * Longest run of the same character.
 * @param {string} text
 * @returns {number}
 */
export function longestCharRun(text) {
  const chars = Array.from(String(text || '').replace(/\s/g, ''));
  let best = 0;
  let run = 0;
  let previous = null;

  for (const ch of chars) {
    if (ch === previous) {
      run++;
    } else {
      run = 1;
      previous = ch;
    }
    if (run > best) best = run;
  }
  return best;
}

/**
 * Counts how often each normalized title appears.
 * @param {Array<{title?: string}>} posts
 * @returns {Map<string, number>}
 */
export function buildDuplicateIndex(posts) {
  const index = new Map();
  for (const post of posts || []) {
    const key = normalizeTitle(post && post.title);
    if (!key) continue;
    index.set(key, (index.get(key) || 0) + 1);
  }
  return index;
}

/**
 * Compiles user patterns once per scan; invalid regexes are dropped rather
 * than throwing mid-scan.
 * @param {string[]} patterns
 * @returns {Array<{source: string, regex: RegExp}>}
 */
export function compilePatterns(patterns) {
  const compiled = [];
  for (const source of patterns || []) {
    const text = String(source || '').trim();
    if (!text) continue;
    try {
      compiled.push({ source: text, regex: new RegExp(text, 'i') });
    } catch (err) {
      // Ignore a broken pattern instead of breaking the whole filter.
    }
  }
  return compiled;
}

/**
 * Decides whether one post looks like spam.
 * @param {{title?: string, author?: string}} post
 * @param {{duplicateIndex?: Map<string, number>, compiledPatterns?: Array<{source: string, regex: RegExp}>}} context
 * @param {Partial<typeof DEFAULT_SPAM_OPTIONS>} [options]
 * @returns {{spam: boolean, reason: string|null, detail: string|null}}
 */
export function detectSpam(post, context = {}, options = {}) {
  const opts = { ...DEFAULT_SPAM_OPTIONS, ...options };
  const title = String((post && post.title) || '');
  const clean = { spam: false, reason: null, detail: null };

  if (!title.trim()) return clean;

  const patterns = context.compiledPatterns || compilePatterns(opts.patterns);
  for (const { source, regex } of patterns) {
    if (regex.test(title)) {
      return { spam: true, reason: SPAM_REASONS.PATTERN, detail: source };
    }
  }

  if (context.duplicateIndex) {
    const count = context.duplicateIndex.get(normalizeTitle(title)) || 0;
    if (count >= opts.duplicateThreshold) {
      return { spam: true, reason: SPAM_REASONS.DUPLICATE, detail: `동일 제목 ${count}건` };
    }
  }

  const run = longestCharRun(title);
  if (run >= opts.repeatedCharRun) {
    return { spam: true, reason: SPAM_REASONS.REPEATED_CHAR, detail: `같은 글자 ${run}회 반복` };
  }

  const stripped = title.replace(/\s/g, '');
  if (stripped.length >= opts.minLengthForRatio) {
    const ratio = specialCharRatio(title);
    if (ratio >= opts.specialCharRatio) {
      return { spam: true, reason: SPAM_REASONS.SPECIAL_CHARS, detail: `특수문자 ${Math.round(ratio * 100)}%` };
    }
  }

  return clean;
}

/**
 * Convenience wrapper: scans a whole list in one pass.
 * @param {Array<{title?: string}>} posts
 * @param {Partial<typeof DEFAULT_SPAM_OPTIONS>} [options]
 * @returns {Array<{post: Object, spam: boolean, reason: string|null, detail: string|null}>}
 */
export function scanPosts(posts, options = {}) {
  const opts = { ...DEFAULT_SPAM_OPTIONS, ...options };
  const context = {
    duplicateIndex: buildDuplicateIndex(posts),
    compiledPatterns: compilePatterns(opts.patterns)
  };

  return (posts || []).map(post => ({ post, ...detectSpam(post, context, opts) }));
}
