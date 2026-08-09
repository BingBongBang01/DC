import { themeSystem } from '../theme/theme-system.js';
import { Logger } from '../../core/logger.js';
import { configManager } from '../../core/config-manager.js';
import { storageManager, INITIAL_STORAGE_SCHEMA } from '../../core/storage-manager.js';
import { filterEngine, FilterRuleItem, FILTER_ACTIONS } from '../../core/filters/filter-engine.js';
import { userNotesFeature } from '../../features/user-notes-feature.js';
import { dataManager } from '../../core/data-manager.js';
import { createSwitch, createSnackbar } from '../components/ui-components.js';
import { escapeHTML } from '../../utils/sanitizer.js';

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
      const stored = await storageManager.get('autoSignatureImage');
      const base64 = stored ? stored.autoSignatureImage : null;
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
      await storageManager.set({ autoSignatureImage: pendingSigBase64 });
      await configManager.set('enableAutoSignature', true);
      createSnackbar(t('msg_sig_saved'));
    });
  }

  if (btnDeleteSig) {
    btnDeleteSig.addEventListener('click', async () => {
      await storageManager.set({ autoSignatureImage: null });
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
      card.innerHTML = `
        <div>
          <b>${safeKey}</b>: ${safeNote} ${noteObj.isBlocked ? t('user_blocked') : ''}
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

  await renderUserNotes();

  // Save User Note Button
  document.getElementById('btn-save-usernote')?.addEventListener('click', async () => {
    const key = document.getElementById('un-key').value.trim();
    const note = document.getElementById('un-note').value.trim();
    if (!key || !note) {
      alert(t('msg_un_req'));
      return;
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
});
