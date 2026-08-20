/**
 * DCInside 작성자 신분 판별 · 식별 키 정규화
 *
 * 신분과 DOM 신호 (`tests/fixtures/dc.html` 작성자 셀 50건 실측, 예외 없음):
 *   고닉   (fixed)     — data-uid 있음 + 닉 아이콘 `fix_nik.gif`
 *   반고닉 (semiFixed) — data-uid 있음 + 닉 아이콘 `nik.gif`
 *   유동닉 (floating)  — data-uid 없음 + data-ip (2옥텟)
 *
 * 두 아이콘 파일명이 사용자가 눈으로 보는 "회색 딱지 옆 노란점"의 정체다.
 *
 * 중요한 성질: **반고닉도 계정 uid를 가진다.** 닉네임이 `ㅇㅇ`처럼 겹쳐도
 * uid 로 개인 단위 구분이 되므로, 검색·메모는 닉네임이 아니라 uid 를 키로 써야 한다.
 * 반대로 유동닉은 2옥텟 IP 뿐이라 개인 식별이 원리적으로 불가능하다.
 *
 * 자세한 근거는 `SEMI_FIXED_NICKNAME_ANALYSIS.md`.
 */

export const USER_IDENTITY = {
  FIXED: 'fixed',
  SEMI_FIXED: 'semiFixed',
  FLOATING: 'floating',
  UNKNOWN: 'unknown'
};

export const USER_KEY_TYPES = {
  UID: 'uid',
  IP: 'ip',
  NICK: 'nick'
};

const IDENTITY_LABELS = {
  [USER_IDENTITY.FIXED]: '고닉',
  [USER_IDENTITY.SEMI_FIXED]: '반고닉',
  [USER_IDENTITY.FLOATING]: '유동닉',
  [USER_IDENTITY.UNKNOWN]: '알 수 없음'
};

/** 신분 코드 → 한국어 표기 */
export function identityLabel(identity) {
  return IDENTITY_LABELS[identity] || IDENTITY_LABELS[USER_IDENTITY.UNKNOWN];
}

/**
 * 닉 아이콘 파일명으로 고닉/반고닉을 가른다.
 *
 * 아이콘을 읽을 수 없는 화면(검색 결과 등)에서는 "회원인 것은 확실하지만 어느 쪽인지는
 * 모른다"가 정확한 답이므로 UNKNOWN 을 준다 — 고닉으로 단정하지 않는다.
 *
 * @param {{uid?: string, ip?: string, nikconSrc?: string}} user
 * @returns {'fixed'|'semiFixed'|'floating'|'unknown'}
 */
export function classifyIdentity({ uid = '', ip = '', nikconSrc = '' } = {}) {
  if (String(uid || '').trim()) {
    const src = String(nikconSrc || '');
    // `fix_nik.gif` 는 `nik` 을 부분 문자열로 포함하므로 반드시 먼저 본다.
    if (/fix_nik/i.test(src)) return USER_IDENTITY.FIXED;
    if (/nik/i.test(src)) return USER_IDENTITY.SEMI_FIXED;
    return USER_IDENTITY.UNKNOWN;
  }
  if (String(ip || '').trim()) return USER_IDENTITY.FLOATING;
  return USER_IDENTITY.UNKNOWN;
}

/**
 * 작성자를 비교 가능한 하나의 키로 정규화한다. 우선순위 uid > ip > nick.
 *
 * 반고닉은 uid 가 채워지므로 닉네임이 겹쳐도 서로 다른 키가 나온다.
 * 반면 `nick:` 키는 여러 사람을 한꺼번에 가리킬 수 있어 약한 키다 (`isAmbiguousKey`).
 *
 * @param {{nick?: string, uid?: string, ip?: string}} user
 * @returns {string} `uid:guest1433` / `ip:175.223` / `nick:ㅇㅇ`
 */
