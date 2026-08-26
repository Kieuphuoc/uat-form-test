import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  actionIds,
  getListMockRows,
  nextActionId,
  renameControlId,
  resolveListDataActionId,
  setEventActions,
  setFormMeta,
  setListMockRows,
  updateColumn,
  updateControl,
  updateList,
  upsertAction,
  validateControlId,
} from '../../lib/formDocOps';
import { formatFormJson } from '../../lib/formatFormJson';
import { COLOR_PRESETS, normalizeColorHex } from '../../lib/colorPresets';
import { ICON_PRESETS, isPresetIcon } from '../../lib/iconPresets';
import {
  defaultActionDefForEvent,
  suggestEventActionId,
  type FormEventKind,
} from '../../lib/eventActionDefaults';
import {
  formatStaticOptionsText,
  resolveSelectOptionsMode,
  staticOptionsToSelect,
  type SelectOptionsMode,
} from '../../lib/selectOptions';
import {
  compactLocalizedText,
  resolveLocalizedText,
  type LocalizedText,
} from '../../lib/localizedText';
import {
  DATE_FORMAT_EXAMPLES,
  DEFAULT_DATE_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_TIME_FORMAT,
  NUMBER_FORMAT_EXAMPLES,
  TIME_FORMAT_EXAMPLES,
} from '../../lib/valueFormat';
import type { DesignSelection, FormDocument } from '../../types/formDoc';
import { CONTROL_TYPES } from '../../types/formDoc';
import { CodeEditor } from '../CodeEditor';
import { LocalizedTextInput } from './LocalizedTextInput';
import type { FormControlDef } from '../../types/form';
import { formatValuesMapText, parseValuesMapText, pcMaxColumns } from '../../lib/pcLayout';
import { inferColumnSizeMode } from '../../lib/gridColumnLayout';

type Props = {
  doc: FormDocument;
  selection: DesignSelection | null;
  formIds?: string[];
  /** App slug — hiện path fragment khi sửa include. */
  slug?: string;
  onCommit: (next: FormDocument) => void;
  onSelect?: (sel: DesignSelection) => void;
  /** Mở tab Actions và focus action id. */
  onEditAction?: (actionId: string) => void;
  /** Overlay Design Grid (cột `lists[].columns[]`). */
  onOpenGridEditor?: (listId: string) => void;
};

const ACTION_NEW = '__new__';
const ACTION_CLEAR = '__clear__';

function sqlActionIds(doc: FormDocument): string[] {
  return Object.entries(doc.actions ?? {})
    .filter(([, def]) => {
      const t = String((def as Record<string, unknown> | undefined)?.type ?? '').toLowerCase();
      return t === 'sqlquery' || t === 'sqlexec';
    })
    .map(([id]) => id)
    .sort((a, b) => a.localeCompare(b));
}

