/**
 * VirtualPaginator Module for DC Ultimate Search Engine
 * Decouples source fetch pages from extension UI pagination
 */

export class VirtualPaginator {
  /**
   * Paginates a dataset into virtual pages without network requests
   * @param {Array} items Complete dataset array
   * @param {number} [page=1] Requested 1-based page number
   * @param {number} [pageSize=20] Results per page (20, 50, 100, 200)
   * @returns {{ items: Array, currentPage: number, totalPages: number, totalItems: number, pageSize: number, hasNext: boolean, hasPrev: boolean }}
   */
  paginate(items, page = 1, pageSize = 20) {
    const list = Array.isArray(items) ? items : [];
    const validPageSize = Math.max(1, pageSize);
    const totalItems = list.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / validPageSize));
    
    const currentPage = Math.max(1, page);
    const startIndex = (currentPage - 1) * validPageSize;
    const endIndex = Math.min(startIndex + validPageSize, totalItems);

    // A page beyond the available range should yield an empty result set
    // rather than silently substituting a different page's data.
    const pageItems = startIndex < totalItems ? list.slice(startIndex, endIndex) : [];

    return {
      items: pageItems,
      currentPage,
      totalPages,
      totalItems,
      pageSize: validPageSize,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1
    };
  }
}

export const virtualPaginator = new VirtualPaginator();
