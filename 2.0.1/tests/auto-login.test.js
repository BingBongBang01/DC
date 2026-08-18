/**
 * DC Auto Login & Theme Sync Tests
 * Exercises the sign-page helpers against captured DCInside markup and the
 * background policy that decides when auto login may run.
 */
import assert from 'assert';
import {
  AUTH_STATE,
  detectAuthState,
  isLoginPage,
  isLogoutUrl,
  isDcInsideUrl,
  buildLoginUrl,
  findLoginForm,
  hasCaptcha,
  findPostponeButton,
  isPasswordChangePrompt
} from '../src/auth/dc-login-page.js';
import {
  canAttemptLogin,
  toPublicStatus,
  MAX_CONSECUTIVE_FAILURES,
  BLOCK_REASONS,
  getAutoLoginState,
  updateAutoLoginState,
  saveCredentials,
  clearCredentials
} from '../src/auth/credential-store.js';
import { AutoLoginService, ATTEMPT_PHASE } from '../src/auth/auto-login-service.js';

/** Header markup as served by gall.dcinside.com (captured 2026-08). */
const LOGGED_OUT_HTML = `
  <div class="area_links clear"><ul class="fl clear">
    <li><a class="btn_top_loginout" href="https://sign.dcinside.com/login?s_url=https%3A%2F%2Fgall.dcinside.com%2Fboard%2Flists%2F%3Fid%3Dprogramming&s_key=768">로그인</a></li>
  </ul>
  <div class="fl darkmodebox">
    <a href="javascript:;" class="darkonoff" onclick="darkmode()"><em class="sp_img icon_tdark"></em>야간모드</a>
  </div></div>`;

const LOGGED_IN_HTML = `
  <div class="area_links clear"><ul class="fl clear">
    <li><a class="btn_top_loginout" href="https://sign.dcinside.com/logout?s_url=https%3A%2F%2Fgall.dcinside.com%2F">로그아웃</a></li>
  </ul></div>`;

const LOGIN_FORM_HTML = `
  <form action="https://sign.dcinside.com/login/member_check" name="login" method="post">
    <input type="hidden" name="ci_t" value="a9698b93aa0b48249eb567c765f47b9f">
    <input type="hidden" name="s_url" value="https%3A%2F%2Fgall.dcinside.com%2F">
    <input type="text" id="id" name="user_id" value="" class="int id bg" maxlength="20">
    <input type="password" id="pw" name="pw" class="int pw bg" maxlength="40">
    <input type="checkbox" id="checksaveid" name="checksaveid">
    <button type="submit" class="btn_blue small btn_wfull">로그인</button>
  </form>`;

const PASSWORD_CHANGE_HTML = `
  <div class="pop_wrap">
    <h3>비밀번호를 변경해 주세요</h3>
    <p>안전한 이용을 위해 비밀번호를 변경하시기 바랍니다.</p>
    <div class="btn_box">
      <button type="button" class="btn_blue">비밀번호 변경하기</button>
      <a href="javascript:;" class="btn_grey">다음에 변경하기</a>
    </div>
  </div>`;

