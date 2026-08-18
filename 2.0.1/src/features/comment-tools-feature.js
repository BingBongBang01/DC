/**
 * CommentToolsFeature Module for DC Ultimate (Phase 4C)
 * Comment panel, comment search, comment filtering, reply visibility, and comment JSON/CSV export
 */
import { BaseFeature } from './base-feature.js';
import { commentParser } from '../parser/comment-parser.js';
import { logger } from '../core/logger.js';

export class CommentToolsFeature extends BaseFeature {
  constructor() {
    super('enableCommentTools', 'Comment Analysis & Export Tools', 'Search, filter, toggle replies, and export article comments to JSON or CSV');
  }

  async onEnable() {
    logger.info('CommentToolsFeature enabled.');
  }

  /**
   * Export comment array to JSON string
   * @param {Comment[]} comments Array of Comment objects
   * @returns {string} JSON string
   */
  exportToJSON(comments) {
    return JSON.stringify(comments || [], null, 2);
  }

  /**
   * Export comment array to CSV string
   * @param {Comment[]} comments Array of Comment objects
   * @returns {string} CSV string
   */
  exportToCSV(comments) {
    if (!Array.isArray(comments) || comments.length === 0) {
      return 'ID,Author,IP,Content,Date,IsReply\n';
    }

    const headers = ['ID', 'Author', 'IP', 'Content', 'Date', 'IsReply'];
    const rows = comments.map(c => [
      `"${c.id || ''}"`,
      `"${(c.author || '').replace(/"/g, '""')}"`,
      `"${c.ip || ''}"`,
      `"${(c.content || '').replace(/"/g, '""')}"`,
      `"${c.date || ''}"`,
      c.isReply ? 'TRUE' : 'FALSE'
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

export const commentToolsFeature = new CommentToolsFeature();
