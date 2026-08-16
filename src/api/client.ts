const JWT_KEY = 'arito_form_jwt';

export function getApiBase(): string {
  const v = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : 'http://localhost:5600/api').replace(/\/$/, '');
}

export function getJwt(): string | null {
  return sessionStorage.getItem(JWT_KEY) || localStorage.getItem(JWT_KEY);
}

export function setJwt(token: string, persist = true): void {
  sessionStorage.setItem(JWT_KEY, token);
  if (persist) localStorage.setItem(JWT_KEY, token);
  else localStorage.removeItem(JWT_KEY);
}

export function clearJwt(): void {
  sessionStorage.removeItem(JWT_KEY);
  localStorage.removeItem(JWT_KEY);
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** user_id từ claim — chế độ embed_token không gọi /auth/me nên vẫn phải biết mình là ai. */
export function getJwtUserId(jwt: string): number {
  const claims = decodeJwtPayload(jwt);
  if (!claims) return 0;
  const raw = claims.user_id ?? claims.nameid ?? claims.sub;
  const id = Number(typeof raw === 'string' ? raw.trim() : raw);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

export function isJwtExpired(jwt: string): boolean {
  const claims = decodeJwtPayload(jwt);
  if (!claims) return true;
  const exp = Number(claims.exp);
  if (!exp) return false;
  return Date.now() / 1000 >= exp - 30;
}

export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: unknown;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  const jwt = getJwt();
  if (jwt && !isJwtExpired(jwt)) {
    headers.set('Authorization', `Bearer ${jwt}`);
  }

  const url = path.startsWith('http')
    ? path
    : `${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, { ...init, headers, credentials: 'include' });
  const text = await res.text();
  let body: ApiResult<T> | null = null;
  try {
    body = text ? (JSON.parse(text) as ApiResult<T>) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    return {
      success: false,
      error: body?.error || `HTTP ${res.status}`,
      meta: body?.meta,
    };
  }

  return body ?? { success: true };
}
