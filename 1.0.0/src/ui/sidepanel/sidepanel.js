import { themeSystem } from '../theme/theme-system.js';
import { configManager } from '../../core/config-manager.js';
import { messageRouter } from '../../core/message-router.js';
import { searchAggregationFeature } from '../../features/search-aggregation-feature.js';
import { escapeHTML } from '../../utils/sanitizer.js';
import { MessageAction } from '../../core/message-contract.js';
import { signatureStore } from '../../core/signature/signature-store.js';

document.addEventListener('DOMContentLoaded', async () => {
  await configManager.init();
  themeSystem.init(configManager.get('theme'));

  let currentVirtualPage = 1;
  let currentVirtualPageSize = 20;

  const btnSearch = document.getElementById('sp-btn-search');
  const btnCancel = document.getElementById('sp-btn-cancel');
  const keywordInput = document.getElementById('sp-search-keyword');
  const galleryInput = document.getElementById('sp-search-gallery');
  const categorySelect = document.getElementById('sp-search-category');
  const pagesSelect = document.getElementById('sp-search-pages');
  const pageSizeSelect = document.getElementById('sp-results-per-page');
  const sortSelect = document.getElementById('sp-sort-order');
  
  // Restore saved search options
  if (pagesSelect) pagesSelect.value = configManager.get('spSearchPages') || '10';
  if (pageSizeSelect) pageSizeSelect.value = configManager.get('spResultsPerPage') || '20';
  if (sortSelect) sortSelect.value = configManager.get('spSortOrder') || 'newest';
  if (keywordInput) keywordInput.value = configManager.get('spKeyword') || '';
  if (galleryInput) galleryInput.value = configManager.get('spGalleryId') || '';

  const targetCheckboxes = document.querySelectorAll('#sp-search-targets input[type="checkbox"]');
  const savedTargets = configManager.get('spSearchTargets');
  if (savedTargets && Array.isArray(savedTargets)) {
    targetCheckboxes.forEach(chk => {
      chk.checked = savedTargets.includes(chk.value);
    });
  }

  currentVirtualPageSize = parseInt(pageSizeSelect?.value, 10) || 20;

  // Canonical Store for Gallery Context
  const appStore = {
    currentGallery: null,
    selectedGallery: null
  };

  // ---------------------------------------------------------------
  // 서비스 바: 상단 타일로 본문 영역 전환
  // ---------------------------------------------------------------
  const serviceTiles = document.querySelectorAll('.sp-tile');
  const serviceViews = document.querySelectorAll('.sp-view');

  /**
   * Shows one service view and remembers it for the next time the panel opens.
   * @param {string} view data-view key
   * @param {boolean} [persist=true]
   */
  function switchView(view, persist = true) {
    const known = Array.from(serviceTiles).some(tile => tile.dataset.view === view);
    const target = known ? view : 'search';

    serviceTiles.forEach(tile => {
      const active = tile.dataset.view === target;
      tile.classList.toggle('active', active);
      tile.setAttribute('aria-selected', String(active));
    });
    serviceViews.forEach(section => {
      section.classList.toggle('active', section.dataset.view === target);
    });

    // The panel body scrolls per view; start each one at the top.
    document.querySelector('.sp-main')?.scrollTo({ top: 0 });

    if (persist) configManager.set('spActiveView', target);
  }

  serviceTiles.forEach(tile => {
    tile.addEventListener('click', () => switchView(tile.dataset.view));
  });

  switchView(configManager.get('spActiveView') || 'search', false);

  /**
   * Rebuild the category (말머리) select box.
   * Always shows "전체" first, then each detected category.
   * Restores the previously saved selection when available.
   * Category objects come from PageDetector's `extractCategoriesFromDOM`
   * (src/parser/page-detector.js) via GalleryDetector, shaped as {id, name}.
   * @param {Array<{id: string, name: string}>} categories
   */
  function updateCategorySelect(categories) {
    if (!categorySelect) return;
    const saved = configManager.get('spCategory') || '';
    categorySelect.innerHTML = '<option value="">전체</option>';
    if (Array.isArray(categories) && categories.length > 0) {
      categories.forEach(({ id, name }) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name;
        categorySelect.appendChild(opt);
      });
      // Restore saved selection if it still exists in the new list
      if (saved && categories.some(c => c.id === saved)) {
        categorySelect.value = saved;
      }
    }
  }

  // Save options automatically when changed
  keywordInput?.addEventListener('input', (e) => configManager.set('spKeyword', e.target.value));
  galleryInput?.addEventListener('input', (e) => configManager.set('spGalleryId', e.target.value));
  categorySelect?.addEventListener('change', (e) => configManager.set('spCategory', e.target.value));
  
  targetCheckboxes.forEach(chk => {
    chk.addEventListener('change', () => {
      const selected = Array.from(targetCheckboxes).filter(c => c.checked).map(c => c.value);
      configManager.set('spSearchTargets', selected);
    });
  });

  pagesSelect?.addEventListener('change', (e) => configManager.set('spSearchPages', e.target.value));
  pageSizeSelect?.addEventListener('change', (e) => {
    configManager.set('spResultsPerPage', e.target.value);
    currentVirtualPageSize = parseInt(e.target.value, 10) || 20;
    renderVirtualPage(1);
  });
  sortSelect?.addEventListener('change', (e) => configManager.set('spSortOrder', e.target.value));

  // Auto-fill gallery ID and categories from active tab on initial load
  // Auto-fill gallery context from Background on initial load
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    // 1. Initial Load
    messageRouter.send(MessageAction.GET_CURRENT_GALLERY).then((res) => {
      // MessageRouter wraps every handler's return value as { success, data }
      // (see MessageRouter._initListener), so the handler's own return shape
      // ({ context }) lives at res.data.context, not res.context.
      const context = res && res.success ? res.data?.context : null;
      if (context) {
        appStore.currentGallery = context;

        // Auto-sync gallery ID and categories on initial load
        if (context.valid) {
          appStore.selectedGallery = { ...context };
          if (galleryInput) galleryInput.value = context.galleryId || '';
          configManager.set('spGalleryType', context.galleryType || 'board');
          updateCategorySelect(context.categories || []);
        }
        updateCurrentGallery(appStore.currentGallery);
        renderQuickAccess(); // Update recent visit list if changed
      }
    }).catch(err => console.warn('Failed to get current gallery:', err));
    
    // 2. Dynamically update when navigating (broadcasted by Background)
    chrome.runtime.onMessage.addListener(async (msg) => {
      if (msg.type === MessageAction.CURRENT_GALLERY_CHANGED) {
        // Ensure we only update to the CURRENT ACTIVE tab's context,
        // because background tabs might emit CURRENT_GALLERY_CHANGED too.
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id || tab.id !== msg.tabId) return;

          const res = await messageRouter.send(MessageAction.GET_CURRENT_GALLERY);
          const payload = res && res.success ? res.data?.context : null;
          if (payload) {
            appStore.currentGallery = payload;
            
            // Always sync the selected gallery and input to the current active gallery
            appStore.selectedGallery = { ...payload };
            if (galleryInput) galleryInput.value = payload.galleryId || '';
            configManager.set('spGalleryType', payload.galleryType || 'board');
            updateCategorySelect(payload.categories || []);

            updateCurrentGallery(appStore.currentGallery);
            renderQuickAccess(); 
          }
        } catch (e) {
          console.warn('Failed to update context on change:', e);
        }
      } else if (msg.type === MessageAction.KEYWORD_NOTIFICATION_CREATED) {
        if (typeof renderNotifications === 'function') {
          renderNotifications();
        }
      }
    });
  }
  const progressBox = document.getElementById('sp-progress-container');
  const progressText = document.getElementById('sp-progress-text');
  const progressFill = document.getElementById('sp-progress-fill');
  
  const resultsSection = document.getElementById('sp-results-section');
  const resultsSummary = document.getElementById('sp-results-summary');
  const resultsList = document.getElementById('sp-results-list');
  const pgPrev = document.getElementById('sp-pg-prev');
  const pgNext = document.getElementById('sp-pg-next');
  const pgIndicator = document.getElementById('sp-pg-indicator');

  // Render Virtual Page
  const renderVirtualPage = (page = 1) => {
    currentVirtualPage = page;
    const pagination = searchAggregationFeature.getVirtualPage(currentVirtualPage, currentVirtualPageSize);

    resultsSummary.textContent = `수집 ${pagination.totalItems}건 (페이지당 ${pagination.pageSize}개) | 가상 페이지 ${pagination.currentPage} / ${pagination.totalPages}`;
    pgIndicator.textContent = `${pagination.currentPage} / ${pagination.totalPages}`;

    pgPrev.disabled = !pagination.hasPrev;
    pgNext.disabled = !pagination.hasNext;

    resultsList.innerHTML = '';

    if (pagination.items.length === 0) {
      resultsList.innerHTML = '<div class="sp-results-meta" style="padding:10px;">검색 결과가 없습니다.</div>';
      return;
    }

    pagination.items.forEach(article => {
      const item = document.createElement('div');
      item.className = 'result-item';
      const safeTitle = escapeHTML(article.title);
      const safeAuthor = escapeHTML(article.author || '익명');
      item.innerHTML = `
        <a href="${escapeHTML(article.url || '#')}" target="_blank" class="result-item-title">${safeTitle}</a>
        <div class="result-item-meta">
          작성자: ${safeAuthor} | 댓글: ${article.comments} | 추천: ${article.recommendations} | 조회: ${article.views}
        </div>
      `;
      resultsList.appendChild(item);
    });
  };

  // Handle Enter key in keyword input
  keywordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSearch?.click();
    }
  });

  btnSearch?.addEventListener('click', async () => {
    switchView('search');
    const keyword = keywordInput.value.trim();
    const galleryId = galleryInput.value.trim() || 'programming';
    const subject = categorySelect ? categorySelect.value : '';
    const currentType = (appStore.selectedGallery && appStore.selectedGallery.galleryId === galleryId) 
                         ? appStore.selectedGallery.galleryType 
                         : 'board';
    const maxPages = parseInt(pagesSelect.value, 10) || 10;
    currentVirtualPageSize = parseInt(pageSizeSelect.value, 10) || 20;
    const sortOrder = sortSelect.value || 'newest';

    const targetCheckboxes = document.querySelectorAll('#sp-search-targets input[type="checkbox"]:checked');
    let searchTargets = Array.from(targetCheckboxes).map(chk => chk.value);
    if (searchTargets.length === 0) searchTargets = ['search_subject_memo'];
    
    // Optimization: if both Title and Content are selected, merge them into 'search_subject_memo' to halve network requests
    if (searchTargets.includes('search_subject') && searchTargets.includes('search_memo')) {
      searchTargets = searchTargets.filter(t => t !== 'search_subject' && t !== 'search_memo');
      searchTargets.unshift('search_subject_memo');
    }

    progressBox.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    progressFill.style.width = '0%';

    // Save to Recent Searches
    if (keyword) {
      let recents = configManager.get('spRecentSearches') || [];
      recents = recents.filter(r => !(r.keyword === keyword && r.galleryId === galleryId && r.subject === subject));
      recents.unshift({ keyword, galleryId, subject });
      if (recents.length > 5) recents.pop();
      configManager.set('spRecentSearches', recents);
      renderRecentSearches();
    }

    try {
      const res = await searchAggregationFeature.executeSearch(
        { keyword, galleryId, galleryType: currentType, subject, maxPages, sortOrder, searchTargets },
        {},
        (info) => {
          const percent = Math.round((info.currentPage / info.totalPages) * 100);
          progressFill.style.width = `${percent}%`;
          progressText.textContent = `수집 중... ${info.currentPage} / ${info.totalPages} 페이지 (${info.collectedCount}건)`;
        }
      );

      progressBox.classList.add('hidden');
      resultsSection.classList.remove('hidden');

      renderVirtualPage(1);

      if (res.isPartial) {
        const failCount = res.failedPages ? res.failedPages.length : 0;
        progressText.textContent = '';
        showPartialFailureBanner(`일부 페이지(${failCount}건) 수집에 실패했습니다. 결과가 불완전할 수 있습니다.`);
      } else {
        const banner = document.getElementById('sp-partial-failure-banner');
        if (banner) banner.classList.add('hidden');
      }
    } catch (err) {
      progressBox.classList.add('hidden');
      // window.alert() is not rendered inside a Side Panel, so surface the
      // failure in the existing inline banner instead.
      resultsSection.classList.remove('hidden');
      showPartialFailureBanner(`검색 중 오류가 발생했습니다: ${err.message}`);
    }
  });

  // Cancel Button Click Handler
  btnCancel?.addEventListener('click', () => {
    searchAggregationFeature.cancel();
    progressText.textContent = '수집 중단됨.';
    setTimeout(() => {
      progressBox.classList.add('hidden');
    }, 1000);
  });

  // Virtual Pagination Controls
  pgPrev?.addEventListener('click', () => {
    if (currentVirtualPage > 1) {
      renderVirtualPage(currentVirtualPage - 1);
    }
  });

  pgNext?.addEventListener('click', () => {
    renderVirtualPage(currentVirtualPage + 1);
  });

  // Recent Searches Rendering
  const recentSearchesContainer = document.getElementById('sp-recent-searches-container');
  function renderRecentSearches() {
    if (!recentSearchesContainer) return;
    const recents = configManager.get('spRecentSearches') || [];
    
    // Clear old buttons and spans
    recentSearchesContainer.querySelectorAll('button, span:not(.preset-label)').forEach(el => el.remove());
    
    if (recents.length === 0) {
      const span = document.createElement('span');
      span.textContent = '없음';
      span.className = 'sp-results-meta';
      recentSearchesContainer.appendChild(span);
      return;
    }
    
    recents.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-preset-btn';
      btn.textContent = item.keyword;
      btn.addEventListener('click', () => {
        keywordInput.value = item.keyword;
        if (galleryInput) galleryInput.value = item.galleryId;
        if (categorySelect && item.subject !== undefined) categorySelect.value = item.subject;
        btnSearch.click();
      });
      recentSearchesContainer.appendChild(btn);
    });
  };

  renderRecentSearches();

  // DOM Rescan Button
  document.getElementById('btn-refresh-dom')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const res = await messageRouter.send('RESCAN_PAGE', {}, tab.id);
        if (res && res.success && res.data) {
          document.getElementById('stat-posts').textContent = res.data.articlesCount || 0;
          document.getElementById('stat-comments').textContent = res.data.commentsCount || 0;
        }
      }
    }
  });

  // Partial Failure Banner Helper
  function showPartialFailureBanner(message) {
    let banner = document.getElementById('sp-partial-failure-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'sp-partial-failure-banner';
      banner.className = 'sp-warning-banner';
      resultsSection.prepend(banner);
    }
    banner.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
      <span>${escapeHTML(message)}</span>
    `;
    banner.classList.remove('hidden');
  }

  // --- Phase 2: Keyword Alerts ---

  const alertForm = document.getElementById('sp-alert-form');
  const alertKeywordsInput = document.getElementById('sp-alert-keywords');
  const alertIntervalSelect = document.getElementById('sp-alert-interval');
  const alertMatchModeSelect = document.getElementById('sp-alert-match-mode');
  const alertNotifyChromeInput = document.getElementById('sp-alert-notify-chrome');
  const alertFormGalleryLabel = document.getElementById('sp-alert-form-gallery');
  const alertStatusBox = document.getElementById('sp-alerts-status');
  const btnAddAlert = document.getElementById('sp-btn-add-alert');
  const btnScanNow = document.getElementById('sp-btn-scan-now');

  // Deleting asks for a second click instead of confirm(): the Side Panel does
  // not render window.confirm() / window.prompt() dialogs.
  const pendingDeletes = new Set();

  function setAlertStatus(message, isError = false) {
    if (!alertStatusBox) return;
    if (!message) {
      alertStatusBox.textContent = '';
      alertStatusBox.classList.add('hidden');
      return;
    }
    alertStatusBox.textContent = message;
    alertStatusBox.classList.toggle('error', Boolean(isError));
    alertStatusBox.classList.remove('hidden');
  }

  /**
   * Resolves the gallery a new alert should watch: the active DC tab when there
   * is one, otherwise whatever gallery ID is typed into the search box.
   * @returns {{id: string, type: string, name: string, url: string}|null}
   */
  function currentAlertTarget() {
    const context = appStore.selectedGallery || appStore.currentGallery;
    const typedId = galleryInput?.value.trim() || '';
    const galleryId = context?.galleryId || typedId;
    if (!galleryId) return null;

    const matchesContext = context?.galleryId === galleryId;
    return {
      id: galleryId,
      type: matchesContext ? (context.galleryType || 'board') : 'board',
      name: matchesContext ? (context.galleryName || galleryId) : galleryId,
      url: (matchesContext && context.canonicalUrl)
        ? context.canonicalUrl
        : `https://gall.dcinside.com/board/lists/?id=${encodeURIComponent(galleryId)}`
    };
  }

  /**
   * Turns one scan summary from the background scheduler into a Korean status line.
   * @param {Object} summary
   * @returns {string}
   */
  function describeScan(summary) {
    if (!summary) return '검사 결과를 받지 못했습니다.';
    if (summary.error) return `검사 실패: ${summary.error}`;
    if (!summary.scanned) return '검사할 활성 알림이 없습니다.';
    if (summary.baselineMatches > 0 && summary.newPosts === 0) {
      return `감시 기준점을 설정했습니다. 현재 목록에서 ${summary.baselineMatches}건이 키워드와 일치하며, 다음 새 글부터 알림을 보냅니다.`;
    }
    return `검사 완료: 수집 ${summary.posts}건 / 새 글 ${summary.newPosts}건 / 알림 ${summary.notified}건`;
  }

  function toggleAlertForm(show) {
    if (!alertForm) return;
    const target = currentAlertTarget();
    if (show && alertFormGalleryLabel) {
      alertFormGalleryLabel.textContent = target ? `${target.name} (${target.id})` : '갤러리를 먼저 선택하세요';
    }
    alertForm.classList.toggle('hidden', !show);
    if (show) {
      setAlertStatus('');
      alertKeywordsInput?.focus();
    }
  }

  async function renderKeywordAlerts() {
    const activeContainer = document.getElementById('sp-alerts-active');
    if (!activeContainer) return;

    const res = await messageRouter.send(MessageAction.KEYWORD_ALERT_LIST);
    if (!res || !res.success) {
      activeContainer.innerHTML = `<div class="sp-results-meta">알림 규칙을 불러오지 못했습니다: ${escapeHTML(res?.error || '백그라운드 응답 없음')}</div>`;
      return;
    }

    const alerts = (res.data && res.data.alerts) || [];

    if (alerts.length === 0) {
      activeContainer.innerHTML = '<div class="sp-results-meta">등록된 키워드 알림이 없습니다.</div>';
      return;
    }

    activeContainer.innerHTML = alerts.map(a => {
      const statusClass = a.enabled ? 'active-rule' : 'paused-rule';
      const failBadge = (a.consecutiveFailures || 0) >= 3 ? '<span class="sp-badge">오류</span>' : '';
      const keywordsText = Array.isArray(a.keywords) ? a.keywords.join(', ') : '';
      const nameText = escapeHTML(a.gallery?.name || a.gallery?.id || '알 수 없음');
      const lastRunText = a.lastCheckedAt ? new Date(a.lastCheckedAt).toLocaleString('ko-KR') : '확인 대기 중';
      const intervalText = `${a.pollingIntervalMinutes || 5}분 주기`;
      const matchText = a.matchCount ? ` · 누적 알림 ${a.matchCount}건` : '';
      const errorText = a.lastError
        ? `<div class="sp-alert-item-meta" style="color: var(--md-sys-color-error);">${escapeHTML(a.lastError)}</div>`
        : '';
      const deleteLabel = pendingDeletes.has(a.id) ? '삭제 확인' : '삭제';

      return `
        <div class="sp-alert-item ${statusClass}" data-id="${escapeHTML(a.id)}">
          <div class="sp-alert-item-header">
            <div class="sp-alert-item-title">${nameText} ${failBadge}</div>
            <div style="font-size: 11px; font-weight: 600; color: var(--md-sys-color-primary);">${a.enabled ? '● 감시 중' : '○ 일시정지'}</div>
          </div>
          <div class="sp-alert-item-meta" style="margin-bottom: 2px;">키워드: <strong>${escapeHTML(keywordsText)}</strong></div>
          <div class="sp-alert-item-meta">${escapeHTML(intervalText)} · 최근 확인: ${escapeHTML(lastRunText)}${escapeHTML(matchText)}</div>
          ${errorText}
          <div class="sp-alert-item-actions">
            <button type="button" class="sp-btn-outline toggle-alert-btn" data-id="${escapeHTML(a.id)}" data-enabled="${a.enabled}">${a.enabled ? '일시정지' : '시작'}</button>
            <button type="button" class="sp-btn-outline scan-alert-btn" data-id="${escapeHTML(a.id)}">지금 검사</button>
            <button type="button" class="sp-btn-outline delete-alert-btn" data-id="${escapeHTML(a.id)}">${deleteLabel}</button>
          </div>
        </div>
      `;
    }).join('');

    activeContainer.querySelectorAll('.toggle-alert-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const enabled = e.currentTarget.dataset.enabled === 'true';
        const res2 = await messageRouter.send(MessageAction.KEYWORD_ALERT_TOGGLE, { id, enabled: !enabled });
        if (!res2 || !res2.success) {
          setAlertStatus(`상태 변경 실패: ${res2?.error || '알 수 없는 오류'}`, true);
        } else {
          setAlertStatus(enabled ? '알림을 일시정지했습니다.' : '알림을 다시 시작했습니다.');
        }
        renderKeywordAlerts();
      });
    });

    activeContainer.querySelectorAll('.scan-alert-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        e.currentTarget.disabled = true;
        setAlertStatus('검사 중...');
        const res2 = await messageRouter.send(MessageAction.KEYWORD_ALERT_SCAN_NOW, { id });
        if (!res2 || !res2.success) {
          setAlertStatus(`검사 실패: ${res2?.error || '알 수 없는 오류'}`, true);
        } else {
          const summary = res2.data?.result;
          setAlertStatus(describeScan(Array.isArray(summary) ? summary[0] : summary), Boolean(summary?.error));
        }
        renderKeywordAlerts();
        renderNotifications();
      });
    });

    activeContainer.querySelectorAll('.delete-alert-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!pendingDeletes.has(id)) {
          pendingDeletes.add(id);
          e.currentTarget.textContent = '삭제 확인';
          setAlertStatus('삭제하려면 [삭제 확인]을 한 번 더 누르세요.');
          return;
        }
        pendingDeletes.delete(id);
        const res2 = await messageRouter.send(MessageAction.KEYWORD_ALERT_DELETE, { id });
        setAlertStatus(res2 && res2.success ? '알림 규칙을 삭제했습니다.' : `삭제 실패: ${res2?.error || '알 수 없는 오류'}`, !(res2 && res2.success));
        renderKeywordAlerts();
      });
    });
  }

  async function renderNotifications() {
    const recentContainer = document.getElementById('sp-alerts-recent');
    const badge = document.getElementById('sp-alerts-unread-badge');
    if (!recentContainer) return;

    const res = await messageRouter.send(MessageAction.KEYWORD_NOTIFICATION_LIST);
    if (!res || !res.success) {
      recentContainer.innerHTML = `<div class="sp-results-meta">알림을 불러오지 못했습니다: ${escapeHTML(res?.error || '백그라운드 응답 없음')}</div>`;
      return;
    }

    const notis = (res.data && res.data.notifications) || [];
    const unreadCount = notis.filter(n => !n.read).length;

    const tileBadge = document.getElementById('sp-tile-badge-alerts');
    [badge, tileBadge].forEach(node => {
      if (!node) return;
      if (unreadCount > 0) {
        node.textContent = String(unreadCount);
        node.classList.remove('hidden');
      } else {
        node.classList.add('hidden');
      }
    });

    if (notis.length === 0) {
      recentContainer.innerHTML = '<div class="sp-results-meta">최근 알림이 없습니다.</div>';
      return;
    }

    const getRelativeTime = (ts) => {
      const diff = Math.floor((Date.now() - ts) / 1000);
      if (diff < 60) return '방금 전';
      if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
      return `${Math.floor(diff / 86400)}일 전`;
    };

    recentContainer.innerHTML = `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <button type="button" id="sp-btn-clear-notis" class="sp-btn-outline" style="padding: 2px 6px; font-size: 10px;">모두 삭제</button>
      </div>
    ` + notis.map(n => {
      const readClass = n.read ? 'read' : '';
      const galleryName = escapeHTML(n.post?.galleryName || '갤러리');
      const title = escapeHTML(n.post?.title || '제목 없음');
      const keywords = Array.isArray(n.matchedKeywords) ? escapeHTML(n.matchedKeywords.join(', ')) : '';

      return `
        <div class="sp-notification-item ${readClass}" data-id="${escapeHTML(n.id)}" data-url="${escapeHTML(n.post?.url || '')}">
          <div class="sp-notification-title">${title}</div>
          <div class="sp-notification-meta">${galleryName} · ${getRelativeTime(n.detectedAt)}</div>
          <div class="sp-notification-meta" style="margin-top:2px;">매칭 키워드: ${keywords}</div>
        </div>
      `;
    }).join('');

    recentContainer.querySelectorAll('.sp-notification-item').forEach(el => {
      el.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const url = e.currentTarget.dataset.url;
        await messageRouter.send(MessageAction.KEYWORD_NOTIFICATION_READ, { id });
        if (url) chrome.tabs.create({ url });
        renderNotifications(); // Refresh list to remove bold/unread state
      });
    });

    const clearBtn = document.getElementById('sp-btn-clear-notis');
    clearBtn?.addEventListener('click', async () => {
      if (clearBtn.dataset.confirm !== 'true') {
        clearBtn.dataset.confirm = 'true';
        clearBtn.textContent = '정말 삭제';
        return;
      }
      await messageRouter.send(MessageAction.KEYWORD_NOTIFICATION_CLEAR);
      renderNotifications();
    });
  }

  btnAddAlert?.addEventListener('click', () => {
    toggleAlertForm(alertForm?.classList.contains('hidden'));
  });

  document.getElementById('sp-alert-form-cancel')?.addEventListener('click', () => {
    toggleAlertForm(false);
  });

  alertForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const target = currentAlertTarget();
    if (!target) {
      setAlertStatus('감시할 갤러리를 먼저 선택하거나 갤러리 ID를 입력하세요.', true);
      return;
    }

    const keywords = (alertKeywordsInput?.value || '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      setAlertStatus('키워드를 1개 이상 입력하세요.', true);
      return;
    }

    const saveBtn = document.getElementById('sp-alert-form-save');
    if (saveBtn) saveBtn.disabled = true;
    setAlertStatus('등록 중...');

    const res = await messageRouter.send(MessageAction.KEYWORD_ALERT_CREATE, {
      gallery: target,
      keywords,
      target: 'title',
      matchMode: alertMatchModeSelect?.value || 'contains',
      enabled: true,
      pollingIntervalMinutes: parseInt(alertIntervalSelect?.value, 10) || 5,
      notifyPanel: true,
      notifyChrome: alertNotifyChromeInput ? alertNotifyChromeInput.checked : true
    });

    if (saveBtn) saveBtn.disabled = false;

    if (!res || !res.success) {
      setAlertStatus(`알림 추가 실패: ${res?.error || '알 수 없는 오류'}`, true);
      return;
    }

    if (alertKeywordsInput) alertKeywordsInput.value = '';
    toggleAlertForm(false);
    renderKeywordAlerts();

    // The rule's baseline scan already started in the background; joining it
    // here reports back how many current posts match the new keyword.
    const newId = res.data?.alert?.id;
    const scanRes = await messageRouter.send(MessageAction.KEYWORD_ALERT_SCAN_NOW, { id: newId });
    const summary = scanRes && scanRes.success ? scanRes.data?.result : null;
    if (summary && summary.error) {
      setAlertStatus(describeScan(summary), true);
    } else if (summary) {
      setAlertStatus(`감시를 시작했습니다. 현재 목록에서 키워드 일치 ${summary.baselineMatches}건 확인 — 다음 새 글부터 알림을 보냅니다.`);
    } else {
      setAlertStatus('감시를 시작했습니다. 새 글이 올라오면 알림을 보냅니다.');
    }
    renderKeywordAlerts();
  });

  btnScanNow?.addEventListener('click', async () => {
    btnScanNow.disabled = true;
    setAlertStatus('전체 검사 중...');
    const res = await messageRouter.send(MessageAction.KEYWORD_ALERT_SCAN_NOW, {});
    btnScanNow.disabled = false;

    if (!res || !res.success) {
      setAlertStatus(`검사 실패: ${res?.error || '알 수 없는 오류'}`, true);
    } else {
      const summaries = Array.isArray(res.data?.result) ? res.data.result : [res.data?.result].filter(Boolean);
      if (summaries.length === 0) {
        setAlertStatus('검사할 활성 알림이 없습니다.');
      } else {
        const failed = summaries.filter(s => s && s.error);
        const totals = summaries.reduce((acc, s) => ({
          posts: acc.posts + (s?.posts || 0),
          newPosts: acc.newPosts + (s?.newPosts || 0),
          notified: acc.notified + (s?.notified || 0)
        }), { posts: 0, newPosts: 0, notified: 0 });
        const base = `검사 완료 (갤러리 ${summaries.length}곳): 수집 ${totals.posts}건 / 새 글 ${totals.newPosts}건 / 알림 ${totals.notified}건`;
        setAlertStatus(failed.length > 0 ? `${base} · 실패 ${failed.length}건 (${failed[0].error})` : base, failed.length > 0);
      }
    }

    renderKeywordAlerts();
    renderNotifications();
  });

  renderKeywordAlerts();
  renderNotifications();
  setInterval(() => {
    renderKeywordAlerts();
    renderNotifications();
  }, 15000); // 15 sec refresh for status

  // --- Phase 1: Quick Access & Current Gallery Actions ---
  
  const quickTabs = document.querySelectorAll('.sp-quick-tab');
  const quickContents = document.querySelectorAll('.sp-quick-content');
  quickTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      quickTabs.forEach(t => t.classList.remove('active'));
      quickContents.forEach(c => {
        c.classList.remove('active');
        c.classList.add('hidden');
      });
      
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.target);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
      }
    });
  });

  async function renderQuickAccess() {
    const recentContainer = document.getElementById('sp-recent-galleries');
    const favContainer = document.getElementById('sp-favorite-galleries');
    if (!recentContainer || !favContainer) return;

    try {
      const [recentRes, favRes] = await Promise.all([
        messageRouter.send(MessageAction.GET_RECENT_GALLERIES),
        messageRouter.send(MessageAction.GET_FAVORITE_GALLERIES)
      ]);

      const recents = recentRes.success ? recentRes.data.galleries : [];
      const favorites = favRes.success ? favRes.data.favorites : [];

      const createItem = (g, isFav) => {
        const el = document.createElement('div');
        el.className = 'sp-gallery-item';
        el.innerHTML = `
          <div>
            <div class="sp-gallery-item-name">${escapeHTML(g.name || g.galleryId)}</div>
            <div class="sp-gallery-item-meta">${g.galleryType === 'mgallery' ? '마이너 갤러리' : g.galleryType === 'mini' ? '미니 갤러리' : '갤러리'}</div>
          </div>
        `;
        el.addEventListener('click', () => {
          chrome.tabs.create({ url: g.url || `https://gall.dcinside.com/${g.galleryType === 'mgallery' ? 'mgallery/' : g.galleryType === 'mini' ? 'mini/' : ''}board/lists/?id=${g.galleryId}` });
        });
        return el;
      };

      recentContainer.innerHTML = recents.length === 0 ? '<div class="sp-results-meta">최근 방문 기록이 없습니다.</div>' : '';
      recents.forEach(g => recentContainer.appendChild(createItem(g, false)));

      favContainer.innerHTML = favorites.length === 0 ? '<div class="sp-results-meta">즐겨찾기가 없습니다.</div>' : '';
      favorites.forEach(g => favContainer.appendChild(createItem(g, true)));
    } catch (err) {
      console.warn('Failed to render quick access:', err);
    }
  }

  let currentActiveGallery = null;
  const currentGallerySection = document.getElementById('sp-current-gallery-section');
  const currentGalleryName = document.getElementById('sp-current-gallery-name');
  const btnFavoriteToggle = document.getElementById('sp-btn-favorite-toggle');
  
  function updateCurrentGallery(context) {
    if (!context || !context.valid || !context.galleryId) {
      currentGallerySection.classList.add('hidden');
      currentActiveGallery = null;
      return;
    }
    
    currentActiveGallery = context;
    currentGallerySection.classList.remove('hidden');
    currentGalleryName.textContent = context.galleryName || context.galleryId;
    
    checkIfFavorite(context.galleryId);
  }

  async function checkIfFavorite(galleryId) {
    const res = await messageRouter.send(MessageAction.GET_FAVORITE_GALLERIES);
    if (res.success && res.data.favorites.some(f => f.galleryId === galleryId)) {
      btnFavoriteToggle.classList.add('active');
    } else {
      btnFavoriteToggle.classList.remove('active');
    }
  }

  btnFavoriteToggle?.addEventListener('click', async () => {
    if (!currentActiveGallery) return;
    const isFav = btnFavoriteToggle.classList.contains('active');
    if (isFav) {
      await messageRouter.send(MessageAction.REMOVE_FAVORITE_GALLERY, { galleryId: currentActiveGallery.galleryId });
      btnFavoriteToggle.classList.remove('active');
    } else {
      await messageRouter.send(MessageAction.ADD_FAVORITE_GALLERY, {
        galleryId: currentActiveGallery.galleryId,
        galleryType: currentActiveGallery.galleryType,
        name: currentActiveGallery.galleryName || currentActiveGallery.galleryId,
        url: currentActiveGallery.url
      });
      btnFavoriteToggle.classList.add('active');
    }
    renderQuickAccess();
  });

  const navigateTo = (pathSuffix) => {
    if (!currentActiveGallery) return;
    let base = 'https://gall.dcinside.com';
    if (currentActiveGallery.galleryType === 'mgallery') base += '/mgallery';
    else if (currentActiveGallery.galleryType === 'mini') base += '/mini';
    chrome.tabs.create({ url: `${base}/board/lists/?id=${currentActiveGallery.galleryId}${pathSuffix}` });
  };

  document.getElementById('sp-btn-nav-all')?.addEventListener('click', () => navigateTo(''));
  document.getElementById('sp-btn-nav-best')?.addEventListener('click', () => navigateTo('&exception_mode=recommend'));
  document.getElementById('sp-btn-nav-notice')?.addEventListener('click', () => {
    // Navigating to notice (usually it's a search_head or just clicking notice link on site)
    // We'll approximate it or just go to all. Usually notice doesn't have a strict url param across all galleries.
    navigateTo(''); 
  });

  document.getElementById('sp-btn-use-current')?.addEventListener('click', () => {
    if (currentActiveGallery) {
      appStore.selectedGallery = { ...currentActiveGallery };
      galleryInput.value = currentActiveGallery.galleryId;
      configManager.set('spGalleryType', currentActiveGallery.galleryType);
    }
  });

  renderQuickAccess();

  // ---------------------------------------------------------------
  // Phase 21: 유저 메모·차단 / 도배 필터 / 보기 옵션 / 작성 도우미
  // ---------------------------------------------------------------

  const USER_RULE_TYPE_LABEL = {
    nick: '닉네임',
    uid: '유저 ID',
    ip: 'IP',
    ipPrefix: 'IP 대역',
    regex: '정규식'
  };
  const USER_RULE_ACTION_LABEL = {
    blind: '블라인드',
    hide: '숨김',
    dim: '흐리게',
    label: '메모만'
  };

  function setStatus(elementId, message, isError = false) {
    const box = document.getElementById(elementId);
    if (!box) return;
    if (!message) {
      box.textContent = '';
      box.classList.add('hidden');
      return;
    }
    box.textContent = message;
    box.classList.toggle('error', Boolean(isError));
    box.classList.remove('hidden');
  }

  async function renderUserRules() {
    const container = document.getElementById('sp-user-rule-list');
    if (!container) return;

    const res = await messageRouter.send(MessageAction.USER_RULE_LIST);
    if (!res || !res.success) {
      container.innerHTML = `<div class="sp-results-meta">규칙을 불러오지 못했습니다: ${escapeHTML(res?.error || '백그라운드 응답 없음')}</div>`;
      return;
    }

    const rules = (res.data && res.data.rules) || [];
    if (rules.length === 0) {
      container.innerHTML = '<div class="sp-results-meta">등록된 유저 메모/차단이 없습니다.</div>';
      return;
    }

    container.innerHTML = rules.map(rule => `
      <div class="sp-alert-item ${rule.enabled === false ? 'paused-rule' : 'active-rule'}" data-id="${escapeHTML(rule.id)}">
        <div class="sp-alert-item-header">
          <div class="sp-alert-item-title">${escapeHTML(USER_RULE_TYPE_LABEL[rule.type] || rule.type)}: ${escapeHTML(rule.value)}</div>
          <div style="font-size: 11px; font-weight: 600; color: var(--md-sys-color-primary);">${escapeHTML(USER_RULE_ACTION_LABEL[rule.action] || rule.action)}</div>
        </div>
        ${rule.memo ? `<div class="sp-alert-item-meta">메모: <strong>${escapeHTML(rule.memo)}</strong></div>` : ''}
        <div class="sp-alert-item-meta">
          ${rule.galleryId ? `${escapeHTML(rule.galleryId)} 갤러리 전용` : '모든 갤러리'} · 적중 ${Number(rule.hitCount || 0)}회
        </div>
        <div class="sp-alert-item-actions">
          <button type="button" class="sp-btn-outline user-rule-toggle" data-id="${escapeHTML(rule.id)}" data-enabled="${rule.enabled !== false}">${rule.enabled === false ? '사용' : '중지'}</button>
          <button type="button" class="sp-btn-outline user-rule-delete" data-id="${escapeHTML(rule.id)}">삭제</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.user-rule-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const enabled = e.currentTarget.dataset.enabled === 'true';
        await messageRouter.send(MessageAction.USER_RULE_UPDATE, { id, updates: { enabled: !enabled } });
        renderUserRules();
      });
    });

    container.querySelectorAll('.user-rule-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        if (button.dataset.confirm !== 'true') {
          button.dataset.confirm = 'true';
          button.textContent = '삭제 확인';
          return;
        }
        await messageRouter.send(MessageAction.USER_RULE_DELETE, { id: button.dataset.id });
        setStatus('sp-user-rule-status', '규칙을 삭제했습니다.');
        renderUserRules();
      });
    });
  }

  const userRuleForm = document.getElementById('sp-user-rule-form');

  document.getElementById('sp-btn-add-user-rule')?.addEventListener('click', () => {
    userRuleForm?.classList.toggle('hidden');
    setStatus('sp-user-rule-status', '');
    if (!userRuleForm?.classList.contains('hidden')) {
      document.getElementById('sp-user-rule-value')?.focus();
    }
  });

  document.getElementById('sp-user-rule-cancel')?.addEventListener('click', () => {
    userRuleForm?.classList.add('hidden');
  });

  userRuleForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const value = document.getElementById('sp-user-rule-value')?.value.trim() || '';
    if (!value) {
      setStatus('sp-user-rule-status', '차단/메모할 대상을 입력하세요.', true);
      return;
    }

    const scoped = document.getElementById('sp-user-rule-gallery')?.checked;
    const galleryId = scoped
      ? (appStore.selectedGallery?.galleryId || appStore.currentGallery?.galleryId || galleryInput?.value.trim() || null)
      : null;

    const res = await messageRouter.send(MessageAction.USER_RULE_ADD, {
      type: document.getElementById('sp-user-rule-type')?.value || 'nick',
      value,
      memo: document.getElementById('sp-user-rule-memo')?.value.trim() || '',
      action: document.getElementById('sp-user-rule-action')?.value || 'blind',
      galleryId
    });

    if (!res || !res.success) {
      setStatus('sp-user-rule-status', `등록 실패: ${res?.error || '알 수 없는 오류'}`, true);
      return;
    }

    document.getElementById('sp-user-rule-value').value = '';
    document.getElementById('sp-user-rule-memo').value = '';
    userRuleForm.classList.add('hidden');
    setStatus('sp-user-rule-status', '등록했습니다. 열려 있는 디시 탭에 바로 적용됩니다.');
    renderUserRules();
  });

  // --- 도배 필터 설정 ---
  function loadSpamSettings() {
    const enabled = document.getElementById('sp-spam-enabled');
    const duplicate = document.getElementById('sp-spam-duplicate');
    const special = document.getElementById('sp-spam-special');
    const run = document.getElementById('sp-spam-run');
    const patterns = document.getElementById('sp-spam-patterns');
    if (!enabled) return;

    enabled.checked = configManager.get('enableSpamFilter') !== false;
    duplicate.value = configManager.get('spamDuplicateThreshold') ?? 3;
    special.value = Math.round((configManager.get('spamSpecialCharRatio') ?? 0.6) * 100);
    run.value = configManager.get('spamRepeatedCharRun') ?? 6;
    patterns.value = (configManager.get('spamPatterns') || []).join('\n');
  }

  document.getElementById('sp-spam-save')?.addEventListener('click', async () => {
    const patterns = (document.getElementById('sp-spam-patterns')?.value || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const invalid = patterns.filter(pattern => {
      try {
        new RegExp(pattern, 'i');
        return false;
      } catch (err) {
        return true;
      }
    });

    if (invalid.length > 0) {
      setStatus('sp-spam-status', `정규식이 올바르지 않습니다: ${invalid[0]}`, true);
      return;
    }

    await configManager.set({
      enableSpamFilter: document.getElementById('sp-spam-enabled')?.checked !== false,
      spamDuplicateThreshold: parseInt(document.getElementById('sp-spam-duplicate')?.value, 10) || 3,
      spamSpecialCharRatio: (parseInt(document.getElementById('sp-spam-special')?.value, 10) || 60) / 100,
      spamRepeatedCharRun: parseInt(document.getElementById('sp-spam-run')?.value, 10) || 6,
      spamPatterns: patterns
    });

    setStatus('sp-spam-status', '도배 필터를 저장했습니다. 디시 탭을 새로고침하면 적용됩니다.');
  });

  // --- 보기 옵션 ---
  function loadViewSettings() {
    const map = {
      'sp-opt-infinite': 'enableInfiniteScroll',
      'sp-opt-hot': 'enableHotHighlight',
      'sp-opt-markdown': 'enableMarkdownCode',
      'sp-opt-draft': 'enableDraftAutosave',
      'sp-opt-dccon': 'enableDcconFavorites'
    };
    Object.entries(map).forEach(([elementId, key]) => {
      const el = document.getElementById(elementId);
      if (el) el.checked = configManager.get(key) !== false;
    });

    const rec = document.getElementById('sp-hot-rec');
    const cmt = document.getElementById('sp-hot-cmt');
    const max = document.getElementById('sp-infinite-max');
    if (rec) rec.value = configManager.get('hotRecommendThreshold') ?? 10;
    if (cmt) cmt.value = configManager.get('hotCommentThreshold') ?? 20;
    if (max) max.value = configManager.get('infiniteScrollMaxPages') ?? 10;
  }

  document.getElementById('sp-view-save')?.addEventListener('click', async () => {
    await configManager.set({
      enableInfiniteScroll: document.getElementById('sp-opt-infinite')?.checked !== false,
      enableHotHighlight: document.getElementById('sp-opt-hot')?.checked !== false,
      enableMarkdownCode: document.getElementById('sp-opt-markdown')?.checked !== false,
      enableDraftAutosave: document.getElementById('sp-opt-draft')?.checked !== false,
      enableDcconFavorites: document.getElementById('sp-opt-dccon')?.checked !== false,
      hotRecommendThreshold: parseInt(document.getElementById('sp-hot-rec')?.value, 10) || 10,
      hotCommentThreshold: parseInt(document.getElementById('sp-hot-cmt')?.value, 10) || 20,
      infiniteScrollMaxPages: parseInt(document.getElementById('sp-infinite-max')?.value, 10) || 10
    });
    setStatus('sp-view-status', '보기 옵션을 저장했습니다. 디시 탭을 새로고침하면 적용됩니다.');
  });

  // --- 임시저장 목록 ---
  async function renderDrafts() {
    const container = document.getElementById('sp-drafts');
    if (!container) return;

    const res = await messageRouter.send(MessageAction.DRAFT_LIST);
    if (!res || !res.success) {
      container.innerHTML = '<div class="sp-results-meta">임시저장 목록을 불러오지 못했습니다.</div>';
      return;
    }

    const drafts = (res.data && res.data.drafts) || [];
    if (drafts.length === 0) {
      container.innerHTML = '<div class="sp-results-meta">임시저장된 글이 없습니다. 글쓰기 화면에서 자동으로 저장됩니다.</div>';
      return;
    }

    container.innerHTML = drafts.map(draft => `
      <div class="sp-notification-item" data-url="${escapeHTML(draft.url || '')}" data-key="${escapeHTML(draft.key)}">
        <div class="sp-notification-title">${escapeHTML(draft.subject || '(제목 없음)')}</div>
        <div class="sp-notification-meta">${escapeHTML(draft.galleryId || '')} · ${escapeHTML(new Date(draft.savedAt).toLocaleString('ko-KR'))}</div>
        ${draft.preview ? `<div class="sp-notification-meta" style="margin-top:2px;">${escapeHTML(draft.preview)}</div>` : ''}
        ${draft.attachments?.length ? `<div class="sp-notification-meta" style="margin-top:2px;">첨부: ${escapeHTML(draft.attachments.join(', '))}</div>` : ''}
        <div class="sp-alert-item-actions">
          <button type="button" class="sp-btn-outline draft-open">이어쓰기</button>
          <button type="button" class="sp-btn-outline draft-delete">삭제</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.draft-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = e.currentTarget.closest('[data-url]')?.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });

    container.querySelectorAll('.draft-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const key = e.currentTarget.closest('[data-key]')?.dataset.key;
        await messageRouter.send(MessageAction.DRAFT_DELETE, { key });
        renderDrafts();
      });
    });
  }

  // --- 디시콘 즐겨찾기 ---
  async function renderDccons() {
    const container = document.getElementById('sp-dccons');
    if (!container) return;

    const res = await messageRouter.send(MessageAction.DCCON_LIST);
    if (!res || !res.success) {
      container.innerHTML = '<div class="sp-results-meta">디시콘 목록을 불러오지 못했습니다.</div>';
      return;
    }

    const dccons = (res.data && res.data.dccons) || [];
    if (dccons.length === 0) {
      container.innerHTML = '<div class="sp-results-meta">디시콘을 사용하면 자동으로 수집됩니다. 3회 이상 쓰면 자동으로 핀 고정됩니다.</div>';
      return;
    }

    container.innerHTML = `<div class="sp-dccon-grid">${dccons.map(dccon => `
      <div class="sp-dccon-cell ${dccon.pinned ? 'pinned' : ''}" data-detail="${escapeHTML(dccon.detailIdx)}">
        <img src="${escapeHTML(dccon.img)}" alt="${escapeHTML(dccon.title)}" loading="lazy">
        <div class="sp-dccon-name">${escapeHTML(dccon.title || '(이름 없음)')}</div>
        <div class="sp-dccon-uses">${Number(dccon.uses || 0)}회</div>
        <div class="sp-dccon-actions">
          <button type="button" class="sp-btn-outline dccon-pin" data-detail="${escapeHTML(dccon.detailIdx)}" data-pinned="${Boolean(dccon.pinned)}">${dccon.pinned ? '핀 해제' : '핀 고정'}</button>
          <button type="button" class="sp-btn-outline dccon-delete" data-detail="${escapeHTML(dccon.detailIdx)}">삭제</button>
        </div>
      </div>`).join('')}</div>`;

    container.querySelectorAll('.dccon-pin').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const detailIdx = e.currentTarget.dataset.detail;
        const pinned = e.currentTarget.dataset.pinned === 'true';
        await messageRouter.send(MessageAction.DCCON_PIN, { detailIdx, pinned: !pinned });
        renderDccons();
      });
    });

    container.querySelectorAll('.dccon-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await messageRouter.send(MessageAction.DCCON_DELETE, { detailIdx: e.currentTarget.dataset.detail });
        renderDccons();
      });
    });
  }

  loadSpamSettings();
  loadViewSettings();
  renderUserRules();
  renderDrafts();
  renderDccons();


  // ---------------------------------------------------------------
  // 자짤(자동 첨부 이미지) 관리 — [작성] 서비스
  // ---------------------------------------------------------------
  const autoSigModeSelect = document.getElementById('sp-autosig-mode');
  const autoSigList = document.getElementById('sp-autosig-list');
  const autoSigMapBox = document.getElementById('sp-autosig-gallery-map');
  const autoSigHint = document.getElementById('sp-autosig-hint');
  const autoSigFile = document.getElementById('sp-autosig-file');
  const autoSigMapBtn = document.getElementById('sp-autosig-map');
  const autoSigEnabled = document.getElementById('sp-autosig-enabled');

  const MODE_HINT = {
    random: '글을 쓸 때마다 등록된 자짤 중 하나가 무작위로 첨부됩니다.',
    single: '항상 지정한 자짤 1개만 첨부됩니다. 썸네일을 눌러 지정하세요.',
    gallery: '갤러리마다 다른 자짤을 씁니다. 갤러리를 연 상태에서 자짤을 고르고 [현재 갤러리에 지정]을 누르세요. 지정하지 않은 갤러리는 기본 자짤(없으면 무작위)이 쓰입니다.'
  };

  function activeGalleryId() {
    return appStore.selectedGallery?.galleryId || appStore.currentGallery?.galleryId || galleryInput?.value.trim() || '';
  }

  /** 마지막으로 클릭한 자짤 — 갤러리 지정의 대상이 된다. */
  let autoSigFocusedId = null;

  async function renderAutoSignatures() {
    if (!autoSigList) return;

    const mode = configManager.get('autoSigMode') || 'random';
    const selectedId = configManager.get('autoSigSelectedId') || null;
    const galleryMap = configManager.get('autoSigGalleryMap') || {};
    const images = await signatureStore.list();

    if (autoSigEnabled) autoSigEnabled.checked = configManager.get('enableAutoSignature') === true;
    if (autoSigModeSelect) autoSigModeSelect.value = mode;
    if (autoSigHint) autoSigHint.textContent = MODE_HINT[mode] || '';
    autoSigMapBtn?.classList.toggle('hidden', mode !== 'gallery');

    if (images.length === 0) {
      autoSigList.innerHTML = '<div class="sp-results-meta">등록된 자짤이 없습니다. [이미지 추가]를 누르거나, 글쓰기 화면에 이미지를 붙여넣으면 목록에 추가됩니다.</div>';
      autoSigMapBox?.classList.add('hidden');
      return;
    }

    const galleryId = activeGalleryId();

    autoSigList.innerHTML = images.map(image => {
      const isSelected = image.id === selectedId;
      const mappedTo = Object.entries(galleryMap).filter(([, id]) => id === image.id).map(([gid]) => gid);
      const isFocused = image.id === autoSigFocusedId;
      const tags = [];
      if (mode === 'single' && isSelected) tags.push('사용 중');
      if (mode !== 'single' && isSelected) tags.push('기본');
      if (mode === 'gallery' && mappedTo.includes(galleryId)) tags.push('현재 갤');
      if (mode === 'gallery' && mappedTo.length > 0) tags.push(`갤 ${mappedTo.length}곳`);

      return `
        <div class="sp-autosig-cell ${isSelected || isFocused ? 'selected' : ''}" data-id="${escapeHTML(image.id)}">
          <img src="${escapeHTML(image.dataUrl)}" alt="${escapeHTML(image.name)}" title="클릭하면 선택됩니다" loading="lazy">
          <div class="sp-autosig-name">${escapeHTML(image.name)}</div>
          ${tags.length ? `<div class="sp-autosig-tag">${escapeHTML(tags.join(' · '))}</div>` : ''}
          <div class="sp-autosig-actions">
            <button type="button" class="sp-btn-outline autosig-rename" data-id="${escapeHTML(image.id)}">이름</button>
            <button type="button" class="sp-btn-outline autosig-delete" data-id="${escapeHTML(image.id)}">삭제</button>
          </div>
        </div>`;
    }).join('');

    autoSigList.querySelectorAll('.sp-autosig-cell img').forEach(img => {
      img.addEventListener('click', async () => {
        const id = img.closest('[data-id]').dataset.id;
        autoSigFocusedId = id;
        // single 모드에서는 클릭이 곧 '이 자짤만 사용', 그 외에는 기본 자짤 지정.
        await configManager.set('autoSigSelectedId', id);
        setStatus('sp-autosig-status', (configManager.get('autoSigMode') === 'single')
          ? '이 자짤만 사용하도록 지정했습니다.'
          : '기본 자짤로 지정했습니다.');
        renderAutoSignatures();
      });
    });

    autoSigList.querySelectorAll('.autosig-rename').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const cell = e.currentTarget.closest('[data-id]');
        const nameEl = cell.querySelector('.sp-autosig-name');
        if (cell.dataset.editing === 'true') return;
        cell.dataset.editing = 'true';

        const input = document.createElement('input');
        input.className = 'sp-input';
        input.value = nameEl.textContent;
        input.style.fontSize = '11px';
        nameEl.replaceWith(input);
        input.focus();

        const commit = async () => {
          try {
            await signatureStore.rename(cell.dataset.id, input.value);
          } catch (err) {
            setStatus('sp-autosig-status', err.message, true);
          }
          renderAutoSignatures();
        };
        input.addEventListener('blur', commit, { once: true });
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
      });
    });

    autoSigList.querySelectorAll('.autosig-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        if (button.dataset.confirm !== 'true') {
          button.dataset.confirm = 'true';
          button.textContent = '확인';
          return;
        }
        await signatureStore.remove(button.dataset.id);
        setStatus('sp-autosig-status', '자짤을 삭제했습니다.');
        renderAutoSignatures();
      });
    });

    // 갤러리별 매핑 목록
    const entries = Object.entries(galleryMap);
    if (mode === 'gallery' && entries.length > 0) {
      autoSigMapBox.classList.remove('hidden');
      autoSigMapBox.innerHTML = entries.map(([gid, imageId]) => {
        const image = images.find(item => item.id === imageId);
        return `
          <div class="sp-autosig-map-row" data-gallery="${escapeHTML(gid)}">
            <img src="${escapeHTML(image?.dataUrl || '')}" alt="">
            <span class="gallery">${escapeHTML(gid)}</span>
            <span>${escapeHTML(image?.name || '(삭제된 자짤)')}</span>
            <button type="button" class="sp-btn-outline autosig-unmap">해제</button>
          </div>`;
      }).join('');

      autoSigMapBox.querySelectorAll('.autosig-unmap').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const gid = e.currentTarget.closest('[data-gallery]').dataset.gallery;
          await signatureStore.setGalleryImage(gid, null);
          setStatus('sp-autosig-status', `${gid} 갤러리 지정을 해제했습니다.`);
          renderAutoSignatures();
        });
      });
    } else if (autoSigMapBox) {
      // 남아 있던 행이 다시 보이지 않도록 내용까지 비운다.
      autoSigMapBox.innerHTML = '';
      autoSigMapBox.classList.add('hidden');
    }
  }

  autoSigEnabled?.addEventListener('change', async (e) => {
    await configManager.set('enableAutoSignature', e.target.checked);
    setStatus('sp-autosig-status', e.target.checked ? '자짤 자동 첨부를 켰습니다.' : '자짤 자동 첨부를 껐습니다.');
  });

  autoSigModeSelect?.addEventListener('change', async (e) => {
    await configManager.set('autoSigMode', e.target.value);
    renderAutoSignatures();
  });

  document.getElementById('sp-autosig-add')?.addEventListener('click', () => autoSigFile?.click());

  autoSigFile?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let added = 0;
    for (const file of files) {
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target.result);
          reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
          reader.readAsDataURL(file);
        });
        await signatureStore.add({ dataUrl, name: file.name.replace(/\.[^.]+$/, '') });
        added++;
      } catch (err) {
        setStatus('sp-autosig-status', `${file.name}: ${err.message}`, true);
      }
    }

    if (added > 0) setStatus('sp-autosig-status', `자짤 ${added}개를 등록했습니다.`);
    e.target.value = '';
    renderAutoSignatures();
  });

  autoSigMapBtn?.addEventListener('click', async () => {
    const galleryId = activeGalleryId();
    const imageId = autoSigFocusedId || configManager.get('autoSigSelectedId');

    if (!galleryId) {
      setStatus('sp-autosig-status', '디시 갤러리 탭을 연 뒤 다시 시도하거나, 검색 탭에서 갤러리 ID를 입력하세요.', true);
      return;
    }
    if (!imageId) {
      setStatus('sp-autosig-status', '먼저 목록에서 자짤을 클릭해 선택하세요.', true);
      return;
    }

    await signatureStore.setGalleryImage(galleryId, imageId);
    setStatus('sp-autosig-status', `${galleryId} 갤러리에 자짤을 지정했습니다.`);
    renderAutoSignatures();
  });

  renderAutoSignatures();


  // ---------------------------------------------------------------
  // [보관] 아카이브 · 박제 / [분석] 갤러리 지분율
  // ---------------------------------------------------------------
  const archiveToggles = {
    'sp-opt-archive-cache': 'enableArchiveCache',
    'sp-opt-archive-capture': 'enableArchiveCapture',
    'sp-opt-user-analytics': 'enableUserAnalytics',
    'sp-opt-comment-tree': 'enableCommentTree'
  };

  Object.entries(archiveToggles).forEach(([elementId, key]) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.checked = configManager.get(key) !== false;
    el.addEventListener('change', async () => {
      await configManager.set(key, el.checked);
      setStatus('sp-archive-status', '설정을 저장했습니다. 디시 탭을 새로고침하면 적용됩니다.');
    });
  });

  const archiveModeSelect = document.getElementById('sp-archive-mode');
  if (archiveModeSelect) {
    archiveModeSelect.value = configManager.get('archiveDefaultMode') || 'cache';
    archiveModeSelect.addEventListener('change', async () => {
      await configManager.set('archiveDefaultMode', archiveModeSelect.value);
      setStatus('sp-archive-status', '단축키 기본 동작을 저장했습니다.');
    });
  }

  async function renderArchiveStats() {
    const box = document.getElementById('sp-archive-stats');
    if (!box) return;

    const res = await messageRouter.send(MessageAction.ARCHIVE_DB_STATS);
    if (!res || !res.success) {
      box.textContent = '보관함 정보를 불러오지 못했습니다.';
      return;
    }

    const stats = res.data?.stats || { posts: 0, comments: 0, galleries: 0 };
    box.textContent = `보관 중: 글 ${stats.posts.toLocaleString('ko-KR')}건 · 댓글 ${stats.comments.toLocaleString('ko-KR')}건 · 갤러리 ${stats.galleries}곳`;
  }

  document.getElementById('sp-archive-refresh')?.addEventListener('click', renderArchiveStats);

  document.getElementById('sp-archive-clear-gallery')?.addEventListener('click', async (e) => {
    const galleryId = activeGalleryId();
    if (!galleryId) {
      setStatus('sp-archive-status', '갤러리를 먼저 선택하세요.', true);
      return;
    }
    const button = e.currentTarget;
    if (button.dataset.confirm !== 'true') {
      button.dataset.confirm = 'true';
      button.textContent = `${galleryId} 삭제 확인`;
      return;
    }
    button.dataset.confirm = '';
    button.textContent = '현재 갤 보관함 비우기';
    await messageRouter.send(MessageAction.ARCHIVE_CLEAR, { galleryId });
    setStatus('sp-archive-status', `${galleryId} 갤러리 보관함을 비웠습니다.`);
    renderArchiveStats();
  });

  document.getElementById('sp-archive-clear-all')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    if (button.dataset.confirm !== 'true') {
      button.dataset.confirm = 'true';
      button.textContent = '전체 삭제 확인';
      return;
    }
    button.dataset.confirm = '';
    button.textContent = '전체 비우기';
    await messageRouter.send(MessageAction.ARCHIVE_CLEAR, {});
    setStatus('sp-archive-status', '보관함을 모두 비웠습니다.');
    renderArchiveStats();
  });

  // --- 갤러리 지분율 분석 ---
  const analyticsSample = document.getElementById('sp-analytics-sample');
  if (analyticsSample) analyticsSample.value = String(configManager.get('analyticsSampleSize') || 200);

  async function runGalleryAnalytics() {
    const summary = document.getElementById('sp-analytics-summary');
    const list = document.getElementById('sp-analytics-list');
    const suspiciousBox = document.getElementById('sp-analytics-suspicious');
    if (!summary || !list) return;

    const galleryId = activeGalleryId();
    if (!galleryId) {
      summary.textContent = '디시 갤러리 탭을 열거나 검색 탭에서 갤러리 ID를 입력한 뒤 분석하세요.';
      list.innerHTML = '';
      return;
    }

    const sampleSize = parseInt(analyticsSample?.value, 10) || 200;
    await configManager.set('analyticsSampleSize', sampleSize);

    summary.textContent = '계산 중...';
    const res = await messageRouter.send(MessageAction.ARCHIVE_GALLERY_STATS, { galleryId, sampleSize });
    if (!res || !res.success) {
      summary.textContent = `분석에 실패했습니다: ${res?.error || '백그라운드 응답 없음'}`;
      return;
    }

    const stats = res.data?.stats || { sampled: 0, entries: [] };
    const suspicious = res.data?.suspicious || [];

    if (stats.sampled === 0) {
      summary.textContent = `${galleryId} 갤러리에서 수집된 글이 아직 없습니다. 목록을 한 번 둘러보면 자동으로 쌓입니다.`;
      list.innerHTML = '';
      suspiciousBox.innerHTML = '';
      return;
    }

    summary.textContent = `${galleryId} · 최근 ${stats.sampled}개 글 기준 · 작성자 ${stats.entries.length}명`;

    list.innerHTML = stats.entries.slice(0, 25).map(entry => {
      const percent = (entry.share * 100).toFixed(1);
      return `
        <div class="sp-share-row" data-key="${escapeHTML(entry.authorKey)}">
          <div class="sp-share-head">
            <span class="sp-share-name">${escapeHTML(entry.label)}</span>
            <span class="sp-share-value">${escapeHTML(percent)}% · ${entry.count}건</span>
          </div>
          <div class="sp-share-track"><div class="sp-share-fill" style="width:${Math.min(100, entry.share * 100)}%"></div></div>
          ${entry.nicknames.length > 1 ? `<div class="sp-share-meta">닉네임 ${entry.nicknames.length}개: ${escapeHTML(entry.nicknames.slice(0, 4).join(', '))}</div>` : ''}
          <div class="sp-share-actions">
            <button type="button" class="sp-btn-outline share-block" data-key="${escapeHTML(entry.authorKey)}" data-label="${escapeHTML(entry.label)}">차단</button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.share-block').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const [kind, value] = e.currentTarget.dataset.key.split(/:(.+)/);
        const type = kind === 'uid' ? 'uid' : kind === 'ip' ? 'ip' : 'nick';
        const res2 = await messageRouter.send(MessageAction.USER_RULE_ADD, {
          type,
          value,
          memo: `지분율 ${e.currentTarget.closest('.sp-share-row')?.querySelector('.sp-share-value')?.textContent || ''}`.trim(),
          action: 'blind',
          galleryId
        });
        setStatus('sp-archive-status', res2 && res2.success ? '차단 규칙을 등록했습니다.' : '차단 등록에 실패했습니다.', !(res2 && res2.success));
        renderUserRules();
      });
    });

    suspiciousBox.innerHTML = suspicious.length === 0 ? '' : `
      <div class="sp-alert-form-status" style="margin-top:8px;">
        <b>통피/다중 닉 의심 대역</b><br>
        ${suspicious.slice(0, 5).map(item => `${escapeHTML(item.band)}.x — 닉네임 ${item.nicknames.length}개 / 글 ${item.count}건`).join('<br>')}
      </div>`;
  }

  document.getElementById('sp-analytics-run')?.addEventListener('click', runGalleryAnalytics);

  renderArchiveStats();

});
