import { Link } from 'react-router-dom';
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
 */
export function RequireAuth({ children, nextPath = '/', title = 'Cần đăng nhập' }: Props) {
  const { status, jwt, login, loginError, mobile } = useAuth();
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || jwt || !mobile) return;
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    notifyParentAuthLost('missing');
  }, [status, jwt, mobile]);

  if (status === 'loading') {
    return (
      <div className="shell">
        <p className="muted">Đang kiểm tra phiên…</p>
      </div>
    );
  }

  if (!jwt) {
    return (
      <div className="shell stack">
        <h1>{title}</h1>
        <div className="banner">Đăng nhập AritoID để tiếp tục.</div>
        {loginError && <div className="banner">{loginError}</div>}
        <div className="row">
          <button type="button" onClick={() => void login(nextPath, { requireAdmin: false })}>
            Đăng nhập AritoID
          </button>
          <Link to="/">Trang chủ</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
