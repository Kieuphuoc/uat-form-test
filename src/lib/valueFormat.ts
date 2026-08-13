/** Number / date display formats — `format` là chuỗi pattern tự do trên control. */

export const DEFAULT_NUMBER_FORMAT = '### ### ### ##0.00';
/** Mặc định VN: ngày/tháng/năm. */
export const DEFAULT_DATE_FORMAT = 'dd/MM/yyyy';
export const DEFAULT_TIME_FORMAT = 'HH:mm';

/** Gợi ý pattern (ghi docs / placeholder — không khóa select). */
export const NUMBER_FORMAT_EXAMPLES = [
  '### ### ### ##0.00',
  '###,###,###,##0.00',
  '###.###.###.##0,00',
] as const;

export const DATE_FORMAT_EXAMPLES = [
  'dd/MM/yyyy',
  'yyyy-MM-dd',
  'yyyy-MM-dd HH:mm:ss',
] as const;

/** time: lưu text; alias hh:MM / hh:MM:ss → HH:mm / HH:mm:ss. */
export const TIME_FORMAT_EXAMPLES = ['HH:mm', 'HH:mm:ss'] as const;

export type NumberSep = { thousand: string; decimal: string; pattern: string };

/** Suy ra thousand/decimal từ pattern tự do. */
export function resolveNumberFormat(format?: string | null): NumberSep {
  const raw = (format ?? '').trim();
  // legacy ids
  if (raw === 'space_dot' || raw === '')
    return { thousand: ' ', decimal: '.', pattern: DEFAULT_NUMBER_FORMAT };
  if (raw === 'comma_dot') return { thousand: ',', decimal: '.', pattern: '###,###,###,##0.00' };
  if (raw === 'dot_comma') return { thousand: '.', decimal: ',', pattern: '###.###.###.##0,00' };

  const pattern = raw;
  const m = /([.,\s])(0+)$/.exec(pattern);
  const decimal = m?.[1] === ' ' ? '.' : (m?.[1] ?? '.');
  // thousand = other separator appearing before decimal in integer part
  const intPart = m ? pattern.slice(0, m.index) : pattern;
  let thousand = ' ';
  if (intPart.includes(' ')) thousand = ' ';
  else if (decimal === '.' && intPart.includes(',')) thousand = ',';
  else if (decimal === ',' && intPart.includes('.')) thousand = '.';
  else if (intPart.includes(',')) thousand = ',';
  else if (intPart.includes('.')) thousand = '.';
  return { thousand, decimal: decimal === ' ' ? '.' : decimal, pattern };
}

export function maxFractionDigits(pattern: string): number {
  const m = /[.,](0+)$/.exec(pattern);
  return m?.[1]?.length ?? 0;
}

export function parseNumberInput(text: string, format?: string | null): number | null {
  const f = resolveNumberFormat(format);
  let s = text.trim();
  if (!s) return 0; // trống → 0
  if (f.thousand) s = s.split(f.thousand).join('');
  if (f.decimal !== '.') s = s.split(f.decimal).join('.');
  s = s.replace(/[^\d.+-]/g, '');
  if (!s || s === '-' || s === '+' || s === '.') return 0;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  const max = maxFractionDigits(f.pattern);
  const factor = 10 ** max;
  return Math.round(n * factor) / factor;
}

export function formatNumberValue(value: unknown, format?: string | null): string {
  const f = resolveNumberFormat(format);
  let n: number;
  if (value == null || value === '') n = 0;
  else if (typeof value === 'number') n = value;
  else {
    const parsed = parseNumberInput(String(value), format);
    n = parsed ?? 0;
  }
  if (Number.isNaN(n)) n = 0;
  const max = maxFractionDigits(f.pattern);
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(max);
  const [intRaw, frac = ''] = fixed.split('.') as [string, string];
  const groups: string[] = [];
  for (let i = intRaw.length; i > 0; i -= 3) {
    groups.unshift(intRaw.slice(Math.max(0, i - 3), i));
  }
  const intPart = groups.join(f.thousand);
  const body = max > 0 ? `${intPart}${f.decimal}${frac}` : intPart;
  return neg ? `-${body}` : body;
}

