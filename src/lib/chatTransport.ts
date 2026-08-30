import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { chatApi, getChatApiBase, type ChatMessage, type Conversation, type ConversationNotifyMode } from '../api/chatApi';
import { getJwt } from '../api/client';
import { oaApi, type OaConversation, type OaMessage } from '../api/oaApi';

export type ChatSubscription = { stop: () => void };
export type ChatPlatform = 'web' | 'mobile';
export type DesktopNotificationMode = 'badge' | 'chrome' | 'off';

const HEARTBEAT_MS = 30_000;
const OA_LIST_PAGE_SIZE = 30;
const OA_MESSAGE_LIMIT = 50;

type MessageListener = {
  conversationId: number;
  getAfterId: () => number;
  callback: (messages: ChatMessage[]) => void;
};

type ConversationListener = {
  search: string;
  callback: (items: Conversation[]) => void;
};

type ContactListener = {
  callback: () => void;
};

export type ConversationReadEvent = {
  conversation_id: number;
  user_id: number;
  last_read_message_id: number;
};

export type ZaloInboxEvent = {
  source_id: string;
  source_name?: string;
  conversation_id: string;
  conversation_name?: string;
  unread_count: number;
  has_external_unread?: boolean;
  preview?: string;
  last_message_at?: string;
  sender_type?: string;
  notify?: boolean;
};

export type OaInboxEvent = {
  conversation: OaConversation;
  notify?: boolean;
};

export type OaReadEvent = {
  thread_id: number;
  user_id: number;
  last_read_message_id: number;
};

type ConversationReadListener = {
  callback: (event: ConversationReadEvent) => void;
};

type OaReadListener = {
  callback: (event: OaReadEvent) => void;
};

type OaMessageListener = {
  threadId: number;
  getAfterId: () => number;
  callback: (messages: OaMessage[]) => void;
};

type OaConversationListener = {
  search: string;
  callback: (items: OaConversation[]) => void;
};

let platform: ChatPlatform = 'web';
let shellVisible = true;
let desktopNotificationMode: DesktopNotificationMode = 'badge';
let actorUserId = 0;
const notifyModes = new Map<number, ConversationNotifyMode>();
const desktopModeListeners = new Set<(mode: DesktopNotificationMode) => void>();
let connection: HubConnection | null = null;
let startPromise: Promise<void> | null = null;
let sessionRetain = 0;
let retryTimer: number | null = null;
let heartbeatTimer: number | null = null;
let idleStopTimer: number | null = null;
const messageListeners = new Set<MessageListener>();
const conversationListeners = new Set<ConversationListener>();
const contactListeners = new Set<ContactListener>();
const conversationReadListeners = new Set<ConversationReadListener>();
const oaReadListeners = new Set<OaReadListener>();
const zaloInboxListeners = new Set<(event: ZaloInboxEvent) => void>();
const oaInboxListeners = new Set<(event: OaInboxEvent) => void>();
const oaMessageListeners = new Set<OaMessageListener>();
const oaConversationListeners = new Set<OaConversationListener>();
const zaloBadgeListeners = new Set<(count: number) => void>();
const zaloUnread = new Map<string, number>();
let zaloWatchSource = '';
let zaloBadge = 0;
const listInflight = new Map<string, Promise<Conversation[]>>();
let listDebounceTimer: number | null = null;
let lastListKey = '';
let lastListAt = 0;
let lastListItems: Conversation[] = [];
const oaListInflight = new Map<string, Promise<OaConversation[]>>();
let oaListDebounceTimer: number | null = null;
let oaLastListKey = '';
let oaLastListAt = 0;
let oaLastListItems: OaConversation[] = [];

function hasListeners(): boolean {
  return (
    sessionRetain
    + messageListeners.size
    + conversationListeners.size
    + contactListeners.size
    + conversationReadListeners.size
    + oaReadListeners.size
    + zaloInboxListeners.size
    + oaInboxListeners.size
    + oaMessageListeners.size
    + oaConversationListeners.size
    + zaloBadgeListeners.size
    > 0
  );
}

function isActive(): boolean {
  return !document.hidden && shellVisible;
}

export function setChatPlatform(value: ChatPlatform): void {
  if (platform === value) return;
  platform = value;
  if (connection) {
    void connection.stop().finally(() => {
      connection = null;
      startPromise = null;
      void ensureStarted();
    });
  }
}

