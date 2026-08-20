/**
 * UserNotesFeature Module for DC Ultimate (Phase 4B)
 * Local user notes, local user blocks, and activity summary tracker
 *
 * 메모는 `uid:guest1433` 같은 **정규화 키**로 저장한다. 예전에는 사람이 설정 화면에
 * 자유 입력한 문자열이 그대로 키였는데, 그러면 `ㅇㅇ` 한 건이 서로 무관한 반고닉 여럿과
 * 유동닉 여럿을 동시에 가리켜 메모가 의미를 잃었다 (`SEMI_FIXED_NICKNAME_ANALYSIS.md`).
 * 기존 키는 `migrateLegacyKeys()` 가 한 번 정규화해서 옮긴다.
 */
import { BaseFeature } from './base-feature.js';
import { storageManager } from '../core/storage-manager.js';
import { logger } from '../core/logger.js';
import {
  normalizeUserKey,
  userKeyOf,
  identityLabel,
  parseUserKey,
  USER_IDENTITY,
  USER_KEY_TYPES
} from '../core/identity.js';

export class UserNotesFeature extends BaseFeature {
  constructor() {
    super('enableUserNotes', 'User Notes & Local Block', 'Attach local notes and activity tags to DCInside users');
  }

  async onEnable() {
    // 예전 자유 입력 키가 남아 있으면 이 시점에 한 번 정규화한다.
    try {
      const moved = await this.migrateLegacyKeys();
      if (moved > 0) logger.info(`UserNotesFeature: migrated ${moved} legacy note key(s)`);
    } catch (err) {
      logger.debug('UserNotesFeature: key migration skipped:', err);
    }
    logger.info('UserNotesFeature enabled.');
  }

  /**
   * Add or update note for a user key (nickname or IP or uid)
   *
   * 키는 정규화해서 저장하므로 `guest1433` 과 `uid:guest1433` 은 같은 메모가 된다.
   * @param {string} userKey User key (자유 입력 문자열도 허용)
   * @param {string} note Content note
   * @param {boolean} [isBlocked=false] Local block status
   * @param {{label?: string, identity?: string}} [meta] 표시용 부가 정보
   */
  async setNote(userKey, note, isBlocked = false, meta = {}) {
    const key = normalizeUserKey(userKey);
    if (!key) return;

    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};
    const previous = notesMap[key] || {};

    notesMap[key] = {
      userKey: key,
      note,
      isBlocked: Boolean(isBlocked),
      // 목록에서 `uid:guest1433` 만 보이면 누구인지 알 수 없으므로 마지막으로 관측된
      // 닉네임과 신분을 함께 남긴다.
      label: meta.label !== undefined ? meta.label : (previous.label || ''),
      identity: meta.identity || previous.identity || USER_IDENTITY.UNKNOWN,
      updatedAt: new Date().toISOString()
    };

    await storageManager.set({ userNotes: notesMap });
    logger.info(`UserNotesFeature: Updated note for ${key}`);
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
   * Get note for user key
   * @param {string} userKey User key
   * @returns {Object|null}
   */
  async getNote(userKey) {
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};
    const key = normalizeUserKey(userKey);
    // 아직 마이그레이션되지 않은 저장소에서도 찾히도록 원본 키까지 본다.
    return notesMap[key] || notesMap[String(userKey || '').trim()] || null;
  }

  /**
   * 작성자 정보로 메모를 조회한다.
   * @param {{nick?: string, uid?: string, ip?: string}} user
   */
  async getNoteFor(user) {
    return this.getNote(userKeyOf(user || {}));
  }

  /**
   * Delete note for user key
   * @param {string} userKey User key
   */
  async deleteNote(userKey) {
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};
    const raw = String(userKey || '').trim();
    const key = normalizeUserKey(raw);

    delete notesMap[key];
    // 마이그레이션 전 데이터를 지우는 경우도 있으므로 원본 키도 함께 정리한다.
    if (raw && raw !== key) delete notesMap[raw];

    await storageManager.set({ userNotes: notesMap });
  }

  /**
   * Get all stored user notes
   */
  async getAllNotes() {
    const data = await storageManager.get('userNotes');
    return data.userNotes || {};
  }

  /**
   * 예전 자유 입력 키를 정규화 키로 옮긴다.
   *
   * 두 개의 옛 키가 같은 정규화 키로 합쳐지면 `updatedAt` 이 늦은 쪽을 남긴다.
   * 이미 정규화된 저장소에서는 아무것도 쓰지 않는다.
   *
   * @returns {Promise<number>} 옮긴 항목 수
   */
  async migrateLegacyKeys() {
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};

    const next = {};
    let moved = 0;

    for (const [rawKey, value] of Object.entries(notesMap)) {
      const key = normalizeUserKey(rawKey);
      if (!key) continue;
      if (key !== rawKey) moved++;

      const entry = { ...value, userKey: key };
      if (entry.identity === undefined) entry.identity = USER_IDENTITY.UNKNOWN;
      if (entry.label === undefined) {
        // 옛 키가 닉네임이었다면 그 문자열이 곧 표시용 이름이다.
        const { type, value: parsed } = parseUserKey(key);
        entry.label = type === USER_KEY_TYPES.NICK ? parsed : '';
      }

      const existing = next[key];
      if (existing && String(existing.updatedAt || '') > String(entry.updatedAt || '')) continue;
      next[key] = entry;
    }

    // 키 이동뿐 아니라 label/identity 백필도 저장 대상이다. 아무것도 안 바뀌었으면 쓰지 않는다.
    // (`next` 는 `notesMap` 순회 순서로 만들어지므로 변화가 없으면 직렬화 결과가 같다.)
    if (moved === 0 && JSON.stringify(notesMap) === JSON.stringify(next)) return 0;

    await storageManager.set({ userNotes: next });
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
}

export const userNotesFeature = new UserNotesFeature();
