import { getJwt, isJwtExpired } from './client';
import { ChatApiError, getChatApiBase } from './chatApi';
import type {
  ZaloAttachment,
  ZaloConversation,
  ZaloFolderConfig,
  ZaloLabel,
  ZaloMember,
  ZaloMessage,
  ZaloQuote,
  ZaloSenderType,
  ZaloSource,
  ZaloStaffUser,
  ZaloUserGroup,
} from '../lib/zaloChat';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (Array.isArray(rec.items)) return rec.items;
  if (Array.isArray(rec.data)) return rec.data;
  return [];
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const rec = asRecord(value);
  const oid = rec.$oid ?? rec.oid ?? rec._id ?? rec.id;
  if (oid != null && oid !== value) return str(oid, fallback);
  return fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  return value === 1 || value === '1' || value === 'true';
}

function iso(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function personName(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const rec = asRecord(value);
  return str(
    rec.dName
      ?? rec.displayName
      ?? rec.display_name
      ?? rec.name
      ?? rec.fromD
      ?? rec.uid,
  );
}

function mapAttachment(raw: unknown): ZaloAttachment | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const href = str(raw);
    if (!href) return null;
    return { href, fileName: href.split(/[\\/]/).pop() || href };
  }
  const file = asRecord(raw);
  const href = str(file.href ?? file.url ?? file.oriUrl ?? file.hdUrl ?? file.params);
  const thumb = str(file.thumb ?? file.thumbnail) || undefined;
  const fileName = str(
    file.fileName
      ?? file.file_name
      ?? file.name
      ?? file.title
      ?? file.fileNameDisplay,
  );
  if (!href && !thumb && !fileName) return null;
  return {
    kind: str(file.kind ?? file.type ?? file.fileType ?? file.fileExt) || undefined,
    href: href || undefined,
    thumb,
    title: str(file.title) || undefined,
    fileName: fileName || undefined,
  };
}

function normalizeAttachmentList(raw: unknown): unknown[] {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  return asArray(raw);
}

function parseMessageContent(
  content: string,
): { content: string; extraAttachments: ZaloAttachment[] } {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return { content, extraAttachments: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const extraAttachments = parsed
        .map(mapAttachment)
        .filter((item): item is ZaloAttachment => !!item);
      if (extraAttachments.length) return { content: '', extraAttachments };
      return { content, extraAttachments: [] };
    }
    const rec = asRecord(parsed);
    const caption = str(rec.text ?? rec.content ?? rec.message ?? rec.caption ?? '');
    const extraAttachments = [
      ...normalizeAttachmentList(rec.attachments ?? rec.files),
      rec.attach,
      rec.attachment,
    ]
      .map(mapAttachment)
      .filter((item): item is ZaloAttachment => !!item);
    if (caption || extraAttachments.length) {
      return { content: caption, extraAttachments };
    }
  } catch {
    /* keep raw content */
  }
  return { content, extraAttachments: [] };
}

function attachmentsFromContent(content: string): ZaloAttachment[] {
  return parseMessageContent(content).extraAttachments;
}

function extractLinkPreviewTitle(row: Json): string {
  const raw = asRecord(row.zaloContentRaw ?? row.zalo_content_raw);
  if (!Object.keys(raw).length) return '';
  let params: unknown = raw.params;
  if (typeof params === 'string') {
    const trimmed = params.trim();
    if (trimmed.startsWith('{')) {
      try {
        params = JSON.parse(trimmed) as unknown;
      } catch {
        params = null;
      }
    }
  }
  const parsedParams = asRecord(params);
  const candidates = [
    parsedParams.mediaTitle,
    parsedParams.media_title,
    parsedParams.title,
    raw.title,
    raw.description,
  ];
  for (const value of candidates) {
    const text = str(value).trim();
    if (text && !/^https?:\/\//i.test(text)) return text;
  }
  return '';
}

function mapQuote(raw: unknown): ZaloQuote | null {
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        value = JSON.parse(trimmed) as unknown;
      } catch {
        return { from: '', msg: trimmed };
      }
    } else {
      return { from: '', msg: trimmed };
    }
  }
  if (!value || typeof value !== 'object') return null;
  const q = asRecord(value);
  const from = personName(q.fromD ?? q.fromName ?? q.senderName ?? q.dName ?? q.from);
  const attach = mapAttachment(q.attach ?? q.attachment ?? q.file);
  const msg = str(q.msg ?? q.content ?? q.message ?? q.text ?? q.title);
  const globalMsgId = str(
    q.globalMsgId ?? q.global_msg_id ?? q.cliMsgId ?? q.cli_msg_id ?? q.msgId ?? q.quoteMessageId,
  );
  if (!from && !msg && !attach) return null;
  return {
    from,
    msg,
    attach: attach || undefined,
    globalMsgId: globalMsgId || undefined,
  };
}