function normalizeDesktopMode(value?: string | null): DesktopNotificationMode {
  return value === 'chrome' || value === 'off' ? value : 'badge';
}

function normalizeNotifyMode(value?: string | null): ConversationNotifyMode {
  return value === 'mention' || value === 'mute' ? value : 'all';
}

export function setChatActorUserId(userId: number): void {
  actorUserId = userId > 0 ? userId : 0;
}

export function syncConversationNotifyModes(items: Conversation[]): void {
  for (const item of items) {
    notifyModes.set(item.id, normalizeNotifyMode(item.notify_mode));
  }
}

export function setConversationNotifyMode(conversationId: number, mode: ConversationNotifyMode): void {
  notifyModes.set(conversationId, normalizeNotifyMode(mode));
}

function notifyDesktopMode(): void {
  for (const listener of desktopModeListeners) listener(desktopNotificationMode);
}

async function resolveDesktopMode(companyMode: DesktopNotificationMode): Promise<DesktopNotificationMode> {
  if (companyMode !== 'chrome') return companyMode;
  if (!('Notification' in window)) return 'badge';
  if (Notification.permission === 'granted') return 'chrome';
  if (Notification.permission === 'denied') return 'badge';
  const permission = await Notification.requestPermission();
  return permission === 'granted' ? 'chrome' : 'badge';
}

/** Mode hiệu lực trên tab này (chrome có thể hạ thành badge nếu chưa có quyền). */
export function getDesktopNotificationMode(): DesktopNotificationMode {
  return desktopNotificationMode;
}

/** Áp dụng cấu hình công ty; không ghi localStorage. */
export async function applyDesktopNotificationMode(
  companyMode?: string | null,
): Promise<DesktopNotificationMode> {
  const resolved = await resolveDesktopMode(normalizeDesktopMode(companyMode));
  if (desktopNotificationMode !== resolved) {
    desktopNotificationMode = resolved;
    notifyDesktopMode();
  } else {
    desktopNotificationMode = resolved;
  }
  return desktopNotificationMode;
}

export function subscribeDesktopNotificationMode(
  onMode: (mode: DesktopNotificationMode) => void,
): ChatSubscription {
  desktopModeListeners.add(onMode);
  return {
    stop: () => {
      desktopModeListeners.delete(onMode);
    },
  };
}

function buildConnection(): HubConnection {
  const hub = new HubConnectionBuilder()
    .withUrl(`${getChatApiBase()}/hubs/chat?platform=${platform}`, {
      accessTokenFactory: () => getJwt() || '',
      // Chat.Api CORS mở AllowAnyOrigin; trình duyệt chặn wildcard khi request kèm credentials,
      // mà hub chỉ xác thực bằng Bearer nên không cần gửi cookie.
      withCredentials: false,
    })
    .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
    .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
    .build();

  hub.on('message.created', (message: ChatMessage) => {
    void showDesktopNotification(message);
    if (!patchConversationsFromMessage(message)) scheduleRefreshAllConversations();
    for (const listener of messageListeners) {
      if (listener.conversationId === message.conversation_id) void refreshMessages(listener);
    }
  });
  hub.on('message.recalled', (message: ChatMessage) => {
    if (!patchConversationsFromMessage(message)) scheduleRefreshAllConversations();
    for (const listener of messageListeners) {
      if (listener.conversationId === message.conversation_id) {
        listener.callback([message]);
        void refreshMessages(listener);
      }
    }
  });
  hub.on('conversation.updated', (payload?: { conversation_id?: number; message_id?: number }) => {
    // message.created / recalled đã kèm conversation.updated — không list lại.
    if (payload?.message_id) return;
    scheduleRefreshAllConversations();
  });
  hub.on('conversation.read', (payload: ConversationReadEvent) => {
    for (const listener of conversationReadListeners) listener.callback(payload);
  });
  hub.on('contact.updated', () => {
    for (const listener of contactListeners) listener.callback();
    scheduleRefreshAllConversations();
  });
  hub.on('zalo.inbox.updated', (event: ZaloInboxEvent) => {
    applyZaloInboxEvent(event);
    if (event?.notify) void showZaloDesktopNotification(event);
  });
  hub.on('oa.inbox.updated', (event: OaInboxEvent) => {
    // unread_count trong event là chung cả OA — không dùng; vá preview rồi cộng unread local.
    if (!upsertOaConversation(event.conversation)) scheduleRefreshAllOaConversations();
    for (const listener of oaInboxListeners) listener(event);
  });
  hub.on('oa.message.created', (message: OaMessage) => {
    const item = withOaSenderFlag(message);
    if (!patchOaConversationsFromMessage(item)) scheduleRefreshAllOaConversations();
    for (const listener of oaMessageListeners) {
      if (listener.threadId === item.thread_id) listener.callback([item]);
    }
  });
  hub.on('oa.conversation.updated', () => {
    scheduleRefreshAllOaConversations();
  });
  hub.on('oa.conversation.read', (payload: OaReadEvent) => {
    applyOaRead(payload);
    for (const listener of oaReadListeners) listener.callback(payload);
  });
  hub.on('oa.conversations.read', (payload: { user_id?: number }) => {
    applyOaReadAll(Number(payload?.user_id) || 0);
  });
  hub.onreconnecting(() => stopHeartbeat());
  hub.onreconnected(() => {
    startHeartbeat();
    void syncActive();
    void invokeWatchZalo();
    void catchUpAll();
  });
  hub.onclose(() => {
    stopHeartbeat();
    scheduleInitialRetry();
  });
  return hub;
}

