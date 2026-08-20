/**
 * CommentParser Module for DC Ultimate
 */
import { Comment } from '../utils/models.js';
import { SELECTORS } from '../adapters/selectors.js';

export class CommentParser {
  /**
   * Parse a single comment item LI node
   * @param {Element} commentElement LI element
   * @param {string} [articleId=null] Article ID
   * @returns {Comment|null}
   */
  parseComment(commentElement, articleId = null) {
    if (!commentElement) return null;

    try {
      const id = commentElement.getAttribute('data-no') || commentElement.id || null;
      const nickElem = commentElement.querySelector(SELECTORS.commentNick);
      const contentElem = commentElement.querySelector(SELECTORS.commentContent);
      const dateElem = commentElement.querySelector(SELECTORS.commentDate);
      const ipElem = commentElement.querySelector(SELECTORS.commentIp);
      const recElem = commentElement.querySelector('.cmt_up_num, .btn_cmt_up');

      if (!contentElem && !nickElem) return null;

      const author = nickElem ? (nickElem.getAttribute('data-nick') || nickElem.textContent.trim()) : '';
      const authorId = nickElem ? (nickElem.getAttribute('data-uid') || null) : null;
      const ip = ipElem ? ipElem.textContent.trim() : (nickElem ? nickElem.getAttribute('data-ip') : null);
      const content = contentElem ? contentElem.textContent.trim() : '';
      const date = dateElem ? dateElem.textContent.trim() : null;

      const recommendations = recElem ? (parseInt(recElem.textContent.replace(/[^0-9]/g, ''), 10) || 0) : 0;

      const isReply = commentElement.classList.contains('reply') || 
                      commentElement.classList.contains('cmt_reply') ||
                      Boolean(commentElement.querySelector('.icon_reply'));

      const replyToElem = commentElement.querySelector('.reply_target_nick');
      const replyTo = replyToElem ? replyToElem.textContent.trim() : null;

      return new Comment({
        id,
        articleId,
        author,
        authorId,
        ip,
        content,
        date,
        recommendations,
        isReply,
        replyTo
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Parse all comments in container
   * @param {Element|Document} container Container node
   * @param {string} [articleId=null] Article ID
   * @returns {Comment[]}
   */
  parseList(container = (typeof document !== 'undefined' ? document : null), articleId = null) {
    if (!container) return [];
    const items = container.querySelectorAll(SELECTORS.commentItems);
    const comments = [];
    items.forEach(item => {
      const parsed = this.parseComment(item, articleId);
      if (parsed) comments.push(parsed);
    });
    return comments;
  }
}

export const commentParser = new CommentParser();
