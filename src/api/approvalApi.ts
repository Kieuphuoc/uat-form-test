import { getJwt, isJwtExpired } from './client';
import type {
  DecideTaskRequest,
  SaveDefinitionRequest,
  StartApprovalRequest,
  WfDefinitionDetail,
  WfDefinitionRow,
  WfInstanceDetail,
  WfTaskRow,
} from '../types/approval';

export class ApprovalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApprovalApiError';
    this.status = status;
  }
}

/** Approval.Api riêng (không qua Form.Api). Mặc định :5410 — tránh trùng Chat :5400. */
export function getApprovalApiBase(): string {
  const v = (import.meta.env.VITE_APPROVAL_API_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : 'http://localhost:5410').replace(/\/$/, '');
}

function getApprovalStaticToken(): string {
  const v = (import.meta.env.VITE_APPROVAL_STATIC_TOKEN as string | undefined)?.trim();
  return v && v.length > 0 ? v : 'static-approval-dev-change-me';
}

async function approvalFetch<T>(
  path: string,
  init?: RequestInit,
  auth: 'jwt' | 'static' = 'jwt',
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth === 'static') {
    headers.set('Authorization', `Bearer ${getApprovalStaticToken()}`);
  } else {
    const jwt = getJwt();
    if (!jwt || isJwtExpired(jwt)) {
      throw new ApprovalApiError('Phiên đăng nhập đã hết hạn.', 401);
    }
    headers.set('Authorization', `Bearer ${jwt}`);
  }

  const res = await fetch(`${getApprovalApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      (body as { message?: string })?.message || `Approval API lỗi (HTTP ${res.status}).`;
    throw new ApprovalApiError(message, res.status);
  }

  return body as T;
}

export const approvalApi = {
  listDefinitions: (opts?: { code?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.code?.trim()) qs.set('code', opts.code.trim());
    if (opts?.status?.trim()) qs.set('status', opts.status.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return approvalFetch<{ items: WfDefinitionRow[] }>(`/api/approvals/definitions${suffix}`).then(
      (r) => r.items ?? [],
    );
  },

  getDefinition: (id: number) =>
    approvalFetch<WfDefinitionDetail>(`/api/approvals/definitions/${id}`),

  createDefinition: (body: SaveDefinitionRequest) =>
    approvalFetch<WfDefinitionDetail>('/api/approvals/definitions', {
      method: 'POST',
      body: JSON.stringify({ ...body, id: null }),
    }),

  updateDefinition: (id: number, body: SaveDefinitionRequest) =>
    approvalFetch<WfDefinitionDetail>(`/api/approvals/definitions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...body, id }),
    }),

  publishDefinition: (id: number) =>
    approvalFetch<WfDefinitionDetail>(`/api/approvals/definitions/${id}/publish`, {
      method: 'POST',
    }),

  start: (body: StartApprovalRequest) =>
    approvalFetch<WfInstanceDetail>(
      '/api/internal/approvals/start',
      { method: 'POST', body: JSON.stringify(body) },
      'static',
    ),

  getInstance: (id: number) =>
    approvalFetch<WfInstanceDetail>(`/api/approvals/instances/${id}`),

  inbox: (status = 'pending') => {
    const qs = new URLSearchParams({ status });
    return approvalFetch<{ items: WfTaskRow[] }>(`/api/approvals/tasks/inbox?${qs}`).then(
      (r) => r.items ?? [],
    );
  },

  decide: (taskId: number, body: DecideTaskRequest) =>
    approvalFetch<WfInstanceDetail>(`/api/approvals/tasks/${taskId}/decide`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
