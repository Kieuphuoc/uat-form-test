import { getJwt, isJwtExpired } from './client';

/**
 * Chat.Api là service riêng (không qua Form.Api) → base URL riêng, trả JSON thuần
 * (không bọc {success,data} như Form.Api).
 */
export function getChatApiBase(): string {
  const v = (import.meta.env.VITE_CHAT_API_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : 'http://localhost:5400').replace(/\/$/, '');
}

function getFilesBase(): string {
  const v = (import.meta.env.VITE_FILES_BASE_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : '').replace(/\/$/, '');
}

function getFilesWebBase(): string {
  const v = (import.meta.env.VITE_FILES_WEB_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : '').replace(/\/$/, '');
}

/** Avatar AritoID qua File.Api. Không có avatar_id → null, UI dùng chữ cái đầu. */
export function chatAvatarUrl(avatarId?: string | null): string | null {
  const id = avatarId?.trim();
  const base = getFilesBase();
  if (!id || !base) return null;
  return `${base}/api/avatar?avatar_id=${encodeURIComponent(id)}`;
}

function chatFilesWebUrl(fileId: string, embedded: boolean): string | null {
  const id = fileId?.trim();
  const base = getFilesWebBase();
  if (!id || !base) return null;
  const viewPath = embedded
    ? `/view/${encodeURIComponent(id)}?embed=popup&hidden-navbar=true&toolbar=0`
    : `/view/${encodeURIComponent(id)}`;
  const jwt = getJwt();
  if (jwt && !isJwtExpired(jwt)) {
    return `${base}/auth/handoff?returnUrl=${encodeURIComponent(viewPath)}#token=${encodeURIComponent(jwt)}`;
  }
  return `${base}${viewPath}`;
}

/** Preview files-web iframe (handoff JWT nếu cross-origin). */
export function chatFilePreviewUrl(fileId: string): string | null {
  return chatFilesWebUrl(fileId, true);
}

/** Mở files-web đầy đủ toolbar trong tab mới. */
export function chatFileFullViewUrl(fileId: string): string | null {
  return chatFilesWebUrl(fileId, false);
}