/** Chỉ cho nhập ký tự hợp lệ của format số (digit, dấu -, thousand, decimal). */
export function filterNumberInput(raw: string, format?: string | null): string {
  const f = resolveNumberFormat(format);
  const allowed = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', f.decimal]);
  if (f.thousand) [...f.thousand].forEach((c) => allowed.add(c));
  let out = '';
  let sawDigit = false;
  for (const ch of raw) {
    if (!allowed.has(ch)) continue;
    if (ch === '-' && (out.length > 0 || sawDigit)) continue;
    if (ch === f.decimal && out.includes(f.decimal)) continue;
    out += ch;
    if (/\d/.test(ch)) sawDigit = true;
  }
  return out;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

type DateField = 'yyyy' | 'MM' | 'dd' | 'HH' | 'mm' | 'ss';

function fieldWidth(f: DateField): number {
  return f === 'yyyy' ? 4 : 2;
}

/** Thứ tự field theo pattern (yyyy/MM/dd/HH/mm/ss). */
function dateFieldsInOrder(format: string): DateField[] {
  const fields: DateField[] = [];
  let i = 0;
  const f = format;
  while (i < f.length) {
    if (f.startsWith('yyyy', i)) {
      fields.push('yyyy');
      i += 4;
    } else if (f.startsWith('dd', i)) {
      fields.push('dd');
      i += 2;
    } else if (f.startsWith('MM', i)) {
      fields.push('MM');
      i += 2;
    } else if (f.startsWith('HH', i) || f.startsWith('hh', i)) {
      fields.push('HH');
      i += 2;
    } else if (f.startsWith('mm', i)) {
      fields.push('mm');
      i += 2;
    } else if (f.startsWith('ss', i)) {
      fields.push('ss');
      i += 2;
    } else if (f.startsWith('d', i) && !f.startsWith('dd', i)) {
      fields.push('dd');
      i += 1;
    } else if (f.startsWith('M', i) && !f.startsWith('MM', i)) {
      fields.push('MM');
      i += 1;
    } else {
      i += 1;
    }
  }
  return fields;
}

function formatLiterals(format: string): string[] {
  return [...new Set([...format].filter((c) => !/[a-zA-Z]/.test(c)))];
}

export function normalizeDateFormat(format?: string | null): string {
  const s = (format ?? '').trim();
  return s || DEFAULT_DATE_FORMAT;
}

/**
 * Mask hiển thị khi chưa nhập ngày — giữ separator của format.
 * vd. dd/MM/yyyy → `  /  /    `
 */
export function emptyDateMask(format?: string | null): string {
  const f = normalizeDateFormat(format);
  return f
    .replace(/yyyy/g, '    ')
    .replace(/dd/g, '  ')
    .replace(/MM/g, '  ')
    .replace(/HH/g, '  ')
    .replace(/hh/g, '  ')
    .replace(/mm/g, '  ')
    .replace(/ss/g, '  ');
}

export function normalizeTimeFormat(format?: string | null): string {
  const s = (format ?? '').trim();
  if (!s) return DEFAULT_TIME_FORMAT;
  const key = s.replace(/\s/g, '');
  const aliases: Record<string, string> = {
    'hh:MM': 'HH:mm',
    'hh:mm': 'HH:mm',
    'HH:MM': 'HH:mm',
    'hh:MM:ss': 'HH:mm:ss',
    'hh:mm:ss': 'HH:mm:ss',
    'HH:MM:ss': 'HH:mm:ss',
  };
  return aliases[key] ?? s;
}

function dateKind(format: string): 'date' | 'datetime' {
  const fields = dateFieldsInOrder(format);
  const hasDate = fields.some((x) => x === 'yyyy' || x === 'MM' || x === 'dd');
  const hasTime = fields.some((x) => x === 'HH' || x === 'mm' || x === 'ss');
  if (hasDate && hasTime) return 'datetime';
  return 'date';
}

/**
 * Tự chèn separator của format khi gõ digit (09082026 → 09/08/2026).
 * Cho phép gõ/xóa separator thủ công; blur mới smart-parse (20/6 → đủ năm).
 */
export function filterDateInput(raw: string, format?: string | null): string {
  const f = normalizeDateFormat(format);
  const seps = new Set(formatLiterals(f));
  const hasManualSep = [...raw].some((ch) => seps.has(ch));
  if (hasManualSep) {
    let out = '';
    for (const ch of raw) {
      if (/\d/.test(ch)) out += ch;
      else if (seps.has(ch)) {
        if (!out.length) continue;
        if (seps.has(out[out.length - 1]!)) continue;
        out += ch;
      }
    }
    return out;
  }
  return maskDateDigits(raw.replace(/\D/g, ''), f);
}

function dateFormatTokens(format: string): ({ kind: 'd'; n: number } | { kind: 'lit'; ch: string })[] {
  const f = normalizeDateFormat(format);
  const tokens: ({ kind: 'd'; n: number } | { kind: 'lit'; ch: string })[] = [];
  let i = 0;
  while (i < f.length) {
    if (f.startsWith('yyyy', i)) {
      tokens.push({ kind: 'd', n: 4 });
      i += 4;
    } else if (
      f.startsWith('dd', i) ||
      f.startsWith('MM', i) ||
      f.startsWith('HH', i) ||
      f.startsWith('hh', i) ||
      f.startsWith('mm', i) ||
      f.startsWith('ss', i)
    ) {
      tokens.push({ kind: 'd', n: 2 });
      i += 2;
    } else if (/[dMyHms]/.test(f[i]!)) {
      tokens.push({ kind: 'd', n: 1 });
      i += 1;
    } else {
      tokens.push({ kind: 'lit', ch: f[i]! });
      i += 1;
    }
  }
  return tokens;
}

/** Gõ 09082026 + format dd/MM/yyyy → 09/08/2026 */
function maskDateDigits(digits: string, format: string): string {
  if (!digits) return '';
  const tokens = dateFormatTokens(format);
  let di = 0;
  let out = '';
  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti]!;
    if (t.kind === 'lit') continue;
    if (di >= digits.length) break;
    if (out.length) {
      const lits: string[] = [];
      for (let j = ti - 1; j >= 0; j--) {
        const pj = tokens[j]!;
        if (pj.kind === 'd') break;
        lits.unshift(pj.ch);
      }
      out += lits.join('');
    }
    const take = Math.min(t.n, digits.length - di);
    out += digits.slice(di, di + take);
    di += take;
    if (take < t.n) break;
  }
  return out;
}

