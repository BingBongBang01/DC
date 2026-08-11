import { themeSystem } from '../theme/theme-system.js';
import { configManager } from '../../core/config-manager.js';
import { messageRouter } from '../../core/message-router.js';
import { searchAggregationFeature } from '../../features/search-aggregation-feature.js';
import { escapeHTML } from '../../utils/sanitizer.js';
import { MessageAction } from '../../core/message-contract.js';

/**
 * Clamp a user-entered "수집 페이지 수" value to a sane integer range.
 * Mirrors the SearchQuery.maxPages clamp (1..100) so the input never
 * silently sends an out-of-range value to the collector.
 * @param {string|number} value
 * @returns {number}
 */
function clampPageCount(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 10;
  return Math.min(Math.max(n, 1), 100);
}

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
  const pagesPresets = document.getElementById('sp-search-pages-presets');
  const pageSizeSelect = document.getElementById('sp-results-per-page');
  const sortSelect = document.getElementById('sp-sort-order');
  
  // Restore saved search options
  if (pagesSelect) pagesSelect.value = clampPageCount(configManager.get('spSearchPages')) || 10;
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

  pagesSelect?.addEventListener('change', (e) => {
    const clamped = clampPageCount(e.target.value);
    e.target.value = clamped;
    configManager.set('spSearchPages', clamped);
  });

  pagesPresets?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pages]');
    if (!btn || !pagesSelect) return;
    pagesSelect.value = btn.dataset.pages;
    configManager.set('spSearchPages', clampPageCount(btn.dataset.pages));
  });
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
    const keyword = keywordInput.value.trim();
    const galleryId = galleryInput.value.trim() || 'programming';
    const subject = categorySelect ? categorySelect.value : '';
    const currentType = (appStore.selectedGallery && appStore.selectedGallery.galleryId === galleryId) 
                         ? appStore.selectedGallery.galleryType 
                         : 'board';
    const maxPages = clampPageCount(pagesSelect.value);
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
      alert(`검색 중 오류가 발생했습니다: ${err.message}`);
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

  async function renderKeywordAlerts() {
    const activeContainer = document.getElementById('sp-alerts-active');
    if (!activeContainer) return;

    try {
      const res = await messageRouter.send(MessageAction.KEYWORD_ALERT_LIST);
      const alerts = res.success ? res.data.alerts : [];

      if (alerts.length === 0) {
        activeContainer.innerHTML = '<div class="sp-results-meta">등록된 키워드 알림이 없습니다.</div>';
        return;
      }

      activeContainer.innerHTML = alerts.map(a => {
        const statusClass = a.enabled ? 'active-rule' : 'paused-rule';
        const failBadge = a.consecutiveFailures >= 3 ? `<span class="sp-badge">오류</span>` : '';
        const keywordsText = Array.isArray(a.keywords) ? a.keywords.join(', ') : '';
        const nameText = escapeHTML(a.gallery?.name || '알 수 없음');
        const lastRunText = a.lastCheckedAt ? new Date(a.lastCheckedAt).toLocaleString('ko-KR') : '확인 대기 중';

        return `
          <div class="sp-alert-item ${statusClass}" data-id="${a.id}">
            <div class="sp-alert-item-header">
              <div class="sp-alert-item-title">${nameText} ${failBadge}</div>
              <div style="font-size: 11px; font-weight: 600; color: var(--md-sys-color-primary);">${a.enabled ? '● 감시 중' : '○ 일시정지'}</div>
            </div>
            <div class="sp-alert-item-meta" style="margin-bottom: 2px;">키워드: <strong>${escapeHTML(keywordsText)}</strong></div>
            <div class="sp-alert-item-meta">최근 확인: ${lastRunText}</div>
            <div class="sp-alert-item-actions">
              <button type="button" class="sp-btn-outline toggle-alert-btn" data-id="${a.id}" data-enabled="${a.enabled}">${a.enabled ? '일시정지' : '시작'}</button>
              <button type="button" class="sp-btn-outline delete-alert-btn" data-id="${a.id}">삭제</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind events
      activeContainer.querySelectorAll('.toggle-alert-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const enabled = e.target.dataset.enabled === 'true';
          await messageRouter.send(MessageAction.KEYWORD_ALERT_TOGGLE, { id, enabled: !enabled });
          renderKeywordAlerts();
        });
      });

      activeContainer.querySelectorAll('.delete-alert-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (confirm('이 알림 규칙을 삭제하시겠습니까?')) {
            const id = e.target.dataset.id;
            await messageRouter.send(MessageAction.KEYWORD_ALERT_DELETE, { id });
            renderKeywordAlerts();
          }
        });
      });

    } catch (err) {
      activeContainer.innerHTML = `<div class="sp-results-meta">알림 규칙을 불러오지 못했습니다: ${err.message}</div>`;
    }
  }

  async function renderNotifications() {
    const recentContainer = document.getElementById('sp-alerts-recent');
    const badge = document.getElementById('sp-alerts-unread-badge');
    if (!recentContainer) return;

    try {
      const res = await messageRouter.send(MessageAction.KEYWORD_NOTIFICATION_LIST);
      const notis = res.success ? res.data.notifications : [];
      const unreadCount = notis.filter(n => !n.read).length;

      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      if (notis.length === 0) {
        recentContainer.innerHTML = '<div class="sp-results-meta">최근 알림이 없습니다.</div>';
        return;
      }

      const getRelativeTime = (ts) => {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return '방금 전';
        if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
        if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
        return `${Math.floor(diff/86400)}일 전`;
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
          <div class="sp-notification-item ${readClass}" data-id="${n.id}" data-url="${n.post?.url}">
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
          chrome.tabs.create({ url });
          renderNotifications(); // Refresh list to remove bold/unread state
        });
      });

      document.getElementById('sp-btn-clear-notis')?.addEventListener('click', async () => {
        if (confirm('모든 알림을 삭제하시겠습니까?')) {
          await messageRouter.send(MessageAction.KEYWORD_NOTIFICATION_CLEAR);
          renderNotifications();
        }
      });

    } catch (err) {
      recentContainer.innerHTML = `<div class="sp-results-meta">알림을 불러오지 못했습니다.</div>`;
    }
  }

  document.getElementById('sp-btn-add-alert')?.addEventListener('click', async () => {
    const target = appStore.selectedGallery || appStore.currentGallery;
    const currentGall = target?.galleryId || galleryInput?.value || 'programming';
    const currentType = target?.galleryType || 'board';
    const currentName = target?.galleryName || currentGall;
    const url = target?.canonicalUrl || `https://gall.dcinside.com/board/lists/?id=${currentGall}`;

    let keyword = prompt(`[${currentName}] 갤러리에서 감시할 키워드를 입력하세요:`);
    if (!keyword) return;
    keyword = keyword.trim();
    if (!keyword) return;

    try {
      await messageRouter.send(MessageAction.KEYWORD_ALERT_CREATE, {
        gallery: {
          id: currentGall,
          type: currentType,
          name: currentName,
          url: url
        },
        keywords: [keyword],
        target: 'title',
        matchMode: 'contains',
        enabled: true,
        pollingIntervalMinutes: 1, // Default 1 min for fast testing
        notifyPanel: true,
        notifyChrome: true
      });
      renderKeywordAlerts();
    } catch(err) {
      alert('알림 추가 실패: ' + err.message);
    }
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

  document.getElementById('sp-btn-donation')?.addEventListener('click', () => {
    const url = 'https://ko-fi.com/thk7410';
    if (typeof chrome !== 'undefined' && chrome.windows) {
      chrome.windows.create({
        url: url,
        type: 'popup',
        width: 500,
        height: 700,
        focused: true
      });
    } else {
      window.open(url, '_blank', 'width=500,height=700');
    }
  });

  renderQuickAccess();
});
