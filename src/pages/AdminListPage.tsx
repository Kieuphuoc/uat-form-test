import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAdminApp, listAdminApps } from '../api/formApi';
import { useAuth } from '../auth/AuthContext';
import type { AdminAppSummary } from '../types/form';

export function AdminListPage() {
  const { jwt, status } = useAuth();
  const [apps, setApps] = useState<AdminAppSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await listAdminApps();
    if (!res.success || !res.data) {
      setError(res.error || 'Không tải list');
      return;
    }
    setError(null);
    setApps(res.data);
  };

  useEffect(() => {
    if (status !== 'ready' || !jwt) return;
    void reload();
  }, [status, jwt]);

  const onCreate = async () => {
    setBusy(true);
    try {
      const res = await createAdminApp({ slug, title: title || slug });
      if (!res.success) {
        setError(res.error || 'Tạo thất bại');
        return;
      }
      setSlug('');
      setTitle('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (!jwt) {
    return (
      <div className="shell stack">
        <div className="banner">Admin cần JWT (embed từ mobile hoặc session Form.Api).</div>
        <Link to="/">← Home</Link>
      </div>
    );
  }

  return (
    <div className="shell wide stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Form Admin</h1>
        <Link to="/">Home</Link>
      </div>
      {error && <div className="banner">{error}</div>}

      <div className="card stack">
        <strong>Tạo app</strong>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="leave" />
          </label>
          <label className="field" style={{ flex: 2 }}>
            title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Đăng ký nghỉ" />
          </label>
          <button type="button" disabled={busy || !slug.trim()} onClick={() => void onCreate()}>
            Tạo
          </button>
        </div>
      </div>

      <div className="card stack">
        {apps.length === 0 && <p className="muted">Chưa có app.</p>}
        {apps.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{a.title}</strong>
              <div className="muted">
                {a.slug} · {a.status} · forms: {a.formIds.join(', ')}
              </div>
            </div>
            <div className="row">
              <Link to={`/admin/apps/${a.slug}`}>Sửa</Link>
              <Link to={`/runtime/${a.slug}${a.status !== 'published' ? '?preview=true' : ''}`}>
                Runtime
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
