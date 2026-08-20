/**
 * User Rule Manager (IP / 닉네임 메모 및 차단)
 *
 * One rule targets a DCInside identity and says what to do with their posts
 * and comments: hide them, dim them, or just label them so they are easy to
 * spot.
 *
 * Identity shapes on DCInside (all read from `.gall_writer`):
 *   - 고닉 (fixed nickname): data-uid is set  → match by `uid`
 *   - 유동/통피 (anonymous):  data-ip is set   → match by `ip` or `ipPrefix`
 *   - nickname text is never unique on its own, so `nick` rules exist but are
 *     documented as weaker in the UI.
 */
import { storageManager } from '../storage-manager.js';
import { logger } from '../logger.js';

export const USER_RULE_KEY = 'dc_user_rules';

export const USER_RULE_TYPES = {
  UID: 'uid',
  NICK: 'nick',
  IP: 'ip',
  IP_PREFIX: 'ipPrefix',
  REGEX: 'regex'
};

export const USER_RULE_ACTIONS = {
  BLIND: 'blind', // 글/댓글을 접어서 숨김 (펼치기 가능)
  HIDE: 'hide',   // 목록에서 완전히 제거
  DIM: 'dim',     // 흐리게
  LABEL: 'label'  // 메모 라벨만 표시
};

/**
 * @typedef {Object} UserRule
 * @property {string} id
 * @property {'uid'|'nick'|'ip'|'ipPrefix'|'regex'} type
 * @property {string} value
 * @property {'blind'|'hide'|'dim'|'label'} action
 * @property {string} memo 식별용 메모 (라벨로 표시)
 * @property {string|null} galleryId null이면 전체 갤러리
 * @property {boolean} enabled
 * @property {number} createdAt
 * @property {number} hitCount
 */

/**
 * Normalizes a writer element's data into a comparable identity.
 * @param {{nick?: string, uid?: string, ip?: string}} user
 */
export function normalizeUser(user = {}) {
  return {
    nick: (user.nick || '').trim(),
    uid: (user.uid || '').trim(),
    ip: (user.ip || '').trim()
  };
}

/**
 * Does one rule apply to this writer?
 * @param {UserRule} rule
 * @param {{nick?: string, uid?: string, ip?: string}} rawUser
 * @param {string} [galleryId]
 * @returns {boolean}
 */
