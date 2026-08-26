import type { CSSProperties } from 'react';
import type { FormControlDef } from '../types/form';

export type ControlAlign = 'left' | 'center' | 'right' | 'squareCenter';

/** Parse width "40%" → 40; không phải % → null. */
export function parseWidthPercent(width?: string | null): number | null {
  const raw = width?.trim();
  if (!raw) return null;
  const m = /^([\d.]+)\s*%$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeControlAlign(raw?: string | null): ControlAlign | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'left' || v === 'start') return 'left';
  if (v === 'center' || v === 'middle') return 'center';
  if (v === 'right' || v === 'end') return 'right';
  if (v === 'squarecenter' || v === 'square-center' || v === 'square_center') return 'squareCenter';
  return null;
}

/** center | squareCenter — căn giữa label / nội dung. */
export function isCenterishAlign(raw?: string | null): boolean {
  const a = normalizeControlAlign(raw);
  return a === 'center' || a === 'squareCenter';
}

/**
 * align + width x% (&lt;100) → control một hàng riêng, rộng x% hàng.
 * (center/squareCenter bắt buộc; left/right cũng solo theo kế hoạch.)
 */
export function needsAlignSoloRow(c: FormControlDef): boolean {
  const align = normalizeControlAlign(c.align);
  if (!align) return false;
  const pct = parseWidthPercent(c.width);
  return pct != null && pct > 0 && pct < 100;
}

function justifyForAlign(align: ControlAlign): CSSProperties['justifyContent'] {
  if (align === 'center' || align === 'squareCenter') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
}

/** Style wrapper hàng solo (align + % &lt; 100). */
export function alignSoloRowStyle(c: FormControlDef): CSSProperties {
  const align = normalizeControlAlign(c.align) ?? 'left';
  return {
    display: 'flex',
    width: '100%',
    justifyContent: justifyForAlign(align),
    maxWidth: '100%',
  };
}

/**
 * Layout style cho control trong hàng.
 * `width: "60%"` trong hàng chung = tỷ lệ flex (60:40).
 * Ngoài hàng / alignSolo: % = width tuyệt đối của hàng (vd. 50%).
 */
export function controlLayoutStyle(
  c: FormControlDef,
  inRow: boolean,
  opts?: { alignSolo?: boolean },
): CSSProperties {
  const raw = c.width?.trim();
  const alignSolo = opts?.alignSolo === true || needsAlignSoloRow(c);
  const pctVal = parseWidthPercent(c.width);

  // align + % < 100, hoặc % khi đứng một mình (không inRow): width tuyệt đối.
  if (alignSolo || (!inRow && pctVal != null)) {
    if (pctVal != null) {
      return {
        width: `${pctVal}%`,
        maxWidth: '100%',
        minWidth: 0,
        flex: '0 0 auto',
        boxSizing: 'border-box',
      };
    }
  }

  if (!raw) {
    return inRow ? { flex: '1 1 0%', minWidth: 0 } : {};
  }
  if (pctVal != null) {
    // Trong hàng chung: tỷ lệ flex
    return { flex: `${pctVal} ${pctVal} 0%`, minWidth: 0, maxWidth: '100%' };
  }
  return { flex: `0 0 ${raw}`, width: raw, maxWidth: raw, minWidth: 0, boxSizing: 'border-box' };
}

/** Typography + màu chữ — dùng chung Design canvas và Runtime. */
export function controlTextStyle(c: FormControlDef): CSSProperties {
  const style: CSSProperties = {};
  const family = c.fontFamily?.trim();
  if (family) style.fontFamily = family;
  const size = c.fontSize?.trim();
  if (size) style.fontSize = size;
  const weight = c.fontWeight?.trim();
  if (weight) style.fontWeight = weight as CSSProperties['fontWeight'];
  const fstyle = c.fontStyle?.trim();
  if (fstyle) style.fontStyle = fstyle as CSSProperties['fontStyle'];
  const align = c.textAlign?.trim();
  if (align) style.textAlign = align as CSSProperties['textAlign'];
  const color = c.textColor?.trim();
  if (color) style.color = color;
  return style;
}

/** Gộp layout hàng + typography. */
export function controlVisualStyle(
  c: FormControlDef,
  inRow: boolean,
  opts?: { alignSolo?: boolean },
): CSSProperties {
  return { ...controlLayoutStyle(c, inRow, opts), ...controlTextStyle(c) };
}
