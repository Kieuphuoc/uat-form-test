import { apiFetch, type ApiResult } from './client';

export type AuthUser = {
  userId: number;
  clientId: string;
  email: string;
  nickname: string;
  isAdmin: boolean;
  /** Ngôn ngữ UI: v | e | o */
  lan?: 'v' | 'e' | 'o' | string;
};

export type AuthConfig = {
  enabled: boolean;
  loginUrl?: string;
  loginSlug?: string;
  mockEnabled?: boolean;
  aritoClientId?: string;
};

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
  return apiFetch<AuthUser>('/auth/me');
}

/** Đổi cookie keycloak (AritoID) → JWT Form.Api. */
export async function authAritoSession(): Promise<ApiResult<SsoLoginResponse>> {
  const keycloakData = readKeycloakFromDocument();
  return apiFetch<SsoLoginResponse>('/auth/arito-session', {
    method: 'POST',
    body: JSON.stringify(keycloakData ? { keycloakData } : {}),
  });
}

export function buildLoginHref(loginUrl: string, nextPath = '/admin'): string {
  const returnUrl = `${window.location.origin}/redirect?from=idp&next=${encodeURIComponent(nextPath)}`;
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