async function ensureStarted(): Promise<void> {
  if (!hasListeners()) return;
  if (idleStopTimer !== null) window.clearTimeout(idleStopTimer);
  idleStopTimer = null;
  if (connection?.state === HubConnectionState.Connected) return;
  if (startPromise) return startPromise;
  if (!getJwt()) return;

  if (!connection) connection = buildConnection();
  startPromise = connection
    .start()
    .then(async () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      startHeartbeat();
      await syncActive();
      await invokeWatchZalo();
      await catchUpAll();
    })
    .catch(() => {
      scheduleInitialRetry();
    })
    .finally(() => {
      startPromise = null;
    });
  return startPromise;
}

function scheduleInitialRetry(): void {
  if (retryTimer !== null || !hasListeners()) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    connection = null;
    void ensureStarted();
  }, 5_000);
}

function scheduleStopIfUnused(): void {
  if (idleStopTimer !== null || hasListeners()) return;
  idleStopTimer = window.setTimeout(() => {
    idleStopTimer = null;
    if (hasListeners()) return;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    stopHeartbeat();
    const current = connection;
    connection = null;
    startPromise = null;
    if (current) void current.stop();
  }, 250);
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (connection?.state === HubConnectionState.Connected) {
      void connection.invoke('Heartbeat', isActive()).catch(() => undefined);
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function syncActive(): Promise<void> {
  if (connection?.state !== HubConnectionState.Connected) return;
  await connection.invoke('SetActive', isActive()).catch(() => undefined);
}

async function refreshMessages(listener: MessageListener): Promise<void> {
  const afterId = listener.getAfterId();
  if (afterId < 0) return;
  try {
    const items = await chatApi.listMessages(listener.conversationId, { afterId });
    if (items.length > 0) listener.callback(items);
  } catch {
    // Reconnect/nhịp kế tiếp sẽ catch-up lại theo after_id.
  }
}

function conversationPreview(message: ChatMessage, mine: boolean): string | null {
  const text =
    message.msg_type === 'image'
      ? '[Hình ảnh]'
      : message.msg_type === 'file'
        ? '[Tệp đính kèm]'
        : (message.body ?? '').replace(/\n/g, ' ').trim();
  if (!text) return null;
  const clipped = text.length > 120 ? text.slice(0, 120) : text;
  return mine ? `Bạn: ${clipped}` : clipped;
}

/** Cập nhật preview/unread tại chỗ — tránh gọi lại ss_Chat_conversation_list mỗi tin mới. */
function patchConversationsFromMessage(message: ChatMessage): boolean {
  if (lastListItems.length === 0) return false;
  const idx = lastListItems.findIndex((item) => item.id === message.conversation_id);
  if (idx < 0) return false;

  const mine = actorUserId > 0 && message.sender_user_id === actorUserId;
  const viewing = [...messageListeners].some((listener) => listener.conversationId === message.conversation_id);
  const current = lastListItems[idx];
  const next: Conversation = {
    ...current,
    last_message_id: Math.max(current.last_message_id, message.id),
    last_message_at: message.created_at,
    last_preview: conversationPreview(message, mine) ?? current.last_preview,
    last_sender_name:
      mine || current.kind === 'direct'
        ? current.last_sender_name
        : (message.sender_name ?? current.last_sender_name),
    unread_count: mine || viewing ? 0 : current.unread_count + 1,
  };
  lastListItems = [next, ...lastListItems.filter((item) => item.id !== message.conversation_id)];
  lastListAt = Date.now();
  for (const listener of conversationListeners) {
    const query = listener.search.trim().toLowerCase();
    listener.callback(
      query
        ? lastListItems.filter((item) => (item.title ?? '').toLowerCase().includes(query))
        : lastListItems,
    );
  }
  return true;
}

async function loadConversations(search: string, force = false): Promise<Conversation[]> {
  const key = search.trim();
  const existing = listInflight.get(key);
  if (existing) return existing;
  if (!force && key === lastListKey && Date.now() - lastListAt < 1000) return lastListItems;

  const pending = chatApi.listConversations(key).then((items) => {
    lastListKey = key;
    lastListAt = Date.now();
    lastListItems = items;
    return items;
  });
  listInflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (listInflight.get(key) === pending) listInflight.delete(key);
  }
}

async function refreshConversation(listener: ConversationListener, force = false): Promise<void> {
  try {
    listener.callback(await loadConversations(listener.search, force));
  } catch {
    // Giữ state hiện tại, reconnect sau sẽ thử lại.
  }
}

function scheduleRefreshAllConversations(): void {
  if (listDebounceTimer !== null) window.clearTimeout(listDebounceTimer);
  listDebounceTimer = window.setTimeout(() => {
    listDebounceTimer = null;
    void refreshAllConversations(true);
  }, 300);
}

async function refreshAllConversations(force = false): Promise<void> {
  await Promise.all([...conversationListeners].map((listener) => refreshConversation(listener, force)));
}

function shouldSkipListCatchUp(): boolean {
  return listInflight.size > 0 || (lastListAt > 0 && Date.now() - lastListAt < 2000);
}

async function catchUpAll(): Promise<void> {
  const skipList = shouldSkipListCatchUp();
  const skipOaList = oaListInflight.size > 0 || (oaLastListAt > 0 && Date.now() - oaLastListAt < 2000);
  await Promise.all([
    ...[...messageListeners].map(refreshMessages),
    ...[...oaMessageListeners].map(refreshOaMessages),
    ...(skipList ? [] : [...conversationListeners].map((listener) => refreshConversation(listener))),
    ...(skipOaList ? [] : [...oaConversationListeners].map((listener) => refreshOaConversation(listener))),
  ]);
}

/**
 * DTO OA được fan-out chung cho cả nhóm nên sender_is_me mang giá trị của người gửi.
 * Tính lại theo actor của tab này, nếu không tin của đồng nghiệp sẽ hiện như tin mình gửi.
 */
function withOaSenderFlag(message: OaMessage): OaMessage {
  if (message.direction !== 'outbound') return { ...message, sender_is_me: false };
  const senderId = Number(message.sender_user_id) || 0;
  return { ...message, sender_is_me: senderId > 0 && senderId === actorUserId };
}

function oaPreview(message: OaMessage): string | null {
  const text =
    message.msg_type === 'text'
      ? (message.body ?? '').replace(/\n/g, ' ').trim()
      : message.file_name || (message.msg_type === 'image' ? '[Hình ảnh]' : '[Tệp đính kèm]');
  if (!text) return null;
  return text.length > 120 ? text.slice(0, 120) : text;
}

function canPatchOaList(): boolean {
  return oaLastListAt > 0 && oaLastListKey === '';
}

function replaceOaConversation(next: OaConversation): void {
  oaLastListItems = [next, ...oaLastListItems.filter((item) => item.id !== next.id)];
  oaLastListAt = Date.now();
  emitOaConversations();
}

function upsertOaConversation(conversation: OaConversation | null | undefined): boolean {
  if (!conversation || !canPatchOaList()) return false;
  const current = oaLastListItems.find((item) => item.id === conversation.id);
  const inboundNew =
    conversation.last_direction === 'inbound' &&
    (!current || conversation.last_message_id > (current.last_message_id || 0));
  replaceOaConversation({
    ...conversation,
    unread_count: inboundNew ? (current?.unread_count || 0) + 1 : (current?.unread_count ?? 0),
    last_read_message_id: current?.last_read_message_id ?? conversation.last_read_message_id ?? 0,
    notify_mode: current?.notify_mode ?? conversation.notify_mode ?? 'all',
  });
  return true;
}

function patchOaConversationsFromMessage(message: OaMessage): boolean {
  if (!canPatchOaList()) return false;
  const current = oaLastListItems.find((item) => item.id === message.thread_id);
  if (!current) return false;
  // oa.inbox.updated đi trước — đã cộng unread local, không cộng thêm lần nữa.
  if (current.last_message_id >= message.id) return true;

  const inbound = message.direction === 'inbound';
  replaceOaConversation({
    ...current,
    last_message_id: message.id,
    last_message_at: message.created_at,
    last_direction: message.direction,
    last_preview: oaPreview(message) ?? current.last_preview,
    unread_count: inbound ? current.unread_count + 1 : current.unread_count,
  });
  return true;
}

function applyOaRead(event: OaReadEvent): void {
  if (!event.thread_id || (actorUserId > 0 && event.user_id !== actorUserId)) return;
  if (!canPatchOaList()) {
    scheduleRefreshAllOaConversations();
    return;
  }
  const current = oaLastListItems.find((item) => item.id === event.thread_id);
  if (!current) {
    scheduleRefreshAllOaConversations();
    return;
  }
  replaceOaConversation({
    ...current,
    unread_count: 0,
    last_read_message_id: event.last_read_message_id || current.last_read_message_id || 0,
  });
}

function applyOaReadAll(userId: number): void {
  if (actorUserId > 0 && userId !== actorUserId) return;
  if (!canPatchOaList()) {
    scheduleRefreshAllOaConversations();
    return;
  }
  oaLastListItems = oaLastListItems.map((item) =>
    item.unread_count > 0
      ? { ...item, unread_count: 0, last_read_message_id: item.last_message_id || item.last_read_message_id }
      : item,
  );
  oaLastListAt = Date.now();
  emitOaConversations();
}

export function patchOaConversation(id: number, patch: Partial<OaConversation>): void {
  if (!canPatchOaList()) {
    scheduleRefreshAllOaConversations();
    return;
  }
  const current = oaLastListItems.find((item) => item.id === id);
  if (!current) {
    scheduleRefreshAllOaConversations();
    return;
  }
  replaceOaConversation({ ...current, ...patch });
}

export function markAllOaConversationsRead(): void {
  applyOaReadAll(actorUserId);
}

function emitOaConversations(): void {
  for (const listener of oaConversationListeners) {
    if (listener.search.trim() !== oaLastListKey) continue;
    listener.callback(oaLastListItems);
  }
}

async function loadOaConversations(search: string, force = false): Promise<OaConversation[]> {
  const key = search.trim();
  const existing = oaListInflight.get(key);
  if (existing) return existing;
  if (!force && key === oaLastListKey && Date.now() - oaLastListAt < 1000) return oaLastListItems;

  const pending = oaApi
    .listConversations({ search: key, page: 1, pageSize: OA_LIST_PAGE_SIZE })
    .then((items) => {
      oaLastListKey = key;
      oaLastListAt = Date.now();
      oaLastListItems = items;
      return items;
    });
  oaListInflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (oaListInflight.get(key) === pending) oaListInflight.delete(key);
  }
}

