export type OpenAsKind = 'link' | 'mail' | 'phone';

export function normalizeOpenAs(raw?: string | null): OpenAsKind | undefined {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'link' || s === 'url' || s === 'web') return 'link';
  if (s === 'mail' || s === 'email' || s === 'mailto') return 'mail';
  if (s === 'phone' || s === 'tel' || s === 'call') return 'phone';
  return undefined;
}

/** Build href cho openAs. */
export function hrefForOpenAs(kind: OpenAsKind, value: string): string {
  const v = value.trim();
  if (!v) return '#';
  if (kind === 'mail') {
    const addr = v.replace(/^mailto:/i, '');
    return `mailto:${addr}`;
  }
  if (kind === 'phone') {
    const tel = v.replace(/^tel:/i, '').replace(/[^\d+]/g, '');
    return `tel:${tel || v}`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/\//.test(v)) return `https:${v}`;
  return `https://${v}`;
}

export function displayForOpenAs(kind: OpenAsKind, value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (kind === 'mail') return v.replace(/^mailto:/i, '');
  if (kind === 'phone') return v.replace(/^tel:/i, '');
  return v.replace(/^https?:\/\//i, '');
}
