import type { CSSProperties } from 'react';
import type { FormControlDef } from '../types/form';

/**
 * Layout style cho control trong hàng.
 * `width: "60%"` được hiểu là **tỷ lệ flex** (60:40) để luôn cùng hàng dù có gap.
 * Width khác % (vd. `120px`) dùng fixed basis.
 */
export function controlLayoutStyle(c: FormControlDef, inRow: boolean): CSSProperties {
  const raw = c.width?.trim();
  if (!raw) {
    return inRow ? { flex: '1 1 0%', minWidth: 0 } : {};
  }
  const pct = /^([\d.]+)\s*%$/.exec(raw);
  if (pct) {
    const n = Number(pct[1]);
    if (Number.isFinite(n) && n > 0) {
      return { flex: `${n} ${n} 0%`, minWidth: 0, maxWidth: '100%' };
    }
  }
  return { flex: `0 0 ${raw}`, width: raw, maxWidth: raw, minWidth: 0 };
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
export function controlVisualStyle(c: FormControlDef, inRow: boolean): CSSProperties {
  return { ...controlLayoutStyle(c, inRow), ...controlTextStyle(c) };
}
