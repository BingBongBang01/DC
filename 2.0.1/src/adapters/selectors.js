/**
 * Centralized DOM Selectors Dictionary for DCInside
 * Provides resilient fallback selectors for Major, Minor, Mini galleries, Search pages, and Media
 */

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
  articleContainer: '.view_content_wrap, .gallview_contents, .write_div',
  articleTitle: '.title_subject, .gallview_head .title_subject, .ub-word, h3.title_subject',
  articleAuthor: '.gall_writer, .write_div .nickname, .gallview_head .nickname',
  articleDate: '.gall_date, .gallview_head .gall_date',
  articleViews: '.gall_count, .gallview_head .gall_count',
  articleRecommend: '.gall_recommend, .gallview_head .gall_recommend',
  articleBody: '.write_div, .gallview_contents .write_div, .view_content_wrap .write_div',
  
  // Comment Section
  commentContainer: '.comment_box, .reply_box, #focus_cmt, .cmt_list',
  commentList: '.cmt_list, .reply_list, ul.cmt_list',
  commentItems: '.cmt_list > li, .reply_list > li, li.ub-content, ul.cmt_list li',
  commentNick: '.cmt_nickname, .nickname',
  commentContent: '.cmt_txt, .usertxt',
  commentDate: '.cmt_date, .date_time',
  commentIp: '.cmt_ip, .ip',

  // Special Page Indicators
  realtimeBestHead: '.dcbest_head, .realtime_best',
  searchResultHead: '.sch_result_box, .result_list, .sch_result_list'
};
