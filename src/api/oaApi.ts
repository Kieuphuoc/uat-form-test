import { getJwt, isJwtExpired } from './client';
import { ChatApiError, getChatApiBase } from './chatApi';

export type OaConversation = {
  id: number;
  contact_id: number;
  oa_id: string;
  zalo_user_id: string;
  arito_user_id?: number | null;
  title: string;
  avatar_url?: string | null;
  is_following: boolean;
  followed_at?: string | null;
  unfollowed_at?: string | null;
  last_oa?: string | null;
  window_expires_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  outbound_window_count: number;
  outbound_limit: number;
  can_send: boolean;
  send_block_reason?: string | null;
  status: string;
  assigned_user_id?: number | null;
  last_message_id: number;
  last_message_at?: string | null;
  last_preview?: string | null;
  last_direction?: string | null;
  unread_count: number;
};

export type OaMessage = {
  id: number;
  thread_id: number;
  direction: 'inbound' | 'outbound' | string;
  sender_type: 'user' | 'agent' | 'system' | string;
  sender_user_id?: number | null;
  msg_type: string;
  body?: string | null;
  zalo_msg_id?: string | null;
  client_msg_id?: string | null;
  sender_name?: string | null;
  sender_avatar_id?: string | null;
  sender_avatar_url?: string | null;
  sender_is_me: boolean;
  created_at: string;
};

export type OaConversationOpen = {
  conversation: OaConversation;
  messages: OaMessage[];
  has_more: boolean;
};

async function oaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) {
    throw new ChatApiError('Phiên đăng nhập đã hết hạn.', 401);
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${jwt}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${getChatApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: unknown }).message || '')
        : '';
    throw new ChatApiError(message || `OA API lỗi (HTTP ${res.status}).`, res.status);
  }
  return body as T;
}

export const oaApi = {
  listConversations: (opts?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.search?.trim()) qs.set('search', opts.search.trim());
    if (opts?.page) qs.set('page', String(opts.page));
    if (opts?.pageSize) qs.set('page_size', String(opts.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return oaFetch<{ items: OaConversation[] }>(`/api/chat/oa/conversations${suffix}`).then(
      (r) => r.items ?? [],
    );
  },

  openConversation: (id: number, limit = 50) =>
    oaFetch<OaConversationOpen>(`/api/chat/oa/conversations/${id}/open?limit=${limit}`),

  listMessages: (id: number, opts?: { beforeId?: number; afterId?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.beforeId) qs.set('before_id', String(opts.beforeId));
    if (opts?.afterId) qs.set('after_id', String(opts.afterId));
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return oaFetch<{ items: OaMessage[] }>(`/api/chat/oa/conversations/${id}/messages${suffix}`).then(
      (r) => r.items ?? [],
    );
  },

  sendMessage: (id: number, text: string) =>
    oaFetch<OaMessage>(`/api/chat/oa/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, client_msg_id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }),
    }),

  markRead: (id: number, messageId?: number) =>
    oaFetch<{ last_read_message_id: number }>(`/api/chat/oa/conversations/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId }),
    }),
};
