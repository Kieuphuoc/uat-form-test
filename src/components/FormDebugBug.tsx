import { useCallback, useEffect, useState } from 'react';
import { getAdminApp, getAdminForm } from '../api/formApi';
import { emitFormDebugLog, isFormDebugEnabled } from '../lib/formDebug';
import { resolveLocalizedText } from '../lib/localizedText';
import type { ClientFormDto } from '../types/form';

type Props = {
  slug: string;
  form: ClientFormDto;
};

type SpecInfo = {
  file?: string;
  relativePath?: string;
  fileId?: string;
  fileName?: string;
  contentSource?: string;
  filesBaseUrl?: string;
  folderId?: string;
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
        relativePath: formRes.data.relativePath,
        fileId: formRes.data.fileId,
        fileName: formRes.data.fileName,
        contentSource: formRes.data.contentSource ?? appRes.data?.contentSource,
        filesBaseUrl: formRes.data.filesBaseUrl,
        folderId: formRes.data.folderId,
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
                slug: <code>{slug}</code> · formId: <code>{form.id}</code> ·{' '}
                {resolveLocalizedText(form.title, 'v')}
              </p>
              {loading ? <p className="muted">Đang tải từ Form.Api…</p> : null}
              {info?.error ? <div className="banner">{info.error}</div> : null}
              {info && !info.error ? (
                <>
                  <p className="muted">
                    source: <code>{info.contentSource || '?'}</code>
                    {info.filesBaseUrl ? (
                      <>
                        {' '}
                        · host: <code>{info.filesBaseUrl}</code>
                      </>
                    ) : null}
                    {info.folderId ? (
                      <>
                        {' '}
                        · folderId: <code>{info.folderId}</code>
                      </>
                    ) : null}
                  </p>
                  {info.relativePath ? (
                    <p>
                      Path: <code>{info.relativePath}</code>
                    </p>
                  ) : null}
                  {info.fileName ? (
                    <p>
                      File: <code>{info.fileName}</code>
                    </p>
                  ) : info.file ? (
                    <p>
                      File: <code>{info.file}</code>
                    </p>
                  ) : null}
                  {info.fileId ? (
                    <p>
                      fileId: <code>{info.fileId}</code>
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
