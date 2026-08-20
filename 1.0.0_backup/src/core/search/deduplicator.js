/**
 * Deduplicator Module for DC Ultimate Search Engine
 * Prevents article duplication across overlapping search pages using stable composite identity keys
 */

export class Deduplicator {
  /**
   * Deduplicate array of normalized Article objects
   * @param {Article[]} articles Array of Article objects
   * @returns {Article[]} Deduplicated array of Article objects
   */
  deduplicate(articles) {
    if (!Array.isArray(articles)) return [];

    const seenKeys = new Set();
    const result = [];

    for (const article of articles) {
      const key = this.getUniqueKey(article);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push(article);
      }
    }

    return result;
  }

  /**
   * Generates unique key for an article
   * @param {Article} article Article object
   * @returns {string}
   */
  getUniqueKey(article) {
    if (article.galleryId && article.id) {
      return `${article.galleryId}_${article.id}`;
    }
    if (article.url) {
      return article.url;
    }
    // Fallback: title + author + date composite key (never title alone)
    return `${article.title}_${article.author}_${article.date || ''}`;
  }
}

export const deduplicator = new Deduplicator();
