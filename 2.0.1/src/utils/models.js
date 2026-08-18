/**
 * DC Ultimate Normalized Data Models
 */

/**
 * Gallery model representation
 */
export class Gallery {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.type = data.type || 'major'; // 'major', 'minor', 'mini'
    this.url = data.url || '';
  }
}

/**
 * Article model representation
 */
export class Article {
  constructor(data = {}) {
    this.id = data.id || null;
    this.galleryId = data.galleryId || null;
    this.galleryName = data.galleryName || '';
    this.title = data.title || '';
    this.author = data.author || '';
    this.authorId = data.authorId || null;
    this.ip = data.ip || null;
    this.date = data.date || null;
    this.views = typeof data.views === 'number' ? data.views : 0;
    this.recommendations = typeof data.recommendations === 'number' ? data.recommendations : 0;
    this.comments = typeof data.comments === 'number' ? data.comments : 0;
    this.url = data.url || '';
    this.hasImage = Boolean(data.hasImage);
    this.hasVideo = Boolean(data.hasVideo);
    this.subject = data.subject || '';
    this.body = data.body || '';
    this.media = Array.isArray(data.media) ? data.media : [];
    this.sourcePage = data.sourcePage || 'gallery_list';
  }
}

/**
 * Comment model representation
 */
export class Comment {
  constructor(data = {}) {
    this.id = data.id || null;
    this.articleId = data.articleId || null;
    this.author = data.author || '';
    this.authorId = data.authorId || null;
    this.ip = data.ip || null;
    this.content = data.content || '';
    this.date = data.date || null;
    this.recommendations = typeof data.recommendations === 'number' ? data.recommendations : 0;
    this.isReply = Boolean(data.isReply);
    this.replyTo = data.replyTo || null;
  }
}

/**
 * User model representation
 */
export class User {
  constructor(data = {}) {
    this.id = data.id || null;
    this.nickname = data.nickname || '';
    this.ip = data.ip || null;
    this.isMember = Boolean(data.isMember);
    this.isGalleryManager = Boolean(data.isGalleryManager);
  }
}

/**
 * SearchResult model representation
 */
export class SearchResult {
  constructor(data = {}) {
    this.keyword = data.keyword || '';
    this.totalCount = typeof data.totalCount === 'number' ? data.totalCount : 0;
    this.articles = Array.isArray(data.articles) ? data.articles.map(a => new Article(a)) : [];
  }
}

/**
 * Media model representation
 */
export class Media {
  constructor(data = {}) {
    this.type = data.type || 'image'; // 'image', 'video', 'dccon'
    this.url = data.url || '';
    this.thumbnail = data.thumbnail || null;
  }
}
