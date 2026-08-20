/**
 * UserNotesFeature — 유저 메모 (유저 규칙 저장소 위의 뷰)
 *
 * 예전에는 메모가 두 갈래였다. `userNotes` 저장소(설정 화면 전용, 페이지에는 안 보임)와
 * `UserRuleManager` 의 `label` 규칙(페이지에 메모 라벨을 실제로 그림)이 각각 따로 있어서,
 * 같은 사람에게 붙인 메모가 어디에 저장됐는지에 따라 보이기도 하고 안 보이기도 했다.
 *
 * 이제 정본은 **유저 규칙 하나**다. 이 클래스는 그 위에 "식별자 → 메모" 모양의 얇은 뷰를
 * 얹은 것이고, 저장은 전부 `dc_user_rules` 로 간다. 그래서 설정 화면에서 남긴 메모도
 * 페이지에 라벨로 뜬다.
 *
 * 다루는 규칙은 신분으로 사람을 가리키는 세 종류(`uid`/`ip`/`nick`)뿐이다.
 * `ipPrefix`·`regex` 규칙은 식별자 키로 표현되지 않으므로 이 뷰에 나오지 않는다
 * (사이드패널의 규칙 목록에서 다룬다).
 *
 * 근거와 배경은 `SEMI_FIXED_NICKNAME_ANALYSIS.md`.
 */
import { BaseFeature } from './base-feature.js';
import { storageManager } from '../core/storage-manager.js';
import { logger } from '../core/logger.js';
import {
  userRuleManager,
  USER_RULE_TYPES,
  USER_RULE_ACTIONS
} from '../core/filters/user-rule-manager.js';
import {
  normalizeUserKey,
  userKeyOf,
  identityLabel,
  parseUserKey,
  USER_IDENTITY
} from '../core/identity.js';

/** 메모 뷰가 다루는 규칙 종류 — 식별자로 사람을 가리키는 것만. */
const NOTE_RULE_TYPES = [USER_RULE_TYPES.UID, USER_RULE_TYPES.IP, USER_RULE_TYPES.NICK];

/** 예전 메모가 담겨 있던 저장소 키. 지금은 드레인 대상이다. */
export const LEGACY_NOTES_KEY = 'userNotes';

export class UserNotesFeature extends BaseFeature {
  constructor() {
    super('enableUserNotes', 'User Notes & Local Block', 'Attach local notes and activity tags to DCInside users');
  }

  async onEnable() {
    try {
      const moved = await this.migrateFromLegacyNotes();
      if (moved > 0) logger.info(`UserNotesFeature: merged ${moved} legacy note(s) into user rules`);
    } catch (err) {
      logger.debug('UserNotesFeature: legacy note merge skipped:', err);
    }
    logger.info('UserNotesFeature enabled.');
  }

  /**
   * 규칙 하나를 메모 모양으로 투영한다.
   * @param {Object} rule
   */
  _toNote(rule) {
    return {
      userKey: `${rule.type}:${rule.value}`,
      note: rule.memo || '',
      // `label` 액션은 순수 메모, 나머지(blind/hide/dim)는 뭔가 가리고 있다는 뜻이다.
      isBlocked: rule.action !== USER_RULE_ACTIONS.LABEL,
      action: rule.action,
      label: rule.label || '',
      identity: rule.identity || USER_IDENTITY.UNKNOWN,
      galleryId: rule.galleryId || null,
      updatedAt: new Date(rule.updatedAt || rule.createdAt || 0).toISOString(),
      ruleId: rule.id
    };
  }

  /**
   * Get all stored user notes — 식별자 키 → 메모.
   *
   * 같은 식별자에 전체 규칙과 갤러리 한정 규칙이 함께 있으면 전체 규칙을 대표로 쓰고,
   * 둘 다 갤러리 한정이면 최근에 고친 쪽을 쓴다 (뷰의 키는 갤러리를 구분하지 않는다).
   */
  async getAllNotes() {
    const rules = await userRuleManager.load(true);
    const map = {};

    for (const rule of rules) {
      if (!rule || !NOTE_RULE_TYPES.includes(rule.type) || !rule.value) continue;

      const note = this._toNote(rule);
      const existing = map[note.userKey];
      if (!existing) {
        map[note.userKey] = note;
        continue;
      }

      if (existing.galleryId === null) continue;
      if (note.galleryId === null || note.updatedAt > existing.updatedAt) {
        map[note.userKey] = note;
      }
    }

    return map;
  }

  /**
   * Get note for user key
   * @param {string} userKey `uid:guest1433` 또는 자유 입력 문자열
   * @returns {Object|null}
   */
  async getNote(userKey) {
    const key = normalizeUserKey(userKey);
    if (!key) return null;
    const notes = await this.getAllNotes();
    return notes[key] || null;
  }

  /**
   * 작성자 정보로 메모를 조회한다.
   * @param {{nick?: string, uid?: string, ip?: string}} user
   */
  async getNoteFor(user) {
    return this.getNote(userKeyOf(user || {}));
  }

