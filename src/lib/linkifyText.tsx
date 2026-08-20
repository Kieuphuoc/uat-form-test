import type { ReactNode } from 'react';

export const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export function renderTextWithLinks(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const href = match[1];
    parts.push(
      <a key={`${keyPrefix}-link-${index++}`} href={href} target="_blank" rel="noopener noreferrer">
        {href}
      </a>,
    );
    last = match.index + href.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}
