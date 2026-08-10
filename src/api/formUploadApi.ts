import { getApiBase, getJwt, isJwtExpired } from './client';
import type { FormControlDef } from '../types/form';

export type FormUploadResult = {
  id: string;
  scope?: string;
  url?: string;
  status?: number;
  meta?: { client_name?: string; ext?: string; size_kb?: number };
  mock?: boolean;
};

/** Item đính kèm trong control values (file/image). */
export type FormFileItem = {
  id?: string;
  name: string;
  sizeKb?: number;
  url?: string;
  /** 0 = draft trên Files; 1 = active; -1 = pending local (onSave). */
  status?: number;
  localId?: string;
  /** blob: preview ảnh local (không serialize khi save JSON). */
  previewUrl?: string;
};

/** Control file → app-files; control image → app-images (resize 256). */
export const UPLOAD_SCOPE_FILE = 'app-files';
export const UPLOAD_SCOPE_IMAGE = 'app-images';
export const IMAGE_PREVIEW_SIZE = 256;

const pendingFiles = new Map<string, File>();
/** Cache preview thumb (blob:) theo file id — tránh tải file gốc mỗi lần. */
const imagePreviewCache = new Map<string, string>();

export function stashPendingFile(localId: string, file: File): void {
  pendingFiles.set(localId, file);
}

export function takePendingFile(localId: string): File | undefined {
  const f = pendingFiles.get(localId);
  pendingFiles.delete(localId);
  return f;
}

export function peekPendingFile(localId: string): File | undefined {
  return pendingFiles.get(localId);
}

export function revokePreviewUrl(url?: string): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function getCachedImagePreviewUrl(fileId: string): string | undefined {
  const id = fileId.trim();
  return id ? imagePreviewCache.get(id) : undefined;
}

export function invalidateImagePreviewCache(fileId?: string | null): void {
  const id = (fileId ?? '').trim();
  if (!id) return;
  const url = imagePreviewCache.get(id);
  if (url) {
    revokePreviewUrl(url);
    imagePreviewCache.delete(id);
  }
}

function filesBaseUrl(): string {
  const base = (import.meta.env.VITE_FILES_BASE_URL as string | undefined)?.trim().replace(/\/$/, '');
  return base || 'http://localhost:5200';
}

