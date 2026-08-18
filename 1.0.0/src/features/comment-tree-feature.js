/**
 * CommentTreeFeature — 글쓴이 댓글 강조 / 모아보기
 *
 * 댓글은 디시가 그려 준 원본 순서 그대로 둔다. 대댓글은 디시 자체 UI가 이미
 * `↳`와 들여쓰기로 표현하고 있어, 확장에서 DOM을 다시 쌓으면 답글이 원 댓글보다
 * 위로 올라가는 등 순서가 어긋난다. 그래서 이 기능은 순서를 건드리지 않고
 * 본문 작성자의 댓글을 표시하거나 그 댓글만 모아 보는 일만 한다.
 *
 * 실제 마크업(2026-08 확인):
 *   <li id="comment_li_9194118" class="ub-content">
 *     <span class="gall_writer ub-writer" data-nick data-uid data-ip>
 *     <p class="usertxt ub-word">본문</p>
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';

export class CommentTreeFeature extends BaseFeature {
  constructor() {
    super('enableCommentTree', 'Comment Tree', '글쓴이 댓글 강조 및 모아보기');
    this.authorOnly = false;
  }

  async onEnable() {
    this.apply();
  }

  async onDisable() {
    this.restore();
    document.querySelector('.dcu-cmt-toolbar')?.remove();
  }

  onPageChange() {
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
    if (!list) return;

    const items = Array.from(list.querySelectorAll('li.ub-content'));
    if (items.length === 0) return;

    const author = this._postAuthor();
    let authorComments = 0;

    for (const li of items) {
      const writer = li.querySelector('.gall_writer, .ub-writer');
      const nick = writer?.getAttribute('data-nick') || '';
      const uid = writer?.getAttribute('data-uid') || '';
      const ip = writer?.getAttribute('data-ip') || '';

      const isAuthor = Boolean(author) && (
        (author.uid && uid && author.uid === uid) ||
        (!author.uid && author.ip && ip && author.ip === ip && author.nick === nick) ||
        (!author.uid && !author.ip && author.nick && author.nick === nick)
      );

      li.classList.toggle('dcu-cmt-author', isAuthor);
      if (!isAuthor) continue;

      authorComments++;
      if (writer && !writer.querySelector('.dcu-cmt-author-badge')) {
        const badge = document.createElement('span');
        badge.className = 'dcu-cmt-author-badge';
        badge.textContent = '글쓴이';
        writer.appendChild(badge);
      }
    }

    logger.debug(`CommentTreeFeature: marked ${authorComments}/${items.length} comment(s) by the post author.`);
    this._mountToolbar(list, items.length, authorComments);
  }

  /** 숨김만 되돌린다 — 순서는 애초에 건드리지 않는다. */
  restore() {
    this.authorOnly = false;
    this._list()?.querySelectorAll('.dcu-cmt-hidden').forEach(li => li.classList.remove('dcu-cmt-hidden'));
  }

  _mountToolbar(list, total, authorComments) {
    document.querySelector('.dcu-cmt-toolbar')?.remove();
    if (authorComments === 0) return;

    const bar = document.createElement('div');
    bar.className = 'dcu-cmt-toolbar';
    bar.innerHTML = `
      <button type="button" class="dcu-cmt-btn" data-action="author">글쓴이 댓글만 (${authorComments})</button>
      <span class="dcu-cmt-count">댓글 ${total}개</span>`;

    list.parentElement?.insertBefore(bar, list);

    bar.querySelector('[data-action="author"]')?.addEventListener('click', (event) => {
      this.authorOnly = !this.authorOnly;
      list.querySelectorAll('li.ub-content').forEach(li => {
        li.classList.toggle('dcu-cmt-hidden', this.authorOnly && !li.classList.contains('dcu-cmt-author'));
      });
      event.currentTarget.textContent = this.authorOnly
        ? `전체 댓글 보기 (${total})`
        : `글쓴이 댓글만 (${authorComments})`;
    });
  }
}

export const commentTreeFeature = new CommentTreeFeature();