async function refreshOaConversation(listener: OaConversationListener, force = false): Promise<void> {
  try {
    listener.callback(await loadOaConversations(listener.search, force));
  } catch {
    // Giữ state hiện tại, reconnect sau sẽ thử lại.
  }
}

async function refreshAllOaConversations(force = false): Promise<void> {
  await Promise.all([...oaConversationListeners].map((listener) => refreshOaConversation(listener, force)));
}

function scheduleRefreshAllOaConversations(): void {
  if (oaConversationListeners.size === 0) return;
  if (oaListDebounceTimer !== null) window.clearTimeout(oaListDebounceTimer);
  oaListDebounceTimer = window.setTimeout(() => {
    oaListDebounceTimer = null;
    void refreshAllOaConversations(true);
  }, 300);
}

async function refreshOaMessages(listener: OaMessageListener): Promise<void> {
  const afterId = listener.getAfterId();
  if (afterId <= 0) return;
  try {
    const items = await oaApi.listMessages(listener.threadId, { afterId, limit: OA_MESSAGE_LIMIT });
    if (items.length > 0) listener.callback(items);
  } catch {
    // Reconnect/nhịp kế tiếp sẽ catch-up lại theo after_id.
  }
}

/** Mutation phía client (gửi tin, đổi AI, đánh dấu đọc) — force, vẫn gộp in-flight. */
export function reloadOaConversations(): Promise<void> {
  return refreshAllOaConversations(true);
}

