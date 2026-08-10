import type { FormControlDef } from '../types/form';
import {
  resolveLocalizedText,
  type LangCode,
  type LocalizedText,
} from './localizedText';

export type SelectOption = { value: string; label: LocalizedText };

export type SelectOptionsMode = 'static' | 'sqlCache' | 'sqlSearch' | 'listPicker';

export function resolveSelectOptionsMode(c: FormControlDef): SelectOptionsMode {
  const raw = (c.optionsMode ?? '').trim().toLowerCase();
  if (raw === 'sqlcache' || raw === 'sql_cache' || raw === 'cache') return 'sqlCache';
  if (raw === 'sqlsearch' || raw === 'sql_search' || raw === 'search') return 'sqlSearch';
  if (raw === 'listpicker' || raw === 'list_picker' || raw === 'picker') return 'listPicker';
  if (raw === 'static') return 'static';
  if (c.optionsPickerFormId?.trim()) return 'listPicker';
  if (c.optionsAction?.trim()) return 'sqlSearch';
  if (c.optionsFrom?.trim()) return 'sqlCache';
  return 'static';
}

function valueField(c: FormControlDef): string {
  return c.optionsValueField?.trim() || 'value';
}

function labelField(c: FormControlDef): string {
  return c.optionsLabelField?.trim() || 'label';
}

function asLocalizedLabel(raw: unknown, fallback: string): LocalizedText {
  if (raw == null) return fallback;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { v?: unknown; e?: unknown; o?: unknown };
    if ('v' in o || 'e' in o || 'o' in o) {
      return {
        ...(typeof o.v === 'string' ? { v: o.v } : {}),
        ...(typeof o.e === 'string' ? { e: o.e } : {}),
        ...(typeof o.o === 'string' ? { o: o.o } : {}),
      };
    }
  }
  return String(raw);
}

export function rowsToSelectOptions(
  rows: Record<string, unknown>[] | undefined,
  c: FormControlDef,
): SelectOption[] {
  if (!rows?.length) return [];
  const vf = valueField(c);
  const lf = labelField(c);
  return rows.map((row, i) => {
    const value = row[vf] ?? row.id ?? row.code ?? i;
    const label = row[lf] ?? row.text ?? row.name ?? row.title ?? value;
    return { value: String(value), label: asLocalizedLabel(label, String(value)) };
  });
}

export function staticOptionsToSelect(c: FormControlDef): SelectOption[] {
  if (!Array.isArray(c.options)) return [];
  return c.options.map((opt) => {
    if (opt && typeof opt === 'object' && 'value' in (opt as object)) {
      const o = opt as { value: string; label?: LocalizedText };
      return {
        value: String(o.value),
        label: o.label != null ? asLocalizedLabel(o.label, String(o.value)) : String(o.value),
      };
    }
    const s = String(opt);
    return { value: s, label: s };
  });
}

/** static + sqlCache từ options / dataset. */
export function resolveSelectOptions(
  c: FormControlDef,
  datasets: Record<string, Record<string, unknown>[]>,
): SelectOption[] {
  const mode = resolveSelectOptionsMode(c);
  if (mode === 'static') return staticOptionsToSelect(c);
  if (mode === 'sqlCache' || mode === 'sqlSearch') {
    const ds = c.optionsFrom?.trim();
    if (ds) return rowsToSelectOptions(datasets[ds], c);
    return staticOptionsToSelect(c);
  }
  return staticOptionsToSelect(c);
}

/** Options đã resolve label theo lan (cho &lt;option&gt;). */
export function resolveSelectOptionsForLan(
  c: FormControlDef,
  datasets: Record<string, Record<string, unknown>[]>,
  lan: LangCode = 'v',
): { value: string; label: string }[] {
  return resolveSelectOptions(c, datasets).map((o) => ({
    value: o.value,
    label: resolveLocalizedText(o.label, lan) || o.value,
  }));
}

export function formatStaticOptionsText(c: FormControlDef): string {
  const opts = staticOptionsToSelect(c);
  if (!opts.length && Array.isArray(c.options)) {
    try {
      return JSON.stringify(c.options, null, 2);
    } catch {
      return '';
    }
  }
  return opts
    .map((o) => {
      const lb = resolveLocalizedText(o.label, 'v');
      return lb === o.value ? o.value : `${o.value}|${lb}`;
    })
    .join('\n');
}

export function parseStaticOptionsText(text: string): { value: string; label: LocalizedText }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1 && lines[0]!.startsWith('[')) {
    try {
      const parsed = JSON.parse(lines[0]!) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((opt) => {
          if (opt && typeof opt === 'object' && 'value' in (opt as object)) {
            const o = opt as { value: string; label?: LocalizedText };
            return {
              value: String(o.value),
              label: o.label != null ? asLocalizedLabel(o.label, String(o.value)) : String(o.value),
            };
          }
          const s = String(opt);
          return { value: s, label: s };
        });
      }
    } catch {
      /* fall through */
    }
  }
  return lines.map((line) => {
    const pipe = line.indexOf('|');
    if (pipe >= 0) {
      return { value: line.slice(0, pipe).trim(), label: line.slice(pipe + 1).trim() };
    }
    return { value: line, label: line };
  });
}
