/**
 * 유저 활동 · 갤러리 지분율 분석 (순수 함수)
 *
 * Works on the records the archive keeps, so the same code can run in the
 * background (Side Panel queries) and be unit tested without a DOM.
 */

/**
 * DCInside 날짜 문자열을 시각으로 바꾼다.
 * 목록은 `13:02`(오늘) 또는 `08.09`(지난 날), 상세/타이틀은 `2026-08-09 13:02:45`.
 * @param {string|number|null} value
 * @param {number} [now=Date.now()] 기준 시각 (테스트 주입용)
 * @returns {number|null} epoch ms
 */
export function parseDcDate(value, now = Date.now()) {
  if (!value) return null;
  if (typeof value === 'number') return value;

  const text = String(value).trim();

  const full = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (full) {
    const [, y, mo, d, h, mi, se] = full;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se || 0)).getTime();
  }

  const base = new Date(now);

  const timeOnly = text.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(timeOnly[1]), Number(timeOnly[2]));
    return date.getTime();
  }

  const monthDay = text.match(/^(\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (monthDay) {
    const month = Number(monthDay[1]) - 1;
    const day = Number(monthDay[2]);
    let year = base.getFullYear();
    // 12월 글을 1월에 보면 작년 글이다.
    if (month > base.getMonth()) year -= 1;
    return new Date(year, month, day, Number(monthDay[3] || 0), Number(monthDay[4] || 0)).getTime();
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 한 유저의 활동 요약.
 * @param {{posts: Array<Object>, comments: Array<Object>}} activity
 * @param {number} [now=Date.now()]
 * @returns {{postCount: number, commentCount: number, firstSeen: number|null, lastSeen: number|null, hours: number[], nicknames: string[], ips: string[], recentPosts: Array<Object>}}
 */
export function summarizeUserActivity(activity, now = Date.now()) {
  const posts = activity?.posts || [];
  const comments = activity?.comments || [];
  const hours = new Array(24).fill(0);
  const nicknames = new Set();
  const ips = new Set();

  let firstSeen = null;
  let lastSeen = null;

  for (const item of [...posts, ...comments]) {
    if (item.author) nicknames.add(item.author);
    if (item.ip) ips.add(item.ip);

    const at = parseDcDate(item.date, now) ?? item.capturedAt ?? null;
    if (at === null) continue;

    hours[new Date(at).getHours()]++;
    if (firstSeen === null || at < firstSeen) firstSeen = at;
    if (lastSeen === null || at > lastSeen) lastSeen = at;
  }

  const recentPosts = [...posts]
    .sort((a, b) => (b.postNo || 0) - (a.postNo || 0))
    .slice(0, 10);

  return {
    postCount: posts.length,
    commentCount: comments.length,
    firstSeen,
    lastSeen,
    hours,
    nicknames: Array.from(nicknames),
    ips: Array.from(ips),
    recentPosts
  };
}

/**
 * 갤러리 지분율: 최근 N개 글 중 각 작성자가 차지하는 비율.
 * @param {Array<Object>} posts 최신순 게시글 레코드
 * @param {number} [sampleSize=200]
 * @returns {{sampled: number, entries: Array<{authorKey: string, label: string, nicknames: string[], count: number, share: number}>}}
 */
export function galleryShareStats(posts, sampleSize = 200) {
  const sample = (posts || []).slice(0, sampleSize);
  const groups = new Map();

  for (const post of sample) {
    const key = post.authorKey || 'nick:';
    const entry = groups.get(key) || {
      authorKey: key,
      label: '',
      nicknames: new Set(),
      ips: new Set(),
      count: 0
    };
    entry.count++;
    if (post.author) entry.nicknames.add(post.author);
    if (post.ip) entry.ips.add(post.ip);
    groups.set(key, entry);
  }

  const entries = Array.from(groups.values())
    .map(entry => {
      const nicknames = Array.from(entry.nicknames);
      const ips = Array.from(entry.ips);
      const [kind, value] = entry.authorKey.split(/:(.+)/);
      const label = kind === 'uid'
        ? (nicknames[0] || value)
        : kind === 'ip'
          ? `${nicknames[0] || '유동'} (${value})`
          : (value || '익명');

      return {
        authorKey: entry.authorKey,
        label,
        nicknames,
        ips,
        count: entry.count,
        share: sample.length ? entry.count / sample.length : 0
      };
    })
    .sort((a, b) => b.count - a.count);

  return { sampled: sample.length, entries };
}

/**
 * 같은 IP 대역(앞 두 옥텟)에서 여러 닉네임이 나오는지 — 통피/다중 계정 의심 신호.
 * @param {Array<Object>} posts
 * @param {number} [minNicknames=3]
 * @returns {Array<{band: string, nicknames: string[], count: number}>}
 */
export function suspiciousIpBands(posts, minNicknames = 3) {
  const bands = new Map();

  for (const post of posts || []) {
    if (!post.ip) continue;
    const band = post.ip.split('.').slice(0, 2).join('.');
    if (!band) continue;

    const entry = bands.get(band) || { band, nicknames: new Set(), count: 0 };
    entry.count++;
    if (post.author) entry.nicknames.add(post.author);
    bands.set(band, entry);
  }

  return Array.from(bands.values())
    .map(entry => ({ band: entry.band, nicknames: Array.from(entry.nicknames), count: entry.count }))
    .filter(entry => entry.nicknames.length >= minNicknames)
    .sort((a, b) => b.count - a.count);
}
