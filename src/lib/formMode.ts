import type { ClientFormDto, FormControlDef, FormMode } from '../types/form';
import { getJwt, decodeJwtPayload } from '../api/client';
import { isFormDebugEnabled } from './formDebug';

function isJwtAdmin(): boolean {
  const jwt = getJwt();
  if (!jwt) return false;
  const claims = decodeJwtPayload(jwt);
  const raw = claims?.is_admin;
  return raw === true || raw === '1' || raw === 'true';
}

/** Chuẩn hóa formMode; alias create/add → new, update → edit. Mặc định view. */
export function normalizeFormMode(raw?: string | null): FormMode {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'new' || s === 'create' || s === 'add') return 'new';
  if (s === 'edit' || s === 'update') return 'edit';
  return 'view';
}

export function resolveFormMode(
  explicit?: string | null,
  formDefault?: string | null,
): FormMode {
  if (explicit != null && String(explicit).trim() !== '') return normalizeFormMode(explicit);
  return normalizeFormMode(formDefault);
}

/** Áp defaultValue khi NEW. Number → 0; time → 00:00; file/image → []. */
export function applyDefaultValues(
  form: ClientFormDto,
  values: Record<string, unknown>,
  formMode: FormMode,
): Record<string, unknown> {
  const next = { ...values };
  for (const c of form.controls) {
    const cur = next[c.id];
    const emptyScalar = cur === undefined || cur === null || cur === '';
    if (c.type === 'number' && emptyScalar) {
      if (formMode === 'new' && c.defaultValue !== undefined && c.defaultValue !== null) {
        next[c.id] = c.defaultValue;
      } else {
        next[c.id] = 0;
      }
      continue;
    }
    if (c.type === 'time' && emptyScalar) {
      if (formMode === 'new' && c.defaultValue !== undefined && c.defaultValue !== null) {
        next[c.id] = c.defaultValue;
      }
      // Không ép 00:00 — TimePicker để trống (--:--) đến khi chọn.
      continue;
    }
    if ((c.type === 'file' || c.type === 'image') && emptyScalar) {
      next[c.id] = [];
      continue;
    }
    if (formMode !== 'new') continue;
    if (c.defaultValue === undefined || c.defaultValue === null) continue;
    if (emptyScalar) next[c.id] = c.defaultValue;
  }
  return next;
}

export function isControlVisible(c: FormControlDef, formMode: FormMode): boolean {
  if (c.visible === false) return false;
  const when = (c.visibleWhen ?? '').trim().toLowerCase();
  if (when === 'debug' && !isFormDebugEnabled()) return false;
  if (when === 'admin' && !isJwtAdmin()) return false;
  const modes = c.visibleModes;
  if (!modes?.length) return true;
  return modes.some((m) => normalizeFormMode(m) === formMode);
}

/** VIEW: khóa nhập; NEW/EDIT: theo enabled. */
export function isControlEditable(c: FormControlDef, formMode: FormMode, busy: boolean): boolean {
  if (busy) return false;
  if (c.enabled === false) return false;
  if (formMode === 'view') return false;
  return true;
}
