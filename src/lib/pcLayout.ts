import { useEffect, useState, type CSSProperties } from 'react';
import type { AccordionLayoutGroup, DesignControlGroup } from './controlGroups';
import type { FormControlDef, FormListDef, FormPcLayout } from '../types/form';
import { isMobileEmbed } from './embedAuthBridge';

export const PC_BREAKPOINT = 900;
/** Ước lượng bề rộng 1 cột form PC — dùng để hạ số cột khi màn hẹp. */
export const PC_COL_MIN_WIDTH = 420;
export const PC_COLUMNS_MIN = 1;
export const PC_COLUMNS_MAX = 6;
export const PC_COLUMNS_DEFAULT = 3;

export type DesignViewport = 'phone' | 'pc';
export type ViewportMode = 'auto' | DesignViewport;

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? PC_BREAKPOINT : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function isPcLayoutActive(
  form: { pc?: FormPcLayout | null },
  opts: {
    viewportMode?: ViewportMode;
    width?: number;
    mobileQuery?: boolean;
  } = {},
): boolean {
  if (!form.pc?.enabled) return false;
  if (opts.viewportMode === 'phone') return false;
  if (opts.viewportMode === 'pc') return true;
  const mobile = opts.mobileQuery ?? isMobileEmbed();
  if (mobile) return false;
  const width = opts.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  return width >= PC_BREAKPOINT;
}

/** PC đủ rộng để drawer bên phải (không phụ thuộc form.pc). */
export function isPcDrawerViewport(opts: {
  viewportMode?: ViewportMode;
  width?: number;
  mobileQuery?: boolean;
} = {}): boolean {
  if (opts.viewportMode === 'phone') return false;
  if (opts.viewportMode === 'pc') return true;
  const mobile = opts.mobileQuery ?? isMobileEmbed();
  if (mobile) return false;
  const width = opts.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  return width >= PC_BREAKPOINT;
}

export function pcMaxColumns(form: { pc?: FormPcLayout | null }): number {
  const n = form.pc?.columns ?? PC_COLUMNS_DEFAULT;
  if (!Number.isFinite(n)) return PC_COLUMNS_DEFAULT;
  return Math.min(PC_COLUMNS_MAX, Math.max(PC_COLUMNS_MIN, Math.floor(n)));
}

/**
 * Số cột thực tế: `pc.columns` là MAX.
 * Runtime: min(max, floor(width / 420)) — màn hẹp 2 cột, rộng 3 (nếu max≥3).
 * Designer viewport PC: dùng max để khai colSpan.
 */
export function pcColumnCount(
  form: { pc?: FormPcLayout | null },
  opts: { viewportMode?: ViewportMode; width?: number } = {},
): number {
  const max = pcMaxColumns(form);
  if (opts.viewportMode === 'pc') return max;
  if (opts.viewportMode === 'phone') return 1;
  const width = opts.width ?? (typeof window !== 'undefined' ? window.innerWidth : PC_BREAKPOINT);
  const byWidth = Math.max(1, Math.floor(width / PC_COL_MIN_WIDTH));
  return Math.min(max, byWidth);
}

export function pcColSpan(c: FormControlDef, columns: number): number {
  const raw = c.pc?.colSpan ?? 1;
  if (!Number.isFinite(raw)) return 1;
  return Math.min(columns, Math.max(1, Math.floor(raw)));
}

/** Lọc visible + sort theo pc.order khi layout PC. */
export function prepareControlsForPc(controls: FormControlDef[]): FormControlDef[] {
  return [...controls]
    .filter((c) => c.pc?.visible !== false)
    .sort((a, b) => (a.pc?.order ?? a.order) - (b.pc?.order ?? b.order));
}

export function pcGridContainerStyle(columns: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '12px',
    alignItems: 'start',
  };
}

export function pcGridItemStyle(span: number): CSSProperties {
  return { gridColumn: `span ${Math.max(1, span)}`, minWidth: 0 };
}

export function pcSpanForDesignGroup(g: DesignControlGroup, columns: number): number {
  if (g.kind === 'group' || g.kind === 'include') return columns;
  if (g.kind === 'row') return pcColSpan(g.controls[0]!, columns);
  return pcColSpan(g.control, columns);
}

export function pcSpanForLayoutGroup(g: AccordionLayoutGroup, columns: number): number {
  if (g.kind === 'group') return columns;
  if (g.kind === 'row') return pcColSpan(g.controls[0]!, columns);
  return pcColSpan(g.control, columns);
}

export function isPcGridList(list: FormListDef, pcViewport: boolean): boolean {
  return pcViewport && list.grid?.enabled === true;
}

export function gridRowEditFormId(list: FormListDef): string | undefined {
  const id = list.grid?.rowEdit?.formId?.trim();
  return id || undefined;
}

/** drawer trên mobile/hẹp → sheet. */
export function resolveOverlayMode(
  uiMode: string | undefined,
  allowDrawer: boolean,
): string {
  const m = (uiMode ?? 'modal').trim().toLowerCase();
  if (m === 'drawer' && !allowDrawer) return 'sheet';
  return m || 'modal';
}

export function mapRowEditValues(
  map: Record<string, string> | undefined,
  row: Record<string, unknown>,
): { values: Record<string, unknown>; state: Record<string, unknown> } {
  const values: Record<string, unknown> = {};
  const state: Record<string, unknown> = {};
  if (!map) return { values, state };
  for (const [destRaw, sourceRaw] of Object.entries(map)) {
    const dest = destRaw.trim();
    const source = sourceRaw.trim();
    if (!dest) continue;
    const v = resolveRowSource(source, row);
    if (dest.toLowerCase().startsWith('state.')) state[dest.slice(6)] = v;
    else if (dest.toLowerCase().startsWith('control.')) values[dest.slice(8)] = v;
    else values[dest] = v;
  }
  return { values, state };
}

function resolveRowSource(source: string, row: Record<string, unknown>): unknown {
  if (source.toLowerCase().startsWith('literal:')) return source.slice('literal:'.length);
  if (source.toLowerCase().startsWith('row.')) return row[source.slice(4)];
  return row[source] ?? source;
}

export function parseValuesMapText(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=') >= 0 && (t.indexOf(':') < 0 || t.indexOf('=') < t.indexOf(':'))
      ? t.indexOf('=')
      : t.indexOf(':');
    if (idx <= 0) continue;
    const dest = t.slice(0, idx).trim();
    const source = t.slice(idx + 1).trim();
    if (dest && source) out[dest] = source;
  }
  return Object.keys(out).length ? out : undefined;
}

export function formatValuesMapText(map: Record<string, string> | undefined): string {
  if (!map) return '';
  return Object.entries(map)
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n');
}
