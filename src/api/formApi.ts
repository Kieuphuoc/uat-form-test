import { apiFetch, type ApiResult } from './client';
import {
  getRuntimeCache,
  setRuntimeCache,
} from '../lib/formRuntimeCache';
import type {
  AdminAppSummary,
  ClientFormDto,
  RuntimeActionResponse,
  RuntimeAppResponse,
} from '../types/form';

export async function fetchRuntimeApp(slug: string, preview = false): Promise<ApiResult<RuntimeAppResponse>> {
  const cacheParts = ['app', slug, preview ? '1' : '0'];
  if (!preview) {
    const hit = getRuntimeCache<RuntimeAppResponse>(cacheParts);
    if (hit) return { success: true, data: hit };
  }

  const q = preview ? '?preview=true' : '';
  const res = await apiFetch<RuntimeAppResponse>(
    `/v1/form/runtime/apps/${encodeURIComponent(slug)}${q}`,
  );
  if (!preview && res.success && res.data) {
    setRuntimeCache(cacheParts, res.data);
  }
  return res;
}

export async function fetchRuntimeForm(slug: string, formId: string, preview = false) {
  type FormPayload = {
    form: ClientFormDto;
    datasets?: Record<string, Record<string, unknown>[]>;
    values?: Record<string, unknown>;
    state?: Record<string, unknown>;
  };
  const cacheParts = ['form', slug, formId, preview ? '1' : '0'];
  if (!preview) {
    const hit = getRuntimeCache<FormPayload>(cacheParts);
    if (hit) return { success: true as const, data: hit };
  }

  const q = preview ? '?preview=true' : '';
  const res = await apiFetch<FormPayload>(
    `/v1/form/runtime/apps/${encodeURIComponent(slug)}/forms/${encodeURIComponent(formId)}${q}`,
  );
  if (!preview && res.success && res.data) {
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
    path?: string;
    contentRoot?: string;
    contentSource?: string;
    json: unknown;
  }>(`/v1/form/admin/apps/${encodeURIComponent(id)}/forms/${encodeURIComponent(formId)}`);
}

export async function putAdminForm(id: string, formId: string, json: unknown) {
  return apiFetch<{ formId: string; saved: boolean }>(
    `/v1/form/admin/apps/${encodeURIComponent(id)}/forms/${encodeURIComponent(formId)}`,
    { method: 'PUT', body: JSON.stringify({ json }) },
  );
}
