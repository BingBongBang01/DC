/**
 * AutoSignatureFeature for DC Ultimate
 * Attaches the user's saved signature image to the write-page editor on load.
 *
 * How it works (and why): DC's write page uploads images via a page-global
 * `window.imageUploader(file)` (defined in editor_common.js), which POSTs to
 * https://upimg.dcinside.com/upimg_file.php and, on success, inserts the
 * resulting `<img src="https://dcimg....viewimage.php?..." data-tempno="...">`
 * into the Summernote editor itself. That is the only path that produces the
 * compact, real DC-hosted markup — reimplementing the upload call from a
 * content script (previous approach) hit the wrong endpoint and, even against
 * the right endpoint, plain fetch()/XMLHttpRequest calls are rejected by the
 * page outright, while the exact same call made through the page's own code
 * succeeds every time. So instead of re-uploading ourselves, we hand the file
 * to the page's own uploader and let it do everything natively.
 *
 * Content scripts run in an isolated JS world and cannot call page-defined
 * functions like `window.imageUploader` directly, even though they share the
 * same DOM. To bridge this, we inject a small <script> tag (which executes in
 * the page's main world) and communicate with it via window.postMessage,
 * which structured-clones File objects across the isolated/main world
 * boundary. This is the standard, supported way to reach into page JS from a
 * content script.
 */
import { BaseFeature } from './base-feature.js';
import { logger } from '../core/logger.js';
import { storageManager } from '../core/storage-manager.js';
import { configManager } from '../core/config-manager.js';

const BRIDGE_SOURCE = 'dc-ultimate-auto-sig';

function base64ToFile(base64String, filename = 'dc_auto_sig.png') {
  try {
    const arr = base64String.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1] || arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (e) {
    logger.error('AutoSignatureFeature: Error converting base64 to file:', e);
    return null;
  }
}

function compressBase64Fallback(base64String) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined' || !base64String) {
      return resolve(base64String);
    }
    if (base64String.length < 35000) {
      return resolve(base64String);
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDim = 800;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64String);
    img.src = base64String;
  });
}

export class AutoSignatureFeature extends BaseFeature {
  constructor() {
    super('auto-signature-feature', '자짤 자동 첨부 엔진', '글 작성 시 설정된 이미지를 본문 상단에 자동 첨부합니다.');
    this._checkInterval = null;
    this._inserted = false;
    this._bridgeReady = false;
    this._bridgeReadyResolver = null;
    this._onBridgeMessage = this._onBridgeMessage.bind(this);
    this._pendingUploads = new Map(); // requestId -> { resolve, reject, timeoutId }
    this._quickPasteSetup = false;
  }

