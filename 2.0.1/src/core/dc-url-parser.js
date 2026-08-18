/**
 * DC URL Parser
 * Centralized module for parsing DCInside URLs into a normalized DcLocation model.
 */

/**
 * @typedef {Object} DcLocation
 * @property {"dcinside"} service
 * @property {"board" | "mgallery" | "mini" | undefined} galleryType
 * @property {string | undefined} galleryId
 * @property {string | undefined} postId
 * @property {string | undefined} commentId
 * @property {"gallery" | "post" | "comment" | "search" | "unknown"} pageType
 */

/**
 * Parses a DCInside URL and returns a structured DcLocation object.
 * @param {string} urlString The URL to parse
 * @returns {DcLocation | null}
 */
export function parseDcUrl(urlString) {
  if (!urlString) return null;

  try {
    const url = new URL(urlString);
    
    // Ensure it's a DCInside URL
    if (!url.hostname.endsWith('dcinside.com')) {
      return null;
    }

    const path = url.pathname;
    const searchParams = url.searchParams;
    const hash = url.hash;
    
    const location = {
      service: 'dcinside',
      pageType: 'unknown'
    };

    // Determine Gallery Type
    if (path.startsWith('/mgallery/')) {
      location.galleryType = 'mgallery';
    } else if (path.startsWith('/mini/')) {
      location.galleryType = 'mini';
    } else if (path.startsWith('/board/')) {
      location.galleryType = 'board';
    } else if (path.length > 1 && !path.includes('/')) {
      // Possible direct gallery link like gall.dcinside.com/programming
      location.galleryType = 'board'; // Defaulting direct paths to board; usually it redirects but if it doesn't we capture it
    }

    // Extract Gallery ID
    const idParam = searchParams.get('id');
    if (idParam) {
      location.galleryId = idParam;
    } else if (path.length > 1 && !path.startsWith('/board/') && !path.startsWith('/mgallery/') && !path.startsWith('/mini/')) {
       // direct path like /programming
       const segments = path.split('/').filter(Boolean);
       if (segments.length === 1) {
         location.galleryId = segments[0];
       }
    }

    // Extract Page Type and Post ID
    const noParam = searchParams.get('no');
    if (path.includes('/view')) {
      location.pageType = 'post';
      if (noParam) location.postId = noParam;
    } else if (path.includes('/lists')) {
      location.pageType = 'gallery';
    } else if (url.hostname === 'search.dcinside.com') {
      location.pageType = 'search';
    } else if (location.galleryId && !path.includes('/view') && !path.includes('/lists')) {
      // Assume gallery list if we have an ID but it's not a known view
      location.pageType = 'gallery';
    }

    // Extract Comment ID from hash (DC usually links to comments via #focus_cmt)
    // Or if there's a specific pattern for comments we can add it here.
    if (hash && hash.includes('focus_cmt')) {
        // e.g. #focus_cmt_12345
        const match = hash.match(/focus_cmt_(\d+)/);
        if (match) {
            location.commentId = match[1];
            location.pageType = 'comment'; // We can classify it as comment focus
        }
    }

    return location;
  } catch (err) {
    console.warn('DC URL Parser failed:', err);
    return null;
  }
}
