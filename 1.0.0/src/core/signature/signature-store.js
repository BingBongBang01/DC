/**
 * 자짤(자동 첨부 이미지) 저장소
 *
 * Holds several signature images and decides which one a post gets:
 *   - random  : 등록된 자짤 중 무작위
 *   - single  : 지정한 자짤 1개만
 *   - gallery : 갤러리별로 지정한 자짤 (미지정 갤러리는 기본 자짤 → 없으면 무작위)
 *
 * Images are stored as data URLs in `chrome.storage.local`, so they are
 * compressed on the way in and the collection is capped.
 */
import { storageManager } from '../storage-manager.js';
import { configManager } from '../config-manager.js';
import { logger } from '../logger.js';

export const SIGNATURE_KEY = 'dc_auto_sig_images';
export const LEGACY_KEY = 'autoSignatureImage';

export const SIGNATURE_MODES = {
  RANDOM: 'random',
  SINGLE: 'single',
  GALLERY: 'gallery'
};

/** 저장 용량 보호: 개수와 한 장의 크기를 제한한다. */
export const MAX_IMAGES = 20;
export const MAX_DATA_URL_BYTES = 1.5 * 1024 * 1024;

/**
 * Chooses the signature for one post. Pure so it can be unit tested.
 * @param {Array<{id: string}>} images
 * @param {Object} options
 * @param {string} options.mode SIGNATURE_MODES value
 * @param {string|null} [options.selectedId] single 모드에서 쓸 자짤
 * @param {Record<string, string>} [options.galleryMap] galleryId -> imageId
 * @param {string} [options.galleryId] 현재 갤러리
 * @param {() => number} [options.random] 0..1 (테스트 주입용)
 * @returns {Object|null}
 */
export function pickSignatureImage(images, options = {}) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  if (list.length === 0) return null;

  const {
    mode = SIGNATURE_MODES.RANDOM,
    selectedId = null,
    galleryMap = {},
    galleryId = '',
    random = Math.random
  } = options;

  const byId = (id) => list.find(image => image.id === id) || null;
  const pickRandom = () => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

  if (mode === SIGNATURE_MODES.SINGLE) {
    return byId(selectedId) || list[0];
  }

  if (mode === SIGNATURE_MODES.GALLERY) {
    const mapped = galleryId ? byId(galleryMap[galleryId]) : null;
    if (mapped) return mapped;
    // 매핑이 없는 갤러리는 기본 자짤 → 그것도 없으면 무작위
    return byId(selectedId) || pickRandom();
  }

  return pickRandom();
}

/**
 * Shrinks a data URL so several images fit in extension storage.
 * Browser-only (needs Image/canvas); returns the input unchanged elsewhere.
 * @param {string} dataUrl
 * @param {number} [maxDimension=900]
 * @returns {Promise<string>}
 */