  async onEnable() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this._onBridgeMessage);
    }
    this._setupQuickPasteUI();
    await this.tryAttachSignature();
  }

  async onDisable() {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this._onBridgeMessage);
    }
    // 대기 중인 업로드 요청들을 정리 (메모리 누수 방지)
    for (const pending of this._pendingUploads.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Feature disabled during pending upload'));
    }
    this._pendingUploads.clear();

    const quickPasteEl = typeof document !== 'undefined' ? document.getElementById('dc-auto-sig-quick-paste') : null;
    if (quickPasteEl) {
      quickPasteEl.remove();
    }
    this._quickPasteSetup = false;
  }

  async onPageChange() {
    this._inserted = false;
    this._setupQuickPasteUI();
    await this.tryAttachSignature();
  }

  _onBridgeMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== BRIDGE_SOURCE) return;

    if (data.type === 'BRIDGE_READY') {
      this._bridgeReady = true;
      if (this._bridgeReadyResolver) {
        this._bridgeReadyResolver(true);
        this._bridgeReadyResolver = null;
      }
      return;
    }

    if (data.type === 'UPLOAD_RESULT') {
      const pending = this._pendingUploads.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      this._pendingUploads.delete(data.requestId);
      if (data.success) {
        pending.resolve();
      } else {
        pending.reject(new Error(data.error || '브릿지 업로드 실패'));
      }
    }
  }

  async _setupQuickPasteUI() {
    if (!this.isWritePage() || typeof document === 'undefined') return;
    
    let container = document.getElementById('dc-auto-sig-quick-paste');
    if (container) return; // Already setup

    const titleWrap = document.querySelector('.title_wrap') || document.querySelector('.write_subject_wrap');
    if (!titleWrap || !titleWrap.parentNode) return;

    container = document.createElement('div');
    container.id = 'dc-auto-sig-quick-paste';
    container.className = 'dc-auto-sig-container';
    container.tabIndex = 0; // Make it focusable to catch paste events

    // Fetch initial state
    const isEnabled = configManager.get('enableAutoSignature') ?? false;
    const sigData = await storageManager.get('autoSignatureImage');
    const hasSig = sigData && sigData.autoSignatureImage;

    container.innerHTML = `
      <div class="sig-ui-left">
        <img class="sig-preview-thumb" src="${hasSig ? sigData.autoSignatureImage : ''}" style="display: ${hasSig ? 'block' : 'none'};" alt="자짤">
        <div class="sig-icon-placeholder" style="display: ${hasSig ? 'none' : 'flex'};">🎨</div>
        <div class="sig-text-wrap">
          <div class="sig-title">자짤 빠른 설정 구역</div>
          <div class="sig-subtitle">이곳에 이미지를 드래그 앤 드롭하거나 붙여넣기(Ctrl+V) 하세요.</div>
        </div>
      </div>
      <div class="sig-controls" title="자짤 자동 첨부 기능을 켜거나 끕니다">
        <label class="sig-switch">
          <input type="checkbox" id="sig-toggle-checkbox" ${isEnabled ? 'checked' : ''}>
          <span class="sig-slider"></span>
        </label>
        <span class="sig-toggle-label" id="sig-toggle-label">${isEnabled ? '자동 첨부 ON' : '자동 첨부 OFF'}</span>
      </div>
    `;

    titleWrap.parentNode.insertBefore(container, titleWrap);
    this._quickPasteSetup = true;

    // Elements
    const subtitle = container.querySelector('.sig-subtitle');
    const thumb = container.querySelector('.sig-preview-thumb');
    const placeholder = container.querySelector('.sig-icon-placeholder');
    const checkbox = container.querySelector('#sig-toggle-checkbox');
    const toggleLabel = container.querySelector('#sig-toggle-label');

    // Toggle logic
    checkbox.addEventListener('change', async (e) => {
      const checked = e.target.checked;
      await configManager.set('enableAutoSignature', checked);
      toggleLabel.textContent = checked ? '자동 첨부 ON' : '자동 첨부 OFF';
      
      if (checked && !this._inserted) {
        this.tryAttachSignature();
      }
    });

    // Prevent toggle click from triggering paste focus unnecessarily
    container.querySelector('.sig-controls').addEventListener('click', (e) => e.stopPropagation());

    // File processing logic
    const handleImageFile = async (imageFile) => {
      subtitle.textContent = '⏳ 이미지를 처리 중입니다...';
      container.classList.remove('error', 'success');
      
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = evt.target.result;
        await storageManager.set({ autoSignatureImage: base64 });
        
        // Auto-enable if user sets an image
        if (!checkbox.checked) {
          checkbox.checked = true;
          await configManager.set('enableAutoSignature', true);
          toggleLabel.textContent = '자동 첨부 ON';
        }

        // Update thumbnail
        thumb.src = base64;
        thumb.style.display = 'block';
        placeholder.style.display = 'none';

        // Feedback
        subtitle.textContent = '✅ 자짤 등록이 완료되어 본문에 삽입되었습니다!';
        container.classList.add('success');
        
        // Insert
        this._inserted = false;
        this.tryAttachSignature();

        setTimeout(() => {
          container.classList.remove('success');
          subtitle.textContent = '다른 이미지로 변경하려면 끌어다 놓거나 붙여넣기 하세요.';
        }, 3000);
      };
      reader.readAsDataURL(imageFile);
    };

    const handleFail = (msg) => {
      subtitle.textContent = msg;
      container.classList.add('error');
      setTimeout(() => {
        container.classList.remove('error');
        subtitle.textContent = '이곳에 이미지를 드래그 앤 드롭하거나 붙여넣기(Ctrl+V) 하세요.';
      }, 2000);
    };

    // Paste Event
    container.addEventListener('paste', async (e) => {
      e.preventDefault();
      const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || window.clipboardData)?.items;
      if (!items) return;

      let imageFile = null;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          imageFile = item.getAsFile();
          break;
        }
      }
      
      if (imageFile) handleImageFile(imageFile);
      else handleFail('❌ 클립보드에 이미지가 없습니다.');
    });

    // Drag & Drop Events
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('dragover');
    });

    container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      container.classList.remove('dragover');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('dragover');
      
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
      if (imageFile) handleImageFile(imageFile);
      else handleFail('❌ 이미지 파일만 드롭할 수 있습니다.');
    });
  }

  /**
   * 페이지의 네이티브 window.imageUploader를 메인월드 브릿지를 통해 호출.
   * 성공 시 에디터에 압축된 DC 호스팅 이미지가 이미 삽입되어 있으므로
   * 별도의 _injectFallback 호출이 필요 없다.
   * @returns {Promise<boolean>} 성공 여부
   */
  async _uploadViaBridge(rawBase64) {
    if (typeof window === 'undefined') return false;

    // rawBase64 is already a Data URL (data:image/png;base64,...)
    // Bypass base64ToFile and FileReader to instantly pass the data URL.
    let fileDataUrl = rawBase64;
    let fileName = 'dc_auto_sig.png';
    let mimeType = 'image/png';
    
    if (fileDataUrl.startsWith('data:')) {
       const mimeMatch = fileDataUrl.match(/:(.*?);/);
       if (mimeMatch) mimeType = mimeMatch[1];
    } else {
       fileDataUrl = 'data:image/png;base64,' + fileDataUrl;
    }

    const requestId = `sig_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this._pendingUploads.delete(requestId);
        logger.warn('AutoSignatureFeature: Bridge upload timed out, will fall back.');
        resolve(false);
      }, 8000);

      this._pendingUploads.set(requestId, {
        resolve: () => { resolve(true); },
        reject: (err) => {
          logger.warn('AutoSignatureFeature: Bridge upload failed, will fall back:', err.message);
          resolve(false);
        },
        timeoutId
      });

      window.postMessage({
        source: BRIDGE_SOURCE,
        type: 'UPLOAD_REQUEST',
        requestId,
        fileDataUrl,
        fileName: file.name,
        mimeType: file.type
      }, '*');
    });
  }

  isWritePage() {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname || '';
    if (path.includes('/board/write')) return true;
    if (typeof document !== 'undefined') {
      return Boolean(
        document.querySelector('form[name="write"], #write_div, #memo, iframe[name="tx_canvas_wysiwyg"]')
      );
    }
    return false;
  }

  async _uploadToDCServer(rawBase64) {
    if (!rawBase64) return null;

    try {
      const rKeyElem = document.querySelector('#r_key, input[name="r_key"]');
      const idElem = document.querySelector('#gallery_id, input[name="id"]');
      const rKey = rKeyElem ? rKeyElem.value : '';
      const galleryId = idElem ? idElem.value : '';

      const file = base64ToFile(rawBase64, 'dc_auto_sig.png');
      if (!file) return null;

      const formData = new FormData();
      formData.append('r_key', rKey);
      formData.append('upload_ing', 'N');
      formData.append('files[]', file);

      // Append _GALLTYPE_ if present, though DCSelfImage doesn't strictly need it.
      const isMgall = window.location.href.includes('/mgallery/') || document.querySelector('input[name="_GALLTYPE_"][value="M"]');
      const isMinigall = window.location.href.includes('/mini/') || document.querySelector('input[name="_GALLTYPE_"][value="MI"]');
      if (isMgall) formData.append('_GALLTYPE_', 'M');
      else if (isMinigall) formData.append('_GALLTYPE_', 'MI');
      else formData.append('_GALLTYPE_', 'G');

      const url = `https://upimg.dcinside.com/upimg_file.php?id=${galleryId}&r_key=${rKey}`;

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        let resData = null;
        try { resData = JSON.parse(text); } catch(err) {}
        
        if (resData) {
          const fileInfo = Array.isArray(resData) ? resData[0] : (resData.files ? resData.files[0] : resData);
          if (fileInfo && (fileInfo.url || fileInfo.img_src || fileInfo.file_url)) {
            const imageUrl = fileInfo.url || fileInfo.img_src || fileInfo.file_url;
            const tempNo = fileInfo.temp_no || fileInfo.tempno || fileInfo.no || '';
            logger.info('AutoSignatureFeature: Direct fetch upload success', { imageUrl, tempNo });
            return { imageUrl, tempNo };
          }
        }
      }
    } catch (err) {
      logger.error('AutoSignatureFeature: Direct fetch upload error:', err);
    }
    
    return null;
  }

  /**
   * 브릿지 스크립트(메인 월드)가 준비될 때까지 짧게 대기한 뒤 업로드를 시도.
   * 브릿지가 끝내 준비되지 않거나(주입 실패, 오래된 DC 페이지 구조 등) 업로드
   * 자체가 실패하면 false를 반환해 호출자가 폴백 경로로 넘어가게 한다.
   */
  async _tryBridgeUpload(rawBase64) {
    if (typeof window === 'undefined') return false;

    if (!this._bridgeReady) {
      window.postMessage({ source: BRIDGE_SOURCE, type: 'PING' }, '*');
      const ready = await new Promise((resolve) => {
        if (this._bridgeReady) return resolve(true);
        this._bridgeReadyResolver = resolve;
        
        // Timeout after 2s
        setTimeout(() => {
          if (this._bridgeReadyResolver === resolve) {
            this._bridgeReadyResolver = null;
            resolve(false);
          }
        }, 2000);
      });
      if (!ready) {
        logger.debug('AutoSignatureFeature: Bridge script not ready within 2s, skipping.');
        return false;
      }
    }

    try {
      return await this._uploadViaBridge(rawBase64);
    } catch (err) {
      logger.warn('AutoSignatureFeature: Bridge upload threw, falling back:', err);
      return false;
    }
  }

  async tryAttachSignature() {
    if (!this.enabled || !this.isWritePage()) return;
    const isConfigEnabled = configManager.get('enableAutoSignature');
    if (!isConfigEnabled) return;

    try {
      const sigData = await storageManager.get('autoSignatureImage');
      const rawBase64 = sigData ? sigData.autoSignatureImage : null;

      if (!rawBase64) {
        logger.debug('AutoSignatureFeature: No signature image saved in storage.');
        return;
      }

      this._inserted = false;

      // 1순위: 페이지 네이티브 업로더(window.imageUploader)를 브릿지로 호출.
      // 성공하면 에디터에 압축된 DC 호스팅 <img>가 이미 삽입되어 있으므로
      // 여기서 종료 — base64/직접 fetch 경로는 시도할 필요가 없다.
      const bridgeSuccess = await this._tryBridgeUpload(rawBase64);
      if (bridgeSuccess) {
        this._inserted = true;
        logger.info('AutoSignatureFeature: Signature attached via native page uploader (compact URL).');
        return;
      }

      // 2순위: content script에서 직접 fetch로 업로드 시도 (페이지가 이를 거부할 수 있음)
      let uploadResult = await this._uploadToDCServer(rawBase64);

      let imageSrc = rawBase64;
      let tempNo = null;

      if (uploadResult && uploadResult.imageUrl) {
        imageSrc = uploadResult.imageUrl;
        tempNo = uploadResult.tempNo;
      } else {
        // 3순위(최후 폴백): base64를 압축해서 그대로 삽입. 이 경로만 글자수 초과 문제가 남는다.
        logger.warn('AutoSignatureFeature: Native uploader and direct upload both failed, falling back to base64 (may exceed post length limit).');
        imageSrc = await compressBase64Fallback(rawBase64);
      }

      let attempts = 0;
      const maxAttempts = 20;

      if (this._checkInterval) {
        clearInterval(this._checkInterval);
      }

      this._checkInterval = setInterval(() => {
        attempts++;
        if (this._inserted) {
          clearInterval(this._checkInterval);
          this._checkInterval = null;
          return;
        }

        const success = this._injectFallback(imageSrc, tempNo);

        if (success || attempts >= maxAttempts) {
          if (success) this._inserted = true;
          clearInterval(this._checkInterval);
          this._checkInterval = null;
        }
      }, 300);
    } catch (err) {
      logger.error('AutoSignatureFeature error retrieving image:', err);
    }
  }

  /**
   * Directly injects the image into the editor, formatting it to perfectly match DC's native HTML structure.
   */
  _injectFallback(imageSrc, tempNo) {
    if (typeof document === 'undefined') return false;

    const tempAttr = tempNo ? ` data-tempno="${tempNo}"` : '';

    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && (doc.body.contentEditable === 'true' || doc.querySelector('.write_div, body'))) {
          if (doc.querySelector('[data-dc-auto-sig="true"]')) return true;
          const pImg = doc.createElement('p');
          pImg.setAttribute('data-dc-auto-sig', 'true');
          pImg.innerHTML = `<img src="${imageSrc}"${tempAttr}>`;
          const pBr = doc.createElement('p');
          pBr.innerHTML = '<br>';
          
          if (doc.body.firstChild) {
            doc.body.insertBefore(pBr, doc.body.firstChild);
            doc.body.insertBefore(pImg, pBr);
          } else {
            doc.body.appendChild(pImg);
            doc.body.appendChild(pBr);
          }
          logger.info('AutoSignatureFeature: Injected signature HTML into iframe editor.');
          return true;
        }
      } catch (e) {
        // Cross-origin iframe or not loaded yet
      }
    }

    const contentEditable = document.querySelector('#write_div, .note-editable, div[contenteditable="true"]');
    if (contentEditable) {
      if (contentEditable.querySelector('[data-dc-auto-sig="true"]')) return true;
      const pImg = document.createElement('p');
      pImg.setAttribute('data-dc-auto-sig', 'true');
      pImg.innerHTML = `<img src="${imageSrc}"${tempAttr}>`;
      const pBr = document.createElement('p');
      pBr.innerHTML = '<br>';
      
      if (contentEditable.firstChild) {
        contentEditable.insertBefore(pBr, contentEditable.firstChild);
        contentEditable.insertBefore(pImg, pBr);
      } else {
        contentEditable.appendChild(pImg);
        contentEditable.appendChild(pBr);
      }
      logger.info('AutoSignatureFeature: Injected signature HTML into contenteditable container.');
      return true;
    }

    const textarea = document.querySelector('#memo, textarea[name="memo"], textarea.write_area');
    if (textarea) {
      if (textarea.value.includes('data-dc-auto-sig="true"')) return true;
      const sigHTML = `<p data-dc-auto-sig="true"><img src="${imageSrc}"${tempAttr}></p><p><br></p>\n`;
      textarea.value = sigHTML + textarea.value;
      logger.info('AutoSignatureFeature: Injected signature HTML into textarea.');
      return true;
    }

    return false;
  }
}

export const autoSignatureFeature = new AutoSignatureFeature();
