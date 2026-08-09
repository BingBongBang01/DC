/**
 * ResultSorter Module for DC Ultimate Search Engine
 * Sorts normalized Article objects on memory dataset
 */

export class ResultSorter {
  /**
   * Sort array of Article objects
   * @param {Article[]} articles Array of Article objects
   * @param {'newest'|'oldest'|'recommendations'|'views'|'comments'|'title'} [sortOrder='newest'] Sort metric
   * @returns {Article[]} Sorted shallow copy array
   */
  sort(articles, sortOrder = 'newest') {
    if (!Array.isArray(articles)) return [];
    const list = [...articles];

    switch (sortOrder) {
      case 'oldest':
        return list.sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));
      case 'recommendations':
        return list.sort((a, b) => b.recommendations - a.recommendations);
      case 'views':
        return list.sort((a, b) => b.views - a.views);
      case 'comments':
        return list.sort((a, b) => b.comments - a.comments);
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'newest':
      default:
        return list.sort((a, b) => (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0));
    }
  }
}

export const resultSorter = new ResultSorter();