/** Giá trị lưu ISO (yyyy-MM-dd[ HH:mm:ss]) → Date local. */
function tryParseStorageDate(value: string): Date | null {
  const s = value.trim();
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const MM = Number(m[2]);
  const dd = Number(m[3]);
  const HH = Number(m[4] ?? 0);
  const mm = Number(m[5] ?? 0);
  const ss = Number(m[6] ?? 0);
  const d = new Date(yyyy, MM - 1, dd, HH, mm, ss);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== MM - 1 ||
    d.getDate() !== dd
  ) {
    return null;
  }
  return d;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

function buildPartsFromSegments(
  fields: DateField[],
  segs: string[],
): Partial<Record<DateField, number>> | null {
  const parts: Partial<Record<DateField, number>> = {};
  const optional = (f: DateField) => f === 'yyyy' || f === 'ss';

  if (segs.length === 1 && /^\d+$/.test(segs[0]!)) {
    let digits = segs[0]!;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      const w = fieldWidth(field);
      if (!digits.length) break;
      const rest = fields.slice(i + 1);
      const minLeft = rest.filter((x) => !optional(x)).length; // ít nhất 1 digit / field bắt buộc
      let take = Math.min(w, digits.length);
      if (digits.length - take < minLeft) {
        take = Math.max(1, digits.length - minLeft);
      }
      take = Math.min(take, digits.length, w);
      if (take < 1) break;
      parts[field] = Number(digits.slice(0, take));
      digits = digits.slice(take);
    }
    return parts;
  }
  for (let i = 0; i < fields.length && i < segs.length; i++) {
    const n = Number(segs[i]);
    if (Number.isNaN(n)) return null;
    parts[fields[i]!] = n;
  }
  return parts;
}

function coerceDate(value: unknown, format?: string | null): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const stored = tryParseStorageDate(s);
  if (stored) return stored;
  const parsed = parseDateInput(s, format);
  if (!parsed) return null;
  return tryParseStorageDate(parsed);
}

export function formatDateValue(value: unknown, format?: string | null): string {
  if (value == null || value === '') return '';
  const f = normalizeDateFormat(format);
  const d = coerceDate(value, format);
  if (!d) return '';

  const map: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    MM: pad2(d.getMonth() + 1),
    dd: pad2(d.getDate()),
    HH: pad2(d.getHours()),
    mm: pad2(d.getMinutes()),
    ss: pad2(d.getSeconds()),
    hh: pad2(d.getHours()),
  };
  let out = f;
  // longer tokens first
  for (const k of ['yyyy', 'HH', 'hh', 'MM', 'dd', 'mm', 'ss'] as const) {
    if (map[k] != null) out = out.split(k).join(map[k]!);
  }
  return out;
}

/**
 * Parse ngày theo format; thiếu năm → năm hiện tại; 20/6 → 20/06/2026.
 * Lưu canonical: yyyy-MM-dd hoặc yyyy-MM-dd HH:mm:ss. Sai → null.
 */