/** Mutation phía client (đổi tên, rời nhóm, …) — force, vẫn gộp in-flight. */
export function reloadConversations(): Promise<void> {
  return refreshAllConversations(true);
}

async function showDesktopNotification(message: ChatMessage): Promise<void> {
  if (
    platform !== 'web'
    || isActive()
    || getDesktopNotificationMode() !== 'chrome'
    || !('Notification' in window)
    || Notification.permission !== 'granted'
    || (actorUserId > 0 && message.sender_user_id === actorUserId)
  ) {
    return;
  }
  const mode = notifyModes.get(message.conversation_id) ?? 'all';
  if (mode === 'mute') return;
  if (mode === 'mention' && !(message.mentioned_user_ids ?? []).includes(actorUserId)) return;
  const allowed =
    connection?.state === HubConnectionState.Connected
      ? await connection.invoke<boolean>('CanNotify', 'web').catch(() => false)
      : false;
  if (!allowed) return;
  const notification = new Notification(message.sender_name || 'Tin nhắn mới', {
    body: message.body || (message.msg_type === 'image' ? '[Hình ảnh]' : '[Tệp đính kèm]'),
    tag: `chat:${message.conversation_id}`,
  });
  notification.onclick = () => {
    window.focus();
    window.location.assign(`/chat/${message.conversation_id}`);
    notification.close();
  };
}

