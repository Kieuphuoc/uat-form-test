import { useEffect, useMemo, useState } from 'react';
import { CodeEditor, type CodeEditorTheme } from '../CodeEditor';
import {
  deleteAction,
  duplicateAction,
  nextActionId,
  renameActionId,
  upsertAction,
  validateActionId,
} from '../../lib/formDocOps';
import { formatFormJson } from '../../lib/formatFormJson';
import type { FormDocument } from '../../types/formDoc';

const ACTION_TYPES = [
  'sqlQuery',
  'sqlExec',
  'setValue',
  'validate',
  'showForm',
  'closeForm',
  'message',
] as const;

/** Cách mở form UI (showForm.mode). */
const SHOW_FORM_UI_MODES = [
  { value: 'modal', label: 'modal — hộp giữa màn hình' },
  { value: 'sheet', label: 'sheet — kéo từ dưới lên' },
  { value: 'fullscreen', label: 'fullscreen — toàn màn hình' },
] as const;

const FORMID_CUSTOM = '__custom__';

const ACTION_TYPE_HINTS: Record<string, string> = {
  sqlQuery:
    'sqlQuery: chạy SELECT → đổ targetDataset. Bật mock để dùng mockRows (không gọi SQL). Params: control.* / state.* / session.userId|clientId|lan. Gắn vào onLoad / onChange / optionsAction.',
  sqlExec:
    'sqlExec: INSERT/UPDATE/DELETE hoặc EXEC procedure. Bật mock để bỏ qua SQL (dev). Params từ control.* / state.* / session.userId|clientId|lan.',
  setValue:
    'setValue: gán control.* / state.* từ map values (vd row.id, session.lan). Bật mock để ưu tiên mockValues thay vì map thật.',
  validate: 'validate: kiểm rules (required…). Lỗi → dừng chuỗi action, hiện message.',
  showForm:
    'showForm: mở form con (formId). mode=modal|sheet|fullscreen; formMode=view|new|edit; returnMap map giá trị trả về parent.',
  closeForm:
    'closeForm: đóng modal/sheet/fullscreen, trả returnValues theo returnMap về form cha.',
  message: 'message: toast thông báo (message + level info|success|error).',
};

function actionTypeHint(type: string): string {
  return (
    ACTION_TYPE_HINTS[type] ??
    `Type “${type}”: chỉnh JSON bên dưới hoặc chọn type chuẩn trong danh sách.`
  );
}

type Props = {
  doc: FormDocument;
  theme?: CodeEditorTheme;
  formIds?: string[];
  onCommit: (next: FormDocument) => void;
  focusActionId?: string | null;
  focusNonce?: number;
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

function pretty(v: unknown): string {
  try {
    return formatFormJson(v ?? null);
  } catch {
    return String(v ?? '');
  }
}

function parseJsonField(
  text: string,
  label: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(t) as unknown };
  } catch (e) {
    return { ok: false, error: `${label}: ${e instanceof Error ? e.message : 'JSON invalid'}` };
  }
}

