/**
 * DC Ultimate Site Detector
 * Robust utility for verifying DCInside URLs.
 */

/**
 * Checks if a given URL string points to DCInside.
 * @param {string} urlString 
 * @returns {boolean}
 */
export function isDCInsideUrl(urlString) {
  if (!urlString) return false;
  
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();
    
    // Exact match or subdomain match
    return hostname === 'dcinside.com' || hostname.endsWith('.dcinside.com');
  } catch (e) {
    return false;
  }
}