export function userKeyOf({ uid = '', ip = '', nick = '' } = {}) {
  const trimmedUid = String(uid || '').trim();
  if (trimmedUid) return `${USER_KEY_TYPES.UID}:${trimmedUid}`;

  const trimmedIp = String(ip || '').trim();
  if (trimmedIp) return `${USER_KEY_TYPES.IP}:${trimmedIp}`;

  return `${USER_KEY_TYPES.NICK}:${String(nick || '').trim()}`;
}

/**
 * 정규화 키를 되돌린다. `uid:guest1433` → `{ type: 'uid', value: 'guest1433' }`
 * @param {string} key
 * @returns {{type: string, value: string}}
 */
export function parseUserKey(key) {
  const text = String(key || '').trim();
  const match = text.match(/^(uid|ip|nick):([\s\S]*)$/);
  if (!match) return { type: USER_KEY_TYPES.NICK, value: text };
  return { type: match[1], value: match[2].trim() };
}

/**
 * 사람이 자유롭게 입력한 문자열을 정규화 키로 바꾼다.
 *
 * 이미 `uid:`/`ip:`/`nick:` 접두가 붙어 있으면 존중하고, 없으면 형태로 추론한다.
 * IP 모양(숫자와 점으로만 이루어짐)이면 `ip:`, 그 밖은 `nick:` 이다 — 닉네임과 계정
 * 아이디는 생김새가 겹쳐서 자동으로는 가릴 수 없으므로, uid 로 넣으려면 접두를 직접
 * 붙여야 한다.
 *
 * @param {string} input
 * @returns {string} 정규화 키. 빈 입력이면 빈 문자열.
 */
export function normalizeUserKey(input) {
  const text = String(input || '').trim();
  if (!text) return '';

  const prefixed = text.match(/^(uid|ip|nick):([\s\S]*)$/);
  if (prefixed) {
    const value = prefixed[2].trim();
    return value ? `${prefixed[1]}:${value}` : '';
  }

  if (/^\d{1,3}(\.\d{1,3}){1,3}$/.test(text)) return `${USER_KEY_TYPES.IP}:${text}`;
  return `${USER_KEY_TYPES.NICK}:${text}`;
}

/**
 * 이 키가 여러 사람을 가리킬 수 있는가?
 *
 * `nick:` 은 항상 약하다 (`ㅇㅇ` 하나에 반고닉 여럿 + 유동닉 여럿이 걸린다).
 * `ip:` 는 2옥텟까지만 공개되므로 대역을 공유하는 남을 함께 잡는다.
 * `uid:` 만 개인 단위로 안전하다.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isAmbiguousKey(key) {
  const { type } = parseUserKey(key);
  return type !== USER_KEY_TYPES.UID;
}

/**
 * `.gall_writer` 요소에서 닉네임·uid·IP·신분·정규화 키를 한 번에 읽는다.
 *
 * DOM 이 필요한 유일한 함수이므로, 백그라운드/테스트에서는 위의 순수 함수만 쓰면 된다.
 *
 * @param {Element|null} writer `.gall_writer, .ub-writer` 요소
 * @returns {{nick: string, uid: string, ip: string, nikconSrc: string, identity: string, key: string}|null}
 */
export function readWriterIdentity(writer) {
  if (!writer || typeof writer.getAttribute !== 'function') return null;

  const nick = writer.getAttribute('data-nick') || '';
  const uid = writer.getAttribute('data-uid') || '';
  const ip = writer.getAttribute('data-ip') || '';

  // 목록에서는 `<a class="writer_nikcon"><img src=".../fix_nik.gif">` 구조다.
  // 다른 화면에서 클래스가 달라도 파일명으로 찾을 수 있게 대체 선택자를 둔다.
  const icon = typeof writer.querySelector === 'function'
    ? writer.querySelector('.writer_nikcon img, img[src*="nik.gif"]')
    : null;
  const nikconSrc = icon ? (icon.getAttribute('src') || '') : '';

  return {
    nick,
    uid,
    ip,
    nikconSrc,
    identity: classifyIdentity({ uid, ip, nikconSrc }),
    key: userKeyOf({ uid, ip, nick })
  };
}
