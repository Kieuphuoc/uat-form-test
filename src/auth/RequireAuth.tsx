import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { notifyParentAuthLost } from '../lib/embedAuthBridge';

type Props = {
  children: React.ReactNode;
  /** Đường quay lại sau khi đăng nhập IdP. */
  nextPath?: string;
  title?: string;
};

/**
 * Cho mọi user đã đăng nhập (không cần admin) — dùng cho /chat.
 * Khác RequireAdmin: không kiểm tra isAdmin và quay về nextPath thay vì /admin.
 * `?embed=true`: tự login (cookie→JWT hoặc IdP), không hiện UI đăng nhập.
 */
export function RequireAuth({ children, nextPath = '/', title = 'Cần đăng nhập' }: Props) {
  const { status, jwt, login, loginError, mobile } = useAuth();
  const notifiedRef = useRef(false);
  const embedLoginStarted = useRef(false);
  const [params] = useSearchParams();
  const embed = params.get('embed') === 'true' || params.get('embed') === '1';
  const resolvedNext = embed
    ? nextPath.includes('embed=')
      ? nextPath
      : `${nextPath}${nextPath.includes('?') ? '&' : '?'}embed=true`
    : nextPath;

  useEffect(() => {
    if (status !== 'ready' || jwt || !mobile) return;
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    notifyParentAuthLost('missing');
  }, [status, jwt, mobile]);

  useEffect(() => {
    if (!embed || status !== 'ready' || jwt) return;
    if (embedLoginStarted.current) return;
    embedLoginStarted.current = true;
    void login(resolvedNext, { requireAdmin: false });
  }, [embed, status, jwt, login, resolvedNext]);

  if (status === 'loading') {
    return (
      <div className={embed ? 'zalo-embed' : 'shell'}>
        <p className="muted">Đang kiểm tra phiên…</p>
      </div>
    );
  }

  if (!jwt) {
    if (embed) {
      return (
        <div className="zalo-embed">
          <p className="muted">{loginError || 'Đang đăng nhập…'}</p>
        </div>
      );
    }
    return (
      <div className="shell stack">
        <h1>{title}</h1>
        <div className="banner">Đăng nhập AritoID để tiếp tục.</div>
        {loginError && <div className="banner">{loginError}</div>}
        <div className="row">
          <button type="button" onClick={() => void login(resolvedNext, { requireAdmin: false })}>
            Đăng nhập AritoID
          </button>
          <Link to="/">Trang chủ</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
