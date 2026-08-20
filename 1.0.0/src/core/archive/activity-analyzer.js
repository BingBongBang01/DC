/**
 * 유저 활동 · 갤러리 지분율 분석 (순수 함수)
 *
 * Works on the records the archive keeps, so the same code can run in the
 * background (Side Panel queries) and be unit tested without a DOM.
 */
import { userKeyOf, parseUserKey } from '../identity.js';

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
 * IP 대역(앞 두 옥텟). 디시가 유동닉 IP 를 이미 2옥텟까지만 공개하므로 목록에서 모은
 * 값에 대해서는 입력과 같은 값이 나온다 — 대역 비교는 반드시 이 함수끼리 해야 하고,
 * `ip.startsWith(band + '.')` 같은 접두 비교는 2옥텟 입력에서 절대 참이 되지 않는다.
 * @param {string} ip
 * @returns {string}
 */
export function ipBand(ip) {
  return String(ip || '').split('.').slice(0, 2).join('.');
}

/**
 * 한 닉네임을 실제로 몇 명이 쓰고 있는지 — `nick` 규칙의 사정거리.
 *
 * `ㅇㅇ` 처럼 겹치는 닉네임에 차단 규칙을 걸면 무관한 다수가 함께 걸린다. 규칙을 만들기
 * 전에 그 범위를 숫자로 보여주기 위한 집계다.
 *
 * 정확히 무엇을 세는지:
 *   - `accountCount` — uid 를 가진 계정 수. 아카이브에는 닉 아이콘 정보가 없어
 *     고닉과 반고닉을 가릴 수 없으므로 둘을 합쳐 센다.
 *   - `ipCount` — 서로 다른 유동닉 IP 수. **사람 수가 아니다**: 한 사람이 대역을
 *     바꾸면 여러 개로, 남 여럿이 한 대역을 쓰면 하나로 세어진다.
 *   - 아카이브에 없는 사람은 세어지지 않으므로 전체가 아니라 **하한값**이다.
 *
 * @param {Array<Object>} records 아카이브 글·댓글 레코드
 * @param {string} nickname
 * @returns {{nickname: string, sampled: number, holders: Array<{authorKey: string, count: number}>, accountCount: number, ipCount: number}}
 */
export function nicknameHolders(records, nickname) {
  const wanted = String(nickname || '').trim();
  if (!wanted) return { nickname: '', sampled: 0, holders: [], accountCount: 0, ipCount: 0 };

  const holders = new Map();
  let sampled = 0;

  for (const record of records || []) {
    if (String(record.author || '').trim() !== wanted) continue;
    sampled++;

    const key = record.authorKey
      || userKeyOf({ uid: record.authorId, ip: record.ip, nick: record.author });
    const entry = holders.get(key) || { authorKey: key, count: 0 };
    entry.count++;
    holders.set(key, entry);
  }

  const list = Array.from(holders.values()).sort((a, b) => b.count - a.count);

  let accountCount = 0;
  let ipCount = 0;
  for (const holder of list) {
    const { type } = parseUserKey(holder.authorKey);
    if (type === 'uid') accountCount++;
    else if (type === 'ip') ipCount++;
  }

  return { nickname: wanted, sampled, holders: list, accountCount, ipCount };
}

/**
 * 같은 IP 대역(앞 두 옥텟)에서 여러 닉네임이 나오는지 — 통피/다중 계정 의심 신호.
 *
 * 주의: DC 가 유동닉 IP 를 이미 2옥텟까지만 공개하므로(`175.223`), 아래 `slice(0, 2)` 는
 * 목록에서 수집한 데이터에 대해서는 값을 바꾸지 않는다. 즉 이 함수의 "대역 묶기"는
 * 실질적으로 정확한 IP 일치와 같다. 그리고 하나의 2옥텟 대역에는 무관한 사람이 다수
 * 들어오므로, 여기서 나온 결과는 다중 계정의 **증거가 아니라 단서**로만 써야 한다
 * (`ㅇㅇ` 같은 흔한 닉네임은 서로 남인데도 함께 잡힌다).
 *
 * @param {Array<Object>} posts
 * @param {number} [minNicknames=3]
 * @returns {Array<{band: string, nicknames: string[], count: number}>}
 */
export function suspiciousIpBands(posts, minNicknames = 3) {
  const bands = new Map();

  for (const post of posts || []) {
    if (!post.ip) continue;
    const band = ipBand(post.ip);
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
