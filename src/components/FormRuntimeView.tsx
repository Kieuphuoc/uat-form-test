import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { fetchRuntimeForm, runAction } from '../api/formApi';
import type { ClientFormDto, RuntimeActionResponse } from '../types/form';
import { FormDebugBug } from './FormDebugBug';

type Toast = { text: string; level: string } | null;

type StackFrame = {
  formId: string;
  form: ClientFormDto;
  values: Record<string, unknown>;
  state: Record<string, unknown>;
  datasets: Record<string, Record<string, unknown>[]>;
  returnMap?: Record<string, string>;
  selectedRowKey?: string;
};

type Props = {
  slug: string;
  initialForm: ClientFormDto;
  initialDatasets?: Record<string, Record<string, unknown>[]>;
  initialValues?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  preview?: boolean;
};

function asInputValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v);
}

function applyDestMap(
  map: Record<string, string> | undefined,
  source: Record<string, unknown>,
  values: Record<string, unknown>,
  state: Record<string, unknown>,
) {
  if (!map) return;
  for (const [fromKey, dest] of Object.entries(map)) {
    const v = source[fromKey];
    if (dest.startsWith('state.')) state[dest.slice(6)] = v;
    else if (dest.startsWith('control.')) values[dest.slice(8)] = v;
    else state[dest] = v;
  }
}

