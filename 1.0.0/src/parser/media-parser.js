/**
 * MediaParser Module for DC Ultimate
 * Extracts and normalizes images, videos, GIFs, and dccons from article body
 */
import { Media } from '../utils/models.js';

export class MediaParser {
  /**
   * Extract all media items from an article body container
   * @param {Element|Document} container Body element node
   * @returns {Media[]} Array of Media objects
   */
  parseMedia(container) {
    if (!container) return [];

    const mediaList = [];

    try {
      // 1. Images & GIFs
      const images = container.querySelectorAll('img');
      images.forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-original') || '';
        if (!src) return;

        let type = 'image';
        if (src.includes('dccon') || img.classList.contains('dccon')) {
          type = 'dccon';
        } else if (src.endsWith('.gif') || src.includes('.gif?')) {
          type = 'gif';
        }

        mediaList.push(new Media({
          type,
          url: src,
          thumbnail: src
        }));
      });

      // 2. Video elements & IFrames (YouTube, Kakao, mp4, webm)
      const videos = container.querySelectorAll('video, iframe');
      videos.forEach(v => {
        const src = v.getAttribute('src') || v.getAttribute('data-src') || '';
        if (!src) return;

        mediaList.push(new Media({
          type: 'video',
          url: src,
          thumbnail: null
        }));
      });
    } catch (err) {
      // Ignore parsing errors safely
    }

    return mediaList;
  }
}

export const mediaParser = new MediaParser();
