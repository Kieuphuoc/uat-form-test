import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Props = {
  children: React.ReactNode;
};

/** Chỉ cho /admin/* — cần JWT + isAdmin. Runtime embed không dùng. */
export function RequireAdmin({ children }: Props) {
  const { status, jwt, user, isAdmin, login, logout, loginError } = useAuth();

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
        <h1>Form Admin</h1>
        <div className="banner">Cần đăng nhập AritoID (tài khoản admin).</div>
        {loginError && <div className="banner">{loginError}</div>}
        <div className="row">
          <button type="button" onClick={() => void login('/admin')}>
            Đăng nhập
          </button>
          <Link to="/">Home</Link>
        </div>
        <p className="muted">
          Sau IdP sẽ về <code>/redirect</code> → đổi cookie → JWT. Runtime mobile vẫn dùng{' '}
          <code>embed_token</code>.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="shell stack">
        <h1>Không có quyền admin</h1>
        <div className="banner">
          Đã đăng nhập
          {user?.nickname || user?.email ? ` (${user.nickname || user.email})` : ''} nhưng không phải
          admin.
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => logout()}>
            Đăng xuất
          </button>
          <button type="button" onClick={() => void login('/admin')}>
            Đăng nhập lại
          </button>
          <Link to="/">Home</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
