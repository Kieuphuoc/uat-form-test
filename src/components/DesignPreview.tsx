import { useEffect, useState } from 'react';
import { fetchRuntimeForm } from '../api/formApi';
import { clearRuntimeFormCacheForSlug } from '../lib/formRuntimeCache';
import type { LangCode } from '../lib/localizedText';
import type { ClientFormDto, FormMode } from '../types/form';
import { FormRuntimeHost } from './FormRuntimeView';

type Props = {
  slug: string;
  formId: string;
  /** Bump để reload sau Save — bắt buộc remount runtime. */
  refreshKey: number;
};

const MODES: { id: FormMode; label: string }[] = [
  { id: 'view', label: 'view' },
  { id: 'new', label: 'new' },
  { id: 'edit', label: 'edit' },
];

const LANS: { id: LangCode; label: string; title: string }[] = [
  { id: 'v', label: 'v', title: 'Tiếng Việt' },
  { id: 'e', label: 'e', title: 'English' },
  { id: 'o', label: 'o', title: 'Other' },
];

export function DesignPreview({ slug, formId, refreshKey }: Props) {
  const [form, setForm] = useState<ClientFormDto | null>(null);
  const [datasets, setDatasets] = useState<Record<string, Record<string, unknown>[]> | undefined>();
  const [values, setValues] = useState<Record<string, unknown> | undefined>();
  const [state, setState] = useState<Record<string, unknown> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Preview Designer mặc định edit để sửa được. */
  const [formMode, setFormMode] = useState<FormMode>('edit');
  /** Ngôn ngữ UI preview — mặc định v. */
  const [lan, setLan] = useState<LangCode>('v');

  useEffect(() => {
    if (!slug || !formId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setForm(null);
      clearRuntimeFormCacheForSlug(slug);
      const res = await fetchRuntimeForm(slug, formId, true, refreshKey);
      if (cancelled) return;
      setLoading(false);
      if (!res.success || !res.data) {
        setForm(null);
        setError(res.error || 'Không tải preview');
        return;
      }
      setForm(res.data.form);
      setDatasets(res.data.datasets);
      setValues(res.data.values);
      setState(res.data.state);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, formId, refreshKey]);

  if (!formId) {
    return <p className="muted">Chọn form để preview.</p>;
  }

  if (loading || !form) {
    if (error) return <div className="banner">{error}</div>;
    return <p className="muted">Đang tải preview…</p>;
  }

  if (error) {
    return <div className="banner">{error}</div>;
  }

  return (
    <div className="design-preview-stack">
      <div className="design-preview-toolbar">
        <div className="design-preview-mode" title="formMode preview">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`design-preview-mode-btn${formMode === m.id ? ' active' : ''}`}
              onClick={() => setFormMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="design-preview-mode design-preview-lan" title="Ngôn ngữ UI (lan)">
          {LANS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`design-preview-mode-btn${lan === m.id ? ' active' : ''}`}
              title={m.title}
              onClick={() => setLan(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="design-phone">
        <FormRuntimeHost
          key={`${slug}:${formId}:${refreshKey}:${formMode}:${lan}`}
          slug={slug}
          initialForm={form}
          initialDatasets={datasets}
          initialValues={values}
          initialState={state}
          initialFormMode={formMode}
          uiLan={lan}
          preview
          embedded
        />
      </div>
    </div>
  );
}
