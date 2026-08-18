/**
 * DC Ultimate Keyword Alert Data Models
 */

/**
 * Represents a user-defined keyword alert rule.
 * @typedef {Object} KeywordAlert
 * @property {string} id - Unique identifier (UUID).
 * @property {Object} gallery - Target gallery information.
 * @property {string} gallery.id - Gallery ID (e.g. 'pridepc_new4').
 * @property {"board" | "mgallery" | "mini"} gallery.type - Type of the gallery.
 * @property {string} gallery.name - Human readable gallery name.
 * @property {string} gallery.url - Base URL of the gallery.
 * @property {string[]} keywords - List of keywords to match (acts as OR).
 * @property {"title" | "title_content"} target - What parts of the post to match against.
 * @property {"contains" | "exact" | "regex"} matchMode - How to match keywords.
 * @property {boolean} enabled - Whether this rule is active.
 * @property {number} pollingIntervalMinutes - Background checking interval.
 * @property {boolean} notifyPanel - Whether to show in Side Panel.
 * @property {boolean} notifyChrome - Whether to trigger Chrome OS notifications.
 * @property {number} createdAt - Epoch timestamp.
 * @property {number} updatedAt - Epoch timestamp.
 * @property {boolean} [initialized] - True if the baseline posts have been scanned.
 * @property {number} [lastCheckedAt] - Epoch timestamp of last check.
 * @property {string} [lastSeenPostId] - Highest/latest post ID seen.
 * @property {number} [consecutiveFailures] - Tracking network failures.
 * @property {string} [lastError] - Error message if applicable.
 */

/**
 * Represents a matched post notification.
 * @typedef {Object} KeywordNotification
 * @property {string} id - Unique identifier (UUID).
 * @property {string} alertId - ID of the KeywordAlert rule that triggered this.
 * @property {Object} post - Detected post information.
 * @property {string} post.id - DCInside Post ID (number string).
 * @property {string} post.title - Title of the post.
 * @property {string} post.url - Exact URL to the post.
 * @property {string} [post.author] - Author's nickname.
 * @property {string} [post.createdAt] - Time created on DC.
 * @property {string} post.galleryId - Target gallery ID.
 * @property {string} post.galleryName - Target gallery name.
 * @property {string[]} matchedKeywords - Which keyword(s) matched.
 * @property {number} detectedAt - Epoch timestamp when detected.
 * @property {boolean} read - True if user has clicked/dismissed.
 */

export {};
