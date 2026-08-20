/**
 * UserNotesFeature Module for DC Ultimate (Phase 4B)
 * Local user notes, local user blocks, and activity summary tracker
 */
import { BaseFeature } from './base-feature.js';
import { storageManager } from '../core/storage-manager.js';
import { logger } from '../core/logger.js';

export class UserNotesFeature extends BaseFeature {
  constructor() {
    super('enableUserNotes', 'User Notes & Local Block', 'Attach local notes and activity tags to DCInside users');
  }

  async onEnable() {
    logger.info('UserNotesFeature enabled.');
  }

  /**
   * Add or update note for a user key (nickname or IP or uid)
   * @param {string} userKey User key
   * @param {string} note Content note
   * @param {boolean} [isBlocked=false] Local block status
   */
  async setNote(userKey, note, isBlocked = false) {
    if (!userKey) return;
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};

    notesMap[userKey] = {
      userKey,
      note,
      isBlocked: Boolean(isBlocked),
      updatedAt: new Date().toISOString()
    };

    await storageManager.set({ userNotes: notesMap });
    logger.info(`UserNotesFeature: Updated note for ${userKey}`);
  }

  /**
   * Get note for user key
   * @param {string} userKey User key
   * @returns {Object|null}
   */
  async getNote(userKey) {
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};
    return notesMap[userKey] || null;
  }

  /**
   * Delete note for user key
   * @param {string} userKey User key
   */
  async deleteNote(userKey) {
    const data = await storageManager.get('userNotes');
    const notesMap = data.userNotes || {};
    delete notesMap[userKey];
    await storageManager.set({ userNotes: notesMap });
  }

  /**
   * Get all stored user notes
   */
  async getAllNotes() {
    const data = await storageManager.get('userNotes');
    return data.userNotes || {};
  }
}

export const userNotesFeature = new UserNotesFeature();
