/** Mã ngôn ngữ UI AritoID: v=Việt, e=Anh, o=khác. */
export type LangCode = 'v' | 'e' | 'o';

/** Text đa ngôn ngữ — string legacy = tiếng Việt (v). */
export type LocalizedText = string | { v?: string; e?: string; o?: string };

export function normalizeLan(raw: unknown): LangCode {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return 'v';
  const c = s[0];
  return c === 'v' || c === 'e' || c === 'o' ? c : 'v';
}

export function getLocalizedPart(
  value: LocalizedText | undefined | null,
  code: LangCode,
): string {
  if (value == null) return '';
  if (typeof value === 'string') return code === 'v' ? value : '';
  const part = value[code];
  return typeof part === 'string' ? part : '';
}

/** Resolve hiển thị theo lan; fallback v → e → o. */
export function resolveLocalizedText(
  value: LocalizedText | undefined | null,
  lan: LangCode = 'v',
): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const order: LangCode[] =
    lan === 'e' ? ['e', 'v', 'o'] : lan === 'o' ? ['o', 'v', 'e'] : ['v', 'e', 'o'];
  for (const k of order) {
    const s = value[k];
    if (typeof s === 'string' && s.trim()) return s;
  }
  return '';
}

/** Gán một mã ngôn ngữ; compact về string nếu chỉ còn v. */
export function setLocalizedPart(
  value: LocalizedText | undefined | null,
  code: LangCode,
  text: string,
): LocalizedText | undefined {
  const next = {
    v: getLocalizedPart(value, 'v'),
    e: getLocalizedPart(value, 'e'),
    o: getLocalizedPart(value, 'o'),
  };
  next[code] = text;
  return compactLocalizedText(next);
}

export function compactLocalizedText(
  value: LocalizedText | undefined | null,
): LocalizedText | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const t = value.trimEnd();
    return t === '' ? undefined : value;
  }
  const v = (value.v ?? '').trimEnd() === '' ? '' : (value.v ?? '');
  const e = (value.e ?? '').trimEnd() === '' ? '' : (value.e ?? '');
  const o = (value.o ?? '').trimEnd() === '' ? '' : (value.o ?? '');
  if (!v && !e && !o) return undefined;
  if (!e && !o) return v || undefined;
  const out: { v?: string; e?: string; o?: string } = {};
  if (v) out.v = v;
  if (e) out.e = e;
  if (o) out.o = o;
  return out;
}

export function hasExtraLocales(value: LocalizedText | undefined | null): boolean {
  return !!(getLocalizedPart(value, 'e') || getLocalizedPart(value, 'o'));
}
