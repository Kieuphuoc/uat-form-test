import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { fetchRuntimeForm, runAction } from '../api/formApi';
import { controlLayoutStyle, controlTextStyle, controlVisualStyle } from '../lib/controlLayout';
import {
  groupControlsByRowId,
  groupControlsForLayout,
  splitControlsByPlacement,
  type AccordionLayoutGroup,
  type RowLayoutGroup,
} from '../lib/controlGroups';
import {
  applyDefaultValues,
  isControlEditable,
  isControlVisible,
  resolveFormMode,
} from '../lib/formMode';
import {
  resolveSelectOptionsForLan,
  resolveSelectOptionsMode,
} from '../lib/selectOptions';
import { resolveLocalizedText, type LangCode } from '../lib/localizedText';
import { uiCopy } from '../lib/uiCopy';
import {
  defaultTimeValue,
  filterNumberInput,
  formatDateValue,
  formatNumberValue,
  formatTimeValue,
  parseNumberInput,
} from '../lib/valueFormat';
import type {
  ClientFormDto,
  FormControlDef,
  FormListColumnDef,
  FormListDef,
  FormListItemTemplate,
  FormMode,
  RuntimeActionResponse,
} from '../types/form';
import { FormDebugBug } from './FormDebugBug';
import {
  OpenAsAnchor,
  resolveOpenAs,
  RuntimeColorInput,
  RuntimeFileImageInput,
} from './formControlsExtras';
import { MapsControl } from './MapsControl';
import { LiveClockLabel } from './LiveClockLabel';
import { getCachedImagePreviewUrl, loadImagePreviewBlob, parseAttachments, stripAttachmentPreviewUrls } from '../api/formUploadApi';
import { useUiLan } from '../hooks/useUiLan';
import { useAuth } from '../auth/AuthContext';
import { buildGoogleMapsUrl, requestDeviceGps } from '../lib/deviceGps';
import { formatMapLocations } from '../lib/mapLocations';

type Toast = { text: string; level: string } | null;

type StackFrame = {
  formId: string;
  form: ClientFormDto;
  formMode: FormMode;
  values: Record<string, unknown>;
  state: Record<string, unknown>;
  datasets: Record<string, Record<string, unknown>[]>;
  returnMap?: Record<string, string>;
  selectedRowKey?: string;
  /** Số dòng trả về lần fetch gần nhất theo list.bind (hasMore). */
  listFetchMeta?: Record<string, { lastCount: number }>;
  /** showForm UI: modal | sheet | fullscreen */
  uiMode?: string;
};

type Props = {
  slug: string;
  initialForm: ClientFormDto;
  initialDatasets?: Record<string, Record<string, unknown>[]>;
  initialValues?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  /** Ưu tiên hơn defaultFormMode của form (preview Designer). */
  initialFormMode?: string | null;
  /** Override ngôn ngữ UI (Designer Preview); mặc định lấy từ auth. */
  uiLan?: LangCode;
  preview?: boolean;
  /** Preview trong Designer — compact shell, ẩn debug bug. */
  embedded?: boolean;
};

export { groupControlsByRowId };

function asInputValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v);
}

function asStringKeys(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function rowDisplayLabel(row: Record<string, unknown>, key: string): string {
  for (const f of ['ten_vt', 'name', 'title', 'label']) {
    const t = row[f];
    if (t != null && String(t).trim()) return String(t);
  }
  return key;
}

function truthyCell(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'x';
}

function listCellStyle(col: FormListColumnDef): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (col.width?.trim()) style.width = col.width.trim();
  if (col.bold) style.fontWeight = 700;
  if (col.italic) style.fontStyle = 'italic';
  if (col.color?.trim()) style.color = col.color.trim();
  return Object.keys(style).length ? style : undefined;
}

function renderListCell(col: FormListColumnDef, row: Record<string, unknown>): ReactNode {
  const raw = row[col.field];
  const type = (col.type ?? 'text').toLowerCase();
  if (type === 'checkbox') {
    return <input type="checkbox" checked={truthyCell(raw)} readOnly disabled tabIndex={-1} />;
  }
  if (type === 'icon') {
    return <span aria-hidden>{asInputValue(raw) || '⬜'}</span>;
  }
  if (type === 'image') {
    const id = asInputValue(raw);
    return id ? <ListRowMediaThumb value={raw} size={28} fallback="🖼" /> : null;
  }
  return asInputValue(raw);
}

function joinRowFields(
  row: Record<string, unknown>,
  fields: string[] | undefined,
  sep: string,
): string {
  if (!fields?.length) return '';
  return fields
    .map((f) => asInputValue(row[f]).trim())
    .filter(Boolean)
    .join(sep);
}

function resolveListTemplate(list: FormListDef): 'table' | 'card' | 'media' {
  const t = (list.template ?? 'table').trim().toLowerCase();
  if (t === 'card' || t === 'media') return t;
  if (list.itemTemplate) return list.itemTemplate.imageField ? 'media' : 'card';
  return 'table';
}