export function parseDateInput(text: string, format?: string | null): string | null {
  const f = normalizeDateFormat(format);
  const original = String(text ?? '').trim();
  if (!original) return null;

  // Đã là storage ISO — không filter theo format hiển thị
  const asStored = tryParseStorageDate(original);
  if (asStored) {
    if (dateKind(f) === 'datetime') {
      return `${asStored.getFullYear()}-${pad2(asStored.getMonth() + 1)}-${pad2(asStored.getDate())} ${pad2(asStored.getHours())}:${pad2(asStored.getMinutes())}:${pad2(asStored.getSeconds())}`;
    }
    return `${asStored.getFullYear()}-${pad2(asStored.getMonth() + 1)}-${pad2(asStored.getDate())}`;
  }

  const raw = filterDateInput(original, f).trim();
  if (!raw) return null;

  const fields = dateFieldsInOrder(f);
  if (!fields.length) return null;
  const segs = raw.split(/\D+/).filter(Boolean);
  if (!segs.length) return null;

  const parts = buildPartsFromSegments(fields, segs);
  if (!parts) return null;

  const now = new Date();
  if (fields.includes('yyyy')) {
    if (parts.yyyy == null) parts.yyyy = now.getFullYear();
    else parts.yyyy = expandYear(parts.yyyy);
  } else {
    parts.yyyy = now.getFullYear();
  }
  if (fields.includes('MM') && parts.MM == null) return null;
  if (fields.includes('dd') && parts.dd == null) return null;
  if (!fields.includes('MM')) parts.MM = now.getMonth() + 1;
  if (!fields.includes('dd')) parts.dd = now.getDate();

  if (fields.includes('HH') && parts.HH == null) return null;
  if (fields.includes('mm') && parts.mm == null) return null;
  if (fields.includes('ss') && parts.ss == null) parts.ss = 0;
  if (!fields.includes('HH')) parts.HH = 0;
  if (!fields.includes('mm')) parts.mm = 0;
  if (!fields.includes('ss')) parts.ss = 0;

  const yyyy = parts.yyyy!;
  const MM = parts.MM!;
  const dd = parts.dd!;
  const HH = parts.HH ?? 0;
  const mm = parts.mm ?? 0;
  const ss = parts.ss ?? 0;
  if (MM < 1 || MM > 12 || dd < 1 || dd > 31) return null;
  if (HH > 23 || mm > 59 || ss > 59) return null;
  const d = new Date(yyyy, MM - 1, dd, HH, mm, ss);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== MM - 1 ||
    d.getDate() !== dd
  ) {
    return null;
  }

  if (dateKind(f) === 'datetime') {
    return `${yyyy}-${pad2(MM)}-${pad2(dd)} ${pad2(HH)}:${pad2(mm)}:${pad2(ss)}`;
  }
  return `${yyyy}-${pad2(MM)}-${pad2(dd)}`;
}

/** time — chỉ digit + `:`; smart pad lúc blur. */
export function filterTimeInput(raw: string, _format?: string | null): string {
  let out = '';
  for (const ch of raw) {
    if (/\d/.test(ch)) out += ch;
    else if (ch === ':') {
      if (!out.length) continue;
      if (out.endsWith(':')) continue;
      out += ':';
    }
  }
  return out;
}

export function formatTimeValue(value: unknown, format?: string | null): string {
  if (value == null || value === '') return '';
  const parsed = parseTimeInput(String(value), format);
  return parsed ?? '';
}

/** Mặc định 00:00 hoặc 00:00:00 theo format. */
export function defaultTimeValue(format?: string | null): string {
  const f = normalizeTimeFormat(format);
  return f.includes('ss') ? '00:00:00' : '00:00';
}

/** Parse giờ → text HH:mm hoặc HH:mm:ss. Trống → null; sai → null. */
export function parseTimeInput(text: string, format?: string | null): string | null {
  const f = normalizeTimeFormat(format);
  const withSec = f.includes('ss');
  const raw = filterTimeInput(String(text), f).trim();
  if (!raw) return null;

  let HH: number;
  let mm: number;
  let ss = 0;

  const segs = raw.split(':').filter((x) => x.length > 0);
  if (segs.length >= 2) {
    HH = Number(segs[0]);
    mm = Number(segs[1]);
    if (withSec) ss = segs.length >= 3 ? Number(segs[2]) : 0;
  } else if (segs.length === 1 && /^\d+$/.test(segs[0]!)) {
    let d = segs[0]!;
    if (withSec && d.length >= 5) {
      ss = Number(d.slice(-2));
      d = d.slice(0, -2);
    }
    if (d.length < 3 || d.length > 4) return null;
    mm = Number(d.slice(-2));
    HH = Number(d.slice(0, -2));
  } else {
    return null;
  }

  if (Number.isNaN(HH) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
  if (HH > 23 || mm > 59 || ss > 59) return null;
  if (withSec) return `${pad2(HH)}:${pad2(mm)}:${pad2(ss)}`;
  return `${pad2(HH)}:${pad2(mm)}`;
}
