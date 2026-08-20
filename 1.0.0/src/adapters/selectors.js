/**
 * Centralized DOM Selectors Dictionary for DCInside
 * Provides resilient fallback selectors for Major, Minor, Mini galleries, Search pages, and Media
 */

/**
 * 우선순위를 지키면서 첫 번째로 매치되는 요소를 찾는다.
 *
 * `querySelector('.a, .b')` 는 "첫 번째 셀렉터의 매치"가 아니라 "문서 순서상 가장
 * 먼저 나오는, 아무 셀렉터든 매치되는 요소"를 돌려준다. 그래서 폴백 셀렉터가
 * 정확한 셀렉터의 *부모*에 걸리면 부모가 자식을 이겨 버린다. 실제로 본문 제목이
 * `.title_subject`(자식) 대신 `.ub-word`(부모 h3)로 잡혀서 "앱에서 작성" 같은
 * 장식 텍스트가 제목에 붙는 버그가 있었다. 폴백은 배열로 주고 이 함수로만 찾는다.
 *
 * @param {Document|Element} root 탐색 기준 노드
 * @param {string|string[]} selectors 우선순위 순서의 셀렉터 (문자열이면 그대로 1회 조회)
 * @returns {Element|null}
 */
export function queryFirst(root, selectors) {
  if (!root || typeof root.querySelector !== 'function') return null;
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    if (!selector) continue;
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/**
 * 요소의 텍스트를 뽑되, 화면에 안 보이는 장식 노드는 걷어낸다.
 * 원본 DOM 은 건드리지 않도록 복제본에서 지운다.
 *
 * @param {Element|null} element
 * @param {string} [noiseSelector] 제거할 노드 셀렉터
 * @returns {string} 공백이 정규화된 텍스트
 */
export function cleanText(element, noiseSelector = '') {
  if (!element) return '';
  let source = element;
  if (noiseSelector) {
    source = element.cloneNode(true);
    source.querySelectorAll(noiseSelector).forEach(node => node.remove());
  }
  return (source.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * "조회 16", "추천 1,234", "댓글 8" 처럼 라벨이 붙은 숫자를 정수로 만든다.
 * 라벨을 안 벗기면 parseInt 가 NaN 을 내서 값이 통째로 0 이 된다.
 *
 * @param {Element|null} element
 * @returns {number}
 */
export function textToInt(element) {
  if (!element) return 0;
  const digits = cleanText(element).replace(/[^0-9]/g, '');
  return digits ? (parseInt(digits, 10) || 0) : 0;
}

export const SELECTORS = {
  // Gallery General
  galleryTitle: '.gall_title_name, .page_head .title, .gall_name, h2.title',
  galleryIdInput: 'input[name="id"], #gallery_id',
  
  // Gallery List Table & Rows
  galleryTable: '.gall_list, .ub-content, table.gall_list, .list_table',
  listRows: '.ub-content:not(.ub-notice), table.gall_list tbody tr.ub-content, tr.ub-content',
  noticeRows: 'tr.ub-notice, .ub-content.ub-notice',
  
  // Row Components
  rowNum: '.gall_num, td.gall_num',
  rowSubject: '.gall_subject, td.gall_subject',
  rowTitle: '.gall_title a, .ub-word a, td.gall_title a',
  rowAuthor: '.gall_writer, .ub-writer, td.gall_writer',
  rowDate: '.gall_date, td.gall_date',
  rowViews: '.gall_count, td.gall_count',
  rowRecommend: '.gall_recommend, td.gall_recommend',
  
  // Article View
  // 아래 배열형 셀렉터는 반드시 queryFirst() 로만 조회한다. querySelector 에
  // 콤마로 이어 넘기면 문서 순서 때문에 우선순위가 뒤집힌다.
  articleContainer: '.view_content_wrap, .gallview_contents, .write_div',
  /** `.ub-word` 는 목록 td·댓글 p 에도 붙는 범용 클래스라 제목 폴백에서 제외한다. */
  articleTitle: ['.gallview_head .title_subject', '.title_subject', 'h3.title_subject'],
  /** 제목/메타에서 걷어낼 장식 노드. `.blind` 안에 "앱에서 작성" 문구가 들어 있다. */
  articleTitleNoise: '.title_device, .blind, .sp_img, .dcu-cmt-author-badge',
  /** 말머리(`[일반]`, `[질문]` …). 제목에서 떼어 subject 로 따로 담는다. */
  articleHeadtext: ['.gallview_head .title_headtext', '.title_headtext'],
  articleAuthor: ['.gallview_head .gall_writer', '.view_content_wrap .gall_writer', '.gallview_head .nickname', '.write_div .nickname'],
  articleDate: ['.gallview_head .gall_date', '.gall_date'],
  articleViews: ['.gallview_head .gall_count', '.gall_count'],
  /**
   * 본문 페이지의 추천은 `.gall_reply_num` 이다. `.gall_recommend` 는 페이지 하단
   * "다른 글" 목록표의 td 에도 있어서 범위를 안 좁히면 그 "-" 를 읽어 0 이 된다.
   * 그래서 마지막 폴백은 반드시 `.gallview_head` 안으로 한정한다.
   */
  articleRecommend: ['.gallview_head .gall_reply_num', '.gall_reply_num', '.gallview_head .gall_recommend'],
  /** 댓글은 AJAX 로 나중에 오므로 fetch 한 HTML 에서는 이 표기가 유일한 개수 정보다. */
  articleCommentCount: ['.gallview_head .gall_comment', '.gall_comment'],
  articleBody: '.write_div, .gallview_contents .write_div, .view_content_wrap .write_div',
  
  // Comment Section
  // 디시 마크업 주의: depth 0 댓글의 <li> 가 닫히지 않은 채 답글 묶음 <li> 가
  // 이어붙기 때문에, 브라우저 파싱 결과 `.cmt_list` 의 자식은
  //   li#comment_li_N.ub-content  /  li(클래스 없음, 안에 ul.reply_list)
  // 가 섞인 평면 구조가 된다. 순서를 옮기는 코드를 여기에 붙이면 답글 묶음만
  // 제자리에 남아 맨 위로 밀려 올라간다. class 부여 외의 조작은 하지 말 것.
  commentContainer: '.view_comment, .comment_box, .reply_box, #focus_cmt, .cmt_list',
  commentList: '.cmt_list, .reply_list, ul.cmt_list',
  commentItems: '.cmt_list > li, .reply_list > li, li.ub-content, ul.cmt_list li',
  /** 최상위 댓글과 대댓글을 한 번에, 순서 그대로 집는다. */
  commentAnyItem: 'li[id^="comment_li_"], li[id^="reply_li_"]',
  /** 답글 묶음 래퍼. class 가 없어서 id 로만 특정할 수 있다. */
  commentReplyBlock: 'li:has(> .reply > .reply_box > ul.reply_list)',
  commentNick: '.cmt_nickname, .nickname',
  commentContent: '.cmt_txt, .usertxt',
  commentDate: '.cmt_date, .date_time',
  commentIp: '.cmt_ip, .ip',

  // Special Page Indicators
  realtimeBestHead: '.dcbest_head, .realtime_best',
  searchResultHead: '.sch_result_box, .result_list, .sch_result_list'
};
