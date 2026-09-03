import { getJwt, isJwtExpired } from './client';
import {
  ChatApiError,
  getChatApiBase,
  type ChatAttachmentList,
  type ConversationNotifyMode,
} from './chatApi';

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
  last_read_message_id?: number;
  notify_mode?: ConversationNotifyMode | string | null;
  ai_bot_folder_id?: string | null;
  ai_enabled?: boolean | null;
  ai_effective?: boolean;
  default_bot_folder_id?: string | null;
  auto_reply_delay_seconds?: number;
  ai_pending?: boolean;
  active_bot_folder_id?: string | null;
  active_bot_title?: string | null;
  active_bot_avatar_url?: string | null;
  active_bot_until?: string | null;
};

export type OaContact = {
  id: number;
  conversation_id?: number | null;
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
  last_message_at?: string | null;
  last_preview?: string | null;
  unread_count: number;
};

export type OaMessage = {
  id: number;
  thread_id: number;
  direction: 'inbound' | 'outbound' | string;
  sender_type: 'user' | 'agent' | 'system' | 'bot' | string;
  sender_user_id?: number | null;
  msg_type: string;
  body?: string | null;
  zalo_msg_id?: string | null;
  client_msg_id?: string | null;
  sender_name?: string | null;
  sender_avatar_id?: string | null;
  sender_avatar_url?: string | null;
  file_id?: string | null;
  file_name?: string | null;
  file_content_type?: string | null;
  file_size_bytes?: number | null;
  attachment_url?: string | null;
  sender_is_me: boolean;
  created_at: string;
  /** Chỉ phía client: tin vừa gửi, chưa có id server. */
  send_status?: 'sending' | 'failed';
  quote_zalo_msg_id?: string | null;
  reply_to_message_id?: number | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
  reply_msg_type?: string | null;
};

export type OaConversationOpen = {
  conversation: OaConversation;
  messages: OaMessage[];
  has_more: boolean;
};

export function nextOaNotifyMode(current?: string | null): ConversationNotifyMode {
  return current === 'mute' ? 'all' : 'mute';
}

async function oaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) {
    throw new ChatApiError('Phiên đăng nhập đã hết hạn.', 401);
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${jwt}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

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

async function oaFetchBlob(path: string): Promise<Blob> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) {
    throw new ChatApiError('Phiên đăng nhập đã hết hạn.', 401);
  }
  const res = await fetch(`${getChatApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new ChatApiError(`Không tải được file OA (HTTP ${res.status}).`, res.status);
  return res.blob();
}

export const oaApi = {
  listConversations: (opts?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.search?.trim()) qs.set('search', opts.search.trim());
    if (opts?.page) qs.set('page', String(opts.page));
    if (opts?.pageSize) qs.set('page_size', String(opts.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return oaFetch<{ items: OaConversation[]; has_more?: boolean }>(
      `/api/chat/oa/conversations${suffix}`,
    ).then((r) => ({
      items: r.items ?? [],
      has_more: !!r.has_more,
    }));
  },

  listContacts: (opts?: { search?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.search?.trim()) qs.set('search', opts.search.trim());
    if (opts?.page) qs.set('page', String(opts.page));
    if (opts?.pageSize) qs.set('page_size', String(opts.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return oaFetch<{ items: OaContact[] }>(`/api/chat/oa/contacts${suffix}`).then(
      (r) => r.items ?? [],
    );
  },

  openContact: (contactId: number) =>
    oaFetch<OaConversation>(`/api/chat/oa/contacts/${contactId}/open`, {
      method: 'POST',
    }),

  openConversation: (id: number, limit = 50) =>
    oaFetch<OaConversationOpen>(`/api/chat/oa/conversations/${id}/open?limit=${limit}`),

  syncConversation: (id: number, limit = 50) =>
    oaFetch<OaConversationOpen>(`/api/chat/oa/conversations/${id}/sync?limit=${limit}`, {
      method: 'POST',
    }),

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

  sendMessage: (id: number, text: string, clientMsgId?: string, replyToMessageId?: number | null) =>
    oaFetch<OaMessage>(`/api/chat/oa/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        client_msg_id: clientMsgId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        reply_to_message_id: replyToMessageId ?? null,
      }),
    }),

  sendAttachment: (id: number, file: File, clientMsgId?: string) => {
    const body = new FormData();
    body.append('file', file, file.name);
    if (clientMsgId) body.append('client_msg_id', clientMsgId);
    return oaFetch<OaMessage>(`/api/chat/oa/conversations/${id}/attachments`, {
      method: 'POST',
      body,
    });
  },

  listAttachments: (threadId: number, limit = 10) =>
    oaFetch<ChatAttachmentList>(
      `/api/chat/oa/conversations/${threadId}/attachments?limit=${limit}`,
    ),

  attachmentBlob: (threadId: number, fileId: string, size = 0) =>
    oaFetchBlob(
      `/api/chat/oa/conversations/${threadId}/attachments/${encodeURIComponent(fileId)}/content${
        size > 0 ? `?size=${size}` : ''
      }`,
    ),

  markRead: (id: number, messageId?: number) =>
    oaFetch<{ last_read_message_id: number }>(`/api/chat/oa/conversations/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId }),
    }),

  markAllRead: () =>
    oaFetch<{ affected: number }>(`/api/chat/oa/conversations/read-all`, {
      method: 'POST',
    }),

  setNotifyMode: (id: number, notifyMode: ConversationNotifyMode) =>
    oaFetch<{ notify_mode: ConversationNotifyMode }>(`/api/chat/oa/conversations/${id}/notify`, {
      method: 'PUT',
      body: JSON.stringify({ notify_mode: notifyMode }),
    }),

  setAi: (id: number, body: { bot_folder_id?: string | null; enabled?: boolean | null }) =>
    oaFetch<OaConversation>(`/api/chat/oa/conversations/${id}/ai`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  triggerAiReply: (id: number) =>
    oaFetch<OaMessage>(`/api/chat/oa/conversations/${id}/ai/reply`, {
      method: 'POST',
    }),
};