  /**
   * Add or update note for a user key (nickname or IP or uid)
   *
   * 저장은 유저 규칙으로 간다. `isBlocked` 가 false 라도 이미 걸려 있는 차단을 메모로
   * 강등하지는 않는다 — 메모만 고치려다 차단이 풀리면 안 되기 때문이다.
   *
   * @param {string} userKey User key (자유 입력 문자열도 허용)
   * @param {string} note Content note
   * @param {boolean} [isBlocked=false] 차단(블라인드)까지 걸 것인지
   * @param {{label?: string, identity?: string, galleryId?: string|null}} [meta]
   */
  async setNote(userKey, note, isBlocked = false, meta = {}) {
    const key = normalizeUserKey(userKey);
    if (!key) return null;

    const { type, value } = parseUserKey(key);
    if (!value || !NOTE_RULE_TYPES.includes(type)) return null;

    const existing = (await this.getAllNotes())[key];
    const action = isBlocked
      ? USER_RULE_ACTIONS.BLIND
      : (existing && existing.action !== USER_RULE_ACTIONS.LABEL ? existing.action : USER_RULE_ACTIONS.LABEL);

    const rule = await userRuleManager.addRule({
      type,
      value,
      memo: note,
      action,
      galleryId: meta.galleryId !== undefined ? meta.galleryId : (existing ? existing.galleryId : null),
      label: meta.label,
      identity: meta.identity
    });

    logger.info(`UserNotesFeature: Updated note for ${key}`);
    return this._toNote(rule);
  }

  /**
   * 작성자 정보로 메모를 저장한다. 반고닉이면 uid 로 갈라져 개인 단위가 된다.
   * @param {{nick?: string, uid?: string, ip?: string, identity?: string}} user
   * @param {string} note
   * @param {boolean} [isBlocked=false]
   */
  async setNoteFor(user, note, isBlocked = false) {
    return this.setNote(userKeyOf(user || {}), note, isBlocked, {
      label: (user && user.nick) || '',
      identity: (user && user.identity) || USER_IDENTITY.UNKNOWN
    });
  }

  /**
   * Delete note for user key
   *
   * 같은 식별자를 가리키는 규칙이 전체·갤러리 한정으로 여럿 있으면 모두 지운다 —
   * 목록에서 지웠는데 행이 남아 있으면 안 되기 때문이다.
   * @param {string} userKey User key
   */
  async deleteNote(userKey) {
    const key = normalizeUserKey(userKey);
    if (!key) return;

    const { type, value } = parseUserKey(key);
    if (!value || !NOTE_RULE_TYPES.includes(type)) return;

    const rules = await userRuleManager.load(true);
    const remaining = rules.filter(rule => !(rule.type === type && rule.value === value));
    if (remaining.length !== rules.length) await userRuleManager.save(remaining);
  }

  /**
   * 예전 `userNotes` 저장소에 남은 메모를 유저 규칙으로 옮기고 저장소를 비운다.
   *
   * 한 번만 도는 마이그레이션이 아니라 **다시 돌 수 있는 드레인**이다: 백업 복원
   * (`DataManager.importJSON`)은 저장소 전체를 되돌려 놓으므로 옛 메모가 다시 나타날 수
   * 있고, 그때 또 흡수해야 한다. 비어 있으면 아무것도 쓰지 않는다.
   *
   * @returns {Promise<number>} 옮긴 항목 수
   */
  async migrateFromLegacyNotes() {
    const data = await storageManager.get(LEGACY_NOTES_KEY);
    const legacy = data[LEGACY_NOTES_KEY] || {};
    const entries = Object.entries(legacy);
    if (entries.length === 0) return 0;

    // 옛 키와 정규화된 키가 같은 사람을 가리킬 수 있다. 오래된 것부터 넣어 최신이 남게 한다.
    entries.sort(([, a], [, b]) => String(a?.updatedAt || '').localeCompare(String(b?.updatedAt || '')));

    let moved = 0;
    for (const [rawKey, value] of entries) {
      const saved = await this.setNote(rawKey, value?.note || '', Boolean(value?.isBlocked), {
        label: value?.label,
        identity: value?.identity
      });
      if (saved) moved++;
    }

    await storageManager.set({ [LEGACY_NOTES_KEY]: {} });
    return moved;
  }

  /**
   * 저장된 메모를 사람이 읽을 수 있는 한 줄로 만든다. (설정 화면 목록용)
   * @param {string} key
   * @param {{label?: string, identity?: string}} [entry]
   * @returns {string} 예: `ㅇㅇ · 반고닉 (uid:guest1433)`
   */
  describeKey(key, entry = {}) {
    const { type, value } = parseUserKey(key);
    const parts = [];
    if (entry.label) parts.push(entry.label);
    if (entry.identity && entry.identity !== USER_IDENTITY.UNKNOWN) {
      parts.push(identityLabel(entry.identity));
    }
    const head = parts.join(' · ');
    const tail = `${type}:${value}`;
    return head ? `${head} (${tail})` : tail;
  }

  /**
   * 메모가 페이지에서 어떻게 처리되는지 한국어로. (설정 화면 목록용)
   * @param {{action?: string, galleryId?: string|null}} entry
   */
  describeAction(entry = {}) {
    const labels = {
      [USER_RULE_ACTIONS.LABEL]: '메모만',
      [USER_RULE_ACTIONS.DIM]: '흐리게',
      [USER_RULE_ACTIONS.BLIND]: '차단(펼치기 가능)',
      [USER_RULE_ACTIONS.HIDE]: '완전히 숨김'
    };
    const action = labels[entry.action] || '메모만';
    return entry.galleryId ? `${action} · ${entry.galleryId} 갤러리` : action;
  }
}

export const userNotesFeature = new UserNotesFeature();