function datasetIdsFromDoc(doc: FormDocument): string[] {
  const s = new Set<string>();
  for (const k of Object.keys(doc.datasets ?? {})) s.add(k);
  for (const def of Object.values(doc.actions ?? {})) {
    const td = String((def as Record<string, unknown> | undefined)?.targetDataset ?? '').trim();
    if (td) s.add(td);
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Select gắn action: giữ UI select; onClick/onChange/onLoad/onRowClick hỗ trợ nhiều id (chips). */
function EventActionSelect({
  label,
  doc,
  event,
  boundIds,
  options,
  controlId,
  listId,
  onCommit,
  onEditAction,
  title,
}: {
  label: string;
  doc: FormDocument;
  event: FormEventKind;
  boundIds: string[];
  options: string[];
  controlId?: string;
  listId?: string;
  onCommit: (next: FormDocument) => void;
  onEditAction?: (actionId: string) => void;
  title?: string;
}) {
  const bound = useMemo(
    () =>
      boundIds
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((id, i, arr) => arr.indexOf(id) === i),
    [boundIds.join('|')],
  );
  const validBound = useMemo(
    () => bound.filter((id) => options.includes(id)),
    [bound.join('|'), options.join('|')],
  );
  const multi =
    event === 'onClick' ||
    event === 'onChange' ||
    event === 'onLoad' ||
    event === 'onRowClick' ||
    event === 'onLoadMore' ||
    event === 'onSearch';
  const primary = validBound[0] ?? '';

  useEffect(() => {
    if (bound.length === 0) return;
    if (bound.every((id) => options.includes(id))) return;
    const nextIds = bound.filter((id) => options.includes(id));
    if (event === 'onLoad') {
      onCommit(setFormMeta(doc, { onLoad: nextIds.length ? nextIds : undefined }));
      return;
    }
    if ((event === 'onClick' || event === 'onChange') && controlId) {
      onCommit(setEventActions(doc, { kind: 'control', id: controlId, event }, nextIds));
      return;
    }
    if ((event === 'onRowClick' || event === 'onLoadMore' || event === 'onSearch') && listId) {
      onCommit(setEventActions(doc, { kind: 'list', id: listId, event }, nextIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi id gắn không còn trong options
  }, [bound.join('|'), options.join('|')]);

  const assign = (ids: string[]) => {
    const uniq = ids.map((x) => x.trim()).filter(Boolean).filter((id, i, arr) => arr.indexOf(id) === i);
    if (event === 'onLoad') {
      onCommit(setFormMeta(doc, { onLoad: uniq.length ? uniq : undefined }));
      return;
    }
    if ((event === 'onClick' || event === 'onChange') && controlId) {
      onCommit(setEventActions(doc, { kind: 'control', id: controlId, event }, uniq));
      return;
    }
    if ((event === 'onRowClick' || event === 'onLoadMore' || event === 'onSearch') && listId) {
      onCommit(setEventActions(doc, { kind: 'list', id: listId, event }, uniq));
    }
  };

  const addId = (id: string) => {
    if (!id) {
      assign([]);
      return;
    }
    if (validBound.includes(id)) return;
    assign(multi ? [...validBound, id] : [id]);
  };

  const removeId = (id: string) => {
    assign(validBound.filter((x) => x !== id));
  };

  return (
    <div className="design-prop-row design-prop-row--block" title={title}>
      <span className="design-prop-label">
        {onEditAction ? (
          <button
            type="button"
            className="design-prop-label-link"
            title={primary ? `Sửa action ${primary}` : 'Chọn hoặc tạo action trước'}
            disabled={!primary}
            onClick={() => {
              if (primary) onEditAction(primary);
            }}
          >
            {label}
          </button>
        ) : (
          label
        )}
      </span>
      <span className="design-prop-value">
        {validBound.length > 0 ? (
          <div className="design-event-chips" aria-label={`${label} đã gắn`}>
            {validBound.map((id) => (
              <span key={id} className="design-event-chip">
                <button
                  type="button"
                  className="design-event-chip__id"
                  title={`Sửa ${id}`}
                  onClick={() => onEditAction?.(id)}
                >
                  {id}
                </button>
                <button
                  type="button"
                  className="design-event-chip__rm"
                  title={`Bỏ ${id}`}
                  aria-label={`Bỏ ${id}`}
                  onClick={() => removeId(id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <span className="design-event-select-row">
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.selectedIndex = 0;
              if (!v) return;
              if (v === ACTION_CLEAR) {
                assign([]);
                return;
              }
              if (v === ACTION_NEW) {
                const id = nextActionId(
                  doc,
                  suggestEventActionId(event, { controlId, listId, formId: doc.id }),
                );
                let next = upsertAction(
                  doc,
                  id,
                  defaultActionDefForEvent(event, id, { controlId, listId }),
                );
                const ids = multi ? [...validBound, id] : [id];
                if (event === 'onLoad') {
                  next = setFormMeta(next, { onLoad: ids });
                } else if ((event === 'onClick' || event === 'onChange') && controlId) {
                  next = setEventActions(next, { kind: 'control', id: controlId, event }, ids);
                } else if (
                  (event === 'onRowClick' || event === 'onLoadMore' || event === 'onSearch') &&
                  listId
                ) {
                  next = setEventActions(next, { kind: 'list', id: listId, event }, ids);
                }
                onCommit(next);
                onEditAction?.(id);
                return;
              }
              addId(v);
            }}
          >
            <option value="">
              {validBound.length ? '＋ Thêm action…' : 'Chưa có action'}
            </option>
            {validBound.length > 0 ? (
              <option value={ACTION_CLEAR}>✕ Xóa tất cả</option>
            ) : null}
            <option value={ACTION_NEW}>Tạo mới action (new)</option>
            {options.map((id) => (
              <option key={id} value={id} disabled={validBound.includes(id)}>
                {validBound.includes(id) ? `✓ ${id}` : id}
              </option>
            ))}
          </select>
        </span>
      </span>
    </div>
  );
}

/** Chọn 1 action (string) — dùng optionsAction; filter SQL tùy chọn. */
function SingleActionSelect({
  label,
  doc,
  value,
  options,
  onCommit,
  onAssign,
  createDefault,
  title,
}: {
  label: string;
  doc: FormDocument;
  value: string | undefined;
  options: string[];
  onCommit: (next: FormDocument) => void;
  onAssign: (actionId: string | undefined, doc: FormDocument) => FormDocument;
  createDefault: () => Record<string, unknown>;
  title?: string;
}) {
  const bound = value?.trim() || '';
  const valid = bound && options.includes(bound) ? bound : '';

  useEffect(() => {
    if (!bound) return;
    if (options.includes(bound)) return;
    onCommit(onAssign(undefined, doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bound, options.join('|')]);

  return (
    <PropRow label={label} title={title}>
      <select
        value={valid}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            onCommit(onAssign(undefined, doc));
            return;
          }
          if (v === ACTION_NEW) {
            const id = nextActionId(doc, 'q_lookup');
            let next = upsertAction(doc, id, createDefault());
            next = onAssign(id, next);
            onCommit(next);
            return;
          }
          onCommit(onAssign(v, doc));
        }}
      >
        <option value="">Chưa có action</option>
        <option value={ACTION_NEW}>Tạo mới action (new)</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </PropRow>
  );
}

function PropRow({
  label,
  children,
  title,
}: {
  label: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <label className="design-prop-row" title={title}>
      <span className="design-prop-label">{label}</span>
      <span className="design-prop-value">{children}</span>
    </label>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string | undefined) => void;
}) {
  const custom = value && !isPresetIcon(value);
  return (
    <div className="design-icon-picker">
      <div className="design-icon-grid">
        {ICON_PRESETS.map((p) => (
          <button
            key={`${p.icon}-${p.label}`}
            type="button"
            className={`design-icon-chip${value === p.icon ? ' selected' : ''}`}
            title={p.label}
            onClick={() => onChange(value === p.icon ? undefined : p.icon)}
          >
            {p.icon}
          </button>
        ))}
      </div>
      <div className="design-icon-picker-row">
        <input
          value={custom ? value : ''}
          placeholder="Hoặc emoji tùy chỉnh"
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
        />
        {value ? (
          <button
            type="button"
            className="design-icon-btn"
            title="Xóa icon"
            aria-label="Xóa icon"
            onClick={() => onChange(undefined)}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Input màu + nút swatch cuối → bảng COLOR_PRESETS (giống control type=color). */
function ColorPropInput({
  value,
  placeholder = '#2f6fed',
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (color: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const hex = normalizeColorHex(value) || '';
  return (
    <div className="design-color-prop">
      <div className="design-color-prop-row">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
          onFocus={() => setOpen(false)}
        />
        <button
          type="button"
          className={`design-color-prop-swatch${hex ? '' : ' is-empty'}`}
          style={hex ? { background: hex } : undefined}
          title="Chọn màu"
          aria-label="Chọn màu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {!hex ? '🎨' : null}
        </button>
      </div>
      {open ? (
        <div className="design-color-prop-grid" role="listbox">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`design-color-prop-cell${c === hex ? ' is-active' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
          {value ? (
            <button
              type="button"
              className="design-color-prop-clear"
              title="Xóa màu"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_GROUP_PROPS: Partial<Omit<FormControlDef, 'id'>> = {
  groupId: undefined,
  groupLabel: undefined,
  groupIcon: undefined,
  groupBackground: undefined,
  groupCollapsed: undefined,
};

/** groupLabel / groupIcon / … chỉ hiện khi groupId nhập khác trắng. */
function GroupPropsSection({
  controlId,
  groupId,
  groupLabel,
  groupIcon,
  groupBackground,
  groupCollapsed,
  patch,
}: {
  controlId: string;
  groupId?: string;
  groupLabel?: FormControlDef['groupLabel'];
  groupIcon?: string;
  groupBackground?: string;
  groupCollapsed?: boolean;
  patch: (p: Partial<Omit<FormControlDef, 'id'>>) => void;
}) {
  const [draft, setDraft] = useState(groupId ?? '');
  useEffect(() => {
    setDraft(groupId ?? '');
  }, [controlId, groupId]);

  const hasGroupId = draft.trim().length > 0;

  return (
    <>
      <PropRow label="groupId" title="Cùng groupId + kề nhau theo order → accordion">
        <input
          value={draft}
          placeholder="vd. address"
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            const trimmed = next.trim();
            if (!trimmed) {
              patch({ ...EMPTY_GROUP_PROPS });
              return;
            }
            patch({ groupId: trimmed });
          }}
        />
      </PropRow>
      {hasGroupId ? (
        <>
          <PropRow label="groupLabel" title="Tiêu đề accordion (ưu tiên control đầu có giá trị)">
            <LocalizedTextInput
              value={groupLabel}
              onChange={(v) => patch({ groupLabel: v || undefined })}
            />
          </PropRow>
          <label className="design-prop-row design-prop-row--block">
            <span className="design-prop-label">groupIcon</span>
            <span className="design-prop-value">
              <IconPicker
                value={groupIcon ?? ''}
                onChange={(v) => patch({ groupIcon: v })}
              />
            </span>
          </label>
          <PropRow label="groupBackground" title="Màu nền accordion">
            <ColorPropInput
              value={groupBackground ?? ''}
              placeholder="#f3f3f3"
              onChange={(v) => patch({ groupBackground: v })}
            />
          </PropRow>
          <PropRow label="groupCollapsed" title="Mặc định thu gọn khi mở form">
            <input
              type="checkbox"
              checked={!!groupCollapsed}
              onChange={(e) => patch({ groupCollapsed: e.target.checked || undefined })}
            />
          </PropRow>
        </>
      ) : null}
    </>
  );
}

function ControlIdField({
  doc,
  controlId,
  onCommit,
  onSelect,
}: {
  doc: FormDocument;
  controlId: string;
  onCommit: (next: FormDocument) => void;
  onSelect?: (sel: DesignSelection) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(controlId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(controlId);
    setError(null);
  }, [controlId]);

  const openEdit = () => {
    setDraft(controlId);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(controlId);
    setError(null);
  };

  const apply = () => {
    const err = validateControlId(doc, draft, controlId);
    if (err) {
      setError(err);
      return;
    }
    const { doc: next, error: renameErr } = renameControlId(doc, controlId, draft);
    if (renameErr) {
      setError(renameErr);
      return;
    }
    onCommit(next);
    const newId = draft.trim();
    onSelect?.({ kind: 'control', id: newId });
    setEditing(false);
    setError(null);
  };

  return (
    <div className="design-id-field">
      <div className="design-id-row">
        <input value={controlId} readOnly />
        <button
          type="button"
          className="design-id-edit-btn"
          title="Đổi id"
          aria-label="Đổi id"
          onClick={openEdit}
        >
          ✎
        </button>
      </div>
      {editing && (
        <div className="design-id-edit" role="dialog" aria-label="Đổi control id">
          <strong>Đổi id</strong>
          <input
            autoFocus
            value={draft}
            placeholder="vd. btnSave"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
              if (e.key === 'Escape') cancel();
            }}
          />
          <p className="muted design-id-hint">Chữ/số/_ ; bắt đầu bằng chữ hoặc _ ; không trùng.</p>
          {error && <p className="design-id-error">{error}</p>}
          <div className="design-id-edit-actions">
            <button type="button" className="secondary" onClick={cancel}>
              Hủy
            </button>
            <button type="button" onClick={apply}>
              Áp dụng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkFormField({
  value,
  formIds,
  onChange,
}: {
  value: string;
  formIds: string[];
  onChange: (v: string | undefined) => void;
}) {
  const inList = value && formIds.includes(value);
  return (
    <div className="design-link-form">
      <select
        value={inList ? value : ''}
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
      >
        <option value="">— chọn form —</option>
        {formIds.map((fid) => (
          <option key={fid} value={fid}>
            {fid}
          </option>
        ))}
      </select>
      <input
        value={value}
        placeholder="hoặc nhập form id"
        list="design-form-ids"
        onChange={(e) => onChange(e.target.value.trim() || undefined)}
      />
      <datalist id="design-form-ids">
        {formIds.map((fid) => (
          <option key={fid} value={fid} />
        ))}
      </datalist>
    </div>
  );
}

function StaticOptionsList({
  c,
  patch,
}: {
  c: FormControlDef;
  patch: (p: Partial<Omit<FormControlDef, 'id'>>) => void;
}) {
  const docKey = formatStaticOptionsText(c);
  const [rows, setRows] = useState(() => staticOptionsToSelect(c));

  useEffect(() => {
    setRows(staticOptionsToSelect(c));
  }, [c.id, docKey]);

  const commit = (next: { value: string; label: LocalizedText }[]) => {
    setRows(next);
    const cleaned = next.filter(
      (r) => r.value.trim() !== '' || resolveLocalizedText(r.label, 'v').trim() !== '',
    );
    patch({
      options: cleaned.length
        ? cleaned.map((r) => ({
            value: r.value,
            label:
              compactLocalizedText(r.label) ??
              (r.value.trim() === '' ? undefined : r.value),
          }))
        : undefined,
    });
  };

  return (
    <div className="design-prop-row design-prop-row--block">
      <span className="design-prop-label">options</span>
      <span className="design-prop-value">
        <div className="design-static-options">
          <div className="design-static-options-head">
            <span>id (value)</span>
            <span>text (label)</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div key={i} className="design-static-options-row design-static-options-row--i18n">
              <input
                value={row.value}
                placeholder="id"
                onChange={(e) => {
                  const next = rows.map((r, idx) =>
                    idx === i ? { ...r, value: e.target.value } : r,
                  );
                  commit(next);
                }}
              />
              <LocalizedTextInput
                value={row.label}
                placeholder="text"
                onChange={(label) => {
                  const next = rows.map((r, idx) =>
                    idx === i ? { ...r, label: label ?? '' } : r,
                  );
                  commit(next);
                }}
              />
              <button
                type="button"
                className="secondary design-static-options-rm"
                title="Xóa dòng"
                onClick={() => commit(rows.filter((_, idx) => idx !== i))}
              >
                −
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="muted design-prop-hint">Chưa có item — bấm + để thêm.</p>
          )}
          <button
            type="button"
            className="secondary design-static-options-add"
            onClick={() => setRows([...rows, { value: '', label: '' }])}
          >
            + Thêm item
          </button>
        </div>
      </span>
    </div>
  );
}

function SelectOptionsEditor({
  c,
  doc,
  formIds,
  patch,
  onCommit,
}: {
  c: FormControlDef;
  doc: FormDocument;
  formIds: string[];
  patch: (p: Partial<Omit<FormControlDef, 'id'>>) => void;
  onCommit: (next: FormDocument) => void;
}) {
  const mode = resolveSelectOptionsMode(c);
  const sqlIds = useMemo(() => sqlActionIds(doc), [doc]);
  const datasets = useMemo(() => datasetIdsFromDoc(doc), [doc]);
  const setMode = (m: SelectOptionsMode) => {
    patch({
      optionsMode: m,
      ...(m === 'static'
        ? { optionsFrom: undefined, optionsAction: undefined, optionsPickerFormId: undefined }
        : m === 'sqlCache'
          ? { optionsPickerFormId: undefined }
          : m === 'sqlSearch'
            ? { optionsPickerFormId: undefined }
            : { optionsFrom: undefined, optionsAction: undefined }),
    });
  };

  return (
    <div className="design-select-options">
      <PropRow label="optionsMode">
        <select value={mode} onChange={(e) => setMode(e.target.value as SelectOptionsMode)}>
          <option value="static">1. Cố định (nhập list)</option>
          <option value="sqlCache">2. SQL cache (dataset)</option>
          <option value="sqlSearch">3. SQL tìm kiếm động</option>
          <option value="listPicker">4. Mở List form</option>
        </select>
      </PropRow>

      {mode === 'static' && <StaticOptionsList c={c} patch={patch} />}

      {(mode === 'sqlCache' || mode === 'sqlSearch') && (
        <>
          <label
            className="design-prop-row design-prop-row--block"
            title="Id dataset mà sqlQuery đổ vào (trùng targetDataset). Runtime đọc rows từ đây làm options."
          >
            <span className="design-prop-label">dataset (optionsFrom)</span>
            <span className="design-prop-value">
              <span className="muted design-prop-hint">
                = <code>targetDataset</code> của action sqlQuery (vd ds_lookup). Không phải form id.
              </span>
              <select
                value={c.optionsFrom && datasets.includes(c.optionsFrom) ? c.optionsFrom : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) patch({ optionsFrom: v });
                }}
              >
                <option value="">— chọn dataset —</option>
                {datasets.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                value={c.optionsFrom ?? ''}
                placeholder="hoặc nhập dataset id"
                onChange={(e) => patch({ optionsFrom: e.target.value.trim() || undefined })}
              />
            </span>
          </label>
          <SingleActionSelect
            label="SQL action"
            title="Chỉ sqlQuery / sqlExec — tạo mới hoặc chọn action đổ dataset / tìm kiếm"
            doc={doc}
            value={c.optionsAction}
            options={sqlIds}
            onCommit={onCommit}
            onAssign={(actionId, d) => {
              const def = actionId
                ? (d.actions?.[actionId] as Record<string, unknown> | undefined)
                : undefined;
              const td = String(def?.targetDataset ?? '').trim();
              return updateControl(d, c.id, {
                optionsAction: actionId,
                ...(td ? { optionsFrom: td } : {}),
              });
            }}
            createDefault={() => ({
              type: 'sqlQuery',
              targetDataset: c.optionsFrom?.trim() || `ds_${c.id}`,
              command:
                mode === 'sqlSearch'
                  ? "SELECT TOP 30 id, name FROM Items WHERE @q = N'' OR name LIKE N'%' + @q + N'%'"
                  : 'SELECT TOP 50 id, name FROM Items ORDER BY name -- TODO',
              params:
                mode === 'sqlSearch'
                  ? [{ name: 'q', from: `state.selectQuery.${c.id}` }]
                  : [],
              mock: true,
              mockRows: [{ id: '1', name: 'Mẫu A' }],
            })}
          />
          <PropRow label="valueField">
            <input
              value={c.optionsValueField ?? ''}
              placeholder="value / id"
              onChange={(e) => patch({ optionsValueField: e.target.value.trim() || undefined })}
            />
          </PropRow>
          <PropRow label="labelField">
            <input
              value={c.optionsLabelField ?? ''}
              placeholder="label / name"
              onChange={(e) => patch({ optionsLabelField: e.target.value.trim() || undefined })}
            />
          </PropRow>
        </>
      )}

      {mode === 'sqlCache' && (
        <p className="muted design-prop-hint">
          Gắn SQL action vào form <strong>onLoad</strong> (hoặc chọn ở trên). Dataset = targetDataset.
        </p>
      )}

      {mode === 'sqlSearch' && (
        <p className="muted design-prop-hint">
          Param tìm: <code>from: &quot;state.selectQuery.{c.id}&quot;</code> — LIKE N&apos;%&apos;+@q+N&apos;%&apos;.
        </p>
      )}

      {mode === 'listPicker' && (
        <>
          <label className="design-prop-row design-prop-row--block">
            <span className="design-prop-label">optionsPickerFormId</span>
            <span className="design-prop-value">
              <select
                value={
                  c.optionsPickerFormId && formIds.includes(c.optionsPickerFormId)
                    ? c.optionsPickerFormId
                    : ''
                }
                onChange={(e) =>
                  patch({ optionsPickerFormId: e.target.value.trim() || undefined })
                }
              >
                <option value="">— chọn form list —</option>
                {formIds.map((fid) => (
                  <option key={fid} value={fid}>
                    {fid}
                  </option>
                ))}
              </select>
              <input
                value={c.optionsPickerFormId ?? ''}
                placeholder="hoặc nhập form id"
                onChange={(e) =>
                  patch({ optionsPickerFormId: e.target.value.trim() || undefined })
                }
              />
            </span>
          </label>
          <p className="muted design-prop-hint">
            Form kiểu picker/list: onRowClick setValue + closeForm (returnMap → control.{c.id}).
          </p>
        </>
      )}
    </div>
  );
}

function ListMockEditor({
  doc,
  listId,
  onCommit,
}: {
  doc: FormDocument;
  listId: string;
  onCommit: (next: FormDocument) => void;
}) {
  const list = doc.lists.find((l) => l.id === listId);
  const rows = getListMockRows(doc, listId);
  const actionId = list ? resolveListDataActionId(doc, list) : null;
  const serialized = formatFormJson(rows);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(serialized);
    setError(null);
  }, [listId, serialized]);

  if (!list) return null;

  const apply = () => {
    try {
      const parsed = text.trim() ? (JSON.parse(text) as unknown) : [];
      if (!Array.isArray(parsed)) {
        setError('mockRows phải là mảng JSON.');
        return;
      }
      const nextRows = parsed.filter(
        (r) => r && typeof r === 'object' && !Array.isArray(r),
      ) as Record<string, unknown>[];
      onCommit(setListMockRows(doc, listId, nextRows));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON invalid');
    }
  };

  return (
    <label className="design-prop-row design-prop-row--block">
      <span className="design-prop-label">mockRows{actionId ? ` · ${actionId}` : ''}</span>
      <span className="design-prop-value">
        <span className="muted design-prop-hint">
          Hiển thị trên canvas Design; PreferMock dùng khi Preview/runtime.
        </span>
        <CodeEditor
          className="design-list-mock"
          language="json"
          value={text}
          onChange={setText}
        />
        {error && <p className="design-id-error">{error}</p>}
        <div className="design-list-mock-tools">
          <button type="button" onClick={apply}>
            Áp dụng
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const sample: Record<string, unknown> = {};
              for (const col of list.columns) {
                sample[col.field] = col.field === 'id' ? rows.length + 1 : '';
              }
              onCommit(setListMockRows(doc, listId, [...rows, sample]));
            }}
          >
            + Dòng mẫu
          </button>
          <button
            type="button"
            className="secondary"
            disabled={rows.length === 0}
            onClick={() => {
              if (!window.confirm('Xóa hết mockRows?')) return;
              onCommit(setListMockRows(doc, listId, []));
            }}
          >
            Xóa hết
          </button>
        </div>
      </span>
    </label>
  );
}

export function DesignInspector({
  doc,
  selection,
  formIds = [],
  slug = '',
  onCommit,
  onSelect,
  onEditAction,
  onOpenGridEditor,
}: Props) {
  const actions = useMemo(() => actionIds(doc), [doc]);
  const sel = selection ?? { kind: 'form' as const };

  if (sel.kind === 'form') {
    return (
      <div className="design-inspector">
        <strong className="design-inspector-title">Form</strong>
        <PropRow label="id" title="Đổi id chỉ qua JSON">
          <input value={doc.id} readOnly />
        </PropRow>
        <PropRow label="title">
          <LocalizedTextInput
            value={doc.title}
            onChange={(title) => onCommit(setFormMeta(doc, { title: title ?? '' }))}
          />
        </PropRow>
        <PropRow
          label="layout"
          title="stack = form thường; list = list-only (không border/tiêu đề list/chọn tất cả); drawer = Appdrawer"
        >
          <select
            value={doc.layout || 'stack'}
            onChange={(e) => onCommit(setFormMeta(doc, { layout: e.target.value }))}
          >
            <option value="stack">stack (form)</option>
            <option value="list">list (list only)</option>
            <option value="drawer">drawer (Appdrawer)</option>
          </select>
        </PropRow>
        <PropRow label="defaultFormMode" title="view = chỉ xem; new/edit = sửa field enabled">
          <select
            value={doc.defaultFormMode || 'view'}
            onChange={(e) => onCommit(setFormMeta(doc, { defaultFormMode: e.target.value }))}
          >
            <option value="view">view</option>
            <option value="new">new</option>
            <option value="edit">edit</option>
          </select>
        </PropRow>
        <label className="design-prop-row">
          <span className="design-prop-label">pc.enabled</span>
          <span className="design-prop-value">
            <input
              type="checkbox"
              checked={!!doc.pc?.enabled}
              onChange={(e) =>
                onCommit(
                  setFormMeta(doc, {
                    pc: e.target.checked
                      ? { enabled: true, columns: doc.pc?.columns ?? 3 }
                      : undefined,
                  }),
                )
              }
            />
          </span>
        </label>
        {doc.pc?.enabled ? (
          <PropRow
            label="pc.columns"
            title="Số cột TỐI ĐA. Runtime tự hạ theo bề rộng (vd. max 3 → 2 cột trên màn hẹp)."
          >
            <input
              type="number"
              min={1}
              max={6}
              value={pcMaxColumns(doc)}
              onChange={(e) => {
                const n = Number(e.target.value);
                onCommit(
                  setFormMeta(doc, {
                    pc: {
                      ...doc.pc,
                      enabled: true,
                      columns: Number.isFinite(n) ? n : 3,
                    },
                  }),
                );
              }}
            />
          </PropRow>
        ) : null}
        <EventActionSelect
          label="onLoad"
          event="onLoad"
          doc={doc}
          boundIds={doc.onLoad ?? []}
          options={actions}
          onCommit={onCommit}
          onEditAction={onEditAction}
        />
      </div>
    );
  }

  if (sel.kind === 'control') {
    const c = doc.controls.find((x) => x.id === sel.id);
    if (!c) {
      return (
        <div className="design-inspector">
          <p className="muted">Control không tồn tại.</p>
        </div>
      );
    }
    const patch = (p: Parameters<typeof updateControl>[2]) => onCommit(updateControl(doc, c.id, p));
    return (
      <div className="design-inspector">
        <strong className="design-inspector-title">Control</strong>
        {c.includeOf ? (
          <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
            Include →{' '}
            <code>
              {slug ? `${slug}/` : ''}shared/fragments/{c.includeOf}.json
            </code>{' '}
            — sửa ở đây ghi đúng file đó; Ctrl+S lưu chung.
          </p>
        ) : null}
        <PropRow label="id">
          <ControlIdField doc={doc} controlId={c.id} onCommit={onCommit} onSelect={onSelect} />
        </PropRow>
        <PropRow label="type">
          <select value={c.type} onChange={(e) => patch({ type: e.target.value })}>
            {CONTROL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {!CONTROL_TYPES.includes(c.type as (typeof CONTROL_TYPES)[number]) && (
              <option value={c.type}>{c.type}</option>
            )}
          </select>
        </PropRow>
        <PropRow label="order">
          <input
            type="number"
            value={c.order}
            onChange={(e) => patch({ order: Number(e.target.value) || 0 })}
          />
        </PropRow>
        {(c.type === 'button' || c.type === 'iconButton' || c.type === 'label') && (
          <PropRow label="text">
            <LocalizedTextInput
              value={c.text}
              onChange={(text) => patch({ text })}
            />
          </PropRow>
        )}
        {c.type === 'label' && (
          <PropRow label="format" title="liveDate / liveTime / personnel — đồng hồ & nhân sự">
            <select
              value={(c.format ?? '').trim()}
              onChange={(e) => patch({ format: e.target.value.trim() || undefined })}
            >
              <option value="">(text thường)</option>
              <option value="liveDate">liveDate — ngày realtime</option>
              <option value="liveTime">liveTime — giờ realtime</option>
              <option value="personnel">personnel — kèm user login</option>
            </select>
          </PropRow>
        )}
        {(c.type === 'label' || c.type === 'text') && (
          <PropRow label="openAs" title="view: mở link / mail / phone">
            <select
              value={c.openAs ?? ''}
              onChange={(e) => patch({ openAs: e.target.value.trim() || undefined })}
            >
              <option value="">(text thường)</option>
              <option value="link">link</option>
              <option value="mail">mail</option>
              <option value="phone">phone</option>
            </select>
          </PropRow>
        )}
        {c.type !== 'button' && c.type !== 'iconButton' && c.type !== 'label' && (
          <PropRow label="label">
            <LocalizedTextInput
              value={c.label}
              onChange={(label) => patch({ label })}
            />
          </PropRow>
        )}
        {(c.type === 'iconButton' || c.type === 'button') && (
          <>
            <label className="design-prop-row design-prop-row--block">
              <span className="design-prop-label">icon</span>
              <span className="design-prop-value">
                <IconPicker
                  value={c.icon ?? ''}
                  onChange={(icon) => patch({ icon })}
                />
              </span>
            </label>
            <PropRow label={c.type === 'button' ? 'background' : 'color'}>
              <ColorPropInput
                value={c.color ?? ''}
                placeholder="#2f6fed"
                onChange={(color) => patch({ color })}
              />
            </PropRow>
            <label className="design-prop-row design-prop-row--block" title="Mở form khác khi bấm">
              <span className="design-prop-label">linkFormId</span>
              <span className="design-prop-value">
                <LinkFormField
                  value={c.linkFormId ?? ''}
                  formIds={formIds}
                  onChange={(v) => patch({ linkFormId: v })}
                />
              </span>
            </label>
          </>
        )}
        {(c.type === 'label' ||
          c.type === 'text' ||
          c.type === 'textarea' ||
          c.type === 'button' ||
          c.type === 'iconButton' ||
          c.type === 'number' ||
          c.type === 'date' ||
          c.type === 'time' ||
          c.type === 'select') && (
          <>
            <PropRow label="fontFamily" title="Font chữ">
              <input
                value={c.fontFamily ?? ''}
                placeholder="system-ui, Arial…"
                onChange={(e) => patch({ fontFamily: e.target.value.trim() || undefined })}
              />
            </PropRow>
            <PropRow label="fontSize" title="Cỡ chữ">
              <input
                value={c.fontSize ?? ''}
                placeholder="14px / 1.25rem"
                onChange={(e) => patch({ fontSize: e.target.value.trim() || undefined })}
              />
            </PropRow>
            <PropRow label="fontWeight" title="Độ đậm">
              <select
                value={c.fontWeight ?? ''}
                onChange={(e) => patch({ fontWeight: e.target.value.trim() || undefined })}
              >
                <option value="">(mặc định)</option>
                <option value="normal">normal</option>
                <option value="500">500</option>
                <option value="600">600</option>
                <option value="700">bold</option>
                <option value="800">800</option>
              </select>
            </PropRow>
            <PropRow label="fontStyle" title="Kiểu chữ">
              <select
                value={c.fontStyle ?? ''}
                onChange={(e) => patch({ fontStyle: e.target.value.trim() || undefined })}
              >
                <option value="">(mặc định)</option>
                <option value="normal">normal</option>
                <option value="italic">italic</option>
              </select>
            </PropRow>
            <PropRow label="textAlign" title="Căn chữ">
              <select
                value={c.textAlign ?? ''}
                onChange={(e) => patch({ textAlign: e.target.value.trim() || undefined })}
              >
                <option value="">(mặc định)</option>
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </PropRow>
            <PropRow label="textColor" title="Màu chữ">
              <ColorPropInput
                value={c.textColor ?? ''}
                placeholder="#0f172a"
                onChange={(textColor) => patch({ textColor })}
              />
            </PropRow>
          </>
        )}
        {(c.type === 'text' ||
          c.type === 'textarea' ||
          c.type === 'number' ||
          c.type === 'date' ||
          c.type === 'time' ||
          c.type === 'color') && (
          <PropRow label="placeholder">
            <LocalizedTextInput
              value={c.placeholder}
              placeholder="Gợi ý trong ô nhập"
              onChange={(placeholder) => patch({ placeholder })}
            />
          </PropRow>
        )}
        {c.type === 'number' && (
          <label className="design-prop-row design-prop-row--block" title="Pattern tự do; 0 sau thập phân = max số lẻ">
            <span className="design-prop-label">format</span>
            <span className="design-prop-value">
              <input
                value={c.format ?? ''}
                placeholder={DEFAULT_NUMBER_FORMAT}
                onChange={(e) => patch({ format: e.target.value.trim() || undefined })}
              />
              <span className="muted design-prop-hint">
                VD: {NUMBER_FORMAT_EXAMPLES.join(' · ')} (trống = mặc định)
              </span>
            </span>
          </label>
        )}
        {c.type === 'date' && (
          <label className="design-prop-row design-prop-row--block" title="Pattern ngày; 20/6 → 20/06/năm hiện tại">
            <span className="design-prop-label">format</span>
            <span className="design-prop-value">
              <input
                value={c.format ?? ''}
                placeholder={DEFAULT_DATE_FORMAT}
                onChange={(e) => patch({ format: e.target.value.trim() || undefined })}
              />
              <span className="muted design-prop-hint">
                VD: {DATE_FORMAT_EXAMPLES.join(' · ')} — thiếu năm → năm hiện tại; sai → null
              </span>
            </span>
          </label>
        )}
        {c.type === 'time' && (
          <label className="design-prop-row design-prop-row--block" title="Lưu text HH:mm hoặc HH:mm:ss">
            <span className="design-prop-label">format</span>
            <span className="design-prop-value">
              <input
                value={c.format ?? ''}
                placeholder={DEFAULT_TIME_FORMAT}
                onChange={(e) => patch({ format: e.target.value.trim() || undefined })}
              />
              <span className="muted design-prop-hint">
                VD: {TIME_FORMAT_EXAMPLES.join(' · ')} (alias hh:MM) — mặc định 00:00
              </span>
            </span>
          </label>
        )}
        {(c.type === 'file' || c.type === 'image') && (
          <>
            <PropRow label="accept" title="Extension, vd. pdf,doc hoặc jpg,png">
              <input
                value={c.accept ?? ''}
                placeholder={c.type === 'image' ? 'jpg,jpeg,png,gif,webp' : 'pdf,doc,docx'}
                onChange={(e) => patch({ accept: e.target.value.trim() || undefined })}
              />
            </PropRow>
            <PropRow label="maxFiles">
              <input
                type="number"
                min={1}
                value={c.maxFiles ?? (c.type === 'image' ? 1 : 5)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  patch({ maxFiles: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined });
                }}
              />
            </PropRow>
            <PropRow label="uploadMode" title="immediate = up ngay draft status=0; onSave = upload khi lưu form">
              <select
                value={c.uploadMode === 'onSave' ? 'onSave' : 'immediate'}
                onChange={(e) =>
                  patch({ uploadMode: e.target.value === 'onSave' ? 'onSave' : 'immediate' })
                }
              >
                <option value="immediate">immediate (draft status=0)</option>
                <option value="onSave">onSave (upload khi lưu)</option>
              </select>
            </PropRow>
            {c.type === 'image' && (
              <>
                <PropRow label="imageSource" title="camera = chỉ chụp live; both = chụp + chọn ảnh">
                  <select
                    value={c.imageSource === 'camera' ? 'camera' : 'both'}
                    onChange={(e) =>
                      patch({
                        imageSource: e.target.value === 'camera' ? 'camera' : 'both',
                      })
                    }
                  >
                    <option value="both">both (chụp + chọn ảnh)</option>
                    <option value="camera">camera (chỉ chụp)</option>
                  </select>
                </PropRow>
                <PropRow label="previewWidth" title="Cạnh preview vuông (px), mặc định 50">
                  <input
                    type="number"
                    min={24}
                    value={c.previewWidth ?? 50}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      patch({
                        previewWidth: Number.isFinite(n) && n >= 24 ? Math.floor(n) : undefined,
                      });
                    }}
                  />
                </PropRow>
              </>
            )}
            <p className="muted design-prop-hint">
              File: scope <code>app-files</code>. Image: <code>app-images</code> (thumb 256 + cache
              client). Disk \\Apps. Source form vẫn <code>system</code>.
            </p>
          </>
        )}
        {c.type === 'color' && (
          <p className="muted design-prop-hint">Chọn từ bảng ~36 màu phổ biến hoặc nhập #hex</p>
        )}
        {c.type !== 'button' &&
          c.type !== 'iconButton' &&
          c.type !== 'label' &&
          c.type !== 'hidden' && (
            <PropRow label="defaultValue" title="Áp khi formMode = new">
              {c.type === 'color' ? (
                <ColorPropInput
                  value={c.defaultValue == null ? '' : String(c.defaultValue)}
                  placeholder="#4a86e8"
                  onChange={(v) => patch({ defaultValue: v })}
                />
              ) : (
                <input
                  value={c.defaultValue == null ? '' : String(c.defaultValue)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw.trim()) {
                      patch({ defaultValue: undefined });
                      return;
                    }
                    if (c.type === 'number' && !Number.isNaN(Number(raw))) {
                      patch({ defaultValue: Number(raw) });
                    } else {
                      patch({ defaultValue: raw });
                    }
                  }}
                />
              )}
            </PropRow>
          )}
        <GroupPropsSection
          controlId={c.id}
          groupId={c.groupId}
          groupLabel={c.groupLabel}
          groupIcon={c.groupIcon}
          groupBackground={c.groupBackground}
          groupCollapsed={c.groupCollapsed}
          patch={patch}
        />
        <PropRow
          label="placement"
          title="body = vùng scroll; header = nút trên modal header; footer = pin cuối form"
        >
          <select
            value={
              (c.placement ?? 'body').toLowerCase() === 'footer'
                ? 'footer'
                : (c.placement ?? '').toLowerCase() === 'header'
                  ? 'header'
                  : 'body'
            }
            onChange={(e) => {
              const v = e.target.value;
              patch({
                placement: v === 'footer' || v === 'header' ? v : undefined,
              });
            }}
          >
            <option value="body">body</option>
            <option value="header">header</option>
            <option value="footer">footer</option>
          </select>
        </PropRow>
        <PropRow label="rowId">
          <input
            value={c.rowId ?? ''}
            placeholder="cùng = 1 hàng"
            onChange={(e) => patch({ rowId: e.target.value.trim() || undefined })}
          />
        </PropRow>
        <PropRow label="width">
          <input
            value={c.width ?? ''}
            placeholder="40%"
            onChange={(e) => patch({ width: e.target.value.trim() || undefined })}
          />
        </PropRow>
        <PropRow
          label="align"
          title="left|center|right. center + width x% (&lt;100) → một hàng, rộng x%"
        >
          <select
            value={
              c.align === 'center' || c.align === 'right' || c.align === 'left' ? c.align : ''
            }
            onChange={(e) => {
              const v = e.target.value;
              patch({
                align: v === 'left' || v === 'center' || v === 'right' ? v : undefined,
              });
            }}
          >
            <option value="">(mặc định)</option>
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </PropRow>
        {doc.pc?.enabled ? (
          <PropRow label="pc.colSpan" title="Số cột chiếm trên lưới PC. Mobile bỏ qua.">
            <select
              value={String(c.pc?.colSpan ?? 1)}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({
                  pc: {
                    ...c.pc,
                    colSpan: n <= 1 ? undefined : n,
                  },
                });
              }}
            >
              {Array.from({ length: pcMaxColumns(doc) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </PropRow>
        ) : null}
        {(c.type === 'textarea' || c.type === 'maps' || c.height) && (
          <PropRow label="height">
            <input
              value={c.height ?? ''}
              placeholder={c.type === 'maps' ? '220px' : '120px'}
              onChange={(e) => patch({ height: e.target.value.trim() || undefined })}
            />
          </PropRow>
        )}
        {(c.type === 'label' || c.type === 'text' || c.type === 'maps') && (
          <PropRow
            label="bind"
            title="sessionUser = tên/email user login (label format personnel)"
          >
            <input
              value={c.bind ?? ''}
              placeholder={c.type === 'maps' ? '(value locations)' : 'sessionUser'}
              onChange={(e) => patch({ bind: e.target.value.trim() || undefined })}
            />
          </PropRow>
        )}
        {c.type === 'maps' && (
          <PropRow label="defaultValue" title='vd. "10.76, 106.61" hoặc nhiều điểm cách ;'>
            <input
              value={
                c.defaultValue == null
                  ? ''
                  : typeof c.defaultValue === 'string'
                    ? c.defaultValue
                    : String(c.defaultValue)
              }
              placeholder="lat, lng;lat, lng"
              onChange={(e) => {
                const t = e.target.value;
                patch({ defaultValue: t.trim() ? t : undefined });
              }}
            />
          </PropRow>
        )}
        <PropRow label="required">
          <input
            type="checkbox"
            checked={!!c.required}
            onChange={(e) => patch({ required: e.target.checked || undefined })}
          />
        </PropRow>
        <PropRow label="enabled">
          <input
            type="checkbox"
            checked={c.enabled !== false}
            onChange={(e) => patch({ enabled: e.target.checked ? undefined : false })}
          />
        </PropRow>
        <PropRow label="visible">
          <input
            type="checkbox"
            checked={c.visible !== false}
            onChange={(e) => patch({ visible: e.target.checked ? undefined : false })}
          />
        </PropRow>
        <PropRow label="visibleWhen" title="debug = chỉ hiện khi ?debug=1">
          <input
            value={c.visibleWhen ?? ''}
            placeholder="debug"
            onChange={(e) => patch({ visibleWhen: e.target.value.trim() || undefined })}
          />
        </PropRow>
        <PropRow label="visibleModes" title="vd. new,edit — trống = mọi mode">
          <input
            value={(c.visibleModes ?? []).join(',')}
            placeholder="new,edit"
            onChange={(e) => {
              const parts = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              patch({ visibleModes: parts.length ? parts : undefined });
            }}
          />
        </PropRow>
        {c.type === 'select' ? (
          <SelectOptionsEditor
            c={c}
            doc={doc}
            formIds={formIds}
            patch={patch}
            onCommit={onCommit}
          />
        ) : null}
        {(c.type === 'button' || c.type === 'iconButton') && (
          <EventActionSelect
            label="onClick"
            event="onClick"
            doc={doc}
            controlId={c.id}
            boundIds={c.onClick ?? []}
            options={actions}
            onCommit={onCommit}
            onEditAction={onEditAction}
          />
        )}
        {c.type !== 'button' &&
          c.type !== 'iconButton' &&
          c.type !== 'label' &&
          c.type !== 'hidden' && (
            <EventActionSelect
              label="onChange"
              event="onChange"
              doc={doc}
              controlId={c.id}
              boundIds={c.onChange ?? []}
              options={actions}
              onCommit={onCommit}
              onEditAction={onEditAction}
            />
          )}
      </div>
    );
  }

  if (sel.kind === 'list') {
    const list = doc.lists.find((x) => x.id === sel.id);
    if (!list) {
      return (
        <div className="design-inspector">
          <p className="muted">List không tồn tại.</p>
        </div>
      );
    }
    return (
      <div className="design-inspector">
        <strong className="design-inspector-title">List</strong>
        {list.includeOf ? (
          <p className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
            Include →{' '}
            <code>
              {slug ? `${slug}/` : ''}shared/fragments/{list.includeOf}.json
            </code>{' '}
            — sửa ghi đúng file đó; Ctrl+S lưu chung.
          </p>
        ) : null}
        <PropRow label="id" title="Đổi id chỉ qua JSON">
          <input value={list.id} readOnly />
        </PropRow>
        <PropRow label="order">
          <input
            type="number"
            value={list.order}
            onChange={(e) =>
              onCommit(updateList(doc, list.id, { order: Number(e.target.value) || 0 }))
            }
          />
        </PropRow>
        <PropRow label="bind">
          <input
            value={list.bind}
            onChange={(e) => onCommit(updateList(doc, list.id, { bind: e.target.value }))}
          />
        </PropRow>
        <PropRow label="rowKey">
          <input
            value={list.rowKey ?? ''}
            onChange={(e) =>
              onCommit(updateList(doc, list.id, { rowKey: e.target.value.trim() || undefined }))
            }
          />
        </PropRow>
        <PropRow label="template" title="table | card | media">
          <select
            value={list.template ?? 'table'}
            onChange={(e) => {
              const template = e.target.value === 'table' ? undefined : e.target.value;
              const nextTpl =
                template && !list.itemTemplate
                  ? {
                      line1: list.columns.slice(0, 2).map((c) => c.field),
                      line2: list.columns.slice(2, 3).map((c) => c.field),
                      metaField: list.columns[3]?.field,
                      defaultIcon: '📦',
                      imageWidth: 48,
                    }
                  : list.itemTemplate;
              onCommit(
                updateList(doc, list.id, {
                  template,
                  itemTemplate: template ? nextTpl : list.itemTemplate,
                }),
              );
            }}
          >
            <option value="table">table</option>
            <option value="card">card</option>
            <option value="media">media</option>
          </select>
        </PropRow>
        {(list.template === 'card' || list.template === 'media' || list.itemTemplate) && (
          <>
            <PropRow label="item.line1" title="Fields dòng 1, cách nhau dấu phẩy">
              <input
                value={(list.itemTemplate?.line1 ?? []).join(', ')}
                placeholder="ma_vt, dvt"
                onChange={(e) => {
                  const line1 = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: { ...(list.itemTemplate ?? {}), line1 },
                    }),
                  );
                }}
              />
            </PropRow>
            <PropRow label="item.line2" title="Fields dòng 2">
              <input
                value={(list.itemTemplate?.line2 ?? []).join(', ')}
                placeholder="ten_vt"
                onChange={(e) => {
                  const line2 = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: { ...(list.itemTemplate ?? {}), line2 },
                    }),
                  );
                }}
              />
            </PropRow>
            <PropRow label="item.metaField">
              <input
                value={list.itemTemplate?.metaField ?? ''}
                placeholder="ma_kho"
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: {
                        ...(list.itemTemplate ?? {}),
                        metaField: e.target.value.trim() || undefined,
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="item.iconField">
              <input
                value={list.itemTemplate?.iconField ?? ''}
                placeholder="icon"
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: {
                        ...(list.itemTemplate ?? {}),
                        iconField: e.target.value.trim() || undefined,
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="item.defaultIcon">
              <input
                value={list.itemTemplate?.defaultIcon ?? ''}
                placeholder="📦"
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: {
                        ...(list.itemTemplate ?? {}),
                        defaultIcon: e.target.value.trim() || undefined,
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="item.imageField" title="File id hoặc URL (media)">
              <input
                value={list.itemTemplate?.imageField ?? ''}
                placeholder="image_id"
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: {
                        ...(list.itemTemplate ?? {}),
                        imageField: e.target.value.trim() || undefined,
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="item.imageWidth">
              <input
                type="number"
                min={24}
                value={list.itemTemplate?.imageWidth ?? 48}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onCommit(
                    updateList(doc, list.id, {
                      itemTemplate: {
                        ...(list.itemTemplate ?? {}),
                        imageWidth: Number.isFinite(n) && n >= 24 ? Math.floor(n) : 48,
                      },
                    }),
                  );
                }}
              />
            </PropRow>
          </>
        )}
        <strong className="design-inspector-title" style={{ marginTop: 8 }}>
          List (mobile)
        </strong>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          template + itemTemplate — card/media trên điện thoại.
        </p>
        <strong className="design-inspector-title">Grid (PC)</strong>
        <div className="design-prop-row">
          <span className="design-prop-label">grid.enabled</span>
          <span className="design-prop-value design-prop-value--row">
            <input
              type="checkbox"
              checked={!!list.grid?.enabled}
              onChange={(e) =>
                onCommit(
                  updateList(doc, list.id, {
                    grid: e.target.checked
                      ? { ...list.grid, enabled: true }
                      : list.grid?.rowEdit
                        ? { ...list.grid, enabled: false }
                        : undefined,
                  }),
                )
              }
            />
            {list.grid?.enabled ? (
              <button
                type="button"
                className="design-icon-btn design-icon-btn--sm"
                title="Design Grid — cột + size"
                aria-label="Design Grid"
                onClick={() => onOpenGridEditor?.(list.id)}
              >
                ▦
              </button>
            ) : null}
          </span>
        </div>
        {list.grid?.enabled ? (
          <>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
              PC (≥900px, không ?mobile=true) vẽ bảng từ columns[]. Không cần form.pc.enabled.
              Load/search/paging giữ nguyên List. Bấm icon bảng cạnh enabled để Design Grid (cột + size).
            </p>
            <PropRow label="rowEdit.formId" title="Form sửa dòng — mở drawer phải trên PC">
              <select
                value={list.grid.rowEdit?.formId ?? ''}
                onChange={(e) => {
                  const formId = e.target.value.trim();
                  onCommit(
                    updateList(doc, list.id, {
                      grid: {
                        ...list.grid,
                        enabled: true,
                        rowEdit: formId
                          ? { ...list.grid?.rowEdit, formId }
                          : undefined,
                      },
                    }),
                  );
                }}
              >
                <option value="">(dùng onRowClick)</option>
                {formIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </PropRow>
            {list.grid.rowEdit?.formId ? (
              <>
                <PropRow label="rowEdit.formMode">
                  <select
                    value={list.grid.rowEdit.formMode ?? 'edit'}
                    onChange={(e) =>
                      onCommit(
                        updateList(doc, list.id, {
                          grid: {
                            ...list.grid,
                            enabled: true,
                            rowEdit: {
                              ...list.grid?.rowEdit,
                              formId: list.grid?.rowEdit?.formId,
                              formMode: e.target.value,
                            },
                          },
                        }),
                      )
                    }
                  >
                    <option value="view">view</option>
                    <option value="new">new</option>
                    <option value="edit">edit</option>
                  </select>
                </PropRow>
                <PropRow
                  label="rowEdit.values"
                  title="Mỗi dòng: đích = nguồn. vd. state.id = row.id"
                >
                  <textarea
                    rows={4}
                    placeholder={'state.id = row.id\ncontrol.code = row.code'}
                    value={formatValuesMapText(list.grid.rowEdit.values)}
                    onChange={(e) =>
                      onCommit(
                        updateList(doc, list.id, {
                          grid: {
                            ...list.grid,
                            enabled: true,
                            rowEdit: {
                              ...list.grid?.rowEdit,
                              formId: list.grid?.rowEdit?.formId,
                              values: parseValuesMapText(e.target.value),
                            },
                          },
                        }),
                      )
                    }
                  />
                </PropRow>
              </>
            ) : null}
          </>
        ) : null}
        <label className="design-prop-row">
          <span className="design-prop-label">search</span>
          <span className="design-prop-value">
            <input
              type="checkbox"
              checked={!!list.search?.enabled || (list.search?.columns?.length ?? 0) > 0}
              onChange={(e) => {
                if (!e.target.checked) {
                  onCommit(updateList(doc, list.id, { search: undefined }));
                  return;
                }
                onCommit(
                  updateList(doc, list.id, {
                    search: {
                      enabled: true,
                      mode: 'server',
                      queryBind: list.search?.queryBind || `${list.id}Query`,
                      debounceMs: 2000,
                      columns: list.search?.columns?.length
                        ? list.search.columns
                        : list.columns.slice(0, 2).map((c, i) => ({
                            field: c.field,
                            op: i === 0 ? 'likePrefix' : 'like',
                          })),
                      onSearch: list.search?.onSearch,
                    },
                  }),
                );
              }}
            />
          </span>
        </label>
        {list.search && (
          <>
            <PropRow label="search.mode" title="server = SQL @q; client = lọc dataset">
              <select
                value={list.search.mode ?? 'server'}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      search: { ...list.search!, mode: e.target.value },
                    }),
                  )
                }
              >
                <option value="server">server</option>
                <option value="client">client</option>
              </select>
            </PropRow>
            <PropRow label="search.queryBind">
              <input
                value={list.search.queryBind ?? `${list.id}Query`}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      search: {
                        ...list.search!,
                        queryBind: e.target.value.trim() || `${list.id}Query`,
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow
              label="search.columns"
              title="field:op mỗi dòng — op: like | likePrefix | likeSuffix | eq | in"
            >
              <textarea
                rows={4}
                value={(list.search.columns ?? [])
                  .map((c) => `${c.field}:${c.op ?? 'like'}`)
                  .join('\n')}
                placeholder={'ma_vt:likePrefix\nten_vt:like\nma_kho:eq\ndvt:in'}
                onChange={(e) => {
                  const columns = e.target.value
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [field, op] = line.split(':').map((x) => x.trim());
                      return { field: field || '', op: op || 'like' };
                    })
                    .filter((c) => c.field);
                  onCommit(
                    updateList(doc, list.id, {
                      search: { ...list.search!, columns, enabled: true },
                    }),
                  );
                }}
              />
            </PropRow>
            <EventActionSelect
              label="onSearch"
              event="onSearch"
              doc={doc}
              listId={list.id}
              boundIds={list.search.onSearch ?? []}
              options={actions}
              onCommit={onCommit}
              onEditAction={onEditAction}
            />
          </>
        )}
        <PropRow label="selection" title="none | single | multiple (checkbox trái)">
          <select
            value={list.selection ?? 'none'}
            onChange={(e) => {
              const selection = e.target.value === 'none' ? undefined : e.target.value;
              onCommit(
                updateList(doc, list.id, {
                  selection,
                  selectedKeysBind:
                    selection === 'multiple'
                      ? list.selectedKeysBind || 'selectedKeys'
                      : list.selectedKeysBind,
                }),
              );
            }}
          >
            <option value="none">none</option>
            <option value="single">single</option>
            <option value="multiple">multiple</option>
          </select>
        </PropRow>
        {list.selection === 'multiple' && (
          <PropRow label="selectedKeysBind" title="State key mảng khóa đã chọn">
            <input
              value={list.selectedKeysBind ?? 'selectedKeys'}
              onChange={(e) =>
                onCommit(
                  updateList(doc, list.id, {
                    selectedKeysBind: e.target.value.trim() || 'selectedKeys',
                  }),
                )
              }
            />
          </PropRow>
        )}
        <PropRow label="paging.mode" title="none | loadMore | pages">
          <select
            value={list.paging?.mode ?? 'none'}
            onChange={(e) => {
              const mode = e.target.value === 'none' ? undefined : e.target.value;
              onCommit(
                updateList(doc, list.id, {
                  paging: mode
                    ? {
                        ...(list.paging ?? {}),
                        mode,
                        pageSize: list.paging?.pageSize ?? 20,
                        pageBind: list.paging?.pageBind || 'page',
                        merge: mode === 'loadMore' ? list.paging?.merge || 'append' : 'replace',
                      }
                    : undefined,
                }),
              );
            }}
          >
            <option value="none">none</option>
            <option value="loadMore">loadMore</option>
            <option value="pages">pages</option>
          </select>
        </PropRow>
        {list.paging?.mode && list.paging.mode !== 'none' && (
          <>
            <PropRow label="paging.pageSize">
              <input
                type="number"
                min={1}
                value={list.paging.pageSize ?? 20}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      paging: {
                        ...list.paging,
                        pageSize: Math.max(1, Number(e.target.value) || 20),
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="paging.pageBind">
              <input
                value={list.paging.pageBind ?? 'page'}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      paging: {
                        ...list.paging,
                        pageBind: e.target.value.trim() || 'page',
                      },
                    }),
                  )
                }
              />
            </PropRow>
            <PropRow label="paging.merge">
              <select
                value={list.paging.merge ?? (list.paging.mode === 'loadMore' ? 'append' : 'replace')}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      paging: { ...list.paging, merge: e.target.value },
                    }),
                  )
                }
              >
                <option value="append">append</option>
                <option value="replace">replace</option>
              </select>
            </PropRow>
            <PropRow label="paging.totalDataset" title="Dataset COUNT(*) 1 dòng">
              <input
                value={list.paging.totalDataset ?? ''}
                onChange={(e) =>
                  onCommit(
                    updateList(doc, list.id, {
                      paging: {
                        ...list.paging,
                        totalDataset: e.target.value.trim() || undefined,
                      },
                    }),
                  )
                }
              />
            </PropRow>
          </>
        )}
        <EventActionSelect
          label="onRowClick"
          event="onRowClick"
          doc={doc}
          listId={list.id}
          boundIds={list.onRowClick ?? []}
          options={actions}
          onCommit={onCommit}
          onEditAction={onEditAction}
        />
        {(list.paging?.mode === 'loadMore' || list.paging?.mode === 'pages') && (
          <EventActionSelect
            label="onLoadMore"
            event="onLoadMore"
            doc={doc}
            listId={list.id}
            boundIds={list.onLoadMore ?? []}
            options={actions}
            onCommit={onCommit}
            onEditAction={onEditAction}
          />
        )}
        <ListMockEditor doc={doc} listId={list.id} onCommit={onCommit} />
      </div>
    );
  }

  if (sel.kind === 'column') {
    const list = doc.lists.find((x) => x.id === sel.listId);
    const col = list?.columns.find((c) => c.field === sel.field);
    if (!list || !col) {
      return (
        <div className="design-inspector">
          <p className="muted">Cột không tồn tại.</p>
        </div>
      );
    }
    return (
      <div className="design-inspector">
        <strong className="design-inspector-title">Column</strong>
        <PropRow label="field" title="Đổi field chỉ qua JSON">
          <input value={col.field} readOnly />
        </PropRow>
        <PropRow label="title">
          <LocalizedTextInput
            value={col.title}
            onChange={(title) =>
              onCommit(updateColumn(doc, list.id, col.field, { title: title ?? '' }))
            }
          />
        </PropRow>
        <PropRow label="type" title="text | checkbox | icon | image | stepper">
          <select
            value={col.type ?? 'text'}
            onChange={(e) =>
              onCommit(
                updateColumn(doc, list.id, col.field, {
                  type: e.target.value === 'text' ? undefined : e.target.value,
                }),
              )
            }
          >
            <option value="text">text</option>
            <option value="checkbox">checkbox</option>
            <option value="icon">icon</option>
            <option value="image">image</option>
            <option value="stepper">stepper</option>
          </select>
        </PropRow>
        <PropRow label="sizeMode" title="fixed (px) | flex (phần còn lại) | percent (%)">
          <select
            value={inferColumnSizeMode(col)}
            onChange={(e) => {
              const sizeMode = e.target.value as 'fixed' | 'flex' | 'percent';
              const width =
                sizeMode === 'fixed' ? '120px' : sizeMode === 'percent' ? '20%' : '1';
              onCommit(updateColumn(doc, list.id, col.field, { sizeMode, width }));
            }}
          >
            <option value="fixed">fixed (px)</option>
            <option value="flex">flex</option>
            <option value="percent">percent (%)</option>
          </select>
        </PropRow>
        <PropRow label="width">
          <input
            value={col.width ?? ''}
            placeholder="120px | 1 | 20%"
            onChange={(e) =>
              onCommit(
                updateColumn(doc, list.id, col.field, {
                  width: e.target.value.trim() || undefined,
                }),
              )
            }
          />
        </PropRow>
        <PropRow label="minWidth" title="Cột flex không xẹp quá mức">
          <input
            value={col.minWidth ?? ''}
            placeholder="80px"
            onChange={(e) =>
              onCommit(
                updateColumn(doc, list.id, col.field, {
                  minWidth: e.target.value.trim() || undefined,
                }),
              )
            }
          />
        </PropRow>
        <label className="design-prop-row">
          <span className="design-prop-label">bold</span>
          <span className="design-prop-value">
            <input
              type="checkbox"
              checked={!!col.bold}
              onChange={(e) =>
                onCommit(updateColumn(doc, list.id, col.field, { bold: e.target.checked || undefined }))
              }
            />
          </span>
        </label>
        <label className="design-prop-row">
          <span className="design-prop-label">italic</span>
          <span className="design-prop-value">
            <input
              type="checkbox"
              checked={!!col.italic}
              onChange={(e) =>
                onCommit(
                  updateColumn(doc, list.id, col.field, { italic: e.target.checked || undefined }),
                )
              }
            />
          </span>
        </label>
        <PropRow label="color">
          <input
            value={col.color ?? ''}
            placeholder="#333"
            onChange={(e) =>
              onCommit(
                updateColumn(doc, list.id, col.field, {
                  color: e.target.value.trim() || undefined,
                }),
              )
            }
          />
        </PropRow>
        <p className="muted design-prop-hint">List: {list.id}</p>
      </div>
    );
  }

  return null;
}
