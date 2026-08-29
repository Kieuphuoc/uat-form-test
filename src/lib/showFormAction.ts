import type { ClientActionMeta } from '../types/form';

export function resolveActionSource(
  source: string,
  ctx: {
    values: Record<string, unknown>;
    state: Record<string, unknown>;
    row?: Record<string, unknown>;
  },
): unknown {
  const s = source.trim();
  if (s.startsWith('literal:')) return s.slice('literal:'.length);
  if (s.startsWith('control.')) return ctx.values[s.slice('control.'.length)];
  if (s.startsWith('state.')) return ctx.state[s.slice('state.'.length)];
  if (s.startsWith('row.') && ctx.row) {
    const key = s.slice('row.'.length);
    if (key in ctx.row) return ctx.row[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(ctx.row)) {
      if (k.toLowerCase() === lower) return v;
    }
  }
  return s;
}

export function buildShowFormSeed(
  valuesMap: Record<string, string> | undefined,
  ctx: {
    values: Record<string, unknown>;
    state: Record<string, unknown>;
    row?: Record<string, unknown>;
  },
): { values: Record<string, unknown>; state: Record<string, unknown> } {
  const values: Record<string, unknown> = {};
  const state: Record<string, unknown> = {};
  if (!valuesMap) return { values, state };
  for (const [dest, source] of Object.entries(valuesMap)) {
    const v = resolveActionSource(source, ctx);
    if (dest.startsWith('state.')) state[dest.slice('state.'.length)] = v;
    else if (dest.startsWith('control.')) values[dest.slice('control.'.length)] = v;
    else values[dest] = v;
  }
  return { values, state };
}

export function isShowFormAction(meta: ClientActionMeta | undefined): boolean {
  return (meta?.type ?? '').trim().toLowerCase() === 'showform';
}
