import { useCallback, useEffect, useState } from 'react';
import { getAdminApp, getAdminForm } from '../api/formApi';
import { emitFormDebugLog, isFormDebugEnabled } from '../lib/formDebug';
import type { ClientFormDto } from '../types/form';

type Props = {
  slug: string;
  form: ClientFormDto;
};

type SpecInfo = {
  file?: string;
  path?: string;
  contentRoot?: string;
  contentSource?: string;
  json?: unknown;
  error?: string;
};

/** Icon con bọ góc dưới trái — chỉ khi ?debug=1. */
export function FormDebugBug({ slug, form }: Props) {
  const enabled = isFormDebugEnabled();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<SpecInfo | null>(null);

  const loadSpec = useCallback(async () => {
    setLoading(true);
    setInfo(null);
    try {
      const [appRes, formRes] = await Promise.all([
        getAdminApp(slug),
        getAdminForm(slug, form.id),
      ]);

      if (!formRes.success || !formRes.data) {
        setInfo({ error: formRes.error || 'Không tải được form JSON từ Form.Api' });
        return;
      }

      const fileFromApp = appRes.data?.app?.forms?.find(
        (f) => f.id === form.id || f.id === formRes.data?.formId,
      )?.file;

      setInfo({
        file: formRes.data.file || fileFromApp,
        path: formRes.data.path,
        contentRoot: formRes.data.contentRoot ?? appRes.data?.contentRoot,
        contentSource: formRes.data.contentSource ?? appRes.data?.contentSource,
        json: formRes.data.json,
      });
    } catch (e) {
      setInfo({ error: e instanceof Error ? e.message : 'Lỗi tải spec' });
    } finally {
      setLoading(false);
    }
  }, [slug, form.id]);

  useEffect(() => {
    if (!enabled) return;
    emitFormDebugLog(`show Form ${slug}/${form.id}`, form);
  }, [enabled, slug, form.id]);

  useEffect(() => {
    if (open) void loadSpec();
  }, [open, loadSpec]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className="form-debug-bug"
        title="Debug form"
        aria-label="Debug form"
        onClick={() => setOpen(true)}
      >
        🐞
      </button>

      {open ? (
        <div className="form-debug-panel">
          <div className="form-debug-panel__card">
            <div className="form-debug-panel__head">
              <strong>Form debug</strong>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>
                Đóng
              </button>
            </div>
            <div className="form-debug-panel__body stack">
              <p className="muted">
                slug: <code>{slug}</code> · formId: <code>{form.id}</code> · {form.title}
              </p>
              {loading ? <p className="muted">Đang tải từ Form.Api…</p> : null}
              {info?.error ? <div className="banner">{info.error}</div> : null}
              {info && !info.error ? (
                <>
                  {info.contentRoot ? (
                    <p className="muted">
                      contentRoot: <code>{info.contentRoot}</code>
                      {info.contentSource ? ` (${info.contentSource})` : ''}
                    </p>
                  ) : null}
                  {info.file ? (
                    <p>
                      File: <code>{info.file}</code>
                    </p>
                  ) : null}
                  {info.path ? (
                    <p>
                      Path: <code>{info.path}</code>
                    </p>
                  ) : null}
                  <pre className="form-debug-json">
                    {JSON.stringify(info.json ?? form, null, 2)}
                  </pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
