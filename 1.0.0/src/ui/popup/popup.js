import { themeSystem } from '../theme/theme-system.js';
import { createSwitch } from '../components/ui-components.js';
import { messageRouter } from '../../core/message-router.js';
import { configManager } from '../../core/config-manager.js';

document.addEventListener('DOMContentLoaded', async () => {
  await configManager.init();
  themeSystem.init(configManager.get('theme'));

  // Initialize Switch UI
  const testSwitchWrapper = document.getElementById('switch-test-feature');
  const cleanUiSwitchWrapper = document.getElementById('switch-clean-ui');
  const previewSwitchWrapper = document.getElementById('switch-preview');

  if (testSwitchWrapper) {
    testSwitchWrapper.appendChild(createSwitch('testFeature', configManager.get('testFeature') ?? true, async (checked) => {
      await configManager.set('testFeature', checked);
    }));
  }

  if (cleanUiSwitchWrapper) {
    cleanUiSwitchWrapper.appendChild(createSwitch('enableCleanUI', configManager.get('enableCleanUI'), async (checked) => {
      await configManager.set('enableCleanUI', checked);
    }));
  }

  if (previewSwitchWrapper) {
    previewSwitchWrapper.appendChild(createSwitch('enableHoverPreview', configManager.get('enableHoverPreview'), async (checked) => {
      await configManager.set('enableHoverPreview', checked);
    }));
  }

  const autoSigSwitchWrapper = document.getElementById('switch-auto-sig');
  if (autoSigSwitchWrapper) {
    autoSigSwitchWrapper.appendChild(createSwitch('enableAutoSignature', configManager.get('enableAutoSignature') ?? false, async (checked) => {
      await configManager.set('enableAutoSignature', checked);
    }));
  }

  const sidepanelSwWrapper = document.getElementById('switch-opt-sidepanel');
  if (sidepanelSwWrapper) {
    sidepanelSwWrapper.appendChild(createSwitch('openSidePanelOnActionClick', configManager.get('openSidePanelOnActionClick') ?? false, async (checked) => {
      await configManager.set('openSidePanelOnActionClick', checked);
    }));
  }

  // Options page button
  document.getElementById('btn-options')?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  // Open sidepanel button
  document.getElementById('btn-open-sidepanel')?.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    }
  });

  // Detect Active DCInside Tab Info
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      const response = await messageRouter.send('GET_PAGE_INFO', {}, tab.id);
      if (response && response.success && response.data) {
        const info = response.data.pageInfo || response.data;
        document.getElementById('page-badge').textContent = info.type || '알 수 없음';
        document.getElementById('info-gallery').textContent = info.galleryId || '비갤러리';
        document.getElementById('info-type').textContent = info.galleryType || '-';
      } else {
        document.getElementById('page-badge').textContent = '일반 웹페이지';
        document.getElementById('info-gallery').textContent = '-';
        document.getElementById('info-type').textContent = '-';
      }
    }
  }
});
