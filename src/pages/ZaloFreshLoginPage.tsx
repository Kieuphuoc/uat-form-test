import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { authAritoSession, fetchAuthConfig } from '../api/authApi';
import { getJwt, isJwtExpired } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const IDP_NET = 'https://id.arito.net';
const IDP_VN = 'https://id.arito.vn';
const DEFAULT_SLUG = 'mobile-login';

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

function miniAppPath(handoff?: string): string {
  const id = (handoff ?? '').trim();
  return id ? `/account/zalo/mini-app/${encodeURIComponent(id)}` : '/account/zalo/mini-app';
}

/** Có cookie/JWT AritoID → thẳng mini-app; chưa có → mở IdP (không ép nhập lại user/pass). */
export function ZaloFreshLoginPage() {
  const { handoff } = useParams<{ handoff?: string }>();
  const { acceptSession } = useAuth();
  const [message, setMessage] = useState('Đang kiểm tra phiên AritoID…');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = miniAppPath(handoff);

      setMessage('Đang kiểm tra cookie AritoID…');
      const session = await authAritoSession();
      if (cancelled) return;

      if (session.success && session.data?.jwt) {
        acceptSession(session.data.jwt, session.data.user);
        window.location.replace(next);
        return;
      }

      const existing = getJwt();
      if (existing && !isJwtExpired(existing)) {
        window.location.replace(next);
        return;
      }

      setMessage('Chưa có phiên — mở AritoID…');
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
      window.location.replace(url.toString());
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff, acceptSession]);

  return (
    <div className="shell stack" style={{ textAlign: 'center', paddingTop: 80 }}>
      <p>{message}</p>
      <p className="muted">Nếu đã đăng nhập AritoID, Mini App sẽ vào luôn — không cần nhập lại user/pass.</p>
    </div>
  );
}
