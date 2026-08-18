import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { chatApi, getChatApiBase, type ChatMessage, type Conversation, type ConversationNotifyMode } from '../api/chatApi';
import { getJwt } from '../api/client';

export type ChatSubscription = { stop: () => void };
export type ChatPlatform = 'web' | 'mobile';
export type DesktopNotificationMode = 'badge' | 'chrome' | 'off';

const HEARTBEAT_MS = 30_000;

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

type ConversationReadListener = {
  callback: (event: ConversationReadEvent) => void;
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
const zaloInboxListeners = new Set<(event: ZaloInboxEvent) => void>();
const zaloBadgeListeners = new Set<(count: number) => void>();
const zaloUnread = new Map<string, number>();
let zaloWatchSource = '';
let zaloBadge = 0;
const listInflight = new Map<string, Promise<Conversation[]>>();
let listDebounceTimer: number | null = null;
let lastListKey = '';
let lastListAt = 0;
let lastListItems: Conversation[] = [];

function hasListeners(): boolean {
  return (
    sessionRetain
    + messageListeners.size
    + conversationListeners.size
    + contactListeners.size
    + conversationReadListeners.size
    + zaloInboxListeners.size
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
  await Promise.all([
    ...[...messageListeners].map(refreshMessages),
    ...(skipList ? [] : [...conversationListeners].map((listener) => refreshConversation(listener))),
  ]);
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
