/**
 * ResultFilter Module for DC Ultimate Search Engine
 * Reusable and composable filter engine supporting AND/OR/NOT conditions
 */

export class FilterRule {
  /**
   * @param {Object} options Filter rule criteria
   */
  constructor(options = {}) {
    this.titleContains = options.titleContains || null;
    this.titleExcludes = options.titleExcludes || null;
    this.author = options.author || null;
    this.authorExclusion = options.authorExclusion || null;
    this.subject = options.subject || null;
    this.minRecommendations = typeof options.minRecommendations === 'number' ? options.minRecommendations : null;
    this.minViews = typeof options.minViews === 'number' ? options.minViews : null;
    this.minComments = typeof options.minComments === 'number' ? options.minComments : null;
    this.hasImage = options.hasImage !== undefined ? Boolean(options.hasImage) : null;
    this.hasVideo = options.hasVideo !== undefined ? Boolean(options.hasVideo) : null;
  }

  /**
   * Check if an article matches this rule
   * @param {Article} article Normalized Article object
   * @returns {boolean}
   */
  matches(article) {
    if (!article) return false;

    if (this.titleContains && !article.title.toLowerCase().includes(this.titleContains.toLowerCase())) {
      return false;
    }

    if (this.titleExcludes && article.title.toLowerCase().includes(this.titleExcludes.toLowerCase())) {
      return false;
    }

    if (this.author && !article.author.toLowerCase().includes(this.author.toLowerCase())) {
      return false;
    }

    if (this.authorExclusion && article.author.toLowerCase().includes(this.authorExclusion.toLowerCase())) {
      return false;
    }

    if (this.subject && article.subject && !article.subject.includes(this.subject)) {
      return false;
    }

    if (this.minRecommendations !== null && article.recommendations < this.minRecommendations) {
      return false;
    }

    if (this.minViews !== null && article.views < this.minViews) {
      return false;
    }

    if (this.minComments !== null && article.comments < this.minComments) {
      return false;
    }

    if (this.hasImage !== null && article.hasImage !== this.hasImage) {
      return false;
    }

    if (this.hasVideo !== null && article.hasVideo !== this.hasVideo) {
      return false;
    }

    return true;
  }
}

export class ResultFilter {
  /**
   * Filter articles array using rules and logical operator
   * @param {Article[]} articles Array of Article objects
   * @param {FilterRule[]} rules Array of FilterRule instances
   * @param {'AND'|'OR'} [operator='AND'] Logical composition operator
   * @returns {Article[]} Filtered array
   */
  filter(articles, rules = [], operator = 'AND') {
    if (!Array.isArray(articles)) return [];
    if (!rules || rules.length === 0) return [...articles];

    return articles.filter(article => {
      if (operator === 'OR') {
        return rules.some(rule => rule.matches(article));
      } else { // 'AND'
        return rules.every(rule => rule.matches(article));
      }
    });
  }
}

export const resultFilter = new ResultFilter();
