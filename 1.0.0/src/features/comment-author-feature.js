/**
 * CommentAuthorFeature — 글쓴이 댓글 강조 + 글쓴이 댓글만 보기
 *
 * 원래는 대댓글을 계층형으로 "재정렬"하는 기능이었으나 제거했다. 이유:
 *
 *  1. 디시 `comment.js` 는 depth 0 댓글의 <li> 를 답글이 뒤따를 때 닫지 않는다.
 *     HTML 파서가 이를 자동으로 닫아 버리므로 `.cmt_list` 의 자식은
 *       li#comment_li_N.ub-content   (최상위 댓글)
 *       li (클래스 없음, 안에 ul.reply_list > li#reply_li_N)   (답글 묶음)
 *     이 섞인 평면 구조가 된다. `:scope > li.ub-content` 로 댓글만 골라
 *     appendChild 로 옮기면 클래스 없는 답글 묶음만 제자리에 남아, 결과적으로
 *     대댓글 전체가 목록 맨 위로 밀려 올라갔다. restore() 도 같은 결함이라
 *     "원본 순서" 버튼으로도 되돌릴 수 없었다.
 *  2. 부모 추정이 `@닉네임` 정규식 추측이었다. 디시는 댓글 API 의 `c_no` 와
 *     DOM 의 `ul.reply_list[p-no]` 로 정확한 부모를 이미 알려준다.
 *  3. 디시가 등록순·최신순·답글순 정렬과 답글 펼침을 이미 제공한다.
 *
 * 그래서 이 기능은 순서를 절대 건드리지 않고 class 부여만 한다.
 *
 * 실제 마크업(2026-08 확인):
 *   <li id="comment_li_9194118" class="ub-content">
 *     <span class="gall_writer ub-writer" data-nick data-uid data-ip>
 *     <p class="usertxt ub-word">본문</p>
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { SELECTORS, queryFirst } from '../adapters/selectors.js';

export class CommentAuthorFeature extends BaseFeature {
  constructor() {
    super('enableCommentTree', 'Comment Author Highlight', '글쓴이 댓글 강조 및 글쓴이 댓글만 보기');
    this.authorOnly = false;
    this._observer = null;
    this._applying = false;
    this._applyTimer = null;
    this._toolbar = null;
  }

  async onEnable() {
    this.apply();
    this._watchComments();
  }

  async onDisable() {
    this._unwatchComments();
    this.clear();
    document.querySelector('.dcu-cmt-toolbar')?.remove();
    this._toolbar = null;
  }

  onPageChange() {
    this.authorOnly = false;
    // 이전 페이지의 댓글 영역을 계속 보고 있으면 안 되므로 다시 붙인다.
    this._unwatchComments();
    this._toolbar = null;
    this.apply();
    this._watchComments();
  }

  _list() {
    return document.querySelector('.cmt_list');
  }

  /**
   * 댓글은 AJAX 로 들어오고, 새로고침·댓글 페이지 이동 때마다 `.cmt_list` 의
   * innerHTML 이 통째로 교체된다. 그래서 한 번 적용으로는 배지가 유지되지 않는다.
   */
  _watchComments() {
    if (typeof MutationObserver === 'undefined' || this._observer) return;
    const host = queryFirst(document, SELECTORS.commentContainer);
    if (!host) return;

    this._observer = new MutationObserver((records) => {
      // apply() 가 넣은 배지/툴바도 childList 변경이라 그대로 두면 옵저버가
      // 자기 자신을 다시 깨운다. 남의 변경만 골라 받는다.
      if (this._applying) return;
      if (!records.some(record => this._isForeignMutation(record))) return;
      this._scheduleApply();
    });
    this._observer.observe(host, { childList: true, subtree: true });
  }

  _unwatchComments() {
    this._observer?.disconnect();
    this._observer = null;
    if (this._applyTimer) {
      clearTimeout(this._applyTimer);
      this._applyTimer = null;
    }
  }

  /** 우리가 만든 노드인지. 배지/툴바만 오간 변경은 무시해야 한다. */
  _isOwnNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.classList?.contains('dcu-cmt-author-badge')
      || node.classList?.contains('dcu-cmt-toolbar')
      || node.classList?.contains('dcu-cmt-btn')
      || node.classList?.contains('dcu-cmt-count');
  }

  /**
   * 이 변경이 디시(또는 사용자)가 만든 것인지. 추가/삭제된 노드가 전부 우리
   * 것이거나 툴바 안의 텍스트 갱신뿐이면 무시한다.
   * @param {MutationRecord} record
   */
  _isForeignMutation(record) {
    if (record.type !== 'childList') return false;
    if (record.target && this._isOwnNode(record.target)) return false;

    const touched = [...record.addedNodes, ...record.removedNodes];
    if (touched.length === 0) return false;
    return touched.some(node => !this._isOwnNode(node));
  }

  /**
   * 디시 렌더가 한 배치로 끝난 뒤 한 번만 돌도록 모아서 실행한다.
   * 마이크로태스크로 미루면 자기 변경과 맞물릴 때 이벤트 루프를 굶겨
   * 탭이 그대로 멈춘다. 실제 타이머를 쓴다.
   */
  _scheduleApply() {
    if (this._applyTimer) return;
    this._applyTimer = setTimeout(() => {
      this._applyTimer = null;
      this.apply();
    }, 50);
  }

  /**
   * 본문 작성자 식별자 (닉네임/uid/IP).
   * @returns {{nick: string, uid: string, ip: string}|null}
   */
  _postAuthor() {
    const writer = queryFirst(document, SELECTORS.articleAuthor);
    if (!writer) return null;
    return {
      nick: writer.getAttribute('data-nick') || '',
      uid: writer.getAttribute('data-uid') || '',
      ip: writer.getAttribute('data-ip') || ''
    };
  }

  /**
   * 최상위 댓글과 대댓글을 문서 순서 그대로 집는다. 순서를 바꾸지 않으므로
   * 답글 묶음 래퍼를 따로 챙길 필요가 없다.
   * @param {Element} list
   * @returns {Element[]}
   */
  _items(list) {
    return Array.from(list.querySelectorAll(SELECTORS.commentAnyItem));
  }

  apply() {
    if (!this.enabled || this._applying) return;
    const list = this._list();
    if (!list) return;

    const items = this._items(list);
    if (items.length === 0) return;

    this._applying = true;
    try {
      this._applyNow(list, items);
    } finally {
      // 이번에 우리가 만든 변경 기록을 버린다. 이게 없으면 apply() 가 끝난
      // 직후 옵저버가 자기 변경으로 다시 깨어나 무한히 돈다.
      this._observer?.takeRecords();
      this._applying = false;
    }
  }

  /**
   * @param {Element} list
   * @param {Element[]} items
   */
  _applyNow(list, items) {
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
      if (isAuthor) {
        authorComments++;
        if (writer && !writer.querySelector('.dcu-cmt-author-badge')) {
          const badge = document.createElement('span');
          badge.className = 'dcu-cmt-author-badge';
          badge.textContent = '글쓴이';
          writer.appendChild(badge);
        }
      } else {
        writer?.querySelector('.dcu-cmt-author-badge')?.remove();
      }
    }

    // 댓글이 새로 로드되면 이전 필터 상태를 다시 반영해 준다.
    this._applyFilter(list);
    this._total = items.length;
    this._authorComments = authorComments;
    this._ensureToolbar(list);
    this._syncToolbar();
    logger.debug(`CommentAuthorFeature: marked ${authorComments}/${items.length} author comment(s).`);
  }

  /** 배지와 필터 흔적을 모두 걷어낸다. 순서는 원래 건드리지 않았으므로 복구할 것이 없다. */
  clear() {
    const list = this._list();
    if (!list) return;
    this.authorOnly = false;
    list.querySelectorAll('.dcu-cmt-author-badge').forEach(badge => badge.remove());
    this._items(list).forEach(li => li.classList.remove('dcu-cmt-author'));
    list.querySelectorAll('.dcu-cmt-hidden').forEach(li => li.classList.remove('dcu-cmt-hidden'));
  }

  /**
   * "글쓴이 댓글만" 상태를 DOM 에 반영한다.
   *
   * 부모 댓글을 숨길 때 그 답글 묶음 래퍼도 같이 숨겨야 한다. 안 그러면 부모는
   * 사라졌는데 대댓글만 붙어 있는 고아 블록이 남는다.
   * @param {Element} list
   */
  _applyFilter(list) {
    const on = this.authorOnly;

    this._items(list).forEach(li => {
      li.classList.toggle('dcu-cmt-hidden', on && !li.classList.contains('dcu-cmt-author'));
    });

    list.querySelectorAll(SELECTORS.commentReplyBlock).forEach(block => {
      const replies = Array.from(block.querySelectorAll('li[id^="reply_li_"]'));
      const allHidden = replies.length > 0 && replies.every(li => li.classList.contains('dcu-cmt-hidden'));
      block.classList.toggle('dcu-cmt-hidden', on && (replies.length === 0 || allHidden));
    });
  }

  /**
   * 툴바는 **한 번만** 만든다. 예전에는 apply() 마다 remove + insertBefore 를
   * 했는데, 그 자체가 옵저버가 감시하는 childList 변경이라 apply() -> 변경 ->
   * apply() 의 무한 루프를 만들었다. 리스너도 매번 새로 붙어 쌓였다.
   * @param {Element} list
   */
  _ensureToolbar(list) {
    const existing = document.querySelector('.dcu-cmt-toolbar');
    if (existing) {
      this._toolbar = existing;
      // 디시가 댓글 영역을 갈아끼우면 툴바가 목록과 떨어질 수 있다. 그때만 옮긴다.
      if (existing.nextElementSibling !== list) {
        list.parentElement?.insertBefore(existing, list);
      }
      return;
    }

    const bar = document.createElement('div');
    bar.className = 'dcu-cmt-toolbar';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dcu-cmt-btn';
    button.dataset.action = 'author';

    const count = document.createElement('span');
    count.className = 'dcu-cmt-count';

    bar.append(button, count);

    button.addEventListener('click', () => {
      this.authorOnly = !this.authorOnly;
      const current = this._list();
      if (current) this._applyFilter(current);
      this._syncToolbar();
    });

    list.parentElement?.insertBefore(bar, list);
    this._toolbar = bar;
  }

  /**
   * 라벨/개수만 갱신한다. 값이 같으면 쓰지 않는다 — textContent 대입도
   * childList 변경이라 매번 쓰면 불필요한 변경 기록이 쌓인다.
   */
  _syncToolbar() {
    const bar = this._toolbar;
    if (!bar) return;

    const total = this._total || 0;
    const authorComments = this._authorComments || 0;
    const label = this.authorOnly
      ? `전체 댓글 보기 (${total})`
      : `글쓴이 댓글만 (${authorComments})`;

    const button = bar.querySelector('.dcu-cmt-btn');
    if (button && button.textContent !== label) button.textContent = label;

    const countText = `댓글 ${total}개`;
    const count = bar.querySelector('.dcu-cmt-count');
    if (count && count.textContent !== countText) count.textContent = countText;
  }
}

export const commentAuthorFeature = new CommentAuthorFeature();
