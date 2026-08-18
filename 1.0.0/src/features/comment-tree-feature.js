/**
 * CommentTreeFeature — 대댓글 트리(계층형) 변환 + 글쓴이 댓글 강조
 *
 * 디시 댓글은 대부분 한 줄로 나열되고, 답글 관계는 `@닉네임` 호출로만 남는다.
 * 이를 파싱해 레딧처럼 들여쓰기 구조로 재정렬하고, 본문 작성자의 댓글을
 * 따로 표시하거나 그 댓글만 모아 볼 수 있게 한다.
 *
 * 실제 마크업(2026-08 확인):
 *   <li id="comment_li_9194118" class="ub-content">
 *     <span class="gall_writer ub-writer" data-nick data-uid data-ip>
 *     <p class="usertxt ub-word">본문</p>
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { configManager } from '../core/config-manager.js';
import { buildCommentTree } from '../core/archive/activity-analyzer.js';

export class CommentTreeFeature extends BaseFeature {
  constructor() {
    super('enableCommentTree', 'Comment Tree', '대댓글 계층 정렬 및 글쓴이 댓글 강조');
    this.applied = false;
    this.authorOnly = false;
    this._originalOrder = null;
  }

  async onEnable() {
    this.apply();
  }

  async onDisable() {
    this.restore();
    document.querySelector('.dcu-cmt-toolbar')?.remove();
  }

  onPageChange() {
    this.applied = false;
    this._originalOrder = null;
    this.apply();
  }

  _list() {
    return document.querySelector('.cmt_list');
  }

  /**
   * 본문 작성자 식별자 (닉네임/uid/IP).
   * @returns {{nick: string, uid: string, ip: string}|null}
   */
  _postAuthor() {
    const writer = document.querySelector('.gallview_head .gall_writer, .view_content_wrap .gall_writer');
    if (!writer) return null;
    return {
      nick: writer.getAttribute('data-nick') || '',
      uid: writer.getAttribute('data-uid') || '',
      ip: writer.getAttribute('data-ip') || ''
    };
  }

  apply() {
    if (!this.enabled) return;
    const list = this._list();
    if (!list || list.dataset.dcuTreeApplied === '1') return;

    const items = Array.from(list.querySelectorAll(':scope > li.ub-content'));
    if (items.length === 0) return;

    list.dataset.dcuTreeApplied = '1';
    this._originalOrder = items.slice();

    const author = this._postAuthor();
    const parsed = items.map((li, index) => {
      const writer = li.querySelector('.gall_writer, .ub-writer');
      const text = li.querySelector('.usertxt, .cmt_txt')?.textContent || '';
      return {
        id: (li.id || `idx_${index}`).replace('comment_li_', ''),
        author: writer?.getAttribute('data-nick') || '',
        uid: writer?.getAttribute('data-uid') || '',
        ip: writer?.getAttribute('data-ip') || '',
        content: text.trim(),
        parentId: li.querySelector('.reply_target_nick') ? null : null,
        element: li
      };
    });

    // 글쓴이 댓글 표시 (트리 여부와 무관하게 항상 적용)
    let authorComments = 0;
    for (const comment of parsed) {
      const isAuthor = Boolean(author) && (
        (author.uid && comment.uid && author.uid === comment.uid) ||
        (!author.uid && author.ip && comment.ip && author.ip === comment.ip && author.nick === comment.author) ||
        (!author.uid && !author.ip && author.nick && author.nick === comment.author)
      );
      comment.isAuthor = isAuthor;
      comment.element.classList.toggle('dcu-cmt-author', isAuthor);
      if (isAuthor) {
        authorComments++;
        const writer = comment.element.querySelector('.gall_writer, .ub-writer');
        if (writer && !writer.querySelector('.dcu-cmt-author-badge')) {
          const badge = document.createElement('span');
          badge.className = 'dcu-cmt-author-badge';
          badge.textContent = '글쓴이';
          writer.appendChild(badge);
        }
      }
    }

    if (configManager.get('commentTreeEnabled') !== false) {
      this._reorder(list, parsed);
    }

    this._mountToolbar(list, parsed.length, authorComments);
  }

  /**
   * @param {Element} list
   * @param {Array<Object>} parsed
   */
  _reorder(list, parsed) {
    const tree = buildCommentTree(parsed.map(({ element, ...rest }) => rest));
    const byId = new Map(parsed.map(comment => [String(comment.id), comment.element]));

    let nested = 0;
    const fragment = document.createDocumentFragment();

    for (const node of tree) {
      const element = byId.get(String(node.id));
      if (!element) continue;
      const depth = Math.min(node.depth || 0, 6);
      element.classList.toggle('dcu-cmt-child', depth > 0);
      element.style.marginLeft = depth > 0 ? `${depth * 18}px` : '';
      element.dataset.dcuDepth = String(depth);
      if (depth > 0) nested++;
      fragment.appendChild(element);
    }

    list.appendChild(fragment);
    this.applied = true;
    logger.debug(`CommentTreeFeature: nested ${nested} reply/replies.`);
  }

  restore() {
    const list = this._list();
    if (!list || !this._originalOrder) return;

    this._originalOrder.forEach(li => {
      li.classList.remove('dcu-cmt-child');
      li.style.marginLeft = '';
      delete li.dataset.dcuDepth;
      list.appendChild(li);
    });

    list.querySelectorAll('.dcu-cmt-hidden').forEach(li => li.classList.remove('dcu-cmt-hidden'));
    this.applied = false;
  }

  _mountToolbar(list, total, authorComments) {
    document.querySelector('.dcu-cmt-toolbar')?.remove();

    const bar = document.createElement('div');
    bar.className = 'dcu-cmt-toolbar';
    bar.innerHTML = `
      <button type="button" class="dcu-cmt-btn" data-action="tree">${this.applied ? '원본 순서' : '트리 보기'}</button>
      <button type="button" class="dcu-cmt-btn" data-action="author">글쓴이 댓글만 (${authorComments})</button>
      <span class="dcu-cmt-count">댓글 ${total}개</span>`;

    list.parentElement?.insertBefore(bar, list);

    bar.querySelector('[data-action="tree"]')?.addEventListener('click', (event) => {
      if (this.applied) {
        this.restore();
        event.currentTarget.textContent = '트리 보기';
      } else {
        const items = Array.from(list.querySelectorAll(':scope > li.ub-content'));
        const parsed = items.map((li, index) => ({
          id: (li.id || `idx_${index}`).replace('comment_li_', ''),
          author: li.querySelector('.gall_writer, .ub-writer')?.getAttribute('data-nick') || '',
          content: (li.querySelector('.usertxt, .cmt_txt')?.textContent || '').trim(),
          element: li
        }));
        this._reorder(list, parsed);
        event.currentTarget.textContent = '원본 순서';
      }
    });

    bar.querySelector('[data-action="author"]')?.addEventListener('click', (event) => {
      this.authorOnly = !this.authorOnly;
      list.querySelectorAll(':scope > li.ub-content').forEach(li => {
        li.classList.toggle('dcu-cmt-hidden', this.authorOnly && !li.classList.contains('dcu-cmt-author'));
      });
      event.currentTarget.textContent = this.authorOnly
        ? `전체 댓글 보기 (${total})`
        : `글쓴이 댓글만 (${authorComments})`;
    });
  }
}

export const commentTreeFeature = new CommentTreeFeature();
