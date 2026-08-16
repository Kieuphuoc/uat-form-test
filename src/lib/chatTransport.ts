import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { chatApi, getChatApiBase, type ChatMessage, type Conversation } from '../api/chatApi';
import { getJwt } from '../api/client';

export type ChatSubscription = { stop: () => void };
export type ChatPlatform = 'web' | 'mobile';
export type DesktopNotificationMode = 'badge' | 'chrome' | 'off';

const NOTIFICATION_MODE_KEY = 'arito-chat:desktop-notification';
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

let platform: ChatPlatform = 'web';
let shellVisible = true;
let connection: HubConnection | null = null;
let startPromise: Promise<void> | null = null;
let retryTimer: number | null = null;
let heartbeatTimer: number | null = null;
let idleStopTimer: number | null = null;
const messageListeners = new Set<MessageListener>();
const conversationListeners = new Set<ConversationListener>();
const contactListeners = new Set<ContactListener>();

function hasListeners(): boolean {
  return messageListeners.size + conversationListeners.size + contactListeners.size > 0;
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

export function getDesktopNotificationMode(): DesktopNotificationMode {
  const value = window.localStorage.getItem(NOTIFICATION_MODE_KEY);
  return value === 'chrome' || value === 'off' ? value : 'badge';
}

export async function setDesktopNotificationMode(
  value: DesktopNotificationMode,
): Promise<DesktopNotificationMode> {
  let resolved = value;
  if (value === 'chrome') {
    if (!('Notification' in window)) {
      resolved = 'badge';
    } else if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') resolved = 'badge';
    }
  }
  window.localStorage.setItem(NOTIFICATION_MODE_KEY, resolved);
  return resolved;
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
    for (const listener of messageListeners) {
      if (listener.conversationId === message.conversation_id) void refreshMessages(listener);
    }
  });
  hub.on('message.recalled', (message: ChatMessage) => {
    for (const listener of messageListeners) {
      if (listener.conversationId === message.conversation_id) {
        listener.callback([message]);
        void refreshMessages(listener);
      }
    }
  });
  hub.on('conversation.updated', () => void refreshAllConversations());
  hub.on('conversation.read', () => void refreshAllConversations());
  hub.on('contact.updated', () => {
    for (const listener of contactListeners) listener.callback();
    void refreshAllConversations();
  });
  hub.onreconnecting(() => stopHeartbeat());
  hub.onreconnected(() => {
    startHeartbeat();
    void syncActive();
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

async function refreshConversation(listener: ConversationListener): Promise<void> {
  try {
    listener.callback(await chatApi.listConversations(listener.search));
  } catch {
    // Giữ state hiện tại, reconnect sau sẽ thử lại.
  }
}

async function refreshAllConversations(): Promise<void> {
  await Promise.all([...conversationListeners].map(refreshConversation));
}

async function catchUpAll(): Promise<void> {
  await Promise.all([
    ...[...messageListeners].map(refreshMessages),
    ...[...conversationListeners].map(refreshConversation),
  ]);
}

async function showDesktopNotification(message: ChatMessage): Promise<void> {
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
