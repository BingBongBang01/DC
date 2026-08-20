/**
 * ArticleParser Module for DC Ultimate
 * Extracts normalized Article models from list table rows or article view DOM nodes
 */
import { Article } from '../utils/models.js';
import { SELECTORS, queryFirst, cleanText, textToInt } from '../adapters/selectors.js';
import { mediaParser } from './media-parser.js';
import { logger } from '../core/logger.js';

export class ArticleParser {
  /**
   * Parse a single gallery table row element
   * @param {Element} rowElement TR row element
   * @param {string} [galleryId=''] Gallery ID
   * @returns {Article|null}
   */
  parseRow(rowElement, galleryId = '') {
    if (!rowElement) return null;

    try {
      const numElem = rowElement.querySelector(SELECTORS.rowNum);
      const titleElem = rowElement.querySelector(SELECTORS.rowTitle);
      const writerElem = rowElement.querySelector(SELECTORS.rowAuthor);
      const dateElem = rowElement.querySelector(SELECTORS.rowDate);
      const viewsElem = rowElement.querySelector(SELECTORS.rowViews);
      const recommendElem = rowElement.querySelector(SELECTORS.rowRecommend);
      const subjectElem = rowElement.querySelector(SELECTORS.rowSubject);

      if (!titleElem) return null;

      // Extract URL first to reliably determine if it's a valid article
      let url = titleElem.getAttribute('href') || titleElem.href || '';
      
      // Fix relative URLs escaping to chrome-extension:// context
      if (url.startsWith('chrome-extension://')) {
        url = url.replace(/^chrome-extension:\/\/[^\/]+/, 'https://gall.dcinside.com');
      } else if (url.startsWith('/')) {
        url = 'https://gall.dcinside.com' + url;
      } else if (url && !url.startsWith('http')) {
        url = 'https://gall.dcinside.com/' + url;
      }

      const noMatch = url.match(/[?&]no=(\d+)/);
      const articleNo = noMatch ? noMatch[1] : null;

      // Filter out ads, notices, and invalid rows (which do not have a `no=` parameter in their URL)
      if (!articleNo) return null;
      
      const id = articleNo; // Use the reliable article number from the URL
      
      // Extract comment count if embedded in title row, e.g., "글제목 [15]"
      let title = titleElem.textContent.trim();
      let comments = 0;
      const cmtCountElem = rowElement.querySelector('.reply_num, .cmt_num, .reply_num_box');
      if (cmtCountElem) {
        const cmtText = cmtCountElem.textContent.replace(/[^0-9]/g, '');
        comments = parseInt(cmtText, 10) || 0;
      } else {
        const match = title.match(/\[(\d+)\]$/);
        if (match) {
          comments = parseInt(match[1], 10) || 0;
        }
      }

      
      const author = writerElem ? (writerElem.getAttribute('data-nick') || writerElem.textContent.trim()) : '';
      const authorId = writerElem ? (writerElem.getAttribute('data-uid') || null) : null;
      const ip = writerElem ? (writerElem.getAttribute('data-ip') || null) : null;

      const viewsText = viewsElem ? viewsElem.textContent.trim() : '0';
      const views = parseInt(viewsText.replace(/,/g, ''), 10) || 0;

      const recText = recommendElem ? recommendElem.textContent.trim() : '0';
      const recommendations = parseInt(recText.replace(/,/g, ''), 10) || 0;

      const date = dateElem ? (dateElem.getAttribute('title') || dateElem.textContent.trim()) : null;

      const hasImage = Boolean(rowElement.querySelector('.icon_pic, .icon_img, .icon_pic_n'));
      const hasVideo = Boolean(rowElement.querySelector('.icon_mv, .icon_movie'));
      const subject = subjectElem ? subjectElem.textContent.trim() : '';

      return new Article({
        id,
        galleryId,
        title,
        author,
        authorId,
        ip,
        date,
        views,
        recommendations,
        comments,
        url,
        hasImage,
        hasVideo,
        subject,
        sourcePage: 'gallery_list'
      });
    } catch (err) {
      return null;
    }
  }

