/**
 * MarkdownCodeFeature — 마크다운 및 코드 하이라이팅
 *
 * Reading side: finds fenced code blocks (```lang … ```) inside a post body and
 * replaces them with a highlighted, copyable block; optionally renders the
 * whole body as Markdown when it clearly is Markdown.
 *
 * Writing side: adds a "마크다운 → HTML 변환" button to the write editor, so a
 * post can be composed in Markdown and submitted as the HTML DC expects.
 */
import { BaseFeature } from './base-feature.js';
import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';
import { renderMarkdown, looksLikeMarkdown, findCodeBlocks } from '../core/markdown/markdown-renderer.js';
import { highlightCode } from '../core/markdown/code-highlighter.js';
import { escapeHTML } from '../utils/sanitizer.js';

export class MarkdownCodeFeature extends BaseFeature {
  constructor() {
    super('enableMarkdownCode', 'Markdown & Code', '코드 블록 하이라이팅 및 마크다운 작성');
    this.originalBody = null;
    this.rendered = false;
  }

  async onEnable() {
    this.applyToPost();
    this.attachWriteTools();
  }

  async onDisable() {
    this.restoreBody();
    document.querySelector('.dcu-md-toolbar')?.remove();
    document.querySelectorAll('.dcu-code-block').forEach(block => block.remove());
  }

  onPageChange() {
    this.applyToPost();
    this.attachWriteTools();
  }

  _bodyElement() {
    return document.querySelector('.write_div, .writing_view_box .write_div');
  }

  /**
   * DC posts store line breaks as <br> and <p>, and `innerText` collapses the
   * blank lines a fenced code block needs. Rebuild the text with real newlines.
   * @param {Element} body
   * @returns {string}
   */
  _bodyText(body) {
    const clone = body.cloneNode(true);
    const NEWLINE = String.fromCharCode(10);
    clone.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode(NEWLINE)));
    clone.querySelectorAll('p, div, li, pre, h1, h2, h3, h4, h5, h6').forEach(el => {
      el.appendChild(document.createTextNode(NEWLINE));
    });
    return (clone.textContent || '').split(String.fromCharCode(160)).join(' ');
  }

  /**
   * Highlights fenced code inside a post and offers full Markdown rendering.
   */
  applyToPost() {
    if (!this.enabled) return;
    const body = this._bodyElement();
    if (!body || body.dataset.dcuMdChecked === '1') return;
    body.dataset.dcuMdChecked = '1';

    const text = this._bodyText(body);
    const blocks = findCodeBlocks(text);
    const markdownish = looksLikeMarkdown(text);

    if (blocks.length === 0 && !markdownish) return;

    this.originalBody = body.innerHTML;

    if (blocks.length > 0) {
      this._renderCodeBlocks(body, blocks);
    }

    if (markdownish && configManager.get('markdownRenderPosts') !== false) {
      this._addRenderToggle(body, text);
    }
  }

  /**
   * Appends highlighted versions of each fenced block below the post body.
   * The original text is left untouched so nothing is lost if parsing is off.
   */
  _renderCodeBlocks(body, blocks) {
    blocks.forEach((block, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'dcu-code-block';
      wrapper.innerHTML = `
        <div class="dcu-code-head">
          <span class="dcu-code-lang">${escapeHTML(block.lang || 'code')} #${index + 1}</span>
          <button type="button" class="dcu-code-copy">복사</button>
        </div>
        <pre class="dcu-md-pre"><code>${highlightCode(block.code)}</code></pre>`;

      wrapper.querySelector('.dcu-code-copy')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        try {
          await navigator.clipboard.writeText(block.code);
          button.textContent = '복사됨';
        } catch (err) {
          button.textContent = '복사 실패';
        }
        setTimeout(() => { button.textContent = '복사'; }, 1500);
      });

      body.appendChild(wrapper);
    });
  }

  _addRenderToggle(body, text) {
    const bar = document.createElement('div');
    bar.className = 'dcu-md-toolbar';
    bar.innerHTML = '<button type="button" class="dcu-md-toggle">마크다운으로 보기</button>';
    body.parentElement?.insertBefore(bar, body);

    bar.querySelector('.dcu-md-toggle')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      if (this.rendered) {
        this.restoreBody();
        button.textContent = '마크다운으로 보기';
        return;
      }
      body.innerHTML = `<div class="dcu-md-rendered">${renderMarkdown(text)}</div>`;
      this.rendered = true;
      button.textContent = '원본 보기';
    });
  }

  restoreBody() {
    const body = this._bodyElement();
    if (body && this.originalBody !== null && this.rendered) {
      body.innerHTML = this.originalBody;
    }
    this.rendered = false;
  }

  /**
   * Write page: convert the Markdown a user typed into the HTML DC stores.
   */
  attachWriteTools() {
    if (!this.enabled) return;
    if (!/\/board\/(write|modify)/.test(window.location.pathname)) return;
    if (document.querySelector('.dcu-md-write-tools')) return;

    const editable = document.querySelector('.note-editable, [contenteditable="true"]');
    if (!editable) {
      setTimeout(() => this.attachWriteTools(), 1500);
      return;
    }

    const tools = document.createElement('div');
    tools.className = 'dcu-md-write-tools';
    tools.innerHTML = `
      <button type="button" class="dcu-md-convert">마크다운 → 본문 변환</button>
      <span class="dcu-md-hint">코드는 \`\`\`언어 … \`\`\` 로 감싸면 하이라이팅됩니다.</span>`;

    editable.parentElement?.insertBefore(tools, editable);

    tools.querySelector('.dcu-md-convert')?.addEventListener('click', () => {
      const source = this._bodyText(editable);
      if (!source.trim()) return;

      const html = renderMarkdown(source);
      editable.innerHTML = html;
      editable.dispatchEvent(new Event('input', { bubbles: true }));

      const memo = document.querySelector('#memo, textarea[name="memo"]');
      if (memo) memo.value = html;

      logger.info('MarkdownCodeFeature: converted Markdown source into post HTML.');
    });
  }
}

export const markdownCodeFeature = new MarkdownCodeFeature();