function folderSlug(name?: string | null): string {
  const base = (name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'folder';
}

/** Mở folder file của hội thoại trên files-web (`/app/s/{slug}--{folderId}`). */
export function chatFolderUrl(folderId?: string | null, folderName?: string | null): string | null {
  const id = folderId?.trim();
  const base = getFilesWebBase();
  if (!id || !base) return null;
  const path = `/app/s/${encodeURIComponent(`${folderSlug(folderName)}--${id}`)}`;
  const jwt = getJwt();
  if (jwt && !isJwtExpired(jwt)) {
    return `${base}/auth/handoff?returnUrl=${encodeURIComponent(path)}#token=${encodeURIComponent(jwt)}`;
  }
  return `${base}${path}`;
}

export function chatAttachmentContentUrl(conversationId: number, fileId: string): string {
  return `${getChatApiBase()}/api/chat/conversations/${conversationId}/attachments/${encodeURIComponent(fileId)}/content`;
}

export type ChatMe = {
  user_id: number;
  is_admin: boolean;
  unit_id?: number;
  nickname?: string | null;
  email?: string | null;
  avatar_id?: string | null;
    unit?: {
    unit_id: number;
    unit_code?: string | null;
    unit_name?: string | null;
    ma_so_thue?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

export type ConversationKind = 'direct' | 'group' | 'bot';

export type Conversation = {
  id: number;
  kind: ConversationKind;
  title: string;
  owner_user_id: number;
  peer_user_id?: number | null;
  peer_avatar_id?: string | null;
  avatar_file_id?: string | null;
  last_message_id: number;
  last_read_message_id: number;
  last_message_at?: string | null;
  last_preview?: string | null;
  last_sender_name?: string | null;
  unread_count: number;
  member_count: number;
};

export type ChatMessage = {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  sender_name?: string | null;
  sender_avatar_id?: string | null;
  sender_is_me: boolean;
  msg_type: 'text' | 'image' | 'file' | 'system' | string;
  body?: string | null;
  file_id?: string | null;
  file_name?: string | null;
  file_content_type?: string | null;
  file_size_bytes?: number | null;
  client_msg_id?: string | null;
  created_at: string;
  reply_to_message_id?: number | null;
  reply_preview?: string | null;
  reply_sender_name?: string | null;
  reply_msg_type?: string | null;
  recalled_at?: string | null;
  recalled_by_user_id?: number | null;
  is_recalled?: boolean;
  can_recall?: boolean;
};

export type ChatAppSettings = {
  exempt_email_domains: string;
  message_recall_minutes: number;
  file_recall_minutes: number;
};

export type ChatMember = {
  user_id: number;
  role: string;
  nickname?: string | null;
  email?: string | null;
  avatar_id?: string | null;
  is_me: boolean;
};

export type ChatAttachment = {
  file_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
};

export type ChatAttachmentItem = ChatAttachment & {
  created_at: string;
  is_image: boolean;
};

export type ChatAttachmentList = {
  items: ChatAttachmentItem[];
  total: number;
  folder_id?: string | null;
  folder_name?: string | null;
};

export type ContactRelation = {
  peer_user_id: number;
  relation: 'none' | 'accepted' | 'pending_out' | 'pending_in' | 'blocked' | string;
  source?: string | null;
  can_send: boolean;
  remaining_messages: number;
  is_requester: boolean;
  is_recipient: boolean;
  i_blocked_peer: boolean;
  peer_blocked_me: boolean;
  send_block_reason?: string | null;
};

export type ConversationDetail = {
  conversation: Conversation;
  members: ChatMember[];
  relation?: ContactRelation | null;
};

export type ChatUser = {
  user_id: number;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_id?: string | null;
  department?: string | null;
};

export type ContactItem = ChatUser & {
  relation: string;
  source?: string | null;
  is_blocked: boolean;
  is_incoming: boolean;
  request_message_count: number;
};

export type ChatUserPage = {
  items: ChatUser[];
  total_record: number;
  page: number;
  page_size: number;
  unit_id: number;
};

export type ContactPage = {
  items: ContactItem[];
  total_record: number;
  page: number;
  page_size: number;
};

export class ChatApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
  }
}

async function chatFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
      (body as { message?: string })?.message || `Chat API lỗi (HTTP ${res.status}).`;
    throw new ChatApiError(message, res.status);
  }

  return body as T;
}

