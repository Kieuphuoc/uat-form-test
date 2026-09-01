import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchAuthConfig } from '../api/authApi';

const IDP_NET = 'https://id.arito.net';
const IDP_VN = 'https://id.arito.vn';
const DEFAULT_SLUG = 'mobile-login';

function expireCookie(name: string, domain?: string): void {
  const base = `${encodeURIComponent(name)}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;max-age=0;path=/`;
  try {
    document.cookie = domain ? `${base};domain=${domain}` : base;
  } catch {
    /* ignore */
  }
}

/** Xóa cookie phiên AritoID trên WebView (giống mobile CookieManager trước khi mở IdP). */
export function clearIdpCookies(): void {
  const names = ['keycloak', 'Keycloak', 'KEYCLOAK'];
  try {
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim();
      if (name) names.push(name);
    }
  } catch {
    /* ignore */
  }

  const host = window.location.hostname.toLowerCase();
  const domains = new Set<string>(['', host]);
  if (host.endsWith('.arito.net') || host === 'arito.net') {
    domains.add('.arito.net');
    domains.add('arito.net');
  }
  if (host.endsWith('.arito.vn') || host === 'arito.vn') {
    domains.add('.arito.vn');
    domains.add('arito.vn');
  }

  const unique = [...new Set(names.filter(Boolean))];
  for (const name of unique) {
    expireCookie(name);
    for (const domain of domains) {
      if (domain) expireCookie(name, domain);
    }
  }

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('arito_form_jwt');
  } catch {
    /* ignore */
  }
}

function idpBaseForHost(): string {
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('.arito.vn') || host === 'arito.vn') return IDP_VN;
  return IDP_NET;
}

function slugFromLoginUrl(loginUrl?: string): string {
  try {
    const path = new URL(loginUrl || '').pathname.replace(/^\/+|\/+$/g, '');
    const first = path.split('/')[0]?.trim();
    return first && first !== 'redirect' ? first : '';
  } catch {
    return '';
  }
}

/** Trang trung gian: xóa cookie rồi mở AritoID (prompt login mới). */
export function ZaloFreshLoginPage() {
  const { handoff } = useParams<{ handoff?: string }>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      clearIdpCookies();
      const cfg = await fetchAuthConfig();
      if (cancelled) return;
      const origin = window.location.origin.replace(/\/$/, '');
      const id = (handoff ?? '').trim();
      const returnPath = id ? `/redirect/mini-app/${encodeURIComponent(id)}` : '/redirect/mini-app';
      const returnUrl = `${origin}${returnPath}`;
      const slug =
        (cfg.loginSlug ?? '').trim() || slugFromLoginUrl(cfg.loginUrl) || DEFAULT_SLUG;
      const url = new URL(`${idpBaseForHost()}/${encodeURIComponent(slug)}`);
      url.searchParams.set('returnUrl', returnUrl);
      url.searchParams.set('prompt', 'login');
      url.searchParams.set('max_age', '0');
      url.searchParams.set('logout', '1');
      window.location.replace(url.toString());
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff]);

  return (
    <div className="shell stack" style={{ textAlign: 'center', paddingTop: 80 }}>
      <p>Đang xóa phiên cũ…</p>
      <p className="muted">Mở AritoID để đăng nhập tài khoản mới.</p>
    </div>
  );
}
