/**
 * Keyword Matcher Module
 * Pure functions for string matching in Keyword Alerts.
 */

/**
 * Matches text against a keyword based on the specified mode.
 * @param {string} text The target text to search in.
 * @param {string} keyword The keyword to search for.
 * @param {"contains"|"exact"|"regex"} mode Matching mode.
 * @returns {boolean}
 */
export function matchKeyword(text, keyword, mode = 'contains') {
  if (!text || !keyword) return false;
  
  try {
    switch (mode) {
      case 'contains':
        return text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
      case 'exact':
        return text.trim().toLocaleLowerCase() === keyword.trim().toLocaleLowerCase();
      case 'regex':
        return new RegExp(keyword, 'i').test(text);
      default:
        return false;
    }
  } catch (err) {
    console.warn(`KeywordMatcher regex error for /${keyword}/:`, err);
    return false;
  }
}

/**
 * Checks a post against a KeywordAlert rule.
 * @param {import('./types.js').KeywordNotification['post']} post 
 * @param {import('./types.js').KeywordAlert} alert 
 * @returns {string[]} Array of matched keywords. Empty if no match.
 */
export function matchPost(post, alert) {
  if (!post || !alert || !alert.enabled || !alert.keywords || alert.keywords.length === 0) {
    return [];
  }

  const matched = [];
  
  const textToSearch = alert.target === 'title_content' && post.content 
    ? `${post.title} ${post.content}`
    : post.title;

  for (const keyword of alert.keywords) {
    if (matchKeyword(textToSearch, keyword, alert.matchMode)) {
      matched.push(keyword);
    }
  }

  return matched;
}
