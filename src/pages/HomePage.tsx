import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function HomePage() {
  const { jwt, user, isAdmin, login, logout, mobile } = useAuth();
  return (
    <div className="shell stack">
      <h1>Arito Form</h1>
      <p className="muted">
        Runtime form cho mobile embed (`embed_token`). Admin / Designer cần đăng nhập AritoID (admin).
      </p>
      <div className="card stack">
        <div className="row">
          <Link to="/runtime/leave">Demo /runtime/leave</Link>
          <Link to="/admin">Admin</Link>
          <Link to="/admin/design/leave">Designer</Link>
        </div>
        <p className="muted">
          JWT: {jwt ? 'có' : 'chưa'}
          {user?.nickname || user?.email ? ` · ${user.nickname || user.email}` : ''}
          {jwt ? (isAdmin ? ' · admin' : ' · không phải admin') : ''}
        </p>
        {!mobile && (
          <div className="row">
            {!jwt ? (
              <button type="button" onClick={() => void login('/admin')}>
                Đăng nhập Admin
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => logout()}>
                Đăng xuất
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
