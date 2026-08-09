/**
 * DC Ultimate Canonical Gallery Context
 */

/**
 * @typedef {Object} GalleryContext
 * @property {boolean} valid
 * @property {string|null} galleryId
 * @property {"board" | "mgallery" | "mini" | null} galleryType
 * @property {string|null} galleryName
 * @property {string|null} url
 * @property {string|null} canonicalUrl
 * @property {"url" | "content" | "manual" | null} source
 * @property {number} detectedAt
 */

/**
 * Parses a raw URL into a canonical GalleryContext.
 * @param {string} rawUrl 
 * @returns {GalleryContext}
 */
export function parseGalleryUrl(rawUrl) {
  const invalid = {
    valid: false,
    galleryId: null,
    galleryType: null,
    galleryName: null,
    url: rawUrl ?? null,
    canonicalUrl: null,
    source: "url",
    detectedAt: Date.now()
  };

  if (!rawUrl) return invalid;

  try {
    const url = new URL(rawUrl);

    if (!url.hostname.endsWith("dcinside.com")) {
      return invalid;
    }

    const path = url.pathname;
    const id = url.searchParams.get("id");

    if (path.startsWith("/mgallery/") && id) {
      return {
        valid: true,
        galleryId: id,
        galleryType: "mgallery",
        galleryName: null,
        url: rawUrl,
        canonicalUrl: `https://gall.dcinside.com/mgallery/board/lists/?id=${encodeURIComponent(id)}`,
        source: "url",
        detectedAt: Date.now()
      };
    }

    if (path.startsWith("/mini/") && id) {
      return {
        valid: true,
        galleryId: id,
        galleryType: "mini",
        galleryName: null,
        url: rawUrl,
        canonicalUrl: `https://gall.dcinside.com/mini/board/lists/?id=${encodeURIComponent(id)}`,
        source: "url",
        detectedAt: Date.now()
      };
    }

    if (path.startsWith("/board/") && id) {
      return {
        valid: true,
        galleryId: id,
        galleryType: "board",
        galleryName: null,
        url: rawUrl,
        canonicalUrl: `https://gall.dcinside.com/board/lists/?id=${encodeURIComponent(id)}`,
        source: "url",
        detectedAt: Date.now()
      };
    }

    // Direct gallery paths without /board/ (usually redirects, but we might encounter them)
    if (path.length > 1 && !path.includes('/') && !id) {
      const potentialId = path.substring(1);
      return {
        valid: true,
        galleryId: potentialId,
        galleryType: "board", // defaulting to board
        galleryName: null,
        url: rawUrl,
        canonicalUrl: `https://gall.dcinside.com/board/lists/?id=${encodeURIComponent(potentialId)}`,
        source: "url",
        detectedAt: Date.now()
      };
    }

    return invalid;
  } catch (err) {
    return invalid;
  }
}
