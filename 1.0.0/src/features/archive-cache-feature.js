/**
 * ArchiveCacheFeature — 삭제 글/댓글 로컬 캐시 복구
 *
 * 목록을 열 때마다 보이는 글을, 본문을 열 때는 본문과 댓글까지 백그라운드의
 * IndexedDB 아카이브로 넘겨 둔다. 나중에 작성자가 글이나 댓글을 지워도
 * 캐시에 남은 내용을 그 자리에서 다시 보여준다.
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { messageRouter } from '../core/message-router.js';
import { MessageAction } from '../core/message-contract.js';
import { articleParser } from '../parser/article-parser.js';
import { commentParser } from '../parser/comment-parser.js';
import { escapeHTML } from '../utils/sanitizer.js';
import { parseGalleryUrl } from '../core/gallery-context.js';

export class ArchiveCacheFeature extends BaseFeature {
  constructor() {
    super('enableArchiveCache', 'Archive Cache', '삭제된 글/댓글을 로컬 캐시에서 복구');
    this.galleryId = '';
    this.postId = null;
    this._captureTimer = null;
    /** 이번 페이지에서 이미 보낸 항목 — 같은 행을 반복 전송하지 않는다. */
    this._sentPosts = new Set();
    this._sentComments = new Set();
  }

  async onEnable() {
    this._refreshContext();
    this.captureSoon();
    await this.restoreIfDeleted();
  }

  async onDisable() {
    clearTimeout(this._captureTimer);
    document.querySelector('.dcu-archive-restore')?.remove();
    document.querySelector('.dcu-archive-comments')?.remove();
  }

  onPageChange() {
    this._refreshContext();
    this.captureSoon();
    this.restoreIfDeleted();
  }

  _refreshContext() {
    this._sentPosts.clear();
    this._sentComments.clear();
    const context = parseGalleryUrl(window.location.href);
    this.galleryId = context.valid ? context.galleryId : '';
    const url = new URL(window.location.href);
    this.postId = url.searchParams.get('no');
  }

  /** DOM 변화가 잦으므로 잠깐 모았다가 한 번에 넘긴다. */
  captureSoon() {
    clearTimeout(this._captureTimer);
    this._captureTimer = setTimeout(() => this.capture().catch(err => logger.debug('ArchiveCache: capture failed:', err)), 1200);
  }

  async capture() {
    if (!this.enabled || !this.galleryId) return { posts: 0, comments: 0 };

    const posts = articleParser.parseList(document, this.galleryId).map(article => ({
      galleryId: this.galleryId,
      id: article.id,
      title: article.title,
      author: article.author,
      authorId: article.authorId,
      ip: article.ip,
      date: article.date,
      url: article.url,
      views: article.views,
      recommendations: article.recommendations,
      comments: article.comments
    }));

    // 본문 페이지라면 본문과 댓글까지 저장한다.
    let comments = [];
    if (this.postId) {
      const view = articleParser.parseView(document, this.galleryId);
      if (view && view.title) {
        const writer = document.querySelector('.gallview_head .gall_writer, .view_content_wrap .gall_writer');
        posts.push({
          galleryId: this.galleryId,
          id: this.postId,
          title: view.title,
          author: view.author || writer?.getAttribute('data-nick') || '',
          authorId: view.authorId || writer?.getAttribute('data-uid') || '',
          ip: view.ip || writer?.getAttribute('data-ip') || '',
          date: view.date,
          url: window.location.href,
          views: view.views,
          recommendations: view.recommendations,
          body: view.body,
          media: (view.media || []).map(item => ({ type: item.type, url: item.url })).slice(0, 20)
        });
      }

      comments = commentParser.parseList(document, this.postId).map(comment => ({
        galleryId: this.galleryId,
        postId: this.postId,
        id: comment.id,
        author: comment.author,
        authorId: comment.authorId,
        ip: comment.ip,
        content: comment.content,
        date: comment.date,
        isReply: comment.isReply,
        parentId: comment.replyTo || null
      })).filter(comment => comment.id);
    }

    // 무한 스크롤이나 DOM 변경마다 목록 전체를 다시 보내면 500행 기준 140KB를
    // 매번 직렬화하고 IndexedDB에도 같은 수만큼 쓰기가 발생한다. 새로 등장한
    // 항목만 추린다. (본문 레코드는 body/media가 추가되므로 항상 보낸다)
    const freshPosts = posts.filter(post => {
      if (post.body !== undefined) return true;
      if (this._sentPosts.has(post.id)) return false;
      this._sentPosts.add(post.id);
      return true;
    });
    const freshComments = comments.filter(comment => {
      if (this._sentComments.has(comment.id)) return false;
      this._sentComments.add(comment.id);
      return true;
    });

    if (freshPosts.length === 0 && freshComments.length === 0) return { posts: 0, comments: 0 };

    const res = await messageRouter.send(MessageAction.ARCHIVE_PUT, { posts: freshPosts, comments: freshComments });
    const saved = res && res.success ? res.data : { posts: 0, comments: 0 };
    logger.debug(`ArchiveCache: stored ${saved.posts || 0} post(s), ${saved.comments || 0} comment(s).`);
    return saved;
  }

  /** 디시가 "삭제되었거나 존재하지 않는 게시글"을 보여줄 때를 감지한다. */
  _looksDeleted() {
    if (!this.postId) return false;
    if (document.querySelector('.view_content_wrap .write_div')) return false;

    const text = document.body ? document.body.textContent || '' : '';
    return /삭제되었거나\s*존재하지\s*않는|존재하지\s*않는\s*게시물|이미\s*삭제된/.test(text);
  }

  async restoreIfDeleted() {
    if (!this.enabled || !this.galleryId || !this.postId) return false;
    if (!this._looksDeleted()) {
      await this.offerDeletedComments();
      return false;
    }

    const res = await messageRouter.send(MessageAction.ARCHIVE_GET_POST, {
      galleryId: this.galleryId,
      postId: this.postId
    });
    const post = res && res.success ? res.data?.post : null;
    if (!post) return false;

    const commentsRes = await messageRouter.send(MessageAction.ARCHIVE_GET_COMMENTS, {
      galleryId: this.galleryId,
      postId: this.postId
    });
    const comments = commentsRes && commentsRes.success ? (commentsRes.data?.comments || []) : [];

    this._renderRestored(post, comments);
    logger.info(`ArchiveCache: restored deleted post ${this.postId} from the local archive.`);
    return true;
  }

  _renderRestored(post, comments) {
    document.querySelector('.dcu-archive-restore')?.remove();

    const box = document.createElement('div');
    box.className = 'dcu-archive-restore';
    box.innerHTML = `
      <div class="dcu-archive-head">
        <span class="dcu-archive-tag">로컬 캐시 복구</span>
        <span class="dcu-archive-time">수집: ${escapeHTML(new Date(post.capturedAt || Date.now()).toLocaleString('ko-KR'))}</span>
      </div>
      <div class="dcu-archive-title">${escapeHTML(post.title || '(제목 없음)')}</div>
      <div class="dcu-archive-meta">${escapeHTML(post.author || '익명')}${post.ip ? ` (${escapeHTML(post.ip)})` : ''} · ${escapeHTML(post.date || '')}</div>
      ${post.body ? `<div class="dcu-archive-body">${escapeHTML(post.body)}</div>` : '<div class="dcu-archive-body dim">본문은 캐시되지 않았습니다(목록만 수집된 글).</div>'}
      ${(post.media || []).length ? `<div class="dcu-archive-media">${post.media.slice(0, 6).map(item => `<img src="${escapeHTML(item.url)}" alt="" loading="lazy">`).join('')}</div>` : ''}
      ${comments.length ? `<div class="dcu-archive-subtitle">캐시된 댓글 ${comments.length}개</div>
        <div class="dcu-archive-comments-list">${comments.map(comment => `
          <div class="dcu-archive-comment">
            <b>${escapeHTML(comment.author || '익명')}</b>${comment.ip ? ` (${escapeHTML(comment.ip)})` : ''}
            <span>${escapeHTML(comment.content || '')}</span>
            <i>${escapeHTML(comment.date || '')}</i>
          </div>`).join('')}</div>` : ''}`;

    const anchor = document.querySelector('.view_content_wrap, .gallview_contents, #container') || document.body;
    anchor.prepend(box);
  }

  /**
   * 살아 있는 글에서 지워진 댓글만 따로 복구해 보여준다.
   */
  async offerDeletedComments() {
    if (!this.postId) return;
    document.querySelector('.dcu-archive-comments')?.remove();

    const list = document.querySelector('.cmt_list');
    if (!list) return;

    const visible = new Set(
      Array.from(list.querySelectorAll('li.ub-content')).map(li => (li.id || '').replace('comment_li_', ''))
    );

    const res = await messageRouter.send(MessageAction.ARCHIVE_GET_COMMENTS, {
      galleryId: this.galleryId,
      postId: this.postId
    });
    const cached = res && res.success ? (res.data?.comments || []) : [];
    const missing = cached.filter(comment => comment.commentId && !visible.has(String(comment.commentId)));
    if (missing.length === 0) return;

    const box = document.createElement('div');
    box.className = 'dcu-archive-comments';
    box.innerHTML = `
      <button type="button" class="dcu-archive-toggle">삭제된 댓글 ${missing.length}개 캐시에서 보기</button>
      <div class="dcu-archive-comments-list hidden">${missing.map(comment => `
        <div class="dcu-archive-comment">
          <b>${escapeHTML(comment.author || '익명')}</b>${comment.ip ? ` (${escapeHTML(comment.ip)})` : ''}
          <span>${escapeHTML(comment.content || '')}</span>
          <i>${escapeHTML(comment.date || '')}</i>
        </div>`).join('')}</div>`;

    list.parentElement?.insertBefore(box, list);

    box.querySelector('.dcu-archive-toggle')?.addEventListener('click', () => {
      const panel = box.querySelector('.dcu-archive-comments-list');
      const showing = panel.classList.toggle('hidden');
      box.querySelector('.dcu-archive-toggle').textContent = showing
        ? `삭제된 댓글 ${missing.length}개 캐시에서 보기`
        : `삭제된 댓글 접기 (${missing.length}개)`;
    });
  }
}

export const archiveCacheFeature = new ArchiveCacheFeature();