export function matchUserRule(rule, rawUser, galleryId = '') {
  if (!rule || rule.enabled === false || !rule.value) return false;
  if (rule.galleryId && galleryId && rule.galleryId !== galleryId) return false;

  const user = normalizeUser(rawUser);
  const value = String(rule.value).trim();
  if (!value) return false;

  switch (rule.type) {
    case USER_RULE_TYPES.UID:
      return Boolean(user.uid) && user.uid.toLowerCase() === value.toLowerCase();

    case USER_RULE_TYPES.NICK:
      return Boolean(user.nick) && user.nick.toLowerCase() === value.toLowerCase();

    case USER_RULE_TYPES.IP:
      return Boolean(user.ip) && user.ip === value;

    case USER_RULE_TYPES.IP_PREFIX: {
      // "223.39" matches 223.39.x — compare octet by octet so "223.3" does not
      // accidentally match "223.39".
      if (!user.ip) return false;
      const wanted = value.split('.').filter(Boolean);
      const actual = user.ip.split('.').filter(Boolean);
      if (wanted.length === 0 || wanted.length > actual.length) return false;
      return wanted.every((part, index) => part === actual[index]);
    }

    case USER_RULE_TYPES.REGEX:
      try {
        const regex = new RegExp(value, 'i');
        return regex.test(user.nick) || regex.test(user.uid) || regex.test(user.ip);
      } catch (err) {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Finds the strongest rule for a writer. Order: hide > blind > dim > label,
 * so a blocked user is never merely labelled.
 * @param {UserRule[]} rules
 * @param {{nick?: string, uid?: string, ip?: string}} user
 * @param {string} [galleryId]
 * @returns {UserRule|null}
 */
export function findMatchingRule(rules, user, galleryId = '') {
  if (!Array.isArray(rules) || rules.length === 0) return null;

  const weight = {
    [USER_RULE_ACTIONS.HIDE]: 4,
    [USER_RULE_ACTIONS.BLIND]: 3,
    [USER_RULE_ACTIONS.DIM]: 2,
    [USER_RULE_ACTIONS.LABEL]: 1
  };

  let best = null;
  for (const rule of rules) {
    if (!matchUserRule(rule, user, galleryId)) continue;
    if (!best || (weight[rule.action] || 0) > (weight[best.action] || 0)) {
      best = rule;
    }
  }
  return best;
}

export class UserRuleManager {
  constructor() {
    this.rules = [];
    this.loaded = false;
  }

  async load(force = false) {
    if (this.loaded && !force) return this.rules;
    const data = await storageManager.get(USER_RULE_KEY);
    this.rules = Array.isArray(data[USER_RULE_KEY]) ? data[USER_RULE_KEY] : [];
    this.loaded = true;
    return this.rules;
  }

  async save(rules) {
    this.rules = rules;
    this.loaded = true;
    await storageManager.set({ [USER_RULE_KEY]: rules });
  }

  /**
   * @param {Partial<UserRule>} data
   * @returns {Promise<UserRule>}
   */
  async addRule(data = {}) {
    const type = Object.values(USER_RULE_TYPES).includes(data.type) ? data.type : USER_RULE_TYPES.NICK;
    const value = String(data.value || '').trim();
    if (!value) throw new Error('차단/메모할 대상(닉네임·아이디·IP)을 입력해 주세요.');

    if (type === USER_RULE_TYPES.REGEX) {
      try {
        new RegExp(value, 'i');
      } catch (err) {
        throw new Error(`정규식이 올바르지 않습니다: ${value}`);
      }
    }

    const rules = await this.load(true);
    const duplicate = rules.find(r => r.type === type && r.value === value && (r.galleryId || null) === (data.galleryId || null));
    if (duplicate) {
      return this.updateRule(duplicate.id, {
        action: data.action || duplicate.action,
        memo: data.memo !== undefined ? data.memo : duplicate.memo
      });
    }

    const rule = {
      id: crypto.randomUUID(),
      type,
      value,
      action: Object.values(USER_RULE_ACTIONS).includes(data.action) ? data.action : USER_RULE_ACTIONS.BLIND,
      memo: String(data.memo || '').slice(0, 200),
      galleryId: data.galleryId || null,
      enabled: data.enabled !== false,
      createdAt: Date.now(),
      hitCount: 0
    };

    rules.push(rule);
    await this.save(rules);
    logger.info(`UserRuleManager: added ${rule.type}:${rule.value} (${rule.action})`);
    return rule;
  }

  async updateRule(id, updates = {}) {
    const rules = await this.load(true);
    const index = rules.findIndex(r => r.id === id);
    if (index === -1) throw new Error('규칙을 찾을 수 없습니다.');

    rules[index] = { ...rules[index], ...updates, id: rules[index].id };
    await this.save(rules);
    return rules[index];
  }

  async deleteRule(id) {
    const rules = await this.load(true);
    await this.save(rules.filter(r => r.id !== id));
  }

  /**
   * Bumps how often a rule actually matched, so dead rules are easy to spot.
   * @param {Record<string, number>} counts ruleId -> hits
   */
  async recordHits(counts) {
    const entries = Object.entries(counts || {}).filter(([, n]) => n > 0);
    if (entries.length === 0) return;

    const rules = await this.load(true);
    let changed = false;
    for (const [id, hits] of entries) {
      const rule = rules.find(r => r.id === id);
      if (rule) {
        rule.hitCount = (rule.hitCount || 0) + hits;
        changed = true;
      }
    }
    if (changed) await this.save(rules);
  }
}

export const userRuleManager = new UserRuleManager();