  /**
   * Parse all article rows in a table container
   * @param {Document|Element} container Container element
   * @param {string} [galleryId=''] Gallery ID
   * @returns {Article[]}
   */
  parseList(container = (typeof document !== 'undefined' ? document : null), galleryId = '') {
    if (!container) return [];
    const rows = container.querySelectorAll(SELECTORS.listRows);
    const articles = [];
    rows.forEach(row => {
      const parsed = this.parseRow(row, galleryId);
      if (parsed) articles.push(parsed);
    });
    return articles;
  }

  /**
   * Parse active Article View page DOM
   * @param {Document|Element} doc Article view container
   * @param {string} [galleryId=''] Gallery ID
   * @returns {Article|null}
   */
  parseView(doc = (typeof document !== 'undefined' ? document : null), galleryId = '') {
    if (!doc) return null;

    try {
      // Check if article is deleted or unavailable
      const deletedElem = doc.querySelector('.error_box, .delet_box, .alert_box');
      if (deletedElem && (deletedElem.textContent.includes('삭제') || deletedElem.textContent.includes('존재하지 않습니다'))) {
        return new Article({
          galleryId,
          title: '삭제되었거나 존재하지 않는 게시글입니다.',
          sourcePage: 'article_view_deleted'
        });
      }

      const titleElem = queryFirst(doc, SELECTORS.articleTitle);
      if (!titleElem) {
        logger.warn('ArticleParser.parseView: titleElem not found — selector may be outdated', SELECTORS.articleTitle);
        return null;
      }

      const writerElem = queryFirst(doc, SELECTORS.articleAuthor);
      const dateElem = queryFirst(doc, SELECTORS.articleDate);
      const viewsElem = queryFirst(doc, SELECTORS.articleViews);
      const recElem = queryFirst(doc, SELECTORS.articleRecommend);
      const commentElem = queryFirst(doc, SELECTORS.articleCommentCount);
      const headtextElem = queryFirst(doc, SELECTORS.articleHeadtext);
      const bodyElem = doc.querySelector(SELECTORS.articleBody);

      // 제목 노드가 `.title_subject` 가 아니라 부모 h3 로 잡히는 경우에도 "앱에서
      // 작성"/"모바일에서 작성" 같은 숨김 텍스트가 붙지 않도록 장식 노드를 걷어낸다.
      const title = cleanText(titleElem, SELECTORS.articleTitleNoise);
      const author = writerElem ? (writerElem.getAttribute('data-nick') || cleanText(writerElem, SELECTORS.articleTitleNoise)) : '';
      const authorId = writerElem ? (writerElem.getAttribute('data-uid') || null) : null;
      const ip = writerElem ? (writerElem.getAttribute('data-ip') || null) : null;

      // "조회 16" 처럼 라벨이 앞에 붙어 오므로 숫자만 뽑아야 한다.
      const views = textToInt(viewsElem);
      const recommendations = textToInt(recElem);
      // 댓글은 AJAX 로 뒤늦게 채워져서 fetch 한 문서에는 목록이 없다. 헤더 표기를 쓴다.
      const comments = textToInt(commentElem);

      const subject = headtextElem ? cleanText(headtextElem).replace(/^\[|\]$/g, '') : '';

      const date = dateElem ? (dateElem.getAttribute('title') || cleanText(dateElem)) : null;

      let media = [];
      if (bodyElem) {
        try {
          media = mediaParser.parseMedia(bodyElem);
        } catch (mediaErr) {
          logger.warn('ArticleParser.parseView: media parsing failed, continuing without media:', mediaErr);
        }
      }
      const hasImage = media.some(m => m.type === 'image' || m.type === 'gif');
      const hasVideo = media.some(m => m.type === 'video');

      const bodyText = bodyElem ? bodyElem.textContent.trim() : '';

      return new Article({
        galleryId,
        title,
        subject,
        author,
        authorId,
        ip,
        date,
        views,
        recommendations,
        comments,
        hasImage,
        hasVideo,
        body: bodyText,
        media,
        sourcePage: 'article_view'
      });
    } catch (err) {
      logger.error('ArticleParser.parseView: unexpected error, returning null:', err);
      return null;
    }
  }
}

export const articleParser = new ArticleParser();