export function mapZaloLabel(raw: unknown): ZaloLabel {
  const row = asRecord(raw);
  return {
    id: str(row.id ?? row._id),
    name: str(row.name),
    color: str(row.color, '#64748b'),
    emoji: str(row.emoji),
  };
}

export function mapZaloConversation(raw: unknown): ZaloConversation {
  const row = asRecord(raw);
  const unread = Number(row.unread_count ?? row.unreadExternalCount ?? 0) || 0;
  return {
    id: str(row.id ?? row._id),
    zalo_thread_id: str(row.zalo_thread_id ?? row.zaloThreadId),
    name: str(row.name, 'Nhóm Zalo'),
    avatar_url: str(row.avatar_url ?? row.avatarUrl) || undefined,
    is_group: bool(row.is_group ?? row.isGroup, true),
    ai_enabled: row.ai_enabled === undefined && row.aiEnabled === undefined
      ? true
      : bool(row.ai_enabled ?? row.aiEnabled, true),
    unread_count: unread,
    has_external_unread: bool(row.has_external_unread, unread > 0),
    notify_grace_minutes: (() => {
      const grace = Number(row.notify_grace_minutes ?? row.notifyGraceMinutes);
      return Number.isFinite(grace) ? Math.max(0, grace) : 2;
    })(),
    last_message_at: iso(row.last_message_at ?? row.lastMessageAt),
    last_preview: str(row.last_preview ?? row.lastPreview) || undefined,
    zalo_labels: asArray(row.zalo_labels ?? row.zaloLabels).map(mapZaloLabel),
  };
}

export function mapZaloMessage(raw: unknown): ZaloMessage {
  const row = asRecord(raw);
  let sender = str(row.sender_type ?? row.senderType, 'user') as ZaloSenderType;
  if (row.operator_staff_id || row.operatorStaffId) sender = 'operator';
  const attachments = [
    ...normalizeAttachmentList(row.attachments ?? row.files),
    row.attach,
    row.attachment,
  ];
  let files = attachments
    .map((item) => mapAttachment(item))
    .filter((item): item is ZaloAttachment => !!item);
  let content = str(row.content);
  const parsedContent = parseMessageContent(content);
  content = parsedContent.content;
  if (parsedContent.extraAttachments.length) {
    files = [...files, ...parsedContent.extraAttachments];
  }
  if (files.length === 0) {
    const fromContent = attachmentsFromContent(content);
    if (fromContent.length) {
      files = fromContent;
      content = '';
    }
  }
  const quote = mapQuote(row.quote ?? row.quoteMessage ?? row.quoted);
  const mentions = asArray(row.mentions).map((item) => {
    const mark = asRecord(item);
    return {
      uid: str(mark.uid) || undefined,
      pos: Number(mark.pos) || 0,
      len: Number(mark.len) || 0,
      type: str(mark.type) || undefined,
    };
  });
  return {
    id: str(row.id ?? row._id),
    zalo_msg_id: str(row.zalo_msg_id ?? row.zaloMsgId) || undefined,
    sender_type: ['user', 'bot', 'operator', 'system'].includes(sender) ? sender : 'user',
    sender_display_name: str(row.sender_display_name ?? row.senderDisplayName) || undefined,
    operator_display_name:
      str(
        row.operator_display_name
          ?? row.operatorDisplayName
          ?? row.staffName
          ?? row.staff_name,
      ) || undefined,
    sender_avatar_url: str(row.sender_avatar_url ?? row.senderAvatarUrl) || undefined,
    sender_zalo_uid: str(row.sender_zalo_uid ?? row.senderZaloUid ?? row.zalo_uid_from ?? row.zaloUidFrom) || undefined,
    content,
    msg_type: str(row.msg_type ?? row.msgType) || undefined,
    mentions: mentions.length ? mentions : undefined,
    quote,
    files: files.length ? files : undefined,
    link_preview_title: extractLinkPreviewTitle(row) || undefined,
    zalo_created_at: iso(row.zalo_created_at ?? row.zaloCreatedAt ?? row.receivedAt),
  };
}

