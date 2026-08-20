import { themeSystem } from '../theme/theme-system.js';
import { Logger, logger } from '../../core/logger.js';
import { configManager } from '../../core/config-manager.js';
import { storageManager, INITIAL_STORAGE_SCHEMA } from '../../core/storage-manager.js';
import { filterEngine, FilterRuleItem, FILTER_ACTIONS } from '../../core/filters/filter-engine.js';
import { userNotesFeature } from '../../features/user-notes-feature.js';
import { dataManager } from '../../core/data-manager.js';
import { createSwitch, createSnackbar } from '../components/ui-components.js';
import { escapeHTML } from '../../utils/sanitizer.js';
import { normalizeUserKey, isAmbiguousKey, parseUserKey } from '../../core/identity.js';
import { messageRouter } from '../../core/message-router.js';
import { signatureStore } from '../../core/signature/signature-store.js';
import { MessageAction } from '../../core/message-contract.js';

document.addEventListener('DOMContentLoaded', async () => {

function getMessageSafe(key, fallback, substitutions) {
    try {
        if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
            const message = chrome.i18n.getMessage(key, substitutions);
            if (message) return message;
        }
    } catch (error) {
        console.warn("[Options] i18n failed:", key, error);
    }
    return fallback || key;
}

function t(key, substitutions) {
    return getMessageSafe(key, "", substitutions);
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.dataset.i18n;
        const fallback = element.textContent?.trim() || "";
        const translated = getMessageSafe(key, fallback);
        if (translated) element.textContent = translated;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        const key = element.dataset.i18nPlaceholder;
        const fallback = element.getAttribute("placeholder") || "";
        const translated = getMessageSafe(key, fallback);
        if (translated) element.setAttribute("placeholder", translated);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
        const key = element.dataset.i18nTitle;
        const fallback = element.getAttribute("title") || "";
        const translated = getMessageSafe(key, fallback);
        if (translated) element.setAttribute("title", translated);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
        const key = element.dataset.i18nAriaLabel;
        const fallback = element.getAttribute("aria-label") || "";
        const translated = getMessageSafe(key, fallback);
        if (translated) element.setAttribute("aria-label", translated);
    });
}

  try {
      applyTranslations();
  } catch (error) {
      console.error("[Options] localization failed:", error);
  }


  await configManager.init();
  await filterEngine.init();
  
  const currentTheme = configManager.get('theme') || 'system';
  themeSystem.init(currentTheme);

  // Theme dropdown setup
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', async (e) => {
      const mode = e.target.value;
      themeSystem.applyTheme(mode);
      await configManager.set('theme', mode);
      createSnackbar(t('msg_theme_changed'));
    });
  }

  // Navigation tab switcher
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetTabId = btn.getAttribute('data-tab');
      document.getElementById(targetTabId)?.classList.add('active');
    });
  });

  // Switches setup
  const previewSwContainer = document.getElementById('switch-opt-preview');
  if (previewSwContainer) {
    previewSwContainer.appendChild(createSwitch('enableHoverPreview', configManager.get('enableHoverPreview'), async (checked) => {
      await configManager.set('enableHoverPreview', checked);
    }));
  }

  const readingSwContainer = document.getElementById('switch-opt-reading');
  if (readingSwContainer) {
    readingSwContainer.appendChild(createSwitch('enableReadingLayout', configManager.get('enableReadingLayout'), async (checked) => {
      await configManager.set('enableReadingLayout', checked);
    }));
  }

  const adWingsSwContainer = document.getElementById('switch-opt-ad-wings');
  if (adWingsSwContainer) {
    adWingsSwContainer.appendChild(createSwitch('hideAdWings', configManager.get('hideAdWings') ?? false, async (checked) => {
      await configManager.set('hideAdWings', checked);
    }));
  }

  const autoSwContainer = document.getElementById('switch-opt-automation');
  if (autoSwContainer) {
    autoSwContainer.appendChild(createSwitch('enableAutomation', configManager.get('enableAutomation') ?? true, async (checked) => {
      await configManager.set('enableAutomation', checked);
      createSnackbar(checked ? t('msg_auto_on') : t('msg_auto_off'));
    }));
  }

  const sidepanelSwContainer = document.getElementById('switch-opt-sidepanel');
  if (sidepanelSwContainer) {
    sidepanelSwContainer.appendChild(createSwitch('openSidePanelOnActionClick', configManager.get('openSidePanelOnActionClick') ?? false, async (checked) => {
      await configManager.set('openSidePanelOnActionClick', checked);
      createSnackbar(checked ? t('msg_sidepanel_on') : t('msg_sidepanel_off'));
    }));
  }

  const dcDarkSwContainer = document.getElementById('switch-opt-dcdark');
  if (dcDarkSwContainer) {
    dcDarkSwContainer.appendChild(createSwitch('syncDcDarkMode', configManager.get('syncDcDarkMode') !== false, async (checked) => {
      await configManager.set('syncDcDarkMode', checked);
      createSnackbar(checked ? 'DC 야간모드 연동을 켰습니다.' : 'DC 야간모드 연동을 껐습니다.');
    }));
  }

  const autoSigSwContainer = document.getElementById('switch-opt-autosig');
  if (autoSigSwContainer) {
    autoSigSwContainer.appendChild(createSwitch('enableAutoSignature', configManager.get('enableAutoSignature') ?? false, async (checked) => {
      await configManager.set('enableAutoSignature', checked);
      createSnackbar(checked ? t('msg_autosig_on') : t('msg_autosig_off'));
    }));
  }

  // Auto Signature Image Upload & Preview Logic
  const sigFileInput = document.getElementById('sig-file-input');
  const sigPreviewImg = document.getElementById('sig-preview-img');
  const sigEmptyText = document.getElementById('sig-empty-text');
  const btnSaveSig = document.getElementById('btn-save-sig');
  const btnDeleteSig = document.getElementById('btn-delete-sig');

  let pendingSigBase64 = null;

  const loadSavedSigImage = async () => {
    try {
      // 자짤은 이제 여러 장을 관리한다(사이드패널 [작성] 탭). 여기서는 대표 1장만 보여준다.
      const images = await signatureStore.list();
      const selectedId = configManager.get('autoSigSelectedId');
      const preview = images.find(image => image.id === selectedId) || images[0] || null;
      const base64 = preview ? preview.dataUrl : null;
      if (sigEmptyText && images.length > 1) {
        sigEmptyText.textContent = `자짤 ${images.length}장이 등록되어 있습니다. 목록과 적용 방식은 사이드패널 [작성] 탭에서 관리하세요.`;
      }
      if (base64) {
        if (sigPreviewImg) {
          sigPreviewImg.src = base64;
          sigPreviewImg.style.display = 'block';
        }
        if (sigEmptyText) sigEmptyText.style.display = 'none';
        pendingSigBase64 = base64;
      } else {
        if (sigPreviewImg) {
          sigPreviewImg.src = '';
          sigPreviewImg.style.display = 'none';
        }
        if (sigEmptyText) sigEmptyText.style.display = 'block';
        pendingSigBase64 = null;
      }
    } catch (err) {
      console.error('Error loading signature image:', err);
    }
  };

  await loadSavedSigImage();

  if (sigFileInput) {
    sigFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        pendingSigBase64 = evt.target.result;
        if (sigPreviewImg) {
          sigPreviewImg.src = pendingSigBase64;
          sigPreviewImg.style.display = 'block';
        }
        if (sigEmptyText) sigEmptyText.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnSaveSig) {
    btnSaveSig.addEventListener('click', async () => {
      if (!pendingSigBase64) {
        createSnackbar(t('msg_sig_req'));
        return;
      }
      try {
        await signatureStore.add({ dataUrl: pendingSigBase64 });
      } catch (err) {
        createSnackbar(err.message);
        return;
      }
      await configManager.set('enableAutoSignature', true);
      createSnackbar(t('msg_sig_saved'));
      await loadSavedSigImage();
    });
  }

  if (btnDeleteSig) {
    btnDeleteSig.addEventListener('click', async () => {
      await signatureStore.clear();
      pendingSigBase64 = null;
      if (sigFileInput) sigFileInput.value = '';
      if (sigPreviewImg) {
        sigPreviewImg.src = '';
        sigPreviewImg.style.display = 'none';
      }
      if (sigEmptyText) sigEmptyText.style.display = 'block';
      createSnackbar(t('msg_sig_del'));
    });
  }

  // Render Filter Rules safely with escapeHTML
  const renderFilterRules = () => {
    const container = document.getElementById('filter-rules-list');
    if (!container) return;
    container.innerHTML = '';

    filterEngine.rules.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = 'rule-card';
      const safeName = escapeHTML(rule.name);
      const safePattern = escapeHTML(rule.titlePattern || rule.ipPattern || rule.regexPattern || '');
      card.innerHTML = `
        <div>
          <b>${safeName}</b> (${safePattern})
        </div>
        <div>
          <span class="md3-chip md3-chip-primary">${escapeHTML(rule.action)}</span>
          <button class="md3-button md3-button--danger btn-del-rule" style="height: 32px; padding: 0 12px; margin-left: 8px;" data-idx="${idx}">${t('common_delete')}</button>
        </div>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll('.btn-del-rule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.getAttribute('data-idx'), 10);
        filterEngine.rules.splice(index, 1);
        await filterEngine.saveRules();
        renderFilterRules();
        createSnackbar(t('msg_filter_del'));
      });
    });
  };

  renderFilterRules();

  // Add Filter Rule
  document.getElementById('btn-add-filter')?.addEventListener('click', async () => {
    const name = document.getElementById('flt-name').value.trim();
    const pattern = document.getElementById('flt-pattern').value.trim();
    const action = document.getElementById('flt-action').value;

    if (!name || !pattern) {
      alert(t('msg_filter_req'));
      return;
    }

    const newRule = new FilterRuleItem({
      name,
      titlePattern: pattern,
      action
    });

    filterEngine.rules.push(newRule);
    await filterEngine.saveRules();
    renderFilterRules();

    document.getElementById('flt-name').value = '';
    document.getElementById('flt-pattern').value = '';
    createSnackbar(t('msg_filter_add'));
  });

  // Render User Notes safely with escapeHTML
  const renderUserNotes = async () => {
    const container = document.getElementById('usernotes-list');
    if (!container) return;
    container.innerHTML = '';

    const notesMap = await userNotesFeature.getAllNotes();
    const entries = Object.entries(notesMap);

    if (entries.length === 0) {
      container.innerHTML = `<div style="font-size:12px; color:#64748b;">${t('user_empty')}</div>`;
      return;
    }

    entries.forEach(([key, noteObj]) => {
      const card = document.createElement('div');
      card.className = 'rule-card';
      const safeKey = escapeHTML(key);
      const safeNote = escapeHTML(noteObj.note);
      // `uid:guest1433` 만 보이면 누구인지 알 수 없으므로 닉네임·신분을 함께 보여준다.
      const safeLabel = escapeHTML(userNotesFeature.describeKey(key, noteObj));
      // 메모가 유저 규칙과 같은 저장소를 쓰므로, 페이지에서 실제로 어떻게 처리되는지 밝힌다.
      const safeAction = escapeHTML(userNotesFeature.describeAction(noteObj));
      card.innerHTML = `
        <div>
          <b>${safeLabel}</b>: ${safeNote}
          <span style="font-size:11px; color:#64748b;">— ${safeAction}</span>
          ${noteObj.isBlocked ? t('user_blocked') : ''}
        </div>
        <button class="md3-button md3-button--danger btn-del-note" style="height: 32px; padding: 0 12px;" data-key="${safeKey}">${t('common_delete')}</button>
      `;
      container.appendChild(card);
    });

    document.querySelectorAll('.btn-del-note').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const key = e.target.getAttribute('data-key');
        await userNotesFeature.deleteNote(key);
        renderUserNotes();
        createSnackbar(t('msg_un_del'));
      });
    });
  };

  // 예전 `userNotes` 저장소에 남은 메모가 있으면 목록을 그리기 전에 유저 규칙으로 흡수한다.
  try {
    await userNotesFeature.migrateFromLegacyNotes();
  } catch (err) {
    logger.debug('options: legacy note merge skipped:', err);
  }
  await renderUserNotes();

  // Save User Note Button
  document.getElementById('btn-save-usernote')?.addEventListener('click', async () => {
    const raw = document.getElementById('un-key').value.trim();
    const note = document.getElementById('un-note').value.trim();
    if (!raw || !note) {
      alert(t('msg_un_req'));
      return;
    }

    // 입력을 `uid:`/`ip:`/`nick:` 키로 정규화한다. 접두가 없으면 IP 모양은 ip, 나머지는 nick.
    const key = normalizeUserKey(raw);
    if (!key) {
      // `uid:` 처럼 접두만 넣은 경우 — 저장하지 않고 되돌린다.
      alert(t('msg_un_req'));
      return;
    }
    if (isAmbiguousKey(key)) {
      const { type, value } = parseUserKey(key);
      const reason = type === 'ip'
        ? `IP ${value}는 2옥텟까지만 공개되어 같은 대역의 다른 사람에게도 이 메모가 붙습니다.`
        : `닉네임 "${value}"은 여러 사람이 함께 쓸 수 있어 이 메모가 특정 개인을 가리키지 않습니다.`;
      if (!confirm(`${reason}\n\n개인 단위로 메모하려면 계정 아이디를 "uid:아이디" 형식으로 입력하세요.\n그대로 저장할까요?`)) {
        return;
      }
    }

    await userNotesFeature.setNote(key, note);
    await renderUserNotes();

    document.getElementById('un-key').value = '';
    document.getElementById('un-note').value = '';
    createSnackbar(t('msg_un_saved'));
  });

  // Export JSON Button
  document.getElementById('btn-export-json')?.addEventListener('click', async () => {
    const json = await dataManager.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dc_ultimate_backup_${Date.now()}.json`;
    a.click();
    createSnackbar(t('msg_export_json'));
  });

  // Export CSV Button
  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    const csv = await dataManager.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dc_ultimate_bookmarks_${Date.now()}.csv`;
    a.click();
    createSnackbar(t('msg_export_csv'));
  });

  // Export HTML Button
  document.getElementById('btn-export-html')?.addEventListener('click', async () => {
    const html = await dataManager.exportHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dc_ultimate_bookmarks_${Date.now()}.html`;
    a.click();
    createSnackbar(t('msg_export_html'));
  });

  // Import JSON File
  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const jsonContent = evt.target.result;
      const result = await dataManager.importJSON(jsonContent);
      if (result.success) {
        createSnackbar(t('msg_restore_success', [String(result.importedKeysCount)]));
        await renderStorage();
      } else {
        alert(t('msg_restore_fail', [result.error]));
      }
    };
    reader.readAsText(file);
  });

  // Render Storage Inspector
  const renderStorage = async () => {
    const data = await storageManager.getAll();
    const inspector = document.getElementById('storage-inspector');
    if (inspector) {
      inspector.textContent = JSON.stringify(data, null, 2);
    }
  };

  await renderStorage();

  // Reset Storage Button
  document.getElementById('btn-reset-storage')?.addEventListener('click', async () => {
    if (confirm(t('msg_reset_confirm'))) {
      await storageManager.setAll(INITIAL_STORAGE_SCHEMA);
      await configManager.reset();
      await renderStorage();
      createSnackbar(t('msg_reset_success'));
    }
  });

  // Diagnostics
  document.getElementById('opt-export-logs')?.addEventListener('click', async () => {
    const logs = await Logger.exportLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dc-ultimate-diagnostic-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('opt-clear-logs')?.addEventListener('click', async () => {
    await Logger.clearLogs();
    alert(t('msg_logs_cleared'));
  });

  // ---------------------------------------------------------------
  // DC Auto Login
  // ---------------------------------------------------------------
  const loginUserIdInput = document.getElementById('login-user-id');
  const loginPasswordInput = document.getElementById('login-password');
  const loginStatusText = document.getElementById('login-status-text');
  const autoLoginSwContainer = document.getElementById('switch-opt-autologin');
  const skipPwSwContainer = document.getElementById('switch-opt-skippw');

  const BLOCK_REASON_TEXT = {
    consecutive_failures: '연속 로그인 실패로 자동 로그인이 중단되었습니다. 계정을 확인한 뒤 다시 저장해 주세요.',
    captcha_required: '보안문자(캡차)가 표시되어 자동 로그인이 중단되었습니다. 직접 로그인한 뒤 다시 켜 주세요.',
    manual: '자동 로그인이 수동으로 중단되었습니다.'
  };

  async function requestAutoLoginStatus(updates) {
    const res = await messageRouter.send(MessageAction.AUTO_LOGIN_STATUS, updates ? { updates } : {});
    if (!res || !res.success) {
      throw new Error(res?.error || '백그라운드 응답 없음');
    }
    return res.data.status;
  }

  function renderAutoLoginStatus(status) {
    if (!loginStatusText) return;

    if (!status.hasCredentials) {
      loginStatusText.textContent = '저장된 계정이 없습니다. 아이디와 비밀번호를 입력한 뒤 [저장]을 누르세요.';
      return;
    }

    const parts = [`계정 저장됨 (${status.userId})`];
    parts.push(status.enabled ? '자동 로그인 켜짐' : '자동 로그인 꺼짐');
    if (status.lastSuccessAt) {
      parts.push(`최근 로그인: ${new Date(status.lastSuccessAt).toLocaleString('ko-KR')}`);
    }
    if (status.blockedReason) {
      parts.push(BLOCK_REASON_TEXT[status.blockedReason] || status.blockedReason);
    } else if (status.failures > 0) {
      parts.push(`연속 실패 ${status.failures}회`);
    }
    if (status.lastError) {
      parts.push(status.lastError);
    }

    loginStatusText.textContent = parts.join(' · ');
  }

  if (loginStatusText) {
    try {
      const status = await requestAutoLoginStatus();

      if (loginUserIdInput) loginUserIdInput.value = status.userId || '';
      renderAutoLoginStatus(status);

      if (autoLoginSwContainer) {
        autoLoginSwContainer.appendChild(createSwitch('autoLoginEnabled', status.enabled, async (checked) => {
          if (checked) {
            const current = await requestAutoLoginStatus();
            if (!current.hasCredentials) {
              createSnackbar('아이디와 비밀번호를 먼저 저장해 주세요.');
              renderAutoLoginStatus(current);
              return;
            }
          }
          // Turning it back on also clears a previous block.
          const next = await requestAutoLoginStatus({ enabled: checked, blockedReason: null, failures: 0, lastError: null });
          renderAutoLoginStatus(next);
          createSnackbar(checked ? '자동 로그인을 켰습니다.' : '자동 로그인을 껐습니다.');
        }));
      }

      if (skipPwSwContainer) {
        skipPwSwContainer.appendChild(createSwitch('skipPasswordChange', status.skipPasswordChange, async (checked) => {
          const next = await requestAutoLoginStatus({ skipPasswordChange: checked });
          renderAutoLoginStatus(next);
        }));
      }
    } catch (err) {
      loginStatusText.textContent = `자동 로그인 상태를 불러오지 못했습니다: ${err.message}`;
    }
  }

  document.getElementById('btn-save-login')?.addEventListener('click', async () => {
    const userId = loginUserIdInput?.value.trim() || '';
    const password = loginPasswordInput?.value || '';

    if (!userId || !password) {
      createSnackbar('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    try {
      const status = await requestAutoLoginStatus({
        userId,
        password,
        failures: 0,
        blockedReason: null,
        lastError: null
      });
      if (loginPasswordInput) loginPasswordInput.value = '';
      renderAutoLoginStatus(status);
      createSnackbar('계정을 저장했습니다.');
    } catch (err) {
      createSnackbar(`저장 실패: ${err.message}`);
    }
  });

  document.getElementById('btn-clear-login')?.addEventListener('click', async () => {
    try {
      const status = await requestAutoLoginStatus({
        userId: '',
        password: '',
        enabled: false,
        failures: 0,
        blockedReason: null,
        lastError: null
      });
      if (loginUserIdInput) loginUserIdInput.value = '';
      if (loginPasswordInput) loginPasswordInput.value = '';
      renderAutoLoginStatus(status);
      createSnackbar('저장된 계정을 삭제했습니다.');
    } catch (err) {
      createSnackbar(`삭제 실패: ${err.message}`);
    }
  });

});
