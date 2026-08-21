import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuthConfig } from '../api/authApi';
import { useAuth } from './AuthContext';

type Props = {
  children: React.ReactNode;
};

/** Chỉ cho /admin/* — JWT + isAdmin, hoặc password developMode (claim form_dev). */
export function RequireAdmin({ children }: Props) {
  const { status, jwt, user, canAccessAdmin, login, logout, loginError, unlockDevelop } = useAuth();
  const [developMode, setDevelopMode] = useState<boolean | null>(null);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  useEffect(() => {
    if (!jwt || canAccessAdmin) {
      setDevelopMode(null);
      return;
    }
    let cancelled = false;
    void fetchAuthConfig().then((cfg) => {
      if (!cancelled) setDevelopMode(!!cfg.developMode);
    });
    return () => {
      cancelled = true;
    };
  }, [jwt, canAccessAdmin]);

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

  if (canAccessAdmin) {
    return <>{children}</>;
  }

  if (developMode === null) {
    return (
      <div className="shell">
        <p className="muted">Đang kiểm tra quyền…</p>
      </div>
    );
  }

  if (!developMode) {
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

  const onUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setPassError(null);
    try {
      const res = await unlockDevelop(pass);
      if (!res.ok) {
        setPassError(res.error || 'Sai password.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell stack">
      <h1>Form Admin</h1>
      <div className="banner">Nhập password develop mode để xem file và design.</div>
      {passError && <div className="banner">{passError}</div>}
      <form className="card stack" onSubmit={(e) => void onUnlock(e)}>
        <label className="field">
          Password
          <input
            type="password"
            value={pass}
            autoComplete="current-password"
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        <div className="row">
          <button type="submit" disabled={busy || !pass.trim()}>
            Vào Admin
          </button>
          <Link to="/">Home</Link>
        </div>
      </form>
    </div>
  );
}