export function FormRuntimeView({
  slug,
  initialForm,
  initialDatasets,
  initialValues,
  initialState,
  preview,
}: Props) {
  const [stack, setStack] = useState<StackFrame[]>([
    {
      formId: initialForm.id,
      form: initialForm,
      values: { ...(initialValues ?? {}) },
      state: { ...(initialState ?? {}) },
      datasets: { ...(initialDatasets ?? {}) },
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const top = stack[stack.length - 1]!;
  const isModal = stack.length > 1;

  const showToast = useCallback((text: string, level = 'info') => {
    setToast({ text, level });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const mergeResult = useCallback((frame: StackFrame, res: RuntimeActionResponse): StackFrame => {
    const next: StackFrame = {
      ...frame,
      values: { ...frame.values, ...(res.values ?? {}) },
      state: { ...frame.state, ...(res.state ?? {}) },
      datasets: { ...frame.datasets, ...(res.datasets ?? {}) },
    };
    return next;
  }, []);

  const runActions = useCallback(
    async (actionIds: string[], rowContext?: Record<string, unknown>) => {
      if (!actionIds.length) return;
      setBusy(true);
      try {
        let working = stack[stack.length - 1]!;
        let frames = [...stack];

        for (const actionId of actionIds) {
          const res = await runAction(slug, actionId, {
            formId: working.formId,
            controlValues: working.values,
            state: working.state,
            rowContext,
          });
          if (!res.success || !res.data) {
            showToast(res.error || 'Action lỗi', 'error');
            return;
          }

          const data = res.data;
          working = mergeResult(working, data);
          frames = [...frames.slice(0, -1), working];

          const ui = data.ui;
          if (ui?.message?.text) showToast(ui.message.text, ui.message.level || 'info');

          if (ui?.openForm?.formId) {
            const loaded = await fetchRuntimeForm(slug, ui.openForm.formId, preview);
            if (!loaded.success || !loaded.data) {
              showToast(loaded.error || 'Không mở được form', 'error');
              return;
            }
            // Không emit openForm ở đây — FormDebugBug sẽ log 1 lần "show Form" khi form hiện.
            frames = [
              ...frames,
              {
                formId: loaded.data.form.id,
                form: loaded.data.form,
                values: { ...(loaded.data.values ?? {}) },
                state: { ...(loaded.data.state ?? {}) },
                datasets: { ...(loaded.data.datasets ?? {}) },
                returnMap: ui.openForm.returnMap,
              },
            ];
            working = frames[frames.length - 1]!;
          }

          if (ui?.close) {
            if (frames.length <= 1) {
              showToast('Đã đóng', 'info');
            } else {
              const child = frames[frames.length - 1]!;
              const parent = { ...frames[frames.length - 2]! };
              const returned = ui.close.returnValues ?? {};
              applyDestMap(child.returnMap, returned, parent.values, parent.state);
              // also apply common fields onto control.approverName etc. if map uses those dests
              frames = [...frames.slice(0, -2), parent];
              working = parent;
            }
          }
        }

        setStack(frames);
      } finally {
        setBusy(false);
      }
    },
    [stack, slug, preview, mergeResult, showToast],
  );

  const setValue = (id: string, value: unknown) => {
    setStack((prev) => {
      const copy = [...prev];
      const last = { ...copy[copy.length - 1]! };
      last.values = { ...last.values, [id]: value };
      copy[copy.length - 1] = last;
      return copy;
    });
  };

  const controls = useMemo(
    () => [...top.form.controls].sort((a, b) => a.order - b.order),
    [top.form.controls],
  );
  const lists = useMemo(
    () => [...top.form.lists].sort((a, b) => a.order - b.order),
    [top.form.lists],
  );

  const body = (
    <div className="stack">
      {!isModal && <h1>{top.form.title}</h1>}
      {isModal && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{top.form.title}</h2>
          <button
            type="button"
            className="secondary"
            onClick={() => setStack((s) => s.slice(0, -1))}
            disabled={busy}
          >
            Đóng
          </button>
        </div>
      )}

      {controls.map((c) => {
        if (c.visible === false) return null;
        const disabled = c.enabled === false || busy;

        if (c.type === 'label') {
          return (
            <p key={c.id} className="muted">
              {c.text || c.label}
            </p>
          );
        }

        if (c.type === 'hidden') return null;

        if (c.type === 'button') {
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => void runActions(c.onClick ?? [])}
            >
              {c.text || c.label || c.id}
            </button>
          );
        }

        const common = {
          id: c.id,
          disabled,
          value: asInputValue(top.values[c.id]),
          onChange: (
            e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
          ) => {
            const v = c.type === 'number' ? Number(e.target.value) : e.target.value;
            setValue(c.id, v);
            if (c.onChange?.length) void runActions(c.onChange);
          },
        };

        return (
          <label key={c.id} className="field">
            <span>
              {c.label || c.id}
              {c.required ? ' *' : ''}
            </span>
            {c.type === 'textarea' ? (
              <textarea {...common} />
            ) : c.type === 'select' ? (
              <select {...common}>
                <option value="">—</option>
                {Array.isArray(c.options) &&
                  c.options.map((opt, i) => {
                    if (opt && typeof opt === 'object' && 'value' in (opt as object)) {
                      const o = opt as { value: string; label?: string };
                      return (
                        <option key={i} value={o.value}>
                          {o.label ?? o.value}
                        </option>
                      );
                    }
                    return (
                      <option key={i} value={String(opt)}>
                        {String(opt)}
                      </option>
                    );
                  })}
              </select>
            ) : (
              <input
                {...common}
                type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
              />
            )}
          </label>
        );
      })}

      {lists.map((list) => {
        const rows = top.datasets[list.bind] ?? [];
        return (
          <div key={list.id} className="card stack">
            <strong className="muted">{list.id}</strong>
            <table className="data">
              <thead>
                <tr>
                  {list.columns.map((col) => (
                    <th key={col.field}>{col.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={list.columns.length} className="muted">
                      Không có dữ liệu
                    </td>
                  </tr>
                )}
                {rows.map((row, idx) => {
                  const key = String(list.rowKey ? row[list.rowKey] : idx);
                  const selected = top.selectedRowKey === key;
                  return (
                    <tr
                      key={key}
                      className={`clickable${selected ? ' selected' : ''}`}
                      onClick={() => {
                        setStack((prev) => {
                          const copy = [...prev];
                          const last = { ...copy[copy.length - 1]! };
                          last.selectedRowKey = key;
                          copy[copy.length - 1] = last;
                          return copy;
                        });
                        if (list.onRowClick?.length) void runActions(list.onRowClick, row);
                      }}
                    >
                      {list.columns.map((col) => (
                        <td key={col.field}>{asInputValue(row[col.field])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {isModal ? (
        <>
          <div className="shell">
            {/* parent peek */}
            <p className="muted">Form chính đang mở hộp thoại…</p>
          </div>
          <div className="modal-backdrop">
            <div className="modal">{body}</div>
          </div>
        </>
      ) : (
        <div className="shell">{body}</div>
      )}
      {toast && <div className={`toast ${toast.level}`}>{toast.text}</div>}
      <FormDebugBug slug={slug} form={top.form} />
    </>
  );
}

/** Remount when slug/form identity changes — không bump key thừa lúc mount. */
export function FormRuntimeHost(props: Props) {
  return <FormRuntimeView key={`${props.slug}:${props.initialForm.id}`} {...props} />;
}
