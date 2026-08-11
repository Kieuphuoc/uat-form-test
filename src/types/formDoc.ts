import type { FormControlDef, FormListDef } from './form';
import type { LocalizedText } from '../lib/localizedText';

/** Full form.json (giữ nguyên actions SQL khi round-trip Design ↔ JSON). */
export type FormDocument = {
  id: string;
  title: LocalizedText;
  /** stack (form) | list (list-only) | drawer (Appdrawer) */
  layout?: string;
  /** view | new | edit — mặc định khi mở form. */
  defaultFormMode?: string;
  controls: FormControlDef[];
  lists: FormListDef[];
  datasets?: Record<string, string>;
  onLoad?: string[];
  actions?: Record<string, Record<string, unknown>>;
};

export type DesignSelection =
  | { kind: 'form' }
  | { kind: 'control'; id: string }
  | { kind: 'list'; id: string }
  | { kind: 'column'; listId: string; field: string };

export const CONTROL_TYPES = [
  'label',
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'color',
  'file',
  'image',
  'maps',
  'select',
  'button',
  'iconButton',
  'hidden',
] as const;

export type ControlType = (typeof CONTROL_TYPES)[number];

function isLocalizedText(v: unknown): boolean {
  if (typeof v === 'string') return true;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return 'v' in o || 'e' in o || 'o' in o;
}

export function isFormDocument(v: unknown): v is FormDocument {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && isLocalizedText(o.title) && Array.isArray(o.controls);
}

export function parseFormDocument(v: unknown): FormDocument | null {
  if (!isFormDocument(v)) return null;
  return {
    id: v.id,
    title: v.title,
    layout: v.layout ?? 'stack',
    defaultFormMode:
      typeof (v as FormDocument).defaultFormMode === 'string'
        ? (v as FormDocument).defaultFormMode
        : undefined,
    controls: Array.isArray(v.controls) ? (v.controls as FormControlDef[]) : [],
    lists: Array.isArray(v.lists) ? (v.lists as FormListDef[]) : [],
    datasets: v.datasets && typeof v.datasets === 'object' ? (v.datasets as Record<string, string>) : {},
    onLoad: Array.isArray(v.onLoad) ? (v.onLoad as string[]) : [],
    actions:
      v.actions && typeof v.actions === 'object'
        ? (v.actions as Record<string, Record<string, unknown>>)
        : {},
  };
}