function ListRowMediaThumb({
  value,
  size,
  fallback,
}: {
  value: unknown;
  size: number;
  fallback: string;
}) {
  const raw = asInputValue(value).trim();
  const isUrl = /^https?:\/\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('data:');
  const fileId = !isUrl ? raw : '';
  const [src, setSrc] = useState<string | undefined>(() => {
    if (isUrl) return raw;
    if (fileId) return getCachedImagePreviewUrl(fileId);
    return undefined;
  });

  useEffect(() => {
    if (isUrl) {
      setSrc(raw);
      return;
    }
    if (!fileId) {
      setSrc(undefined);
      return;
    }
    const cached = getCachedImagePreviewUrl(fileId);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    void loadImagePreviewBlob(fileId).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [raw, isUrl, fileId]);

  if (src) {
    return (
      <img
        className="form-list-item-thumb-img"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className="form-list-item-thumb-fallback" style={{ width: size, height: size }}>
      {fallback}
    </span>
  );
}

function ListItemLeading({
  row,
  tpl,
  media,
}: {
  row: Record<string, unknown>;
  tpl: FormListItemTemplate;
  media: boolean;
}) {
  const size = Math.max(28, tpl.imageWidth ?? 48);
  const defaultIcon = tpl.defaultIcon?.trim() || '📦';
  const iconVal = tpl.iconField ? asInputValue(row[tpl.iconField]).trim() : '';
  const imageVal = tpl.imageField ? row[tpl.imageField] : undefined;
  const hasImage = media && imageVal != null && asInputValue(imageVal).trim() !== '';

  if (hasImage) {
    return (
      <span className="form-list-item-thumb" style={{ width: size, height: size }}>
        <ListRowMediaThumb value={imageVal} size={size} fallback={iconVal || defaultIcon} />
      </span>
    );
  }
  if (iconVal || tpl.defaultIcon || media) {
    return (
      <span className="form-list-item-icon" style={{ width: size, height: size }} aria-hidden>
        {iconVal || defaultIcon}
      </span>
    );
  }
  return null;
}

function resolveListTotal(frame: StackFrame, list: FormListDef): number | null {
  const paging = list.paging;
  if (!paging) return null;
  if (paging.pageCountBind) {
    const pc = Number(frame.state[paging.pageCountBind]);
    if (Number.isFinite(pc) && pc > 0) {
      const size = Math.max(1, paging.pageSize ?? 20);
      return pc * size;
    }
  }
  if (paging.totalDataset) {
    const meta = frame.datasets[paging.totalDataset]?.[0];
    if (meta) {
      const field = paging.totalField?.trim() || 'total';
      const n = Number(meta[field]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function resolvePageCount(frame: StackFrame, list: FormListDef): number | null {
  const paging = list.paging;
  if (!paging) return null;
  if (paging.pageCountBind) {
    const pc = Number(frame.state[paging.pageCountBind]);
    if (Number.isFinite(pc)) return Math.max(0, Math.floor(pc));
  }
  const total = resolveListTotal(frame, list);
  if (total == null) return null;
  const size = Math.max(1, paging.pageSize ?? 20);
  return Math.max(1, Math.ceil(total / size));
}

function initListState(form: ClientFormDto, state: Record<string, unknown>): Record<string, unknown> {
  const next = { ...state };
  for (const list of form.lists ?? []) {
    if (list.selection === 'multiple' && list.selectedKeysBind && next[list.selectedKeysBind] == null) {
      next[list.selectedKeysBind] = [];
    }
    const pageBind = list.paging?.pageBind;
    if (pageBind && next[pageBind] == null) next[pageBind] = 1;
    const qBind = list.search?.queryBind || (list.search ? `${list.id}Query` : '');
    if (qBind && next[qBind] == null) next[qBind] = '';
  }
  return next;
}

function rowMatchesSearch(
  row: Record<string, unknown>,
  query: string,
  columns: { field: string; op?: string }[],
): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = q.toLowerCase();
  const parts = q
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return columns.some((col) => {
    const v = asInputValue(row[col.field]).toLowerCase();
    const op = (col.op ?? 'like').trim().toLowerCase();
    switch (op) {
      case 'eq':
      case '=':
      case 'equal':
        return v === needle;
      case 'likeprefix':
      case 'prefix':
      case 'startswith':
        return v.startsWith(needle);
      case 'likesuffix':
      case 'suffix':
      case 'endswith':
        return v.endsWith(needle);
      case 'in':
        return parts.length ? parts.some((p) => v === p) : v === needle;
      case 'like':
      case 'contains':
      default:
        return v.includes(needle);
    }
  });
}

function filterListRows(
  rows: Record<string, unknown>[],
  list: FormListDef,
  state: Record<string, unknown>,
): Record<string, unknown>[] {
  const search = list.search;
  if (!search?.enabled && !search?.columns?.length) return rows;
  if ((search.mode ?? 'server').toLowerCase() !== 'client') return rows;
  if (!search.columns?.length) return rows;
  const qBind = search.queryBind || `${list.id}Query`;
  const q = String(state[qBind] ?? '');
  return rows.filter((r) => rowMatchesSearch(r, q, search.columns!));
}

function isListSearchEnabled(list: FormListDef): boolean {
  const s = list.search;
  if (!s) return false;
  if (s.enabled === false) return false;
  return s.enabled === true || (s.columns?.length ?? 0) > 0 || (s.onSearch?.length ?? 0) > 0;
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

function buildFrame(
  form: ClientFormDto,
  opts: {
    values?: Record<string, unknown>;
    state?: Record<string, unknown>;
    datasets?: Record<string, Record<string, unknown>[]>;
    formMode?: string | null;
    returnMap?: Record<string, string>;
    uiMode?: string;
  } = {},
): StackFrame {
  const formMode = resolveFormMode(opts.formMode, form.defaultFormMode);
  const values = applyDefaultValues(form, opts.values ?? {}, formMode);
  const datasets = { ...(opts.datasets ?? {}) };
  const listFetchMeta: Record<string, { lastCount: number }> = {};
  for (const list of form.lists ?? []) {
    const rows = datasets[list.bind];
    if (rows) listFetchMeta[list.bind] = { lastCount: rows.length };
  }
  return {
    formId: form.id,
    form,
    formMode,
    values,
    state: initListState(form, { formMode, ...(opts.state ?? {}) }),
    datasets,
    returnMap: opts.returnMap,
    listFetchMeta,
    uiMode: opts.uiMode?.trim() || undefined,
  };
}

export function FormRuntimeView({
  slug,
  initialForm,
  initialDatasets,
  initialValues,
  initialState,
  initialFormMode,
  uiLan,
  preview,
  embedded,
}: Props) {
  const authLan = useUiLan();
  const lan = uiLan ?? authLan;
  const { user } = useAuth();
  const [stack, setStack] = useState<StackFrame[]>([
    buildFrame(initialForm, {
      values: initialValues,
      state: initialState,
      datasets: initialDatasets,
      formMode: initialFormMode,
    }),
  ]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  /** Override collapsed theo groupId (undefined = dùng defaultCollapsed). */
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});

  const top = stack[stack.length - 1]!;
  const isOverlay = stack.length > 1;
  const overlayMode = (top.uiMode ?? 'modal').trim().toLowerCase();
  const isFullscreen = overlayMode === 'fullscreen' || overlayMode === 'full';
  const isSheet = overlayMode === 'sheet';
  const isModal = isOverlay; // form con (header ×) — mọi mode overlay

  useEffect(() => {
    setGroupCollapsed({});
  }, [top.formId]);

  const showToast = useCallback((text: string, level = 'info') => {
    setToast({ text, level });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const mergeResult = useCallback(
    (
      frame: StackFrame,
      res: RuntimeActionResponse,
      opts?: { appendDatasets?: string[] },
    ): StackFrame => {
      const appendSet = new Set((opts?.appendDatasets ?? []).map((x) => x.toLowerCase()));
      const datasets = { ...frame.datasets };
      const listFetchMeta = { ...(frame.listFetchMeta ?? {}) };
      for (const [k, rows] of Object.entries(res.datasets ?? {})) {
        const incoming = rows ?? [];
        listFetchMeta[k] = { lastCount: incoming.length };
        if (appendSet.has(k.toLowerCase())) {
          const prev = datasets[k] ?? [];
          const list = frame.form.lists.find((l) => l.bind === k);
          const rk = list?.rowKey;
          if (rk) {
            const seen = new Set(prev.map((r) => String(r[rk] ?? '')));
            const merged = [...prev];
            for (const row of incoming) {
              const id = String(row[rk] ?? '');
              if (id && seen.has(id)) continue;
              if (id) seen.add(id);
              merged.push(row);
            }
            datasets[k] = merged;
          } else {
            datasets[k] = [...prev, ...incoming];
          }
        } else {
          datasets[k] = incoming;
        }
      }
      return {
        ...frame,
        values: { ...frame.values, ...(res.values ?? {}) },
        state: { ...frame.state, ...(res.state ?? {}) },
        datasets,
        listFetchMeta,
      };
    },
    [],
  );

  const runActions = useCallback(
    async (
      actionIds: string[],
      rowContext?: Record<string, unknown>,
      valuesPatch?: Record<string, unknown>,
      statePatch?: Record<string, unknown>,
      opts?: { appendDatasets?: string[] },
    ) => {
      if (!actionIds.length) return;
      setBusy(true);
      try {
        let working = stack[stack.length - 1]!;
        if (valuesPatch) {
          working = { ...working, values: { ...working.values, ...valuesPatch } };
        }
        if (statePatch) {
          working = { ...working, state: { ...working.state, ...statePatch } };
        }
        let frames = [...stack.slice(0, -1), working];

        for (const actionId of actionIds) {
          const meta = working.form.actions?.[actionId];
          if ((meta?.type ?? '').trim().toLowerCase() === 'getgps') {
            try {
              const fix = await requestDeviceGps();
              const loc = formatMapLocations([{ lat: fix.latitude, lng: fix.longitude }]);
              const mapsIds = working.form.controls
                .filter((c) => c.type === 'maps')
                .map((c) => c.id);
              const nextValues = { ...working.values };
              for (const mid of mapsIds) nextValues[mid] = loc;
              working = { ...working, values: nextValues };
              frames = [...frames.slice(0, -1), working];

              const resultFormId = meta?.formId?.trim();
              if (resultFormId) {
                const loaded = await fetchRuntimeForm(slug, resultFormId, preview);
                if (!loaded.success || !loaded.data) {
                  showToast(loaded.error || uiCopy(lan, 'cannotOpenForm'), 'error');
                  setStack(frames);
                  return;
                }
                const seed = {
                  latitude: fix.latitude.toFixed(7),
                  longitude: fix.longitude.toFixed(7),
                  accuracy: fix.accuracy != null ? fix.accuracy.toFixed(1) : '—',
                  timestamp: new Date(fix.timestamp).toLocaleString('vi-VN'),
                  mapsUrl: buildGoogleMapsUrl(fix.latitude, fix.longitude),
                  location: loc,
                };
                frames = [
                  ...frames,
                  buildFrame(loaded.data.form, {
                    values: { ...(loaded.data.values ?? {}), ...seed },
                    state: loaded.data.state,
                    datasets: loaded.data.datasets,
                    formMode: meta?.formMode,
                    uiMode: meta?.mode || 'modal',
                  }),
                ];
                working = frames[frames.length - 1]!;
              } else {
                showToast(
                  `GPS: ${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)} (±${
                    fix.accuracy != null ? fix.accuracy.toFixed(0) : '?'
                  }m)`,
                  'success',
                );
              }
            } catch (e) {
              showToast(e instanceof Error ? e.message : String(e), 'error');
              setStack(frames);
              return;
            }
            continue;
          }

          const res = await runAction(slug, actionId, {
            formId: working.formId,
            controlValues: stripAttachmentPreviewUrls(working.values),
            state: working.state,
            rowContext,
          });
          if (!res.success || !res.data) {
            showToast(res.error || uiCopy(lan, 'actionFailed'), 'error');
            setStack(frames);
            return;
          }

          const data = res.data;
          working = mergeResult(working, data, opts);
          frames = [...frames.slice(0, -1), working];

          const ui = data.ui;
          if (ui?.message?.text) showToast(ui.message.text, ui.message.level || 'info');

          if (ui?.openForm?.formId) {
            const loaded = await fetchRuntimeForm(slug, ui.openForm.formId, preview);
            if (!loaded.success || !loaded.data) {
              showToast(loaded.error || uiCopy(lan, 'cannotOpenForm'), 'error');
              setStack(frames);
              return;
            }
            frames = [
              ...frames,
              buildFrame(loaded.data.form, {
                values: { ...(loaded.data.values ?? {}), ...(ui.openForm.values ?? {}) },
                state: { ...(loaded.data.state ?? {}), ...(ui.openForm.state ?? {}) },
                datasets: loaded.data.datasets,
                formMode: ui.openForm.formMode,
                returnMap: ui.openForm.returnMap,
                uiMode: ui.openForm.mode,
              }),
            ];
            working = frames[frames.length - 1]!;
          }

          if (ui?.close) {
            if (frames.length <= 1) {
              showToast(uiCopy(lan, 'closed'), 'info');
            } else {
              const child = frames[frames.length - 1]!;
              const parent = { ...frames[frames.length - 2]! };
              const returned = ui.close.returnValues ?? {};
              applyDestMap(child.returnMap, returned, parent.values, parent.state);
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
    [stack, slug, preview, mergeResult, showToast, lan],
  );

  const openLinkedForm = useCallback(
    async (formId: string, returnMap?: Record<string, string>) => {
      setBusy(true);
      try {
        const loaded = await fetchRuntimeForm(slug, formId, preview);
        if (!loaded.success || !loaded.data) {
          showToast(loaded.error || uiCopy(lan, 'cannotOpenForm'), 'error');
          return;
        }
        setStack((prev) => [
          ...prev,
          buildFrame(loaded.data!.form, {
            values: loaded.data!.values,
            state: loaded.data!.state,
            datasets: loaded.data!.datasets,
            returnMap,
          }),
        ]);
      } finally {
        setBusy(false);
      }
    },
    [slug, preview, showToast, lan],
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

  const patchTopState = (patch: Record<string, unknown>, valuesPatch?: Record<string, unknown>) => {
    setStack((prev) => {
      const copy = [...prev];
      const last = { ...copy[copy.length - 1]! };
      last.state = { ...last.state, ...patch };
      if (valuesPatch) last.values = { ...last.values, ...valuesPatch };
      copy[copy.length - 1] = last;
      return copy;
    });
  };

  const applyListSelection = (list: FormListDef, keys: string[]) => {
    const bind = list.selectedKeysBind || 'selectedKeys';
    const rows = top.datasets[list.bind] ?? [];
    const rk = list.rowKey || 'id';
    const labels = keys.map((k) => {
      const row = rows.find((r) => String(r[rk]) === k);
      return row ? rowDisplayLabel(row, k) : k;
    });
    const codes = keys.join(',');
    const label = labels.join(', ');
    patchTopState(
      { [bind]: keys, selectedCodes: codes, selectedLabel: label },
      { selectedLabel: label },
    );
  };

  const toggleListKey = (list: FormListDef, key: string) => {
    const bind = list.selectedKeysBind || 'selectedKeys';
    const cur = asStringKeys(top.state[bind]);
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    applyListSelection(list, next);
  };

  const toggleAllVisibleKeys = (list: FormListDef, keys: string[], selectAll: boolean) => {
    const bind = list.selectedKeysBind || 'selectedKeys';
    const cur = new Set(asStringKeys(top.state[bind]));
    if (selectAll) keys.forEach((k) => cur.add(k));
    else keys.forEach((k) => cur.delete(k));
    applyListSelection(list, [...cur]);
  };

  const loadListPage = (list: FormListDef, nextPage: number, append: boolean) => {
    const pageBind = list.paging?.pageBind || 'page';
    const actions = list.onLoadMore?.length
      ? list.onLoadMore
      : list.bind && top.form.datasets?.[list.bind]
        ? [top.form.datasets[list.bind]!]
        : [];
    if (!actions.length) return;
    void runActions(
      actions,
      undefined,
      undefined,
      { [pageBind]: nextPage },
      append ? { appendDatasets: [list.bind] } : undefined,
    );
  };

  const runListSearch = (list: FormListDef, query: string) => {
    const search = list.search;
    if (!search) return;
    const qBind = search.queryBind || `${list.id}Query`;
    const pageBind = list.paging?.pageBind || 'page';
    const mode = (search.mode ?? 'server').toLowerCase();
    if (mode === 'client') {
      patchTopState({ [qBind]: query, [pageBind]: 1 });
      return;
    }
    const actions =
      search.onSearch?.length
        ? search.onSearch
        : list.onLoadMore?.length
          ? list.onLoadMore
          : list.bind && top.form.datasets?.[list.bind]
            ? [top.form.datasets[list.bind]!]
            : [];
    if (!actions.length) {
      patchTopState({ [qBind]: query, [pageBind]: 1 });
      return;
    }
    void runActions(actions, undefined, undefined, { [qBind]: query, [pageBind]: 1 });
  };

  const { header: headerControls, body: bodyControls, footer: footerControls } = useMemo(
    () => splitControlsByPlacement(top.form.controls),
    [top.form.controls],
  );
  const controlGroups = useMemo(
    () => groupControlsForLayout(bodyControls, lan),
    [bodyControls, lan],
  );
  const footerGroups = useMemo(
    () => groupControlsForLayout(footerControls, lan),
    [footerControls, lan],
  );
  const lists = useMemo(
    () => [...top.form.lists].sort((a, b) => a.order - b.order),
    [top.form.lists],
  );

  const renderControl = (c: FormControlDef, inRow = false): ReactNode => {
    if (!isControlVisible(c, top.formMode)) return null;

    // openAs + view + rỗng → ẩn cả control (vd. QR không phải link).
    if (
      c.type === 'text' &&
      top.formMode === 'view' &&
      resolveOpenAs(c.openAs) &&
      !asInputValue(top.values[c.id]).trim()
    ) {
      return null;
    }

    const editable = isControlEditable(c, top.formMode, busy);
    const disabled = !editable;
    const layoutStyle = controlLayoutStyle(c, inRow);
    const textStyle = controlTextStyle(c);
    const visualStyle = controlVisualStyle(c, inRow);
    const heightStyle: CSSProperties | undefined = c.height?.trim()
      ? { height: c.height.trim(), minHeight: c.height.trim() }
      : undefined;
    const labelText = resolveLocalizedText(c.label, lan).trim();
    const showLabel = c.type !== 'label' && labelText.length > 0;
    const textText = resolveLocalizedText(c.text, lan);
    const placeholderText = resolveLocalizedText(c.placeholder, lan) || undefined;

    if (c.type === 'label') {
      const fmt = (c.format ?? '').trim().toLowerCase();
      if (fmt === 'livedate') {
        return (
          <LiveClockLabel
            key={c.id}
            kind="liveDate"
            className="form-label-control form-live-date"
            style={visualStyle}
          />
        );
      }
      if (fmt === 'livetime') {
        return (
          <LiveClockLabel
            key={c.id}
            kind="liveTime"
            className="form-label-control form-live-time"
            style={visualStyle}
          />
        );
      }

      const openAs = resolveOpenAs(c.openAs);
      const fromValue = asInputValue(top.values[c.id]).trim();
      let sessionText = '';
      if ((c.bind ?? '').trim().toLowerCase() === 'sessionuser') {
        const name = (user?.nickname || user?.email || '').trim();
        const email = (user?.email || '').trim();
        sessionText =
          name && email && name !== email ? `${name} (${email})` : name || email || '—';
      }
      // type=label: nội dung chỉ lấy từ `text` (không dùng prop `label`).
      const caption = textText.trim();
      const raw = (fromValue || sessionText || caption).trim();
      if (fmt === 'personnel' || (c.bind ?? '').trim().toLowerCase() === 'sessionuser') {
        const left = caption || 'Nhân sự';
        return (
          <div key={c.id} className="form-personnel-row" style={visualStyle}>
            <span className="form-personnel-row__label">{left}</span>
            <span className="form-personnel-row__value">{sessionText || fromValue || '—'}</span>
          </div>
        );
      }
      return (
        <p key={c.id} className="form-label-control" style={visualStyle}>
          {openAs && raw ? <OpenAsAnchor kind={openAs} value={raw} /> : raw || c.id}
        </p>
      );
    }

    if (c.type === 'hidden') return null;

    if (c.type === 'maps') {
      return (
        <div key={c.id} className="form-maps-field" style={layoutStyle}>
          {showLabel ? <span className="form-maps-field__label">{labelText}</span> : null}
          <MapsControl
            value={top.values[c.id] ?? c.defaultValue}
            height={c.height}
            autoLocate={!asInputValue(top.values[c.id] ?? c.defaultValue).trim()}
            onLocationsChange={(serialized) => setValue(c.id, serialized)}
          />
        </div>
      );
    }

    if (c.type === 'iconButton') {
      const bg = c.color?.trim() || '#2f6fed';
      return (
        <button
          key={c.id}
          type="button"
          className="form-icon-btn"
          disabled={busy || c.enabled === false}
          style={layoutStyle}
          onClick={() => {
            if (c.linkFormId?.trim()) void openLinkedForm(c.linkFormId.trim());
            else if (c.onClick?.length) void runActions(c.onClick);
          }}
        >
          <span className="form-icon-btn__tile" style={{ background: bg }}>
            {c.icon || '⬜'}
          </span>
          <span className="form-icon-btn__label">{textText || labelText || c.id}</span>
        </button>
      );
    }

    if (c.type === 'button') {
      const btnStyle: CSSProperties = {
        ...visualStyle,
        ...(c.color?.trim() ? { background: c.color.trim(), borderColor: c.color.trim() } : {}),
      };
      return (
        <button
          key={c.id}
          type="button"
          className={`form-btn${inRow ? ' form-row-item' : ''}`}
          disabled={busy || c.enabled === false}
          style={btnStyle}
          onClick={() => {
            if (c.linkFormId?.trim()) void openLinkedForm(c.linkFormId.trim());
            else void runActions(c.onClick ?? []);
          }}
        >
          {c.icon ? <span className="form-btn__icon">{c.icon}</span> : null}
          <span className="form-btn__text">{textText || labelText || c.id}</span>
        </button>
      );
    }

    const common = {
      id: c.id,
      disabled,
      readOnly: disabled,
      placeholder: placeholderText,
      value: asInputValue(top.values[c.id]),
      style: { ...heightStyle, ...textStyle } as CSSProperties,
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        if (!editable) return;
        const v = e.target.value;
        setValue(c.id, v);
        if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: v });
      },
    };

    return (
      <label key={c.id} className="field" style={layoutStyle}>
        {showLabel ? (
          <span>
            {labelText}
            {c.required ? ' *' : ''}
            {(c.type === 'file' || c.type === 'image') &&
            !editable &&
            parseAttachments(top.values[c.id]).length === 0 ? (
              <em className="form-attach-empty-inline">
                {c.type === 'image' ? uiCopy(lan, 'noImageParen') : uiCopy(lan, 'noFilesParen')}
              </em>
            ) : null}
          </span>
        ) : (c.type === 'file' || c.type === 'image') &&
          !editable &&
          parseAttachments(top.values[c.id]).length === 0 ? (
          <em className="form-attach-empty-inline">
            {c.type === 'image' ? uiCopy(lan, 'noImage') : uiCopy(lan, 'noFiles')}
          </em>
        ) : null}
        {c.type === 'textarea' ? (
          <textarea {...common} style={{ ...heightStyle, ...textStyle }} />
        ) : c.type === 'select' ? (
          <RuntimeSelectControl
            c={c}
            disabled={disabled}
            editable={editable}
            value={asInputValue(top.values[c.id])}
            datasets={top.datasets}
            heightStyle={{ ...heightStyle, ...textStyle }}
            placeholder={placeholderText}
            onChangeValue={(v) => {
              if (!editable) return;
              setValue(c.id, v);
              if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: v });
            }}
            onSearch={(q) => {
              const actionId = c.optionsAction?.trim();
              if (!actionId) return;
              void runActions([actionId], undefined, undefined, {
                [`selectQuery.${c.id}`]: q,
              });
            }}
            onOpenPicker={() => {
              const formId = c.optionsPickerFormId?.trim();
              if (!formId) return;
              const vf = c.optionsValueField?.trim() || 'id';
              void openLinkedForm(formId, { [vf]: `control.${c.id}` });
            }}
            lan={lan}
          />
        ) : c.type === 'number' ? (
          <FormattedNumberInput
            id={c.id}
            disabled={disabled}
            editable={editable}
            format={c.format}
            placeholder={placeholderText}
            value={top.values[c.id]}
            style={{ ...heightStyle, ...textStyle }}
            onCommit={(n) => {
              setValue(c.id, n);
              if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: n });
            }}
          />
        ) : c.type === 'date' ? (
          <FormattedDateInput
            id={c.id}
            disabled={disabled}
            editable={editable}
            format={c.format}
            placeholder={placeholderText}
            value={top.values[c.id]}
            style={{ ...heightStyle, ...textStyle }}
            onCommit={(s) => {
              setValue(c.id, s);
              if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: s });
            }}
          />
        ) : c.type === 'time' ? (
          <FormattedTimeInput
            id={c.id}
            disabled={disabled}
            editable={editable}
            format={c.format}
            placeholder={placeholderText}
            value={top.values[c.id]}
            style={{ ...heightStyle, ...textStyle }}
            onCommit={(s) => {
              setValue(c.id, s);
              if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: s });
            }}
          />
        ) : c.type === 'color' ? (
          <RuntimeColorInput
            id={c.id}
            disabled={disabled}
            editable={editable}
            value={top.values[c.id]}
            style={{ ...heightStyle, ...textStyle }}
            lan={lan}
            onCommit={(hex) => {
              setValue(c.id, hex);
              if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: hex });
            }}
          />
        ) : c.type === 'file' || c.type === 'image' ? (
          !editable && parseAttachments(top.values[c.id]).length === 0 ? null : (
            <RuntimeFileImageInput
              kind={c.type}
              slug={slug}
              disabled={disabled}
              editable={editable}
              accept={c.accept}
              maxFiles={c.maxFiles}
              uploadMode={c.uploadMode}
              previewWidth={c.previewWidth}
              value={top.values[c.id]}
              style={heightStyle}
              lan={lan}
              onCommit={(items) => {
                setValue(c.id, items);
                if (c.onChange?.length) void runActions(c.onChange, undefined, { [c.id]: items });
              }}
            />
          )
        ) : (() => {
          const openAs = resolveOpenAs(c.openAs);
          if (c.type === 'text' && openAs && top.formMode === 'view') {
            const raw = asInputValue(top.values[c.id]);
            return (
              <OpenAsAnchor kind={openAs} value={raw} className="form-openas-link form-openas-link--field" />
            );
          }
          return <input {...common} type="text" style={{ ...heightStyle, ...textStyle }} />;
        })()}
      </label>
    );
  };

  const renderRowGroup = (g: RowLayoutGroup): ReactNode => {
    if (g.kind === 'single') {
      return renderControl(g.control, false);
    }
    const kids = g.controls.map((c) => renderControl(c, true)).filter(Boolean);
    if (kids.length === 0) return null;
    return (
      <div key={`row:${g.rowId}`} className="form-control-row">
        {kids}
      </div>
    );
  };

  const renderLayoutGroup = (g: AccordionLayoutGroup): ReactNode => {
    if (g.kind !== 'group') return renderRowGroup(g);

    const collapsed =
      groupCollapsed[g.groupId] !== undefined
        ? groupCollapsed[g.groupId]!
        : g.defaultCollapsed;
    const bodyKids = g.items.map(renderRowGroup).filter(Boolean);
    if (bodyKids.length === 0) return null;

    return (
      <div
        key={`group:${g.groupId}`}
        className="form-control-group form-drawer-span"
        style={g.background ? { background: g.background } : undefined}
      >
        <button
          type="button"
          className="form-control-group-toggle"
          aria-expanded={!collapsed}
          onClick={() =>
            setGroupCollapsed((prev) => ({
              ...prev,
              [g.groupId]: !collapsed,
            }))
          }
        >
          <span className="form-control-group-chevron" aria-hidden>
            {collapsed ? '▸' : '▾'}
          </span>
          {g.icon ? (
            <span className="form-control-group-icon" aria-hidden>
              {g.icon}
            </span>
          ) : null}
          <span className="form-control-group-title">{g.label}</span>
        </button>
        {!collapsed && <div className="form-control-group-body">{bodyKids}</div>}
      </div>
    );
  };

  const footerNodes = footerGroups.map(renderLayoutGroup).filter(Boolean);
  const hasFooter = footerNodes.length > 0;
  /** list = list-only chrome (không card/border, không tiêu đề list + chọn tất cả). */
  const isListLayout = (top.form.layout || '').toLowerCase() === 'list';

  const body = (
    <div className={`form-shell${hasFooter ? ' form-shell--has-footer' : ''}`}>
      <div
        className={`form-scroll ${top.form.layout === 'drawer' ? 'form-drawer' : 'stack'}`}
      >
      {!isModal && top.form.layout !== 'drawer' && !isListLayout && (
        <h1>{resolveLocalizedText(top.form.title, lan)}</h1>
      )}
      {!isModal && top.form.layout === 'drawer' && (
        <h1 className="form-drawer-title">{resolveLocalizedText(top.form.title, lan)}</h1>
      )}
      {isModal && (
        <div
          className={`modal-header${isFullscreen ? ' modal-header--app' : ''}${
            headerControls.length ? ' modal-header--has-actions' : ''
          }`}
        >
          {isFullscreen ? (
            <button
              type="button"
              className="modal-back"
              title={uiCopy(lan, 'close')}
              aria-label={uiCopy(lan, 'close')}
              onClick={() => setStack((s) => s.slice(0, -1))}
              disabled={busy}
            >
              ‹
            </button>
          ) : null}
          <h2>{resolveLocalizedText(top.form.title, lan)}</h2>
          <div className="modal-header-actions">
            {headerControls.map((hc) => {
              if (!isControlVisible(hc, top.formMode)) return null;
              const ht = resolveLocalizedText(hc.text, lan) || resolveLocalizedText(hc.label, lan);
              return (
                <button
                  key={hc.id}
                  type="button"
                  className="modal-header-link"
                  disabled={busy || hc.enabled === false}
                  onClick={() => {
                    if (hc.linkFormId?.trim()) void openLinkedForm(hc.linkFormId.trim());
                    else if (hc.onClick?.length) void runActions(hc.onClick);
                  }}
                >
                  {ht || hc.id}
                </button>
              );
            })}
            {!isFullscreen ? (
              <button
                type="button"
                className="modal-close"
                title={uiCopy(lan, 'close')}
                aria-label={uiCopy(lan, 'close')}
                onClick={() => setStack((s) => s.slice(0, -1))}
                disabled={busy}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      )}

      {controlGroups.map(renderLayoutGroup)}

      {lists.map((list) => {
        const rawRows = top.datasets[list.bind] ?? [];
        const rows = filterListRows(rawRows, list, top.state);
        const multi = list.selection === 'multiple';
        const keysBind = list.selectedKeysBind || 'selectedKeys';
        const selectedKeys = asStringKeys(top.state[keysBind]);
        const selectedSet = new Set(selectedKeys);
        const visibleKeys = rows.map((row, idx) => String(list.rowKey ? row[list.rowKey] : idx));
        const allVisibleSelected =
          visibleKeys.length > 0 && visibleKeys.every((k) => selectedSet.has(k));
        const colCount = list.columns.length + (multi ? 1 : 0);
        const paging = list.paging;
        const pageSize = Math.max(1, paging?.pageSize ?? 20);
        const pageBind = paging?.pageBind || 'page';
        const page = Math.max(1, Number(top.state[pageBind] ?? 1) || 1);
        const pageCount = resolvePageCount(top, list);
        const total = resolveListTotal(top, list);
        const lastCount = top.listFetchMeta?.[list.bind]?.lastCount ?? rawRows.length;
        const mode = (paging?.mode ?? 'none').toLowerCase();
        const hasMore =
          mode === 'loadmore'
            ? total != null
              ? rawRows.length < total
              : lastCount >= pageSize
            : mode === 'pages'
              ? pageCount != null
                ? page < pageCount
                : lastCount >= pageSize
              : false;
        const hasPrev = mode === 'pages' && page > 1;
        const listTpl = resolveListTemplate(list);
        const itemTpl = list.itemTemplate ?? {};
        const sep = itemTpl.lineSep ?? ' · ';
        const isCards = listTpl === 'card' || listTpl === 'media';
        const searchOn = isListSearchEnabled(list);
        const qBind = list.search?.queryBind || `${list.id}Query`;
        const searchQuery = String(top.state[qBind] ?? '');

        const onRowActivate = (row: Record<string, unknown>, key: string) => {
          if (multi) {
            toggleListKey(list, key);
            return;
          }
          setStack((prev) => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1]! };
            last.selectedRowKey = key;
            copy[copy.length - 1] = last;
            return copy;
          });
          if (list.onRowClick?.length) void runActions(list.onRowClick, row);
        };

        const pagingFooter =
          mode === 'loadmore' || mode === 'pages' ? (
            <div className="form-list-paging">
              <span className="muted form-list-paging-meta">
                {total != null
                  ? uiCopy(lan, 'listPagingTotal', { n: rawRows.length, total })
                  : uiCopy(lan, 'listPagingLoaded', { n: rawRows.length })}
                {pageCount != null
                  ? ` · ${uiCopy(lan, 'listPagingPage', { n: page, total: pageCount })}`
                  : ` · ${uiCopy(lan, 'listPagingPageOnly', { n: page })}`}
                {multi && selectedKeys.length > 0
                  ? ` · ${uiCopy(lan, 'listSelectedCount', { n: selectedKeys.length })}`
                  : null}
              </span>
              <div className="form-list-paging-actions">
                {mode === 'pages' && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || !hasPrev}
                    onClick={() => loadListPage(list, page - 1, false)}
                  >
                    {uiCopy(lan, 'listPrevPage')}
                  </button>
                )}
                {mode === 'loadmore' ? (
                  <button
                    type="button"
                    disabled={busy || !hasMore}
                    onClick={() => loadListPage(list, page + 1, paging?.merge !== 'replace')}
                  >
                    {uiCopy(lan, 'listLoadMore')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !hasMore}
                    onClick={() => loadListPage(list, page + 1, false)}
                  >
                    {uiCopy(lan, 'listNextPage')}
                  </button>
                )}
              </div>
            </div>
          ) : null;

        return (
          <div
            key={list.id}
            className={`stack form-drawer-span form-list${isListLayout ? ' form-list--bare' : ' card'}`}
          >
            {!isListLayout && (
              <div className="form-list-head">
                <strong className="muted">{list.id}</strong>
                {multi && isCards && (
                  <label className="form-list-select-all">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={busy || visibleKeys.length === 0}
                      onChange={(e) => toggleAllVisibleKeys(list, visibleKeys, e.target.checked)}
                    />
                    <span className="muted">{uiCopy(lan, 'listSelectAll')}</span>
                  </label>
                )}
              </div>
            )}

            {searchOn && (
              <FormListSearchBox
                listId={list.id}
                value={searchQuery}
                placeholder={
                  resolveLocalizedText(list.search?.placeholder, lan) ||
                  uiCopy(lan, 'listSearchPlaceholder')
                }
                debounceMs={list.search?.debounceMs ?? 2000}
                loading={busy}
                onSearch={(q) => runListSearch(list, q)}
              />
            )}

            {isCards ? (
              <div className={`form-list-items form-list-items--${listTpl}`}>
                {rows.length === 0 && <p className="muted">{uiCopy(lan, 'noData')}</p>}
                {rows.map((row, idx) => {
                  const key = String(list.rowKey ? row[list.rowKey] : idx);
                  const rowSelected = multi ? selectedSet.has(key) : top.selectedRowKey === key;
                  const line1 = joinRowFields(row, itemTpl.line1, sep);
                  const line2 = joinRowFields(row, itemTpl.line2, sep);
                  const meta = itemTpl.metaField
                    ? asInputValue(row[itemTpl.metaField]).trim()
                    : '';
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      className={`form-list-item${rowSelected ? ' selected' : ''}`}
                      onClick={() => onRowActivate(row, key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowActivate(row, key);
                        }
                      }}
                    >
                      {multi && (
                        <span
                          className="form-list-item-check"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSet.has(key)}
                            disabled={busy}
                            onChange={() => toggleListKey(list, key)}
                          />
                        </span>
                      )}
                      <ListItemLeading row={row} tpl={itemTpl} media={listTpl === 'media'} />
                      <div className="form-list-item-body">
                        {line1 ? <div className="form-list-item-line1">{line1}</div> : null}
                        {line2 ? <div className="form-list-item-line2">{line2}</div> : null}
                        {!line1 && !line2 ? (
                          <div className="form-list-item-line1">{key}</div>
                        ) : null}
                      </div>
                      {meta ? <div className="form-list-item-meta muted">{meta}</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    {multi && (
                      <th className="form-list-check-col" style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          disabled={busy || visibleKeys.length === 0}
                          onChange={(e) =>
                            toggleAllVisibleKeys(list, visibleKeys, e.target.checked)
                          }
                          aria-label="Select all"
                        />
                      </th>
                    )}
                    {list.columns.map((col) => (
                      <th key={col.field} style={listCellStyle(col)}>
                        {resolveLocalizedText(col.title, lan)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, colCount)} className="muted">
                        {uiCopy(lan, 'noData')}
                      </td>
                    </tr>
                  )}
                  {rows.map((row, idx) => {
                    const key = String(list.rowKey ? row[list.rowKey] : idx);
                    const rowSelected = multi ? selectedSet.has(key) : top.selectedRowKey === key;
                    return (
                      <tr
                        key={key}
                        className={`clickable${rowSelected ? ' selected' : ''}`}
                        onClick={() => onRowActivate(row, key)}
                      >
                        {multi && (
                          <td
                            className="form-list-check-col"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSet.has(key)}
                              disabled={busy}
                              onChange={() => toggleListKey(list, key)}
                            />
                          </td>
                        )}
                        {list.columns.map((col) => (
                          <td key={col.field} style={listCellStyle(col)}>
                            {renderListCell(col, row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {pagingFooter}
          </div>
        );
      })}
      </div>
      {hasFooter ? (
        <div className="form-footer" role="group" aria-label="Footer">
          <div className="form-footer-inner stack">{footerNodes}</div>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {isOverlay ? (
        <>
          <div className={embedded ? 'shell embedded' : 'shell'}>
            <p className="muted">{uiCopy(lan, 'mainFormModalOpen')}</p>
          </div>
          <div
            className={`modal-backdrop${embedded ? ' embedded' : ''}${
              isFullscreen ? ' modal-backdrop--fullscreen' : ''
            }${isSheet ? ' modal-backdrop--sheet' : ''}`}
          >
            <div
              className={`modal${isFullscreen ? ' modal--fullscreen' : ''}${
                isSheet ? ' modal--sheet' : ''
              }`}
            >
              {body}
            </div>
          </div>
        </>
      ) : (
        <div className={embedded ? 'shell embedded' : 'shell'}>{body}</div>
      )}
      {toast && <div className={`toast toast-tr ${toast.level}`}>{toast.text}</div>}
      {!embedded && <FormDebugBug slug={slug} form={top.form} />}
    </>
  );
}

function FormListSearchBox({
  listId,
  value,
  placeholder,
  debounceMs,
  loading,
  onSearch,
}: {
  listId: string;
  value: string;
  placeholder: string;
  debounceMs: number;
  /** Đang tải list — không disable input (giữ focus). */
  loading?: boolean;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const timerRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // Chỉ sync từ state cha khi không focus — tránh ghi đè / mất caret khi list reload.
  useEffect(() => {
    if (!focusedRef.current) setText(value);
  }, [value, listId]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const schedule = (next: string) => {
    setText(next);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onSearchRef.current(next);
    }, Math.max(0, debounceMs));
  };

  return (
    <div className={`form-list-search${loading ? ' is-loading' : ''}`}>
      <div className="form-list-search-wrap">
        <input
          ref={inputRef}
          type="search"
          className="form-list-search-input"
          value={text}
          placeholder={placeholder}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
          }}
          onChange={(e) => schedule(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (timerRef.current != null) window.clearTimeout(timerRef.current);
              onSearchRef.current(text);
            }
          }}
          aria-label={placeholder}
          aria-busy={loading || undefined}
        />
        {text ? (
          <button
            type="button"
            className="form-list-search-clear"
            title="Clear"
            aria-label="Clear"
            onMouseDown={(e) => {
              // Giữ focus trên input (tránh blur trước khi clear).
              e.preventDefault();
            }}
            onClick={() => {
              setText('');
              if (timerRef.current != null) window.clearTimeout(timerRef.current);
              onSearchRef.current('');
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FormattedNumberInput({
  id,
  disabled,
  editable,
  format,
  placeholder,
  value,
  style,
  onCommit,
}: {
  id: string;
  disabled: boolean;
  editable: boolean;
  format?: string;
  placeholder?: string;
  value: unknown;
  style?: CSSProperties;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(() => formatNumberValue(value ?? 0, format));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatNumberValue(value ?? 0, format));
  }, [value, format]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      readOnly={!editable}
      placeholder={placeholder}
      value={text}
      style={style}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        if (!editable) return;
        setText(filterNumberInput(e.target.value, format));
      }}
      onBlur={() => {
        focused.current = false;
        const n = parseNumberInput(text, format);
        const v = n == null ? 0 : n;
        onCommit(v);
        setText(formatNumberValue(v, format));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function FormattedDateInput({
  id,
  disabled,
  editable,
  format,
  placeholder,
  value,
  style,
  onCommit,
}: {
  id: string;
  disabled: boolean;
  editable: boolean;
  format?: string;
  placeholder?: string;
  value: unknown;
  style?: CSSProperties;
  onCommit: (s: string | null) => void;
}) {
  /** Android/iOS WebView: type=text + readOnly hay bị “khóa”; dùng native date khi sửa được. */
  if (editable) {
    const iso = formatDateValue(value, 'yyyy-MM-dd');
    return (
      <input
        id={id}
        type="date"
        disabled={disabled}
        value={iso}
        placeholder={placeholder || format || 'dd/MM/yyyy'}
        style={{ fontSize: 16, minHeight: 44, ...style }}
        onChange={(e) => {
          const v = e.target.value.trim();
          onCommit(v || null);
        }}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      disabled
      readOnly
      placeholder={placeholder || format || 'dd/MM/yyyy'}
      value={formatDateValue(value, format)}
      style={style}
    />
  );
}

function FormattedTimeInput({
  id,
  disabled,
  editable,
  format,
  placeholder,
  value,
  style,
  onCommit,
}: {
  id: string;
  disabled: boolean;
  editable: boolean;
  format?: string;
  placeholder?: string;
  value: unknown;
  style?: CSSProperties;
  onCommit: (s: string) => void;
}) {
  if (editable) {
    const raw = formatTimeValue(value, format) || defaultTimeValue(format);
    // HH:mm or HH:mm:ss → input type=time prefers HH:mm[:ss]
    const timeVal = raw.length >= 5 ? raw.slice(0, format?.includes('ss') ? 8 : 5) : raw;
    return (
      <input
        id={id}
        type="time"
        step={format?.includes('ss') ? 1 : 60}
        disabled={disabled}
        value={timeVal}
        placeholder={placeholder || format || 'HH:mm'}
        style={{ fontSize: 16, minHeight: 44, ...style }}
        onChange={(e) => {
          const v = e.target.value.trim();
          onCommit(v || defaultTimeValue(format));
        }}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      disabled
      readOnly
      placeholder={placeholder || format || 'HH:mm'}
      value={formatTimeValue(value, format)}
      style={style}
    />
  );
}

function RuntimeSelectControl({
  c,
  disabled,
  editable,
  value,
  datasets,
  heightStyle,
  placeholder,
  lan,
  onChangeValue,
  onSearch,
  onOpenPicker,
}: {
  c: FormControlDef;
  disabled: boolean;
  editable: boolean;
  value: string;
  datasets: Record<string, Record<string, unknown>[]>;
  heightStyle?: CSSProperties;
  placeholder?: string;
  lan: LangCode;
  onChangeValue: (v: string) => void;
  onSearch: (q: string) => void;
  onOpenPicker: () => void;
}) {
  const mode = resolveSelectOptionsMode(c);
  const options = resolveSelectOptionsForLan(c, datasets, lan);
  const [query, setQuery] = useState('');
  const debounceRef = useRef<number | null>(null);
  const searchedOnce = useRef(false);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const scheduleSearch = (q: string) => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => onSearch(q), 300);
  };

  if (mode === 'listPicker') {
    return (
      <div className="form-select-picker">
        <input
          readOnly
          disabled={disabled}
          value={value}
          placeholder={placeholder || uiCopy(lan, 'pickFromList')}
          style={heightStyle}
          onClick={() => {
            if (editable) onOpenPicker();
          }}
        />
        <button
          type="button"
          className="secondary form-select-picker__btn"
          disabled={disabled}
          onClick={() => {
            if (editable) onOpenPicker();
          }}
        >
          …
        </button>
      </div>
    );
  }

  if (mode === 'sqlSearch') {
    return (
      <div className="form-select-search">
        <input
          type="search"
          disabled={disabled}
          value={query}
          placeholder={placeholder || uiCopy(lan, 'search')}
          onFocus={() => {
            if (!searchedOnce.current && editable) {
              searchedOnce.current = true;
              onSearch(query);
            }
          }}
          onChange={(e) => {
            if (!editable) return;
            const q = e.target.value;
            setQuery(q);
            scheduleSearch(q);
          }}
        />
        <select
          disabled={disabled}
          value={value}
          style={heightStyle}
          onChange={(e) => onChangeValue(e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <select
      disabled={disabled}
      value={value}
      style={heightStyle}
      onChange={(e) => onChangeValue(e.target.value)}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Remount when slug/form identity changes — không bump key thừa lúc mount. */
export function FormRuntimeHost(props: Props) {
  return <FormRuntimeView key={`${props.slug}:${props.initialForm.id}`} {...props} />;
}