function parse(html) {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

export async function runAutoLoginTests() {
  console.log('--- Running DC Auto Login Tests ---');

  // 1. Login state comes from the header's login/logout anchor
  assert.strictEqual(detectAuthState(parse(LOGGED_OUT_HTML)), AUTH_STATE.LOGGED_OUT);
  assert.strictEqual(detectAuthState(parse(LOGGED_IN_HTML)), AUTH_STATE.LOGGED_IN);
  assert.strictEqual(detectAuthState(parse('<div>아무것도 없음</div>')), AUTH_STATE.UNKNOWN);
  console.log('✅ [AutoLogin] Header anchor identifies the session state');

  // 2. URL classification
  assert.ok(isLoginPage('https://sign.dcinside.com/login?s_url=https%3A%2F%2Fgall.dcinside.com%2F'));
  assert.ok(isLoginPage('https://sign.dcinside.com/login/member_check'));
  assert.ok(!isLoginPage('https://gall.dcinside.com/board/lists/?id=programming'));
  assert.ok(isLogoutUrl('https://sign.dcinside.com/logout?s_url=https%3A%2F%2Fgall.dcinside.com%2F'));
  assert.ok(!isLogoutUrl('https://sign.dcinside.com/login'));
  assert.ok(isDcInsideUrl('https://gall.dcinside.com/'));
  assert.ok(!isDcInsideUrl('https://example.com/dcinside.com'));
  console.log('✅ [AutoLogin] Login / logout / DCInside URLs are classified correctly');

  // 3. The login URL reuses DC's own anchor (it carries an s_key token)
  const loggedOutDoc = parse(LOGGED_OUT_HTML);
  assert.strictEqual(
    buildLoginUrl(loggedOutDoc, 'https://gall.dcinside.com/board/lists/?id=programming'),
    'https://sign.dcinside.com/login?s_url=https%3A%2F%2Fgall.dcinside.com%2Fboard%2Flists%2F%3Fid%3Dprogramming&s_key=768'
  );
  assert.strictEqual(
    buildLoginUrl(parse('<div></div>'), 'https://gall.dcinside.com/board/lists/?id=programming'),
    'https://sign.dcinside.com/login?s_url=https%3A%2F%2Fgall.dcinside.com%2Fboard%2Flists%2F%3Fid%3Dprogramming'
  );
  console.log('✅ [AutoLogin] Login URL returns the user to the page they were on');

  // 4. Login form lookup + CAPTCHA guard
  const loginDoc = parse(LOGIN_FORM_HTML);
  const form = findLoginForm(loginDoc);
  assert.ok(form, 'login form must be found');
  assert.strictEqual(form.idInput.getAttribute('name'), 'user_id');
  assert.strictEqual(form.pwInput.getAttribute('name'), 'pw');
  assert.ok(form.submit, 'submit button must be found');
  assert.strictEqual(findLoginForm(parse('<div></div>')), null);

  assert.strictEqual(hasCaptcha(loginDoc), false);
  assert.strictEqual(hasCaptcha(parse(`${LOGIN_FORM_HTML}<img src="/captcha/img.php">`)), true);
  assert.strictEqual(hasCaptcha(parse('<p>보안문자를 입력해 주세요</p>')), true);
  console.log('✅ [AutoLogin] Login form is located and CAPTCHA pages are detected');

  // 5. Password-change interstitial is postponed, not confirmed
  const pwDoc = parse(PASSWORD_CHANGE_HTML);
  assert.ok(isPasswordChangePrompt('https://sign.dcinside.com/password/change', pwDoc));
  const postpone = findPostponeButton(pwDoc);
  assert.ok(postpone, 'postpone button must be found');
  assert.strictEqual(postpone.textContent.trim(), '다음에 변경하기');
  assert.strictEqual(findPostponeButton(parse('<button>비밀번호 변경하기</button>')), null);
  assert.strictEqual(isPasswordChangePrompt('https://example.com/', pwDoc), false, 'only DCInside pages count');
  console.log('✅ [AutoLogin] "다음에 변경하기" is chosen on the password-change prompt');

  // 6. Credential gating
  assert.deepStrictEqual(canAttemptLogin({ enabled: false }), { ok: false, reason: 'disabled' });
  assert.deepStrictEqual(canAttemptLogin({ enabled: true, userId: '', password: '' }), { ok: false, reason: 'no_credentials' });
  assert.deepStrictEqual(
    canAttemptLogin({ enabled: true, userId: 'a', password: 'b', failures: MAX_CONSECUTIVE_FAILURES }),
    { ok: false, reason: BLOCK_REASONS.FAILURES }
  );
  assert.deepStrictEqual(canAttemptLogin({ enabled: true, userId: 'a', password: 'b', failures: 0 }), { ok: true, reason: null });
  assert.ok(!Object.prototype.hasOwnProperty.call(toPublicStatus({ userId: 'a', password: 'secret' }), 'password'),
    'the UI status must never carry the password');
  console.log('✅ [AutoLogin] Auto login only runs when enabled, credentialed and unblocked');

  // 7. Background policy: navigate -> fill -> failure, and manual logout
  await clearCredentials();
  await saveCredentials({ userId: 'tester', password: 'pw1234' });
  await updateAutoLoginState({ enabled: true });

  const service = new AutoLoginService();
  service.hasSessionStorage = false; // no chrome.storage.session in tests

  const tabId = 42;
  const first = await service.evaluate({ tabId, state: 'logged_out', isLoginPage: false });
  assert.strictEqual(first.action, 'navigate', 'a signed-out DC page should go to the login form');

  const onLoginPage = await service.evaluate({ tabId, state: 'logged_out', isLoginPage: true });
  assert.strictEqual(onLoginPage.action, 'fill', 'the login page should be filled in');
  assert.strictEqual(service.memorySession.attempts[String(tabId)].phase, ATTEMPT_PHASE.SUBMITTED);

  const bounced = await service.evaluate({ tabId, state: 'logged_out', isLoginPage: true });
  assert.strictEqual(bounced.action, 'none');
  assert.strictEqual(bounced.reason, 'login_failed', 'returning to the login page counts as a failure');
  assert.strictEqual((await getAutoLoginState()).failures, 1);

  // Success clears the failure counter.
  const loggedIn = await service.evaluate({ tabId, state: 'logged_in', isLoginPage: false });
  assert.strictEqual(loggedIn.action, 'none');
  assert.strictEqual((await getAutoLoginState()).failures, 0);
  console.log('✅ [AutoLogin] Failed sign-ins are counted, successful ones reset the counter');

  // 8. Manual logout keeps the tab signed out until it leaves DCInside
  await service.suppressTab(tabId);
  const suppressed = await service.evaluate({ tabId, state: 'logged_out', isLoginPage: false });
  assert.strictEqual(suppressed.action, 'none');
  assert.strictEqual(suppressed.reason, 'user_logged_out');

  const otherTab = await service.evaluate({ tabId: 43, state: 'logged_out', isLoginPage: false });
  assert.strictEqual(otherTab.action, 'navigate', 'a different tab still signs in automatically');

  await service.releaseTab(tabId);
  const revisited = await service.evaluate({ tabId, state: 'logged_out', isLoginPage: false });
  assert.strictEqual(revisited.action, 'navigate', 'returning to DC re-arms auto login');
  console.log('✅ [AutoLogin] Manual logout sticks per tab and re-arms on a fresh visit');

  // 9. Blocking states stop everything
  await service.blockForCaptcha();
  const blocked = await service.evaluate({ tabId: 44, state: 'logged_out', isLoginPage: false });
  assert.strictEqual(blocked.action, 'none');
  assert.strictEqual(blocked.reason, BLOCK_REASONS.CAPTCHA, 'a CAPTCHA stops auto login instead of solving it');
  console.log('✅ [AutoLogin] CAPTCHA blocks auto login instead of being worked around');

  await clearCredentials();
  console.log('--- DC Auto Login Tests Passed ---');
}
