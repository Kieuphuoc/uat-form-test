import type { CSSProperties } from 'react';
import type { FormListColumnDef } from '../types/form';

export type ColumnSizeMode = 'fixed' | 'flex' | 'percent';

export const GRID_CHECK_COL_PX = 36;
export const GRID_EDIT_COL_PX = 72;

export function inferColumnSizeMode(col: Pick<FormListColumnDef, 'sizeMode' | 'width'>): ColumnSizeMode {
  const mode = (col.sizeMode ?? '').trim().toLowerCase();
  if (mode === 'fixed' || mode === 'flex' || mode === 'percent') return mode;
  const w = (col.width ?? '').trim();
  if (w.endsWith('%')) return 'percent';
  if (w && (/px|em|rem$/i.test(w) || /^\d+(\.\d+)?$/.test(w))) return 'fixed';
  return 'flex';
}

function parsePx(raw: string | undefined): number | null {
  const w = (raw ?? '').trim();
  if (!w) return null;
  const m = /^([\d.]+)\s*px$/i.exec(w) || /^([\d.]+)$/.exec(w);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePercent(raw: string | undefined): number | null {
  const w = (raw ?? '').trim();
  const m = /^([\d.]+)\s*%$/.exec(w);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseFlexGrow(raw: string | undefined): number {
  const w = (raw ?? '').trim();
  if (!w) return 1;
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export type GridColSpec = {
  key: string;
  style: CSSProperties;
};

export type GridColLayout = {
  cols: GridColSpec[];
  /** Tổng % đã dùng bởi fixed+percent (có thể > 100 → overflow-x). */
  usedPct: number;
};

/**
 * Mix fixed (px) + percent + flex (phần còn lại).
 * `tableWidthPx` dùng để quy đổi px → % khi tính phần flex.
 */
export function resolveGridColgroup(
  columns: FormListColumnDef[],
  extras: { checkbox?: boolean; edit?: boolean } = {},
  tableWidthPx = 960,
): GridColLayout {
  const table = Math.max(240, tableWidthPx);
  type Slot = {
    key: string;
    mode: ColumnSizeMode;
    px: number;
    percent: number;
    grow: number;
    minWidth?: string;
  };
  const slots: Slot[] = [];
  if (extras.checkbox) {
    slots.push({
      key: '__check',
      mode: 'fixed',
      px: GRID_CHECK_COL_PX,
      percent: 0,
      grow: 0,
    });
  }
  for (const col of columns) {
    const mode = inferColumnSizeMode(col);
    const minWidth = col.minWidth?.trim() || undefined;
    if (mode === 'fixed') {
      slots.push({
        key: col.field,
        mode,
        px: parsePx(col.width) ?? 120,
        percent: 0,
        grow: 0,
        minWidth,
      });
    } else if (mode === 'percent') {
      slots.push({
        key: col.field,
        mode,
        px: 0,
        percent: parsePercent(col.width) ?? 20,
        grow: 0,
        minWidth,
      });
    } else {
      slots.push({
        key: col.field,
        mode: 'flex',
        px: 0,
        percent: 0,
        grow: parseFlexGrow(col.width),
        minWidth: minWidth || '80px',
      });
    }
  }
  if (extras.edit) {
    slots.push({
      key: '__edit',
      mode: 'fixed',
      px: GRID_EDIT_COL_PX,
      percent: 0,
      grow: 0,
    });
  }

  const fixedPx = slots.reduce((s, c) => s + c.px, 0);
  const percentSum = slots.reduce((s, c) => s + c.percent, 0);
  const growSum = slots.reduce((s, c) => s + c.grow, 0);
  const usedPct = percentSum + (fixedPx / table) * 100;
  const remainPct = Math.max(0, 100 - usedPct);

  const cols = slots.map((c) => {
    const style: CSSProperties = {};
    if (c.minWidth) style.minWidth = c.minWidth;
    if (c.mode === 'fixed') {
      style.width = `${c.px}px`;
    } else if (c.mode === 'percent') {
      style.width = `${c.percent}%`;
    } else if (growSum > 0) {
      const share = remainPct * (c.grow / growSum);
      style.width = `${Math.max(1, share)}%`;
    } else {
      style.width = c.minWidth || '80px';
    }
    return { key: c.key, style };
  });
  return { cols, usedPct };
}
