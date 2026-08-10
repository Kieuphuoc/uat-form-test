import hljs from 'highlight.js/lib/core';
import jsonLang from 'highlight.js/lib/languages/json';
import sqlLang from 'highlight.js/lib/languages/sql';

hljs.registerLanguage('json', jsonLang);
hljs.registerLanguage('sql', sqlLang);

export type HighlightLang = 'json' | 'sql';

/** Highlight JSON / SQL (highlight.js). */
export function highlightCode(text: string, language: HighlightLang = 'json'): string {
  try {
    return hljs.highlight(text || ' ', { language }).value;
  } catch {
    try {
      return hljs.highlightAuto(text || ' ').value;
    } catch {
      return escapeHtml(text || '');
    }
  }
}

/** @deprecated dùng highlightCode(..., 'json') */
export function highlightJson(text: string): string {
  return highlightCode(text, 'json');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