/** Xóa draft status=0 trên Files (sysfileinfo + disk). status≠0 thì bỏ qua. */
export async function deleteDraftFormFile(slug: string, fileId: string): Promise<boolean> {
  const id = fileId.trim();
  if (!id) return false;
  const headers = new Headers();
  const jwt = getJwt();
  if (jwt && !isJwtExpired(jwt)) headers.set('Authorization', `Bearer ${jwt}`);
  const url = `${getApiBase()}/v1/form/runtime/apps/${encodeURIComponent(slug)}/files/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { method: 'DELETE', headers, credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * URL file tuyệt đối. Relative `/api/files/...` → ghép `VITE_FILES_BASE_URL`
 * (cùng Form:Files:BaseUrl). Upload API đã trả absolute; helper cho value cũ.
 */
export function resolveFileHref(url?: string | null, fileId?: string | null): string | undefined {
  const raw = (url ?? '').trim();
  const id = (fileId ?? '').trim();
  let path = raw;
  if (!path && id) path = `/api/files/${id}`;
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith('blob:')) return path;

  const base = filesBaseUrl();
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export function extractAccessTokenFromUrl(url?: string | null): string | undefined {
  const raw = (url ?? '').trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw, 'http://local.invalid');
    const t = u.searchParams.get('t');
    return t?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** URL thumb 256 trên File.Api (không phải file gốc). */
export function resolveImagePreviewHref(
  fileId: string,
  accessToken?: string | null,
): string | undefined {
  const id = fileId.trim();
  if (!id) return undefined;
  const base = filesBaseUrl();
  let path = `/api/files/${encodeURIComponent(id)}/image/${IMAGE_PREVIEW_SIZE}`;
  const t = (accessToken ?? '').trim();
  if (t) path += `?t=${encodeURIComponent(t)}`;
  return `${base}${path}`;
}

/**
 * Tải thumb 256 → blob URL, cache theo fileId.
 * Ưu tiên ?t= từ upload access-link; không có thì Bearer JWT.
 */
export async function loadImagePreviewBlob(
  fileId: string,
  accessToken?: string | null,
): Promise<string | undefined> {
  const id = fileId.trim();
  if (!id) return undefined;
  const hit = imagePreviewCache.get(id);
  if (hit) return hit;

  const href = resolveImagePreviewHref(id, accessToken);
  if (!href) return undefined;

  const headers = new Headers();
  if (!accessToken?.trim()) {
    const jwt = getJwt();
    if (jwt && !isJwtExpired(jwt)) headers.set('Authorization', `Bearer ${jwt}`);
  }

  const res = await fetch(href, { method: 'GET', headers, credentials: 'include' });
  if (!res.ok) return undefined;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && blob.size <= 0) return undefined;
  const url = URL.createObjectURL(blob);
  imagePreviewCache.set(id, url);
  return url;
}

export function uploadScopeForKind(kind: 'file' | 'image'): string {
  return kind === 'image' ? UPLOAD_SCOPE_IMAGE : UPLOAD_SCOPE_FILE;
}

/** Upload 1 file qua Form.Api. image → app-images; file → app-files. draft=true → status=0. */
export async function uploadFormFile(
  slug: string,
  file: File,
  opts?: { scope?: string; draft?: boolean; kind?: 'file' | 'image' },
): Promise<FormUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const scope =
    opts?.scope?.trim() ||
    (opts?.kind ? uploadScopeForKind(opts.kind) : UPLOAD_SCOPE_FILE);
  form.append('scope', scope);
  form.append('draft', opts?.draft ? 'true' : 'false');

  const headers = new Headers();
  const jwt = getJwt();
  if (jwt && !isJwtExpired(jwt)) headers.set('Authorization', `Bearer ${jwt}`);

  const url = `${getApiBase()}/v1/form/runtime/apps/${encodeURIComponent(slug)}/upload`;
  const res = await fetch(url, { method: 'POST', headers, body: form, credentials: 'include' });
  const text = await res.text();
  let body: { success?: boolean; data?: FormUploadResult; error?: string } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok || !body?.success || !body.data?.id) {
    throw new Error(body?.error || `Upload thất bại (HTTP ${res.status})`);
  }
  return body.data;
}

export function parseAttachments(value: unknown): FormFileItem[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    const out: FormFileItem[] = [];
    for (const x of value) {
      if (typeof x === 'string') {
        const id = x.trim();
        if (id) out.push({ id, name: id, status: 1 });
        continue;
      }
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const name = String(o.name ?? o.client_name ?? o.id ?? '').trim();
        const id = o.id != null ? String(o.id).trim() : undefined;
        if (!name && !id) continue;
        out.push({
          id: id || undefined,
          name: name || id || 'file',
          sizeKb: typeof o.sizeKb === 'number' ? o.sizeKb : Number(o.size_kb) || undefined,
          url: o.url != null ? String(o.url) : undefined,
          status: typeof o.status === 'number' ? o.status : o.localId ? -1 : 1,
          localId: o.localId != null ? String(o.localId) : undefined,
          previewUrl: o.previewUrl != null ? String(o.previewUrl) : undefined,
        });
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    try {
      return parseAttachments(JSON.parse(s));
    } catch {
      return s
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => ({ id, name: id, status: 1 }));
    }
  }
  return [];
}

/** Serialize để lưu values (bỏ blob previewUrl). */
export function serializeAttachments(items: FormFileItem[]): FormFileItem[] {
  return items.map(({ previewUrl: _p, ...rest }) => rest);
}

export function parseFileIds(value: unknown): string[] {
  return parseAttachments(value)
    .map((x) => x.id)
    .filter((id): id is string => !!id);
}

export function acceptAttrFromExtensions(accept?: string | null, fallback?: string): string {
  const raw = (accept ?? fallback ?? '').trim();
  if (!raw) return '';
  return raw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith('.') ? x : `.${x.replace(/^\./, '')}`))
    .join(',');
}

export function formatSizeKb(sizeKb?: number): string {
  if (sizeKb == null || !Number.isFinite(sizeKb)) return '';
  if (sizeKb < 1024) return `${sizeKb.toFixed(sizeKb < 10 ? 2 : 0)} KB`;
  return `${(sizeKb / 1024).toFixed(2)} MB`;
}

export function resolveUploadMode(raw?: string | null): 'immediate' | 'onSave' {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'onsave' || s === 'on_save' || s === 'save' || s === 'deferred') return 'onSave';
  return 'immediate';
}

/**
 * Upload toàn bộ file pending (uploadMode=onSave) trên form.
 * Gọi trước khi save SQL / submit.
 * Trả values đã thay localId → fileId (status=1).
 */
export async function uploadPendingFormAttachments(
  slug: string,
  values: Record<string, unknown>,
  controls: FormControlDef[],
): Promise<Record<string, unknown>> {
  const next = { ...values };
  for (const c of controls) {
    if (c.type !== 'file' && c.type !== 'image') continue;
    if (resolveUploadMode(c.uploadMode) !== 'onSave') continue;
    const items = parseAttachments(next[c.id]);
    if (!items.some((x) => x.localId && !x.id)) continue;
    const kind = c.type === 'image' ? 'image' : 'file';
    const uploaded: FormFileItem[] = [];
    for (const item of items) {
      if (item.id || !item.localId) {
        uploaded.push(item);
        continue;
      }
      const file = takePendingFile(item.localId);
      if (!file) {
        uploaded.push(item);
        continue;
      }
      const up = await uploadFormFile(slug, file, { draft: false, kind });
      revokePreviewUrl(item.previewUrl);
      const sizeKb =
        up.meta?.size_kb ??
        item.sizeKb ??
        Math.max(1, Math.ceil(file.size / 1024));
      uploaded.push({
        id: up.id,
        name: up.meta?.client_name || item.name || file.name,
        sizeKb,
        url: up.url,
        status: up.status ?? 1,
      });
    }
    next[c.id] = serializeAttachments(uploaded);
  }
  return next;
}
