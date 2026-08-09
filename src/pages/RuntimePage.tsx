import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchRuntimeApp } from '../api/formApi';
import { useAuth } from '../auth/AuthContext';
import { FormRuntimeHost } from '../components/FormRuntimeView';
import { emitFormDebugLog, isFormDebugEnabled } from '../lib/formDebug';
import type { RuntimeAppResponse } from '../types/form';

export function RuntimePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === 'true';
  const { status, jwt, mobile } = useAuth();
  const [data, setData] = useState<RuntimeAppResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !slug) return;
    let cancelled = false;
    (async () => {
      setError(null);
      const res = await fetchRuntimeApp(slug, preview);
      if (cancelled) return;
      if (!res.success || !res.data) {
        setData(null);
        setError(res.error || 'Không tải được app');
        return;
      }
      setData(res.data);
      if (isFormDebugEnabled()) {
        emitFormDebugLog(`runtime app ${slug}`, {
          id: res.data.id,
          slug: res.data.slug,
          entryFormId: res.data.entryFormId,
          status: res.data.status,
          form: res.data.form,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, slug, preview, jwt]);

  if (status === 'loading') {
    return (
      <div className="shell">
        <p className="muted">Đang khởi tạo…</p>
      </div>
    );
  }

  if (!jwt) {
    return (
      <div className="shell stack">
        <div className="banner">
          Cần JWT. Mở tab mobile với <code>authMode=embed_token</code>, hoặc đăng nhập qua Form.Api
          rồi lưu token.
        </div>
        {!mobile && <Link to="/">← Home</Link>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell stack">
        <div className="banner">{error}</div>
        {!mobile && <Link to="/admin">Admin</Link>}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <p className="muted">Đang tải form…</p>
      </div>
    );
  }

  return (
    <FormRuntimeHost
      slug={data.slug}
      initialForm={data.form}
      initialDatasets={data.datasets}
      initialValues={data.values}
      initialState={data.state}
      preview={preview}
    />
  );
}
