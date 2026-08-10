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
