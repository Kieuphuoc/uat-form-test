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

export type DesktopNotificationMode = 'badge' | 'chrome' | 'off';

export type ChatMe = {
  user_id: number;
  is_admin: boolean;
  is_admin_unit?: boolean;
  unit_id?: number;
  nickname?: string | null;
  email?: string | null;
  avatar_id?: string | null;
  desktop_notification?: DesktopNotificationMode | null;
  ai_chatbot_enabled?: boolean;
  zalo_enabled?: boolean;
  can_use_ai_chat?: boolean;
  can_use_zalo_chat?: boolean;
  can_use_oa_chat?: boolean;
  assigned_oa_id?: string | null;
  can_manage_chat_permissions?: boolean;
  can_manage_chat_permission_default?: boolean;
  can_manage_faq_sets?: boolean;
  can_review_faq?: boolean;
  chat_theme?: string | null;
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

/** Mục menu header tab Chat (id khớp postMessage arito-header-select). */
export type ChatTabItem = {
  id: string;
  name: string;
};

export const DEFAULT_BOT_AVATAR = '/AritoMascotsAI.png';

export function botAvatarUrl(url?: string | null): string {
  const value = url?.trim();
  if (!value) return DEFAULT_BOT_AVATAR;
  if (/^https?:\/\//i.test(value)) return value;
  const id = value.toLowerCase().startsWith('file:') ? value.slice(5).trim() : value;
  if (/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    return `${getChatApiBase()}/api/chat/bots/avatar/${encodeURIComponent(id)}`;
  }
  return DEFAULT_BOT_AVATAR;
}

export type ConversationNotifyMode = 'all' | 'mention' | 'mute';

export function normalizeNotifyMode(value?: string | null): ConversationNotifyMode {
  return value === 'mention' || value === 'mute' ? value : 'all';
}

export function nextNotifyMode(current?: string | null): ConversationNotifyMode {
  const order: ConversationNotifyMode[] = ['all', 'mention', 'mute'];
  const mode = normalizeNotifyMode(current);
  return order[(order.indexOf(mode) + 1) % order.length];
}

export function notifyModeLabel(mode?: string | null): string {
  if (mode === 'mute') return 'Tắt thông báo';
  if (mode === 'mention') return 'Thông báo khi tag';
  return 'Mở thông báo';
}

export type ConversationKind = 'direct' | 'group' | 'bot';
export type ChatBotType = 'rag' | 'file' | 'faq' | 'embed';
export type ChatBotAuthMode = 'none' | 'embed_token';

export type Conversation = {
  id: number;
  kind: ConversationKind;
  title: string;
  owner_user_id: number;
  peer_user_id?: number | null;
  peer_avatar_id?: string | null;
  avatar_file_id?: string | null;
  bot_folder_id?: string | null;
  bot_avatar_url?: string | null;
  bot_description?: string | null;
  bot_active?: boolean;
  bot_type?: ChatBotType | string | null;
  bot_embed_url?: string | null;
  bot_auth_mode?: ChatBotAuthMode | string | null;
  /** Bot đang sticky (gợi ý / router). Hết TTL = bot_folder_id. */
  active_bot_folder_id?: string | null;
  active_bot_title?: string | null;
  active_bot_avatar_url?: string | null;
  active_bot_until?: string | null;
  last_message_id: number;
  last_read_message_id: number;
  last_message_at?: string | null;
  last_preview?: string | null;
  last_sender_name?: string | null;
  unread_count: number;
  member_count: number;
  notify_mode?: ConversationNotifyMode | string | null;
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
  mentioned_user_ids?: number[];
  /** Chỉ phía client: tin vừa gửi, chưa có id server. */
  send_status?: 'sending' | 'failed';
};

export type ChatAppSettings = {
  unit_id: number;
  exempt_email_domains: string;
  message_recall_minutes: number;
  file_recall_minutes: number;
  desktop_notification: DesktopNotificationMode;
  device_push_enabled: boolean;
  ai_chatbot_enabled: boolean;
  ai_chatbots: ChatBotCatalogItem[];
  zalo_enabled: boolean;
  zalo_accounts: ChatZaloAccount[];
  oa_id?: string | null;
  oa_setting?: ChatOaSetting | null;
  oa_catalog?: ChatOaCatalogItem[];
  chat_theme: string;
};

export type ChatOaSetting = {
  oa_id: string;
  default_bot_folder_id?: string | null;
  notify_user_ids: number[];
  notify_channels: string[];
};

export type ChatOaCatalogItem = {
  oa_id: string;
  name?: string | null;
  configured?: boolean;
  has_token?: boolean;
  expires_at?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeOaCatalog(raw: unknown): ChatOaCatalogItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ChatOaCatalogItem[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    const oaId = readString(row, 'oa_id', 'oaId');
    if (!oaId) continue;
    items.push({
      oa_id: oaId,
      name: readString(row, 'name', 'title') || null,
      configured: row.configured === true,
      has_token: row.has_token === true || row.hasRefreshToken === true || row.has_refresh_token === true,
      expires_at:
        typeof row.expires_at === 'string'
          ? row.expires_at
          : typeof row.expiresAt === 'string'
            ? row.expiresAt
            : null,
    });
  }
  return items;
}

function normalizeAppSettings(settings: ChatAppSettings): ChatAppSettings {
  return {
    ...settings,
    oa_catalog: normalizeOaCatalog(settings.oa_catalog),
  };
}

export type ChatZaloAccount = {
  id: string;
  name: string;
  active: boolean;
};

export type ChatBotSuggestedQuestion = {
  text: string;
  /** Null / trống = trả lời bằng bot hiện tại. */
  target_folder_id?: string | null;
  /** True = chỉ xin chào + đổi source (GĐ2, không RAG). */
  greet_and_switch?: boolean;
};

export type ChatBotCatalogItem = {
  folder_id: string;
  title: string;
  description?: string | null;
  synonyms?: string | null;
  greeting_title?: string | null;
  avatar_url?: string | null;
  active?: boolean | null;
  type?: ChatBotType | string | null;
  embed_url?: string | null;
  auth_mode?: ChatBotAuthMode | string | null;
  suggested_questions?: ChatBotSuggestedQuestion[] | null;
};

export function isEmbedBot(
  bot: { type?: string | null; bot_type?: string | null } | null | undefined,
): boolean {
  return normalizeBotType(bot?.type ?? bot?.bot_type) === 'embed';
}

export function normalizeBotType(value?: string | null): ChatBotType {
  const next = (value ?? 'rag').trim().toLowerCase();
  if (next === 'embed' || next === 'file' || next === 'faq') return next;
  return 'rag';
}

export function botTypeLabel(
  bot: { type?: string | null; bot_type?: string | null } | null | undefined,
): string {
  const type = normalizeBotType(bot?.type ?? bot?.bot_type);
  if (type === 'embed') return 'AI nhúng';
  if (type === 'file') return 'AI Files';
  if (type === 'faq') return 'AI FAQ';
  return 'AI RAG';
}

/** Gắn hidden_login + embed_token (nếu chọn) vào URL iframe chatbot. */
export function buildBotEmbedSrc(
  embedUrl: string,
  authMode?: string | null,
  mobile = false,
): string {
  const jwt = getJwt();
  try {
    const url = new URL(embedUrl);
    if (!url.searchParams.has('hidden_login')) url.searchParams.set('hidden_login', 'true');
    if (mobile && !url.searchParams.has('mobile')) url.searchParams.set('mobile', 'true');
    const mode = (authMode ?? 'embed_token').trim().toLowerCase();
    if (mode === 'embed_token' && jwt && !isJwtExpired(jwt) && !url.searchParams.has('embed_token')) {
      url.searchParams.set('embed_token', jwt);
    }
    return url.toString();
  } catch {
    return embedUrl;
  }
}

export type ChatBotList = {
  enabled: boolean;
  items: ChatBotCatalogItem[];
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

export type ConversationOpen = ConversationDetail & {
  messages: ChatMessage[];
  has_more: boolean;
  attachments: ChatAttachmentList;
};

export type ChatUser = {
  user_id: number;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_id?: string | null;
  department?: string | null;
  is_admin?: boolean;
  is_admin_unit?: boolean;
};

export type UnitChatPermissions = {
  unit_id: number;
  user_id: number;
  can_use_ai_chat: boolean;
  can_use_zalo_chat: boolean;
  can_use_oa_chat: boolean;
  permission_items: UnitChatPermissionItems;
  available_ai_bots: UnitChatPermissionItem[];
  available_zalo_accounts: UnitChatPermissionItem[];
  source: 'user' | 'default' | 'none' | string;
  is_explicit: boolean;
};

export type UnitChatPermissionItems = {
  ai_bots: UnitChatPermissionItem[];
  zalo_accounts: UnitChatPermissionItem[];
};

export type UnitChatPermissionItem = {
  id: string;
  name?: string | null;
  enabled: boolean;
  active?: boolean;
};

/** Bot/account đang bật trong cấu hình công ty — dùng khi hiện checkbox phân quyền. */
export function activeChatPermissionItems(
  items: UnitChatPermissionItem[] | null | undefined,
): UnitChatPermissionItem[] {
  return (items ?? []).filter((item) => item.active !== false);
}

export type UnitChatPermissionWrite = Pick<
  UnitChatPermissions,
  'can_use_ai_chat' | 'can_use_zalo_chat' | 'can_use_oa_chat' | 'permission_items'
>;

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

  unreadSummary: () =>
    chatFetch<{ chat_ids: number[]; oa_ids: number[] }>('/api/chat/unread-summary').then((r) => ({
      chat_ids: r.chat_ids ?? [],
      oa_ids: r.oa_ids ?? [],
    })),

  listTabs: () =>
    chatFetch<ChatTabItem[] | { items?: ChatTabItem[]; data?: ChatTabItem[] }>('/api/chat/tabs').then(
      (r) => {
        if (Array.isArray(r)) return r;
        return r.items ?? r.data ?? [];
      },
    ),

  listConversations: (search = '', page = 1, pageSize = 16) => {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    qs.set('page', String(Math.max(1, page)));
    qs.set('page_size', String(Math.max(1, pageSize)));
    return chatFetch<{ items: Conversation[]; has_more?: boolean }>(
      `/api/chat/conversations?${qs.toString()}`,
    ).then((r) => ({
      items: r.items ?? [],
      has_more: !!r.has_more,
    }));
  },

  getConversation: (id: number) =>
    chatFetch<ConversationDetail>(`/api/chat/conversations/${id}`),

  openConversation: (id: number, opts?: { limit?: number; fileLimit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.fileLimit) qs.set('file_limit', String(opts.fileLimit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return chatFetch<ConversationOpen>(`/api/chat/conversations/${id}/open${suffix}`);
  },

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

  listBots: () => chatFetch<ChatBotList>('/api/chat/bots'),

  openBot: (folderId: string) =>
    chatFetch<Conversation>('/api/chat/conversations/bot', {
      method: 'POST',
      body: JSON.stringify({ folder_id: folderId }),
    }),

  askBotDraft: (folderId: string, body: string, responseType?: 'MD' | 'TEXT') =>
    chatFetch<{ folder_id: string; title: string; body: string }>('/api/chat/bots/ask', {
      method: 'POST',
      body: JSON.stringify({
        folder_id: folderId,
        body,
        response_type: responseType ?? undefined,
      }),
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

  setNotifyMode: (id: number, notifyMode: ConversationNotifyMode) =>
    chatFetch<{ notify_mode: ConversationNotifyMode }>(`/api/chat/conversations/${id}/notify`, {
      method: 'PUT',
      body: JSON.stringify({ notify_mode: notifyMode }),
    }),

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

  getAdminSettings: () =>
    chatFetch<ChatAppSettings>('/api/chat/admin/settings').then(normalizeAppSettings),

  saveAdminSettings: (settings: ChatAppSettings) =>
    chatFetch<ChatAppSettings>('/api/chat/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }).then(normalizeAppSettings),

  listOaTargets: (oaId: string, zaloType = 'id') => {
    const qs = new URLSearchParams();
    if (oaId) qs.set('oa_id', oaId);
    qs.set('zalo_type', zaloType);
    return chatFetch<{ items: { user_id: number; zalo_id?: string; zalo_type?: string }[] }>(
      `/api/chat/admin/oa-targets?${qs.toString()}`,
    );
  },

  uploadBotAvatar: (file: File) => {
    const body = new FormData();
    body.append('file', file, file.name);
    return chatFetch<{ file_id: string; avatar_url: string }>('/api/chat/admin/bots/avatar', {
      method: 'POST',
      body,
    });
  },

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

  /** size &gt; 0 → bản resize sẵn của File.Api (thumbnail 256 / avatar 64). */
  attachmentBlob: (conversationId: number, fileId: string, size = 0) =>
    chatFetchBlob(
      `/api/chat/conversations/${conversationId}/attachments/${encodeURIComponent(fileId)}/content${
        size > 0 ? `?size=${size}` : ''
      }`,
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

  getUnitChatPermissions: (userId: number) =>
    chatFetch<UnitChatPermissions>(`/api/unit/users/${userId}/chat-permissions`),

  saveUnitChatPermissions: (
    userId: number,
    body: UnitChatPermissionWrite,
  ) =>
    chatFetch<UnitChatPermissions>(`/api/unit/users/${userId}/chat-permissions`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  resetUnitChatPermissions: (userId: number) =>
    chatFetch<UnitChatPermissions>(`/api/unit/users/${userId}/chat-permissions`, {
      method: 'DELETE',
    }),

  getDefaultUnitChatPermissions: () =>
    chatFetch<UnitChatPermissions>('/api/unit/chat-permissions/default'),

  saveDefaultUnitChatPermissions: (
    body: UnitChatPermissionWrite,
  ) =>
    chatFetch<UnitChatPermissions>('/api/unit/chat-permissions/default', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  listFaqSets: () =>
    chatFetch<{ items?: FaqSet[] }>('/api/faq/sets').then((r) => r.items ?? []),

  listFaqWorkbench: () =>
    chatFetch<{ items?: FaqWorkbenchItem[] }>('/api/faq/workbench').then((r) => r.items ?? []),

  syncFaqSet: (id: number) =>
    chatFetch<{ set_id: number; question_count: number; message: string }>(`/api/faq/sets/${id}/sync`, {
      method: 'POST',
    }),

  getFaqSet: (id: number) => chatFetch<FaqSet>(`/api/faq/sets/${id}`),

  createFaqSet: (body: FaqSetWrite) =>
    chatFetch<FaqSet>('/api/faq/sets', { method: 'POST', body: JSON.stringify(body) }),

  updateFaqSet: (id: number, body: FaqSetWrite) =>
    chatFetch<FaqSet>(`/api/faq/sets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteFaqSet: (id: number) =>
    chatFetch<{ message: string }>(`/api/faq/sets/${id}`, { method: 'DELETE' }),

  listFaqItems: (setId: number, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return chatFetch<FaqItemList>(`/api/faq/sets/${setId}/items${qs}`);
  },

  createFaqItem: (setId: number, body: FaqItemWrite) =>
    chatFetch<FaqItem>(`/api/faq/sets/${setId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateFaqItem: (setId: number, itemId: number, body: FaqItemWrite) =>
    chatFetch<FaqItem>(`/api/faq/sets/${setId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteFaqItem: (setId: number, itemId: number) =>
    chatFetch<{ message: string }>(`/api/faq/sets/${setId}/items/${itemId}`, { method: 'DELETE' }),

  approveFaqItem: (setId: number, itemId: number) =>
    chatFetch<FaqItem>(`/api/faq/sets/${setId}/items/${itemId}/approve`, { method: 'POST' }),

  rejectFaqItem: (setId: number, itemId: number) =>
    chatFetch<FaqItem>(`/api/faq/sets/${setId}/items/${itemId}/reject`, { method: 'POST' }),

  submitFaqItem: (setId: number, itemId: number) =>
    chatFetch<FaqItem>(`/api/faq/sets/${setId}/items/${itemId}/submit`, { method: 'POST' }),

  listFaqApprovers: (setId: number) =>
    chatFetch<{ items?: FaqApprover[] } | FaqApprover[]>(`/api/faq/sets/${setId}/approvers`).then(
      (r) => (Array.isArray(r) ? r : r.items ?? []),
    ),

  addFaqApprover: (setId: number, userId: number) =>
    chatFetch<{ items?: FaqApprover[] } | FaqApprover[]>(`/api/faq/sets/${setId}/approvers`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }).then((r) => (Array.isArray(r) ? r : r.items ?? [])),

  removeFaqApprover: (setId: number, userId: number) =>
    chatFetch<{ message: string }>(`/api/faq/sets/${setId}/approvers/${userId}`, {
      method: 'DELETE',
    }),

  uploadFaqFile: (setId: number, file: File) => {
    const body = new FormData();
    body.append('file', file, file.name);
    return chatFetch<FaqFile>(`/api/faq/sets/${setId}/files`, { method: 'POST', body });
  },

  listQuickMessages: () =>
    chatFetch<{ items?: QuickMessage[] } | QuickMessage[]>('/api/chat/quick-messages').then(
      (r) => (Array.isArray(r) ? r : r.items ?? []),
    ),

  createQuickMessage: (body: QuickMessageWrite) =>
    chatFetch<QuickMessage>('/api/chat/quick-messages', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateQuickMessage: (id: number, body: QuickMessageWrite) =>
    chatFetch<QuickMessage>(`/api/chat/quick-messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteQuickMessage: (id: number) =>
    chatFetch<{ message: string }>(`/api/chat/quick-messages/${id}`, { method: 'DELETE' }),

  reorderQuickMessages: (ids: number[]) =>
    chatFetch<{ items?: QuickMessage[] } | QuickMessage[]>('/api/chat/quick-messages/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }).then((r) => (Array.isArray(r) ? r : r.items ?? [])),

  linkFaqFile: (setId: number, sourceFileId: string) =>
    chatFetch<FaqFile>(`/api/faq/sets/${setId}/files/link`, {
      method: 'POST',
      body: JSON.stringify({ source_file_id: sourceFileId }),
    }),

  faqFileBlob: (setId: number, fileId: string, size = 0) =>
    chatFetchBlob(
      `/api/faq/sets/${setId}/files/${encodeURIComponent(fileId)}/content${
        size > 0 ? `?size=${size}` : ''
      }`,
    ),
};

export type FaqNoMatchAction = 'silent' | 'fixed_text' | 'transfer' | 'fallback_rag';
export type FaqReplyMode = 'single' | 'suggest_questions';
export type FaqItemStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type FaqSet = {
  id: number;
  code: string;
  name: string;
  unit_id: number;
  unit_ids?: number[];
  folder_id: string;
  min_score: number;
  suggest_score: number;
  auto_score: number;
  reply_mode: FaqReplyMode | string;
  no_match_action: FaqNoMatchAction | string;
  no_match_text?: string | null;
  pending_publish: boolean;
  item_count: number;
  pending_count: number;
  approved_count: number;
  can_review: boolean;
  can_manage: boolean;
  can_sync?: boolean;
  created_at: string;
  updated_at: string;
};

export type FaqSetWrite = {
  code?: string;
  name?: string;
  min_score?: number;
  suggest_score?: number;
  auto_score?: number;
  reply_mode?: string;
  no_match_action?: string;
  no_match_text?: string | null;
  unit_ids?: number[];
};

export type FaqWorkbenchItem = {
  set_id: number;
  code: string;
  name: string;
  folder_id: string;
  role: 'ask' | 'build' | string;
  title: string;
  workbench_id: string;
};

export type FaqItem = {
  id: number;
  set_id: number;
  question: string;
  answer_md: string;
  status: FaqItemStatus | string;
  source: string;
  created_by: number;
  created_at: string;
  updated_by: number;
  updated_at: string;
  approved_by?: number | null;
  approved_at?: string | null;
};

export type FaqItemWrite = {
  question?: string;
  answer_md?: string;
  source?: string;
};

export type FaqItemList = {
  items: FaqItem[];
  total: number;
};

export type FaqApprover = {
  user_id: number;
  nickname?: string | null;
  email?: string | null;
  granted_at: string;
};

export type FaqFile = {
  file_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
};

export type QuickMessage = {
  id: number;
  unit_id: number;
  code: string;
  body_text: string;
  sort_order: number;
};

export type QuickMessageWrite = {
  code: string;
  body_text: string;
  sort_order?: number;
};

/** id tin phía client — chống nhân đôi khi retry / mạng chập. */
export function newClientMsgId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