async function chatFetchBlob(path: string): Promise<Blob> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) throw new ChatApiError('Phiên đăng nhập đã hết hạn.', 401);
  const res = await fetch(`${getChatApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new ChatApiError(`Không tải được file (HTTP ${res.status}).`, res.status);
  return res.blob();
}

export const chatApi = {
  me: () => chatFetch<ChatMe>('/api/chat/me'),

  listConversations: (search = '') => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return chatFetch<{ items: Conversation[] }>(`/api/chat/conversations${suffix}`).then(
      (r) => r.items ?? [],
    );
  },

  getConversation: (id: number) =>
    chatFetch<ConversationDetail>(`/api/chat/conversations/${id}`),

  createDirect: (peerUserId: number, lookup?: string) =>
    chatFetch<Conversation>('/api/chat/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ peer_user_id: peerUserId, lookup: lookup?.trim() || null }),
    }),

  createGroup: (title: string, memberIds: number[]) =>
    chatFetch<Conversation>('/api/chat/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ title, member_ids: memberIds }),
    }),

  rename: (id: number, title: string) =>
    chatFetch<Conversation>(`/api/chat/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),

  addMembers: (id: number, memberIds: number[]) =>
    chatFetch<{ affected: number }>(`/api/chat/conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ member_ids: memberIds }),
    }),

  leave: (id: number) =>
    chatFetch<{ affected: number; disbanded?: boolean }>(
      `/api/chat/conversations/${id}/leave`,
      { method: 'POST' },
    ),

  listMessages: (
    id: number,
    opts?: { beforeId?: number; afterId?: number; limit?: number },
  ) => {
    const qs = new URLSearchParams();
    if (opts?.beforeId) qs.set('before_id', String(opts.beforeId));
    if (opts?.afterId !== undefined) qs.set('after_id', String(opts.afterId));
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return chatFetch<{ items: ChatMessage[] }>(
      `/api/chat/conversations/${id}/messages${suffix}`,
    ).then((r) => r.items ?? []);
  },

  sendMessage: (id: number, body: string, clientMsgId: string, replyToMessageId?: number | null) =>
    chatFetch<ChatMessage>(`/api/chat/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        client_msg_id: clientMsgId,
        reply_to_message_id: replyToMessageId ?? null,
      }),
    }),

  recallMessage: (conversationId: number, messageId: number) =>
    chatFetch<ChatMessage>(
      `/api/chat/conversations/${conversationId}/messages/${messageId}/recall`,
      { method: 'POST' },
    ),

  setGroupAvatar: (id: number, file: File) => {
    const body = new FormData();
    body.append('file', file, file.name);
    return chatFetch<Conversation>(`/api/chat/conversations/${id}/avatar`, {
      method: 'POST',
      body,
    });
  },

  getAdminSettings: () => chatFetch<ChatAppSettings>('/api/chat/admin/settings'),

  saveAdminSettings: (settings: ChatAppSettings) =>
    chatFetch<ChatAppSettings>('/api/chat/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  uploadAttachment: (id: number, file: File) => {
    const body = new FormData();
    body.append('file', file, file.name);
    return chatFetch<ChatAttachment>(`/api/chat/conversations/${id}/attachments`, {
      method: 'POST',
      body,
    });
  },

  sendAttachment: (id: number, attachment: ChatAttachment, clientMsgId: string) =>
    chatFetch<ChatMessage>(`/api/chat/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        body: attachment.file_name,
        msg_type: attachment.content_type.startsWith('image/') ? 'image' : 'file',
        file_id: attachment.file_id,
        client_msg_id: clientMsgId,
      }),
    }),

  listAttachments: (conversationId: number, limit = 10) =>
    chatFetch<ChatAttachmentList>(
      `/api/chat/conversations/${conversationId}/attachments?limit=${limit}`,
    ),

  attachmentBlob: (conversationId: number, fileId: string) =>
    chatFetchBlob(
      `/api/chat/conversations/${conversationId}/attachments/${encodeURIComponent(fileId)}/content`,
    ),

  markRead: (id: number, messageId?: number) =>
    chatFetch<{ last_read_message_id: number }>(`/api/chat/conversations/${id}/read`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId ?? null }),
    }),

  searchUsers: (search: string, mode = 'direct', page = 1, pageSize = 20) => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('mode', mode);
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    return chatFetch<ChatUserPage>(`/api/chat/users?${qs.toString()}`);
  },

  companyDirectory: (search = '', page = 1, pageSize = 20) => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    return chatFetch<ChatUserPage>(`/api/chat/directory/company?${qs.toString()}`);
  },

  externalLookup: (search: string) => {
    const qs = new URLSearchParams();
    qs.set('search', search.trim());
    return chatFetch<ChatUserPage>(`/api/chat/directory/external?${qs.toString()}`);
  },

  listContacts: (search = '', page = 1, pageSize = 20, filter = 'all') => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('page', String(page));
    qs.set('page_size', String(pageSize));
    qs.set('filter', filter);
    return chatFetch<ContactPage>(`/api/chat/contacts?${qs.toString()}`);
  },

  getRelation: (peerUserId: number) =>
    chatFetch<ContactRelation>(`/api/chat/contacts/${peerUserId}/relation`),

  acceptContact: (peerUserId: number) =>
    chatFetch<ContactRelation>('/api/chat/contacts/accept', {
      method: 'POST',
      body: JSON.stringify({ peer_user_id: peerUserId }),
    }),

  blockContact: (peerUserId: number) =>
    chatFetch<ContactRelation>('/api/chat/contacts/block', {
      method: 'POST',
      body: JSON.stringify({ peer_user_id: peerUserId }),
    }),

  unblockContact: (peerUserId: number) =>
    chatFetch<ContactRelation>('/api/chat/contacts/unblock', {
      method: 'POST',
      body: JSON.stringify({ peer_user_id: peerUserId }),
    }),
};

/** id tin phía client — chống nhân đôi khi retry / mạng chập. */
export function newClientMsgId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