function ActionIdField({
  doc,
  actionId,
  onCommit,
  onRenamed,
}: {
  doc: FormDocument;
  actionId: string;
  onCommit: (next: FormDocument) => void;
  onRenamed: (newId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(actionId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(actionId);
    setError(null);
  }, [actionId]);

  const openEdit = () => {
    setDraft(actionId);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(actionId);
    setError(null);
  };

  const apply = () => {
    const err = validateActionId(doc, draft, actionId);
    if (err) {
      setError(err);
      return;
    }
    const { doc: next, error: renameErr } = renameActionId(doc, actionId, draft);
    if (renameErr) {
      setError(renameErr);
      return;
    }
    onCommit(next);
    onRenamed(draft.trim());
    setEditing(false);
    setError(null);
  };

  return (
    <div className="design-id-field">
      <div className="design-id-row">
        <input value={actionId} readOnly disabled />
        <button
          type="button"
          className="design-icon-btn"
          title="Đổi id"
          aria-label="Đổi id"
          onClick={openEdit}
        >
          ✎
        </button>
      </div>
      {editing && (
        <div className="design-id-edit" role="dialog" aria-label="Đổi action id">
          <strong>Đổi id</strong>
          <input
            autoFocus
            value={draft}
            placeholder="vd. open_picker"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
              if (e.key === 'Escape') cancel();
            }}
          />
          {error && <p className="design-id-error">{error}</p>}
          <div className="design-id-edit-actions">
            <button type="button" className="secondary" onClick={cancel}>
              Hủy
            </button>
            <button type="button" onClick={apply}>
              Lưu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DesignActionsEditor({
  doc,
  theme = 'light',
  formIds = [],
  onCommit,
  focusActionId = null,
  focusNonce = 0,
}: Props) {
  const ids = useMemo(
    () => Object.keys(doc.actions ?? {}).sort((a, b) => a.localeCompare(b)),
    [doc.actions],
  );
  const [selectedId, setSelectedId] = useState<string | null>(ids[0] ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && ids.includes(selectedId)) return;
    setSelectedId(ids[0] ?? null);
  }, [ids, selectedId]);

  useEffect(() => {
    setError(null);
  }, [selectedId]);

  useEffect(() => {
    if (!focusNonce) return;
    if (focusActionId && ids.includes(focusActionId)) {
      setSelectedId(focusActionId);
      window.requestAnimationFrame(() => {
        const el = Array.from(document.querySelectorAll<HTMLElement>('[data-action-id]')).find(
          (n) => n.getAttribute('data-action-id') === focusActionId,
        );
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [focusNonce, focusActionId, ids]);

  const action = selectedId ? asRecord(doc.actions?.[selectedId]) : null;
  const type = String(action?.type ?? 'sqlQuery');
  const isSql = type === 'sqlQuery' || type === 'sqlExec';
  const showMock = isSql || type === 'setValue';
  const mockChecked = !(action?.mock === false || action?.mock === 'false');

  const patchAction = (patch: Record<string, unknown>) => {
    if (!selectedId || !action) return;
    const next = { ...action, ...patch };
    for (const k of Object.keys(next)) {
      if (next[k] === undefined || next[k] === '') delete next[k];
    }
    onCommit(upsertAction(doc, selectedId, next));
  };

  const createAction = () => {
    const id = nextActionId(doc, 'action');
    onCommit(
      upsertAction(doc, id, {
        type: 'sqlQuery',
        targetDataset: 'default',
        command: 'SELECT 1 AS ok',
        params: [],
        mock: true,
      }),
    );
    setSelectedId(id);
    setError(null);
  };

  const copyAction = () => {
    if (!selectedId) return;
    const result = duplicateAction(doc, selectedId);
    if (!result) return;
    onCommit(result.doc);
    setSelectedId(result.newId);
    setError(null);
  };

  const removeAction = () => {
    if (!selectedId) return;
    onCommit(deleteAction(doc, selectedId));
    setSelectedId(null);
  };

  const formIdValue = String(action?.formId ?? '');
  const formIdInList = Boolean(formIdValue && formIds.includes(formIdValue));
  const formIdSelectValue = formIdInList ? formIdValue : FORMID_CUSTOM;

  return (
    <div className="design-actions">
      <aside className="design-actions-list">
        <div className="design-actions-list-head">
          <strong>Actions</strong>
          <button
            type="button"
            className="design-icon-btn"
            title="Thêm action"
            aria-label="Thêm action"
            onClick={createAction}
          >
            +
          </button>
        </div>
        <div className="design-actions-list-body">
          {ids.map((id, index) => {
            const t = String(asRecord(doc.actions?.[id]).type ?? '?');
            return (
              <button
                key={id}
                type="button"
                data-action-id={id}
                className={`design-actions-item${id === selectedId ? ' active' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                <span>
                  {index + 1}. {id}
                </span>
                <span className="muted">{t}</span>
              </button>
            );
          })}
          {ids.length === 0 && <p className="muted">Chưa có action — bấm +.</p>}
        </div>
      </aside>

      <div className="design-actions-detail">
        {!action || !selectedId ? (
          <div className="design-workbench-empty">
            <p className="muted">Chọn hoặc tạo action. Gắn vào control qua Property → onChange / onClick.</p>
          </div>
        ) : (
          <>
            <div className="design-actions-toolbar">
              <div className="field">
                <span className="design-actions-field-label">id</span>
                <ActionIdField
                  doc={doc}
                  actionId={selectedId}
                  onCommit={onCommit}
                  onRenamed={setSelectedId}
                />
              </div>
              <div className="field">
                <span className="design-actions-field-label">
                  type
                  <span className="design-actions-type-tools">
                    {showMock && (
                      <label className="design-actions-mock-check" title="Dùng mock khi không SQL / PreferMock">
                        <input
                          type="checkbox"
                          checked={mockChecked}
                          onChange={(e) => patchAction({ mock: e.target.checked })}
                        />
                        mock
                      </label>
                    )}
                    <button
                      type="button"
                      className="design-icon-btn"
                      title="Copy action (id mới không trùng)"
                      aria-label="Copy action"
                      onClick={copyAction}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="design-icon-btn design-actions-del"
                      title="Xóa action (Undo để hoàn tác)"
                      aria-label="Xóa action"
                      onClick={removeAction}
                    >
                      🗑
                    </button>
                  </span>
                </span>
                <select value={type} onChange={(e) => patchAction({ type: e.target.value })}>
                  {ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {!ACTION_TYPES.includes(type as (typeof ACTION_TYPES)[number]) && (
                    <option value={type}>{type}</option>
                  )}
                </select>
              </div>
            </div>

            {error && <div className="banner">{error}</div>}

            <p className="muted design-actions-hint">{actionTypeHint(type)}</p>

            {isSql && (
              <>
                {type === 'sqlQuery' && (
                  <label className="field">
                    targetDataset
                    <input
                      value={String(action.targetDataset ?? '')}
                      placeholder="default"
                      onChange={(e) =>
                        patchAction({ targetDataset: e.target.value.trim() || undefined })
                      }
                    />
                  </label>
                )}
                <label className="field design-actions-sql-field">
                  command (SQL)
                  <CodeEditor
                    className="design-actions-sql"
                    theme={theme}
                    language="sql"
                    value={String(action.command ?? '')}
                    onChange={(v) => patchAction({ command: v })}
                    placeholder="SELECT … WHERE @keyword LIKE …"
                  />
                </label>
                <label className="field design-actions-sql-field">
                  params (JSON)
                  <CodeEditor
                    className="design-actions-json"
                    theme={theme}
                    language="json"
                    value={pretty(action.params ?? [])}
                    onChange={(text) => {
                      const parsed = parseJsonField(text, 'params');
                      if (!parsed.ok) {
                        setError(parsed.error);
                        return;
                      }
                      setError(null);
                      patchAction({ params: parsed.value });
                    }}
                  />
                </label>
                {type === 'sqlQuery' && (
                  <label className="field design-actions-sql-field">
                    mockRows (JSON, optional)
                    <CodeEditor
                      className="design-actions-json"
                      theme={theme}
                      language="json"
                      value={pretty(action.mockRows ?? [])}
                      onChange={(text) => {
                        const parsed = parseJsonField(text, 'mockRows');
                        if (!parsed.ok) {
                          setError(parsed.error);
                          return;
                        }
                        setError(null);
                        patchAction({ mockRows: parsed.value });
                      }}
                    />
                  </label>
                )}
              </>
            )}

            {type === 'setValue' && mockChecked && (
              <label className="field design-actions-sql-field">
                mockValues (JSON)
                <CodeEditor
                  className="design-actions-json"
                  theme={theme}
                  language="json"
                  value={pretty(action.mockValues ?? {})}
                  onChange={(text) => {
                    const parsed = parseJsonField(text, 'mockValues');
                    if (!parsed.ok) {
                      setError(parsed.error);
                      return;
                    }
                    setError(null);
                    patchAction({ mockValues: parsed.value });
                  }}
                />
              </label>
            )}

            {type === 'showForm' && (
              <div className="design-actions-grid">
                <label className="field design-actions-formid">
                  formId
                  <div className="design-actions-formid-row">
                    <select
                      value={formIdSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === FORMID_CUSTOM) {
                          patchAction({ formId: undefined });
                        } else {
                          patchAction({ formId: v });
                        }
                      }}
                    >
                      <option value={FORMID_CUSTOM}>— nhập formId —</option>
                      {formIds.map((fid) => (
                        <option key={fid} value={fid}>
                          {fid}
                        </option>
                      ))}
                    </select>
                    {!formIdInList && (
                      <input
                        value={formIdValue}
                        placeholder="form id"
                        onChange={(e) =>
                          patchAction({ formId: e.target.value.trim() || undefined })
                        }
                      />
                    )}
                  </div>
                </label>
                <label className="field">
                  mode (UI)
                  <select
                    value={String(action.mode ?? 'modal')}
                    onChange={(e) => patchAction({ mode: e.target.value })}
                  >
                    {SHOW_FORM_UI_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                    {!SHOW_FORM_UI_MODES.some((m) => m.value === String(action.mode ?? 'modal')) && (
                      <option value={String(action.mode)}>{String(action.mode)}</option>
                    )}
                  </select>
                </label>
                <label className="field">
                  formMode
                  <select
                    value={String(action.formMode ?? 'view')}
                    onChange={(e) => patchAction({ formMode: e.target.value })}
                  >
                    <option value="view">view</option>
                    <option value="new">new</option>
                    <option value="edit">edit</option>
                  </select>
                </label>
                <label className="field design-actions-sql-field">
                  returnMap (JSON)
                  <CodeEditor
                    className="design-actions-json"
                    theme={theme}
                    language="json"
                    value={pretty(action.returnMap ?? {})}
                    onChange={(text) => {
                      const parsed = parseJsonField(text, 'returnMap');
                      if (!parsed.ok) {
                        setError(parsed.error);
                        return;
                      }
                      setError(null);
                      patchAction({ returnMap: parsed.value });
                    }}
                  />
                </label>
              </div>
            )}

            {type === 'message' && (
              <div className="design-actions-grid">
                <label className="field">
                  message
                  <input
                    value={String(action.message ?? '')}
                    onChange={(e) => patchAction({ message: e.target.value })}
                  />
                </label>
                <label className="field">
                  level
                  <select
                    value={String(action.level ?? 'info')}
                    onChange={(e) => patchAction({ level: e.target.value })}
                  >
                    <option value="info">info</option>
                    <option value="success">success</option>
                    <option value="error">error</option>
                  </select>
                </label>
              </div>
            )}

            {(type === 'setValue' || type === 'validate' || type === 'closeForm' || !isSql) &&
              type !== 'showForm' &&
              type !== 'message' && (
                <label className="field design-actions-sql-field">
                  Action JSON (toàn bộ)
                  <CodeEditor
                    className="design-actions-json"
                    theme={theme}
                    language="json"
                    value={pretty(action)}
                    onChange={(text) => {
                      const parsed = parseJsonField(text, 'action');
                      if (!parsed.ok) {
                        setError(parsed.error);
                        return;
                      }
                      if (
                        !parsed.value ||
                        typeof parsed.value !== 'object' ||
                        Array.isArray(parsed.value)
                      ) {
                        setError('action phải là object');
                        return;
                      }
                      setError(null);
                      onCommit(upsertAction(doc, selectedId, asRecord(parsed.value)));
                    }}
                  />
                </label>
              )}

            {isSql && (
              <details className="design-actions-advanced">
                <summary>JSON đầy đủ action</summary>
                <CodeEditor
                  className="design-actions-json"
                  theme={theme}
                  language="json"
                  value={pretty(action)}
                  onChange={(text) => {
                    const parsed = parseJsonField(text, 'action');
                    if (!parsed.ok) {
                      setError(parsed.error);
                      return;
                    }
                    if (
                      !parsed.value ||
                      typeof parsed.value !== 'object' ||
                      Array.isArray(parsed.value)
                    ) {
                      setError('action phải là object');
                      return;
                    }
                    setError(null);
                    onCommit(upsertAction(doc, selectedId, asRecord(parsed.value)));
                  }}
                />
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
