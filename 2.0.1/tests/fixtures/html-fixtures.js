/**
 * Representative DOM Fixtures for DC Ultimate Unit Tests
 */

export const FIXTURE_MAJOR_GALLERY_LIST = `
<div class="gall_listwrap">
  <input type="hidden" name="id" id="gallery_id" value="programming" />
  <h2 class="gall_title_name">프로그래밍 갤러리</h2>
  <table class="gall_list">
    <tbody>
      <tr class="ub-content" data-no="1001">
        <td class="gall_num">1001</td>
        <td class="gall_subject">일반</td>
        <td class="gall_title ub-word">
          <a href="https://gall.dcinside.com/board/view/?id=programming&no=1001">JS 비동기 질문입니다 [3]</a>
        </td>
        <td class="gall_writer ub-writer" data-nick="개발자" data-uid="dev123" data-ip="121.168">개발자</td>
        <td class="gall_date" title="2026-08-09 10:00:00">10:00</td>
        <td class="gall_count">120</td>
        <td class="gall_recommend">5</td>
      </tr>
      <tr class="ub-content" data-no="1002">
        <td class="gall_num">1002</td>
        <td class="gall_subject">질문</td>
        <td class="gall_title ub-word">
          <a href="https://gall.dcinside.com/board/view/?id=programming&no=1002">파이썬 크롤링 에러 <em class="icon_pic"></em></a>
        </td>
        <td class="gall_writer ub-writer" data-nick="ㅇㅇ" data-ip="211.201">ㅇㅇ(211.201)</td>
        <td class="gall_date" title="2026-08-09 10:05:00">10:05</td>
        <td class="gall_count">45</td>
        <td class="gall_recommend">0</td>
      </tr>
    </tbody>
  </table>
</div>
`;

export const FIXTURE_ARTICLE_VIEW_NORMAL = `
<div class="gallview_head">
  <h3 class="title_subject">Manifest V3 크롬 확장프로그램 개발 팁</h3>
  <span class="nickname" data-nick="코드마스터" data-uid="cmaster">코드마스터</span>
  <span class="gall_date">2026-08-09 09:30:00</span>
  <span class="gall_count">350</span>
  <span class="gall_recommend">42</span>
</div>
<div class="write_div">
  <p>Service Worker 환경에서는 DOM 접근이 불가능하므로 메시지 통신을 사용해야 합니다.</p>
  <img src="https://dcimg.com/view.php?no=123" alt="sample image" />
  <video src="https://dcimg.com/video.mp4"></video>
</div>
<ul class="cmt_list">
  <li data-no="1" class="ub-content">
    <span class="cmt_nickname" data-nick="유저A">유저A</span>
    <span class="cmt_txt">좋은 정보 감사합니다!</span>
    <span class="cmt_date">09:32</span>
  </li>
  <li data-no="2" class="ub-content cmt_reply">
    <span class="cmt_nickname" data-nick="코드마스터">코드마스터</span>
    <span class="cmt_txt">도움이 되셨다니 다행입니다.</span>
    <span class="cmt_date">09:35</span>
  </li>
</ul>
`;

export const FIXTURE_ARTICLE_VIEW_DELETED = `
<div class="delet_box">
  <p>삭제되었거나 존재하지 않는 게시글입니다.</p>
</div>
`;

export const FIXTURE_MINOR_GALLERY = `
<div class="page_head">
  <h2 class="title">싱글벙글 지구촌 마이너 갤러리</h2>
</div>
<table class="gall_list">
  <tbody>
    <tr class="ub-content" data-no="550">
      <td class="gall_num">550</td>
      <td class="gall_title ub-word">
        <a href="https://gall.dcinside.com/mgallery/board/view/?id=singlebungle&no=550">오늘자 짤방 레전드</a>
      </td>
      <td class="gall_writer ub-writer" data-nick="싱글이">싱글이</td>
      <td class="gall_date">10:10</td>
      <td class="gall_count">999</td>
      <td class="gall_recommend">120</td>
    </tr>
  </tbody>
</table>
`;

export const FIXTURE_MINI_GALLERY = `
<div class="page_head">
  <h2 class="title">미니 갤러리 테스트</h2>
</div>
<table class="gall_list">
  <tbody>
    <tr class="ub-content" data-no="12">
      <td class="gall_num">12</td>
      <td class="gall_title ub-word">
        <a href="https://gall.dcinside.com/mini/board/view/?id=minitest&no=12">미니 갤러리 글입니다</a>
      </td>
      <td class="gall_writer ub-writer" data-nick="미니유저">미니유저</td>
      <td class="gall_date">10:15</td>
      <td class="gall_count">10</td>
      <td class="gall_recommend">1</td>
    </tr>
  </tbody>
</table>
`;
