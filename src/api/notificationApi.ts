import { getJwt, isJwtExpired } from './client';

const LOCAL_NOTI_DEFAULT = 'http://localhost:5300';

export function getNotificationApiBase(): string {
  const raw = (import.meta.env.VITE_NOTI_API_URL ?? LOCAL_NOTI_DEFAULT).trim();
  return (raw || LOCAL_NOTI_DEFAULT).replace(/\/$/, '');
}

export type NotificationPreference = {
  type: string;
  name: string;
  user_can_toggle: number;
  in_app: number;
  mail: number;
  firebase: number;
  has_override: number;
  scopes?: string | null;
};

export type NotificationDevice = {
  id: number;
  user_id: number;
  platform: string;
  device_id: string;
  enabled: number;
  status: number;
  datetime2?: string | null;
};

async function notiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const jwt = getJwt();
  if (!jwt || isJwtExpired(jwt)) throw new Error('Phiên đăng nhập đã hết hạn.');

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${jwt}`);
  if (init?.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${getNotificationApiBase()}${path}`, {
    ...init,
    headers,
    credentials: 'omit',
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(
      (body as { message?: string } | null)?.message ||
        `Notification API lỗi (HTTP ${response.status}).`,
    );
  }
  return body as T;
}

export const notificationApi = {
  getChatPreference: async () => {
    const result = await notiJson<{ items: NotificationPreference[] }>(
      '/api/notifications/preferences',
    );
    return (result.items ?? []).find((item) => item.type.toUpperCase() === 'CHAT') ?? null;
  },

  setChatPreference: (value: {
    in_app: boolean;
    mail: boolean;
    firebase: boolean;
  }) =>
    notiJson<NotificationPreference>('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ type: 'CHAT', ...value }),
    }),

  resetChatPreference: () =>
    notiJson<{ affected: number }>('/api/notifications/preferences/reset', {
      method: 'POST',
      body: JSON.stringify({ types: ['CHAT'] }),
    }),

  listDevices: () =>
    notiJson<{ items: NotificationDevice[] }>('/api/notifications/devices').then(
      (result) => result.items ?? [],
    ),
};