export function mapZaloMember(raw: unknown): ZaloMember {
  const row = asRecord(raw);
  return {
    id: str(row.id ?? row._id ?? row.zalo_uid ?? row.zaloUid),
    zalo_uid: str(row.zalo_uid ?? row.zaloUid),
    display_name: str(row.display_name ?? row.displayName, 'Thành viên'),
    avatar_url: str(row.avatar_url ?? row.avatarUrl) || undefined,
  };
}

export function mapZaloStaffUser(raw: unknown): ZaloStaffUser {
  const row = asRecord(raw);
  return {
    id: str(row.id ?? row._id),
    zalo_uid: str(row.zalo_uid ?? row.zaloUid),
    display_name: str(row.display_name ?? row.displayName, 'Người dùng'),
    avatar_url: str(row.avatar_url ?? row.avatarUrl) || undefined,
    is_bot_account: bool(row.is_bot_account ?? row.isBotAccount),
    user_group_ids: asArray(row.user_group_ids ?? row.userGroupIds).map((id) => str(id)).filter(Boolean),
  };
}

export function mapZaloUserGroup(raw: unknown): ZaloUserGroup {
  const row = asRecord(raw);
  const type = str(row.group_type ?? row.groupType, 'external').toLowerCase();
  return {
    id: str(row.id ?? row._id),
    name: str(row.name, 'Nhóm'),
    group_type: type === 'internal' ? 'internal' : 'external',
    description: str(row.description) || undefined,
    member_count: Number(row.member_count ?? row.memberCount) || 0,
  };
}

export function mapZaloFolderMap(raw: unknown): Record<string, ZaloFolderConfig> {
  const rec = asRecord(raw);
  const out: Record<string, ZaloFolderConfig> = {};
  for (const [key, value] of Object.entries(rec)) {
    const row = asRecord(value);
    out[key] = {
      ragFolderId: str(row.ragFolderId ?? row.rag_folder_id) || undefined,
      faqFolderId: str(row.faqFolderId ?? row.faq_folder_id) || undefined,
      label: str(row.label) || undefined,
    };
  }
  return out;
}

export type ZaloSourcesResponse = {
  infra_source_id: string;
  items: ZaloSource[];
};

type ZaloFetchOptions = RequestInit & {
  accountId?: string;
};

