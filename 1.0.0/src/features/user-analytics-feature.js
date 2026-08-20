/**
 * UserAnalyticsFeature — 유저 활동 히스토리 팝오버
 *
 * 목록이나 댓글에서 닉네임/IP를 클릭하면 로컬 아카이브에 쌓인 기록으로
 * "이 갤러리에서 얼마나, 언제 활동했는지"를 즉시 보여준다. 다중 계정이나
 * 통피 분탕을 알아보는 데 쓰는 화면이라, 같은 IP에서 관측된 다른 닉네임도
 * 함께 표시하고 곧바로 메모/차단을 걸 수 있게 한다.
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { messageRouter } from '../core/message-router.js';
import { MessageAction } from '../core/message-contract.js';
import { escapeHTML } from '../utils/sanitizer.js';
import { parseGalleryUrl } from '../core/gallery-context.js';
import {
  readWriterIdentity,
  userKeyOf,
  parseUserKey,
  identityLabel,
  isAmbiguousKey
} from '../core/identity.js';

export class UserAnalyticsFeature extends BaseFeature {
  constructor() {
    super('enableUserAnalytics', 'User Analytics', '닉네임/IP 클릭 시 활동 히스토리 표시');
    this.popover = null;
    this._onClick = this._onClick.bind(this);
    this._onEscape = this._onEscape.bind(this);
  }

  async onEnable() {
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onEscape);
  }

  async onDisable() {
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onEscape);
    this.close();
  }

  _onEscape(event) {
    if (event.key === 'Escape') this.close();
  }

  _onClick(event) {
    if (!this.enabled) return;

    const writer = event.target.closest?.('.gall_writer, .ub-writer');
    if (!writer) {
      if (!event.target.closest?.('.dcu-analytics-popover')) this.close();
      return;
    }

    // 디시 자체 유저 메뉴와 겹치지 않도록 Alt(또는 보조 클릭)로만 연다.
    if (!event.altKey) return;

    event.preventDefault();
    event.stopPropagation();

    const user = readWriterIdentity(writer);
    if (!user || (!user.nick && !user.uid && !user.ip)) return;

    this.show(writer, user).catch(err => logger.warn('UserAnalytics: failed to show history:', err));
  }

  /**
   * @param {Element} anchor
   * @param {{nick: string, uid: string, ip: string, identity?: string, key?: string}} user
   */
  async show(anchor, user) {
    const context = parseGalleryUrl(window.location.href);
    const galleryId = context.valid ? context.galleryId : '';
    const authorKey = user.key || userKeyOf(user);

    this.close();
    const box = document.createElement('div');
    box.className = 'dcu-analytics-popover';
    box.innerHTML = '<div class="dcu-analytics-loading">활동 기록을 불러오는 중...</div>';
    document.body.appendChild(box);
    this.popover = box;

    const rect = anchor.getBoundingClientRect();
    box.style.top = `${window.scrollY + rect.bottom + 6}px`;
    box.style.left = `${Math.min(window.scrollX + rect.left, window.innerWidth - 340)}px`;

    const res = await messageRouter.send(MessageAction.ARCHIVE_USER_STATS, { galleryId, authorKey });
    if (!res || !res.success) {
      box.innerHTML = `<div class="dcu-analytics-loading">기록을 불러오지 못했습니다.</div>`;
      return;
    }

    const { summary, share, sameIpNicknames } = res.data || {};
    this._render(box, { user, galleryId, authorKey, summary, share, sameIpNicknames });
  }

  _render(box, { user, galleryId, authorKey, summary, share, sameIpNicknames }) {
    const hours = summary?.hours || new Array(24).fill(0);
    const peak = Math.max(1, ...hours);
    const bars = hours.map((count, hour) => `
      <div class="dcu-hour" title="${hour}시 ${count}건">
        <div class="dcu-hour-bar" style="height:${Math.round((count / peak) * 100)}%"></div>
        ${hour % 6 === 0 ? `<span>${hour}</span>` : ''}
      </div>`).join('');

    const label = user.nick || user.uid || user.ip || '알 수 없음';
    // 닉네임이 `ㅇㅇ`처럼 겹쳐도 신분과 uid 를 함께 보여주면 눈으로 구분된다.
    const identity = [
      user.identity ? identityLabel(user.identity) : '',
      user.uid ? `uid ${user.uid}` : '',
      user.ip ? `IP ${user.ip}` : ''
    ].filter(Boolean).join(' · ');

    // uid 가 없는 키는 남을 함께 집계한다. 통계를 개인 기록으로 오해하지 않게 알린다.
    const { type: keyType } = parseUserKey(authorKey);
    const ambiguityNotice = keyType === 'ip'
      ? 'IP는 2옥텟까지만 공개되어 같은 대역의 다른 사람이 섞일 수 있습니다.'
      : '닉네임만으로는 사람을 특정할 수 없어 여러 명의 기록이 섞일 수 있습니다.';

    box.innerHTML = `
      <div class="dcu-analytics-head">
        <b>${escapeHTML(label)}</b>
        <span>${escapeHTML(identity)}</span>
        <button type="button" class="dcu-analytics-close" aria-label="닫기">×</button>
      </div>
      <div class="dcu-analytics-stats">
        <div><b>${summary?.postCount || 0}</b><span>글</span></div>
        <div><b>${summary?.commentCount || 0}</b><span>댓글</span></div>
        <div><b>${share ? (share.share * 100).toFixed(1) : '0.0'}%</b><span>최근 ${share?.sampled || 0}글 중 지분</span></div>
      </div>
      <div class="dcu-analytics-hours">${bars}</div>
      ${summary?.lastSeen ? `<div class="dcu-analytics-meta">최근 활동: ${escapeHTML(new Date(summary.lastSeen).toLocaleString('ko-KR'))}</div>` : ''}
      ${(summary?.nicknames || []).length > 1 ? `<div class="dcu-analytics-meta">관측된 닉네임: ${escapeHTML(summary.nicknames.slice(0, 6).join(', '))}</div>` : ''}
      ${(sameIpNicknames || []).length > 1 ? `<div class="dcu-analytics-warn">같은 IP 대역에서 닉네임 ${sameIpNicknames.length}개 관측: ${escapeHTML(sameIpNicknames.slice(0, 6).join(', '))}</div>` : ''}
      ${isAmbiguousKey(authorKey) ? `<div class="dcu-analytics-warn">${escapeHTML(ambiguityNotice)}</div>` : ''}
      ${(summary?.recentPosts || []).length ? `<div class="dcu-analytics-list">${summary.recentPosts.slice(0, 5).map(post => `
        <a href="${escapeHTML(post.url || '#')}" target="_blank" rel="noopener">${escapeHTML(post.title || '(제목 없음)')}</a>`).join('')}</div>` : ''}
      <div class="dcu-analytics-actions">
        <button type="button" class="dcu-analytics-btn" data-action="memo">메모 추가</button>
        <button type="button" class="dcu-analytics-btn" data-action="block">차단(블라인드)</button>
      </div>
      <div class="dcu-analytics-status"></div>`;

    box.querySelector('.dcu-analytics-close')?.addEventListener('click', () => this.close());

    const addRule = async (action) => {
      const { type, value } = parseUserKey(authorKey);
      const memo = action === 'memo'
        ? (summary?.postCount || summary?.commentCount
            ? `글 ${summary.postCount} · 댓글 ${summary.commentCount}`
            : '관찰 대상')
        : '';

      const res = await messageRouter.send(MessageAction.USER_RULE_ADD, {
        type,
        value,
        memo: memo || `${label} 차단`,
        action: action === 'memo' ? 'label' : 'blind',
        galleryId: galleryId || null
      });

      const status = box.querySelector('.dcu-analytics-status');
      if (status) {
        status.textContent = res && res.success
          ? (action === 'memo' ? '메모를 등록했습니다.' : '차단 규칙을 등록했습니다.')
          : `등록 실패: ${res?.error || '알 수 없는 오류'}`;
      }
    };

    box.querySelectorAll('.dcu-analytics-btn').forEach(button => {
      button.addEventListener('click', () => addRule(button.dataset.action));
    });
  }

  close() {
    this.popover?.remove();
    this.popover = null;
  }
}

export const userAnalyticsFeature = new UserAnalyticsFeature();