function zaloUnreadKey(sourceId: string, conversationId: string): string {
  return `${sourceId}:${conversationId}`;
}

function emitZaloBadge(): void {
  let count = 0;
  for (const unread of zaloUnread.values()) {
    if (unread > 0) count += 1;
  }
  zaloBadge = count;
  for (const listener of zaloBadgeListeners) listener(count);
}

function applyZaloInboxEvent(event: ZaloInboxEvent): void {
  if (event?.source_id && event.conversation_id) {
    if (!zaloWatchSource || event.source_id === zaloWatchSource) {
      zaloUnread.set(zaloUnreadKey(event.source_id, event.conversation_id), Number(event.unread_count) || 0);
      emitZaloBadge();
    }
  }
  for (const listener of zaloInboxListeners) listener(event);
}

async function invokeWatchZalo(): Promise<void> {
  if (connection?.state !== HubConnectionState.Connected) return;
  await connection.invoke('WatchZalo', zaloWatchSource || '').catch(() => undefined);
}

async function showZaloDesktopNotification(event: ZaloInboxEvent): Promise<void> {
  if (
    platform !== 'web'
    || isActive()
    || getDesktopNotificationMode() !== 'chrome'
    || !('Notification' in window)
    || Notification.permission !== 'granted'
  ) {
    return;
  }
  const allowed =
    connection?.state === HubConnectionState.Connected
      ? await connection.invoke<boolean>('CanNotify', 'web').catch(() => false)
      : false;
  if (!allowed) return;
  const notification = new Notification(event.conversation_name || event.source_name || 'Zalo', {
    body: event.preview || 'Tin nhắn Zalo mới',
    tag: `zalo:${event.source_id}:${event.conversation_id}`,
  });
  notification.onclick = () => {
    window.focus();
    window.location.assign('/chat/zalo');
    notification.close();
  };
}

/** Nguồn Zalo đang chọn — Chat.Api dùng để FCM khi tab ẩn. */
export function watchZaloSource(sourceId: string): void {
  zaloWatchSource = (sourceId || '').trim().toLowerCase();
  void ensureStarted().then(() => invokeWatchZalo());
}