async function zaloFetch<T>(path: string, init?: ZaloFetchOptions): Promise<T> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) throw new ChatApiError('Phiên đăng nhập đã hết hạn.', 401);

  const { accountId, ...requestInit } = init ?? {};
  const headers = new Headers(requestInit.headers);
  headers.set('Authorization', `Bearer ${jwt}`);
  if (accountId) headers.set('X-Account-Id', accountId);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${getChatApiBase()}${path}`, { ...requestInit, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      asRecord(body).message
        ? str(asRecord(body).message)
        : asRecord(body).error
          ? str(asRecord(body).error)
          : `Zalo API lỗi (HTTP ${res.status}).`;
    throw new ChatApiError(message, res.status);
  }
  return body as T;
}

export const zaloApi = {
  listSources: () => zaloFetch<ZaloSourcesResponse>('/api/zalo/sources'),

  listAccounts: async (infraSourceId: string) =>
    asArray(await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/accounts`)).map((raw) => {
      const row = asRecord(raw);
      return {
        id: str(row.id ?? row._id),
        name: str(row.display_name ?? row.displayName ?? row.name, str(row.id ?? row._id)),
      } satisfies ZaloSource;
    }),

  listConversations: async (infraSourceId: string, accountId: string) =>
    asArray(
      await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/conversations`, { accountId }),
    ).map(mapZaloConversation),

  listMessages: async (
    infraSourceId: string,
    accountId: string,
    conversationId: string,
    query?: { limit?: number; beforeId?: string; afterId?: string },
  ) => {
    const qs = new URLSearchParams();
    if (query?.limit) qs.set('limit', String(query.limit));
    if (query?.beforeId) qs.set('beforeId', query.beforeId);
    if (query?.afterId) qs.set('afterId', query.afterId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return asArray(
      await zaloFetch<unknown>(
        `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
        { accountId },
      ),
    ).map(mapZaloMessage);
  },

  listMembers: async (infraSourceId: string, accountId: string, conversationId: string) =>
    asArray(
      await zaloFetch<unknown>(
        `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/members`,
        { accountId },
      ),
    ).map(mapZaloMember),

  listLabels: async (infraSourceId: string, accountId: string) =>
    asArray(await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/labels`, { accountId })).map(mapZaloLabel),

  getFolderMap: async (infraSourceId: string, accountId: string) =>
    mapZaloFolderMap(await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/group-folder-map`, { accountId })),

  markRead: (infraSourceId: string, accountId: string, conversationId: string) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'PATCH', accountId },
    ),

  setAi: (infraSourceId: string, accountId: string, conversationId: string, enabled: boolean) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/ai`,
      { method: 'PATCH', body: JSON.stringify({ enabled }), accountId },
    ),

  setNotifyGrace: (infraSourceId: string, accountId: string, groupId: string, minutes: number) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/groups/${encodeURIComponent(groupId)}/notify-grace`,
      { method: 'PATCH', body: JSON.stringify({ minutes }), accountId },
    ),

  addLabel: (infraSourceId: string, accountId: string, conversationId: string, labelId: string) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/labels`,
      { method: 'POST', body: JSON.stringify({ labelId }), accountId },
    ),

  removeLabel: (infraSourceId: string, accountId: string, conversationId: string, labelId: string) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/labels/${encodeURIComponent(labelId)}`,
      { method: 'DELETE', accountId },
    ),

  saveFolderMap: (infraSourceId: string, accountId: string, groupId: string, body: ZaloFolderConfig) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/group-folder-map/${encodeURIComponent(groupId)}`,
      { method: 'PUT', body: JSON.stringify(body), accountId },
    ),

  deleteFolderMap: (infraSourceId: string, accountId: string, groupId: string) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/group-folder-map/${encodeURIComponent(groupId)}`,
      { method: 'DELETE', accountId },
    ),

  sendMessage: async (
    infraSourceId: string,
    accountId: string,
    conversationId: string,
    payload: {
      text: string;
      files?: File[];
      quoteMessageId?: string;
      mentions?: { uid?: string; pos: number; len: number; type?: string }[];
    },
  ) => {
    const form = new FormData();
    form.append('text', payload.text);
    if (payload.quoteMessageId) form.append('quoteMessageId', payload.quoteMessageId);
    if (payload.mentions?.length) form.append('mentions', JSON.stringify(payload.mentions));
    for (const file of payload.files ?? []) form.append('files', file);
    const raw = await zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: form, accountId },
    );
    const rec = asRecord(raw);
    return mapZaloMessage(rec.message ?? rec.data ?? raw);
  },

  listUsers: async (infraSourceId: string, search = '') => {
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return asArray(await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/users${qs}`)).map(mapZaloStaffUser);
  },

  listUserGroups: async (infraSourceId: string) =>
    asArray(await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/user-groups`)).map(mapZaloUserGroup),

  createUserGroup: async (
    infraSourceId: string,
    body: { name: string; groupType: 'internal' | 'external'; description?: string },
  ) => {
    const raw = await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/user-groups`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const rec = asRecord(raw);
    return mapZaloUserGroup(rec.item ?? rec.data ?? rec.group ?? raw);
  },

  updateUserGroup: async (
    infraSourceId: string,
    groupId: string,
    body: { name: string; groupType: 'internal' | 'external'; description?: string },
  ) => {
    const path = `/api/zalo/${infraSourceId}/user-groups/${encodeURIComponent(groupId)}`;
    try {
      return mapZaloUserGroup(await zaloFetch<unknown>(path, { method: 'PATCH', body: JSON.stringify(body) }));
    } catch (error) {
      if (!(error instanceof ChatApiError) || (error.status !== 404 && error.status !== 405)) throw error;
      return mapZaloUserGroup(await zaloFetch<unknown>(path, { method: 'PUT', body: JSON.stringify(body) }));
    }
  },

  deleteUserGroup: (infraSourceId: string, groupId: string) =>
    zaloFetch<unknown>(`/api/zalo/${infraSourceId}/user-groups/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
    }),

  listUserGroupMembers: async (infraSourceId: string, groupId: string) =>
    asArray(
      await zaloFetch<unknown>(`/api/zalo/${infraSourceId}/user-groups/${encodeURIComponent(groupId)}/members`),
    ).map(mapZaloStaffUser),

  addUserGroupMember: (infraSourceId: string, groupId: string, userId: string) =>
    zaloFetch<unknown>(`/api/zalo/${infraSourceId}/user-groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  removeUserGroupMember: (infraSourceId: string, groupId: string, userId: string) =>
    zaloFetch<unknown>(
      `/api/zalo/${infraSourceId}/user-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
};
