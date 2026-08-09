import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminApp, getAdminForm, patchAdminApp, putAdminForm } from '../api/formApi';
import { useAuth } from '../auth/AuthContext';

export function AdminAppPage() {
  const { id = '' } = useParams();
  const { jwt } = useAuth();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [formIds, setFormIds] = useState<string[]>([]);
  const [activeForm, setActiveForm] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(id);

  const load = async () => {
    const res = await getAdminApp(id);
    if (!res.success || !res.data) {
      setError(res.error || 'Không tải app');
      return;
    }
    const app = res.data.app;
    setSlug(app.slug);
    setTitle(app.title);
    setStatus(app.status);
    setFormIds(res.data.formIds);
    const first = res.data.formIds[0] || app.entryFormId;
    setActiveForm(first);
    await loadForm(app.slug, first);
  };

  const loadForm = async (appKey: string, formId: string) => {
    const res = await getAdminForm(appKey, formId);
    if (!res.success || !res.data) {
      setError(res.error || 'Không tải form');
      return;
    }
    setJsonText(JSON.stringify(res.data.json, null, 2));
    setError(null);
  };

  useEffect(() => {
    if (!jwt || !id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt, id]);

  if (!jwt) {
    return (
      <div className="shell">
        <div className="banner">Cần JWT.</div>
      </div>
    );
  }

  return (
    <div className="shell wide stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{title || id}</h1>
        <Link to="/admin">← List</Link>
      </div>
      {error && <div className="banner">{error}</div>}
      {message && <div className="toast success">{message}</div>}

      <div className="card stack">
        <div className="row">
          <label className="field" style={{ flex: 2 }}>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <button
            type="button"
            onClick={async () => {
              const res = await patchAdminApp(slug, { title, status });
              setMessage(res.success ? 'Đã lưu meta' : res.error || 'Lỗi');
            }}
          >
            Lưu meta
          </button>
        </div>
        <p className="muted">
          Embed link:{' '}
          <code>
            /runtime/{slug}?mobile=true&amp;embed_token=…
          </code>
        </p>
      </div>

      <div className="card stack">
        <div className="row">
          {formIds.map((fid) => (
            <button
              key={fid}
              type="button"
              className={fid === activeForm ? undefined : 'secondary'}
              onClick={() => {
                setActiveForm(fid);
                void loadForm(slug, fid);
              }}
            >
              {fid}
            </button>
          ))}
        </div>
        <textarea
          style={{ minHeight: 360, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div className="row">
          <button
            type="button"
            onClick={async () => {
              try {
                const parsed = JSON.parse(jsonText) as unknown;
                const res = await putAdminForm(slug, activeForm, parsed);
                setMessage(res.success ? 'Đã lưu form.json' : res.error || 'Lỗi');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'JSON invalid');
              }
            }}
          >
            Lưu form JSON
          </button>
          <Link to={`/runtime/${slug}?preview=true`}>Preview draft</Link>
        </div>
      </div>
    </div>
  );
}
