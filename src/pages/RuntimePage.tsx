import { useEffect, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchRuntimeApp, fetchRuntimeForm } from '../api/formApi';
import { useAuth } from '../auth/AuthContext';
import { FormOuterChrome } from '../components/FormOuterChrome';
import { FormRuntimeHost } from '../components/FormRuntimeView';
import { useUiLan } from '../hooks/useUiLan';
import { emitFormDebugLog, isFormDebugEnabled } from '../lib/formDebug';
import { clearRuntimeFormCacheForSlug } from '../lib/formRuntimeCache';
import { uiCopy } from '../lib/uiCopy';
import { notifyParentAuthLost } from '../lib/embedAuthBridge';
import type { ClientFormDto } from '../types/form';

type RuntimePayload = {
  slug: string;
  form: ClientFormDto;
  datasets?: Record<string, Record<string, unknown>[]>;
  values?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

/** Query `v.<controlId>=...` → prefill giá trị control (mobile QR, deep-link…). */
function valuesFromQuery(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    if (!key.startsWith('v.')) continue;
    const id = key.slice(2).trim();
    if (!id) continue;
    out[id] = value;
  }
  return out;
}

function mergeValues(
  base?: Record<string, unknown>,
  fromQuery?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!fromQuery || Object.keys(fromQuery).length === 0) return base;
  return { ...(base ?? {}), ...fromQuery };
}

export function RuntimePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === 'true';
  const formId = (params.get('formId') || '').trim();
  const formModeParam = (params.get('formMode') || '').trim() || null;
  const { status, jwt, mobile } = useAuth();
  const lan = useUiLan();
  const [data, setData] = useState<RuntimePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authLostNotifiedRef = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || jwt || !mobile) return;
    if (authLostNotifiedRef.current) return;
    authLostNotifiedRef.current = true;
    notifyParentAuthLost('missing');
  }, [status, jwt, mobile]);

  useEffect(() => {
    if (import.meta.env.DEV && slug) clearRuntimeFormCacheForSlug(slug);
  }, [slug]);

  useEffect(() => {
    if (status !== 'ready' || !slug) return;
    let cancelled = false;
    const fromQuery = valuesFromQuery(params);
    (async () => {
      setError(null);
      setData(null);

      if (formId) {
        const res = await fetchRuntimeForm(slug, formId, preview);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setError(res.error || uiCopy(lan, 'cannotLoadForm'));
          return;
        }
        const payload: RuntimePayload = {
          slug,
          form: res.data.form,
          datasets: res.data.datasets,
          values: mergeValues(res.data.values, fromQuery),
          state: res.data.state,
        };
        setData(payload);
        if (isFormDebugEnabled()) {
          emitFormDebugLog(`runtime form ${slug}/${formId}`, {
            slug,
            formId,
            form: res.data.form,
          });
        }
        return;
      }

      const res = await fetchRuntimeApp(slug, preview);
      if (cancelled) return;
      if (!res.success || !res.data) {
        setError(res.error || uiCopy(lan, 'cannotLoadApp'));
        return;
      }
      setData({
        slug: res.data.slug,
        form: res.data.form,
        datasets: res.data.datasets,
        values: mergeValues(res.data.values, fromQuery),
        state: res.data.state,
      });
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
  }, [status, slug, preview, formId, jwt, lan, params]);

  if (status === 'loading') {
    return (
      <div className="shell">
        <p className="muted">{uiCopy(lan, 'initializing')}</p>
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
        <p className="muted">{uiCopy(lan, 'loadingForm')}</p>
      </div>
    );
  }

  const host = (
    <FormRuntimeHost
      slug={data.slug}
      initialForm={data.form}
      initialDatasets={data.datasets}
      initialValues={data.values}
      initialState={data.state}
      initialFormMode={formModeParam}
      preview={preview}
    />
  );

  if (mobile) return host;
  return <FormOuterChrome fallbackTitle={data.form.id}>{host}</FormOuterChrome>;
}