export function getZaloBadgeCount(): number {
  return zaloBadge;
}

export function seedZaloUnread(
  sourceId: string,
  items: Array<{ id: string; unread_count?: number }>,
): void {
  zaloUnread.clear();
  for (const item of items) {
    zaloUnread.set(zaloUnreadKey(sourceId, item.id), Number(item.unread_count) || 0);
  }
  emitZaloBadge();
}

export function subscribeZaloInbox(onEvent: (event: ZaloInboxEvent) => void): ChatSubscription {
  zaloInboxListeners.add(onEvent);
  void ensureStarted();
  return {
    stop: () => {
      zaloInboxListeners.delete(onEvent);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeZaloBadge(onCount: (count: number) => void): ChatSubscription {
  zaloBadgeListeners.add(onCount);
  onCount(zaloBadge);
  void ensureStarted();
  return {
    stop: () => {
      zaloBadgeListeners.delete(onCount);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeOaInbox(onEvent: (event: OaInboxEvent) => void): ChatSubscription {
  oaInboxListeners.add(onEvent);
  void ensureStarted();
  return {
    stop: () => {
      oaInboxListeners.delete(onEvent);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeOaConversations(
  search: string,
  onConversations: (items: OaConversation[]) => void,
): ChatSubscription {
  const listener: OaConversationListener = { search, callback: onConversations };
  oaConversationListeners.add(listener);
  void ensureStarted();
  void refreshOaConversation(listener);
  return {
    stop: () => {
      oaConversationListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeOaMessages(
  threadId: number,
  getAfterId: () => number,
  onMessages: (messages: OaMessage[]) => void,
): ChatSubscription {
  const listener: OaMessageListener = { threadId, getAfterId, callback: onMessages };
  oaMessageListeners.add(listener);
  void ensureStarted();
  return {
    stop: () => {
      oaMessageListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeMessages(
  conversationId: number,
  getAfterId: () => number,
  onMessages: (messages: ChatMessage[]) => void,
): ChatSubscription {
  const listener: MessageListener = {
    conversationId,
    getAfterId,
    callback: onMessages,
  };
  messageListeners.add(listener);
  void ensureStarted();
  return {
    stop: () => {
      messageListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeConversations(
  search: string,
  onConversations: (items: Conversation[]) => void,
): ChatSubscription {
  const listener: ConversationListener = { search, callback: onConversations };
  conversationListeners.add(listener);
  void ensureStarted();
  void refreshConversation(listener);
  return {
    stop: () => {
      conversationListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeConversationRead(
  onRead: (event: ConversationReadEvent) => void,
): ChatSubscription {
  const listener: ConversationReadListener = { callback: onRead };
  conversationReadListeners.add(listener);
  void ensureStarted();
  return {
    stop: () => {
      conversationReadListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

export function subscribeContacts(onContactUpdated: () => void): ChatSubscription {
  const listener: ContactListener = { callback: onContactUpdated };
  contactListeners.add(listener);
  void ensureStarted();
  return {
    stop: () => {
      contactListeners.delete(listener);
      scheduleStopIfUnused();
    },
  };
}

/** Giữ hub khi còn trong shell Chat (Chat / Danh bạ / Zalo / Cài đặt) — tránh stop/reconnect 404 lúc đổi tab. */
export function subscribeChatSession(): ChatSubscription {
  sessionRetain += 1;
  void ensureStarted();
  return {
    stop: () => {
      sessionRetain = Math.max(0, sessionRetain - 1);
      scheduleStopIfUnused();
    },
  };
}

function onVisibilityChanged(): void {
  if (hasListeners()) void ensureStarted();
  void syncActive();
  if (isActive()) void catchUpAll();
}

document.addEventListener('visibilitychange', onVisibilityChanged);
window.addEventListener('online', () => {
  if (hasListeners()) void ensureStarted();
  void catchUpAll();
});
window.addEventListener('message', (event) => {
  const data = event.data as { type?: string; visible?: unknown } | null;
  if (data?.type !== 'arito-shell-visibility' || typeof data.visible !== 'boolean') return;
  if (window.parent !== window && event.source !== window.parent) return;
  shellVisible = data.visible;
  onVisibilityChanged();
});
