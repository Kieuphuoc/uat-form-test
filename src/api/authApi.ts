import { apiFetch, type ApiResult } from './client';

export type AuthUser = {
  userId: number;
  clientId: string;
  email: string;
  nickname: string;
  isAdmin: boolean;
  /** JWT claim form_dev — unlock Admin bằng password developMode. */
  formDev?: boolean;
  /** Ngôn ngữ UI: v | e | o */
  lan?: 'v' | 'e' | 'o' | string;
};

export type AuthConfiguredClient = {
  clientId: string;
  name: string;
};

export type DemoRuntime = {
  slug: string;
  label: string;
  description?: string;
  icon?: string;
};

export type AuthConfig = {
  enabled: boolean;
  loginUrl?: string;
  loginSlug?: string;
  mockEnabled?: boolean;
  aritoClientId?: string;
  dataSelectionEnabled?: boolean;
  clientSelectionEnabled?: boolean;
  clients?: AuthConfiguredClient[];
  developMode?: boolean;
  demoRuntimes?: DemoRuntime[];
};

export function mapAuthUser(raw: Record<string, unknown>): AuthUser {
  const isAdminRaw = raw.isAdmin ?? raw.is_admin;
  const formDevRaw = raw.formDev ?? raw.form_dev;
  return {
    userId: Number(raw.userId ?? raw.user_id ?? 0),
    clientId: String(raw.clientId ?? raw.client_id ?? ''),
    email: String(raw.email ?? ''),
    nickname: String(raw.nickname ?? ''),
    isAdmin: isAdminRaw === true || isAdminRaw === 1 || isAdminRaw === '1',
    formDev: formDevRaw === true || formDevRaw === 1 || formDevRaw === '1',
    lan: String(raw.lan ?? 'v'),
  };
}

export type SsoLoginResponse = {
  jwt: string;
  user: AuthUser;
};

function readKeycloakFromDocument(): string | undefined {
  try {
    const m = document.cookie.match(/(?:^|;\s*)keycloak=([^;]*)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await apiFetch<AuthConfig>('/auth/config');
  if (res.success && res.data) return res.data;
  return { enabled: true };
}

export async function fetchAuthMe(): Promise<ApiResult<AuthUser>> {
  const res = await apiFetch<AuthUser>('/auth/me');
  if (res.success && res.data) {
    return { ...res, data: mapAuthUser(res.data as unknown as Record<string, unknown>) };
  }
  return res;
}

/** Đổi cookie keycloak (AritoID) → JWT Form.Api. */
export async function authAritoSession(): Promise<ApiResult<SsoLoginResponse>> {
  const keycloakData = readKeycloakFromDocument();
  return apiFetch<SsoLoginResponse>('/auth/arito-session', {
    method: 'POST',
    body: JSON.stringify(keycloakData ? { keycloakData } : {}),
  });
}

export async function unlockDevelopMode(pass: string): Promise<ApiResult<SsoLoginResponse>> {
  return apiFetch<SsoLoginResponse>('/auth/develop-unlock', {
    method: 'POST',
    body: JSON.stringify({ pass }),
  });
}

export function buildLoginHref(loginUrl: string, nextPath = '/admin'): string {
  const dest = nextPath.startsWith('/') ? nextPath : '/admin';
  const returnPath =
    dest === '/account/zalo/mini-app' || dest.startsWith('/account/zalo/mini-app?')
      ? '/redirect/mini-app'
      : `/redirect?from=idp&next=${encodeURIComponent(dest)}`;
  const returnUrl = `${window.location.origin}${returnPath}`;
  try {
    const url = new URL(loginUrl);
    url.searchParams.set('returnUrl', returnUrl);
    return url.toString();
  } catch {
    const sep = loginUrl.includes('?') ? '&' : '?';
    return `${loginUrl}${sep}returnUrl=${encodeURIComponent(returnUrl)}`;
  }
}

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return !!user?.isAdmin;
}

export type ZaloMapping = {
  linked: boolean;
  userId: number;
  zaloId?: string | null;
};

export type ZaloBindStart = {
  bindToken: string;
  expiresIn: number;
  qrUrl: string;
  miniAppId?: string;
};

export async function fetchZaloMapping(): Promise<ApiResult<ZaloMapping>> {
  return apiFetch<ZaloMapping>('/auth/zalo/mapping');
}

export async function startZaloBind(handoffId?: string): Promise<ApiResult<ZaloBindStart>> {
  const id = handoffId?.trim();
  return apiFetch<ZaloBindStart>('/auth/zalo/bind/start', {
    method: 'POST',
    body: JSON.stringify(id ? { handoffId: id } : {}),
  });
}

export async function unbindZalo(): Promise<ApiResult<{ linked: boolean; userId: number }>> {
  return apiFetch('/auth/zalo/unbind', { method: 'POST' });
}