export function compressDataUrl(dataUrl, maxDimension = 900) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined' || !dataUrl) {
      return resolve(dataUrl);
    }

    const image = new Image();
    image.onload = () => {
      let { width, height } = image;
      const isSmallEnough = width <= maxDimension && height <= maxDimension && dataUrl.length < 200000;
      // GIF는 리사이즈하면 애니메이션이 죽으므로 원본을 유지한다.
      if (isSmallEnough || /^data:image\/gif/i.test(dataUrl)) return resolve(dataUrl);

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        const png = canvas.toDataURL('image/png');
        const jpeg = canvas.toDataURL('image/jpeg', 0.85);
        resolve(jpeg.length < png.length ? jpeg : png);
      } catch (err) {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export class SignatureStore {
  /**
   * @returns {Promise<Array<{id: string, name: string, dataUrl: string, addedAt: number}>>}
   */
  async list() {
    const data = await storageManager.get(SIGNATURE_KEY);
    const images = Array.isArray(data[SIGNATURE_KEY]) ? data[SIGNATURE_KEY] : [];
    if (images.length > 0) return images;

    // 단일 자짤을 쓰던 기존 사용자 데이터를 그대로 이어받는다.
    const migrated = await this.migrateLegacy();
    return migrated;
  }

  async save(images) {
    await storageManager.set({ [SIGNATURE_KEY]: images.slice(0, MAX_IMAGES) });
  }

  /**
   * Imports the old single-image setting into the collection (once).
   * @returns {Promise<Array<Object>>}
   */
  async migrateLegacy() {
    const legacy = await storageManager.get(LEGACY_KEY);
    const dataUrl = legacy && legacy[LEGACY_KEY];
    if (!dataUrl || typeof dataUrl !== 'string') return [];

    const image = {
      id: crypto.randomUUID(),
      name: '기존 자짤',
      dataUrl,
      addedAt: Date.now()
    };
    await this.save([image]);
    await storageManager.set({ [LEGACY_KEY]: null });
    logger.info('SignatureStore: migrated the legacy single signature into the collection.');
    return [image];
  }

  /**
   * @param {{dataUrl: string, name?: string}} input
   * @returns {Promise<Object>} 저장된 이미지
   */
  async add({ dataUrl, name }) {
    if (!dataUrl || !/^data:image\//i.test(dataUrl)) {
      throw new Error('이미지 파일만 등록할 수 있습니다.');
    }

    const compressed = await compressDataUrl(dataUrl);
    if (compressed.length > MAX_DATA_URL_BYTES) {
      throw new Error('이미지 용량이 너무 큽니다. 더 작은 이미지를 사용해 주세요.');
    }

    const images = await this.list();
    if (images.length >= MAX_IMAGES) {
      throw new Error(`자짤은 최대 ${MAX_IMAGES}개까지 등록할 수 있습니다.`);
    }

    if (images.some(image => image.dataUrl === compressed)) {
      throw new Error('이미 등록된 이미지입니다.');
    }

    const image = {
      id: crypto.randomUUID(),
      name: (name || `자짤 ${images.length + 1}`).slice(0, 40),
      dataUrl: compressed,
      addedAt: Date.now()
    };

    images.push(image);
    await this.save(images);

    // 첫 자짤은 곧바로 기본값으로 잡아 준다.
    if (images.length === 1 && !configManager.get('autoSigSelectedId')) {
      await configManager.set('autoSigSelectedId', image.id);
    }
    return image;
  }

  async rename(id, name) {
    const images = await this.list();
    const image = images.find(item => item.id === id);
    if (!image) throw new Error('자짤을 찾을 수 없습니다.');
    image.name = String(name || '').slice(0, 40) || image.name;
    await this.save(images);
    return image;
  }

  /**
   * Removes an image and any setting that pointed at it.
   * @param {string} id
   */
  async remove(id) {
    const images = await this.list();
    await this.save(images.filter(image => image.id !== id));

    const updates = {};
    if (configManager.get('autoSigSelectedId') === id) updates.autoSigSelectedId = null;

    const map = { ...(configManager.get('autoSigGalleryMap') || {}) };
    let mapChanged = false;
    for (const [galleryId, imageId] of Object.entries(map)) {
      if (imageId === id) {
        delete map[galleryId];
        mapChanged = true;
      }
    }
    if (mapChanged) updates.autoSigGalleryMap = map;

    if (Object.keys(updates).length > 0) await configManager.set(updates);
  }

  async clear() {
    await this.save([]);
    await configManager.set({ autoSigSelectedId: null, autoSigGalleryMap: {} });
  }

  /**
   * Maps a gallery to one signature (pass null to unmap).
   * @param {string} galleryId
   * @param {string|null} imageId
   */
  async setGalleryImage(galleryId, imageId) {
    if (!galleryId) throw new Error('갤러리를 먼저 선택해 주세요.');
    const map = { ...(configManager.get('autoSigGalleryMap') || {}) };

    if (imageId) map[galleryId] = imageId;
    else delete map[galleryId];

    await configManager.set('autoSigGalleryMap', map);
    return map;
  }

  /**
   * Resolves the signature to attach for the given gallery, honouring the
   * current mode.
   * @param {string} [galleryId]
   * @returns {Promise<Object|null>}
   */
  async pickFor(galleryId = '') {
    const images = await this.list();
    return pickSignatureImage(images, {
      mode: configManager.get('autoSigMode') || SIGNATURE_MODES.RANDOM,
      selectedId: configManager.get('autoSigSelectedId') || null,
      galleryMap: configManager.get('autoSigGalleryMap') || {},
      galleryId
    });
  }
}

export const signatureStore = new SignatureStore();
