import type { FormControlDef, FormListDef, FormPcLayout } from './form';
import type { LocalizedText } from '../lib/localizedText';

/** Full form.json (giữ nguyên actions SQL khi round-trip Design ↔ JSON). */
export type FormDocument = {
  id: string;
  title: LocalizedText;
  /** stack (form) | list (list-only) | drawer (Appdrawer) */
  layout?: string;
  /** view | new | edit — mặc định khi mở form. */
  defaultFormMode?: string;
  /** Overlay layout PC (opt-in). Mobile bỏ qua. */
  pc?: FormPcLayout;
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
  const raw = v as FormDocument;
  return {
    id: raw.id,
    title: raw.title,
    layout: raw.layout ?? 'stack',
    defaultFormMode: typeof raw.defaultFormMode === 'string' ? raw.defaultFormMode : undefined,
    pc: raw.pc && typeof raw.pc === 'object' ? raw.pc : undefined,
    controls: Array.isArray(raw.controls) ? (raw.controls as FormControlDef[]) : [],
    lists: Array.isArray(raw.lists) ? (raw.lists as FormListDef[]) : [],
    datasets: raw.datasets && typeof raw.datasets === 'object' ? (raw.datasets as Record<string, string>) : {},
    onLoad: Array.isArray(raw.onLoad) ? (raw.onLoad as string[]) : [],
    actions:
      raw.actions && typeof raw.actions === 'object'
        ? (raw.actions as Record<string, Record<string, unknown>>)
        : {},
  };
}
