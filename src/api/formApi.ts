import { apiFetch, type ApiResult } from './client';
import {
  getRuntimeCache,
  setRuntimeCache,
} from '../lib/formRuntimeCache';

/** Dev: luôn fetch JSON mới từ Form.Api (tránh localStorage giữ spec cũ sau khi sửa Content/MobileForms). */
const useRuntimeFormCache = !import.meta.env.DEV;
import type {
  AdminAppSummary,
  ClientFormDto,
  RuntimeActionResponse,
  RuntimeAppResponse,
} from '../types/form';

export async function fetchRuntimeApp(slug: string, preview = false): Promise<ApiResult<RuntimeAppResponse>> {
  const cacheParts = ['app', slug, preview ? '1' : '0'];
  if (useRuntimeFormCache && !preview) {
    const hit = getRuntimeCache<RuntimeAppResponse>(cacheParts);
    if (hit) return { success: true, data: hit };
  }

  const q = preview ? '?preview=true' : '';
  const res = await apiFetch<RuntimeAppResponse>(
    `/v1/form/runtime/apps/${encodeURIComponent(slug)}${q}`,
  );
  if (useRuntimeFormCache && !preview && res.success && res.data) {
    setRuntimeCache(cacheParts, res.data);
  }
  return res;
}

export async function fetchRuntimeForm(
  slug: string,
  formId: string,
  preview = false,
  cacheBust?: number | string,
) {
  type FormPayload = {
    form: ClientFormDto;
    datasets?: Record<string, Record<string, unknown>[]>;
    values?: Record<string, unknown>;
    state?: Record<string, unknown>;
  };
  const cacheParts = ['form', slug, formId, preview ? '1' : '0'];
  if (useRuntimeFormCache && !preview) {
    const hit = getRuntimeCache<FormPayload>(cacheParts);
    if (hit) return { success: true as const, data: hit };
  }

  const params = new URLSearchParams();
  if (preview) params.set('preview', 'true');
  if (cacheBust != null && cacheBust !== '') params.set('_', String(cacheBust));
  const q = params.toString() ? `?${params}` : '';
  const res = await apiFetch<FormPayload>(
    `/v1/form/runtime/apps/${encodeURIComponent(slug)}/forms/${encodeURIComponent(formId)}${q}`,
  );
  if (useRuntimeFormCache && !preview && res.success && res.data) {
    setRuntimeCache(cacheParts, res.data);
  }
  return res;
}

export async function runAction(
  slug: string,
  actionId: string,
  body: {
    formId: string;
    controlValues?: Record<string, unknown>;
    state?: Record<string, unknown>;
    rowContext?: Record<string, unknown>;
  },
) {
  return apiFetch<RuntimeActionResponse>(
    `/v1/form/runtime/apps/${encodeURIComponent(slug)}/actions/${encodeURIComponent(actionId)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function listAdminApps() {
  return apiFetch<AdminAppSummary[]>('/v1/form/admin/apps');
}

export async function getAdminApp(id: string) {
  return apiFetch<{
    app: {
      id: string;
      slug: string;
      title: string;
      status: string;
      entryFormId: string;
      connectionKey: string;
      forms: { id: string; file: string }[];
    };
    formIds: string[];
    contentRoot?: string;
    contentSource?: string;
  }>(`/v1/form/admin/apps/${encodeURIComponent(id)}`);
}

export async function createAdminApp(body: { slug: string; title: string }) {
  return apiFetch<AdminAppSummary>('/v1/form/admin/apps', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchAdminApp(
  id: string,
  body: { title?: string; status?: string; entryFormId?: string },
) {
  return apiFetch<AdminAppSummary>(`/v1/form/admin/apps/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function getAdminForm(id: string, formId: string) {
  return apiFetch<{
    formId: string;
    file?: string;
    relativePath?: string;
    fileId?: string;
    fileName?: string;
    contentSource?: string;
    filesBaseUrl?: string;
    folderId?: string;
    json: unknown;
  }>(`/v1/form/admin/apps/${encodeURIComponent(id)}/forms/${encodeURIComponent(formId)}`);
}

export type FormContentLocation = {
  contentSource: string;
  relativePath: string;
  file?: string;
  fileId?: string;
  fileName?: string;
  filesBaseUrl?: string;
  folderId?: string;
};

export async function putAdminForm(id: string, formId: string, json: unknown) {
  return apiFetch<{ formId: string; saved: boolean; location?: FormContentLocation }>(
    `/v1/form/admin/apps/${encodeURIComponent(id)}/forms/${encodeURIComponent(formId)}`,
    { method: 'PUT', body: JSON.stringify({ json }) },
  );
}

export async function getAdminShared(id: string) {
  return apiFetch<{
    actions: Record<string, Record<string, unknown>>;
    fragments: Record<string, unknown>;
  }>(`/v1/form/admin/apps/${encodeURIComponent(id)}/shared`);
}

export async function putAdminShared(
  id: string,
  body: {
    actions?: Record<string, Record<string, unknown>>;
    fragments?: Record<string, unknown>;
  },
) {
  return apiFetch<{ saved: boolean }>(`/v1/form/admin/apps/${encodeURIComponent(id)}/shared`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function createAdminForm(
  id: string,
  body: { id: string; title?: string; template?: 'blank' | 'picker' | 'list' },
) {
  return apiFetch<{
    app: AdminAppSummary;
    formId: string;
    form: unknown;
  }>(`/v1/form/admin/apps/${encodeURIComponent(id)}/forms`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
