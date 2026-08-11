import type { FormControlDef, FormListColumnDef, FormListDef } from '../types/form';
import type { ControlType, FormDocument } from '../types/formDoc';
import {
  flattenDesignGroup,
  groupControlsForDesign,
  splitControlsByPlacement,
  type DesignControlGroup,
} from './controlGroups';
import { resolveLocalizedText, type LocalizedText } from './localizedText';

export { groupControlsForDesign, splitControlsByPlacement, isFooterControl, isHeaderControl } from './controlGroups';
export type { DesignControlGroup } from './controlGroups';

const ORDER_STEP = 10;

/** Renumber theo thứ tự mảng hiện tại (không sort lại theo order cũ). */
export function renumberOrders(doc: FormDocument): FormDocument {
  const controls = doc.controls.map((c, i) => ({ ...c, order: (i + 1) * ORDER_STEP }));
  const lists = doc.lists.map((l, i) => ({ ...l, order: (i + 1) * ORDER_STEP }));
  return { ...doc, controls, lists };
}

/** Sort theo order rồi đánh số lại 10,20,30… */
export function normalizeOrders(doc: FormDocument): FormDocument {
  return renumberOrders({
    ...doc,
    controls: [...doc.controls].sort((a, b) => a.order - b.order),
    lists: [...doc.lists].sort((a, b) => a.order - b.order),
  });
}

export function actionIds(doc: FormDocument): string[] {
  return Object.keys(doc.actions ?? {}).sort((a, b) => a.localeCompare(b));
}

/** Id action mới chưa trùng (vd action, action_2…). */
export function nextActionId(doc: FormDocument, base = 'action'): string {
  const used = new Set(Object.keys(doc.actions ?? {}));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function nextControlId(doc: FormDocument, base: string): string {
  const used = new Set(doc.controls.map((c) => c.id));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

/** Id hợp lệ: chữ cái/underscore đầu, sau đó chữ/số/underscore (1–64). */
export function validateControlId(
  doc: FormDocument,
  nextId: string,
  currentId: string,
): string | null {
  const id = nextId.trim();
  if (!id) return 'Id không được trống.';
  if (id.length > 64) return 'Id tối đa 64 ký tự.';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    return 'Chỉ dùng chữ, số, gạch dưới; bắt đầu bằng chữ hoặc _.';
  }
  if (id !== currentId && doc.controls.some((c) => c.id === id)) {
    return `Id “${id}” đã tồn tại.`;
  }
  return null;
}

function rewriteControlRefs(value: unknown, fromId: string, toId: string): unknown {
  const from = `control.${fromId}`;
  const to = `control.${toId}`;
  if (typeof value === 'string') {
    if (value === from) return to;
    if (value.startsWith(`${from}.`)) return `${to}${value.slice(from.length)}`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rewriteControlRefs(v, fromId, toId));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const nk = k === from ? to : k.startsWith(`${from}.`) ? `${to}${k.slice(from.length)}` : k;
      out[nk] = rewriteControlRefs(v, fromId, toId);
    }
    return out;
  }
  return value;
}

/** Đổi id control + cập nhật tham chiếu control.* trong actions. */
export function renameControlId(
  doc: FormDocument,
  fromId: string,
  toIdRaw: string,
): { doc: FormDocument; error: string | null } {
  const err = validateControlId(doc, toIdRaw, fromId);
  if (err) return { doc, error: err };
  const toId = toIdRaw.trim();
  if (toId === fromId) return { doc, error: null };

  const controls = doc.controls.map((c) => (c.id === fromId ? { ...c, id: toId } : c));
  const actions = doc.actions
    ? (rewriteControlRefs(doc.actions, fromId, toId) as FormDocument['actions'])
    : doc.actions;

  return { doc: { ...doc, controls, actions }, error: null };
}

export function nextListId(doc: FormDocument, base: string): string {
  const used = new Set(doc.lists.map((l) => l.id));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function createControl(
  type: ControlType,
  id: string,
  order: number,
): FormControlDef {
  const base: FormControlDef = { id, type, order };
  if (type === 'button') return { ...base, text: 'Nút mới' };
  if (type === 'iconButton')
    return { ...base, text: 'Chức năng', icon: '📋', color: '#2f6fed' };
  if (type === 'label') return { ...base, text: 'Nhãn mới' };
  if (type === 'hidden') return { ...base, label: id };
  if (type === 'date') return { ...base, label: 'Trường mới', format: 'dd/MM/yyyy' };
  if (type === 'time') return { ...base, label: 'Trường mới', format: 'HH:mm' };
  if (type === 'color') return { ...base, label: 'Trường mới', defaultValue: '#4a86e8' };
  if (type === 'file')
    return {
      ...base,
      label: 'Files đính kèm',
      accept: 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg',
      maxFiles: 5,
      uploadMode: 'immediate',
    };
  if (type === 'image')
    return {
      ...base,
      label: 'Hình ảnh',
      accept: 'jpg,jpeg,png,gif,webp',
      maxFiles: 5,
      uploadMode: 'immediate',
      previewWidth: 50,
    };
  if (type === 'maps')
    return {
      ...base,
      label: 'Bản đồ',
      height: '220px',
      placeholder: 'lat, lng;lat, lng',
    };
  return { ...base, label: 'Trường mới' };
}

export function addControl(doc: FormDocument, type: ControlType, id: string): FormDocument {
  const cid = nextControlId(doc, id.trim() || type);
  const maxOrder = doc.controls.reduce((m, c) => Math.max(m, c.order), 0);
  return normalizeOrders({
    ...doc,
    controls: [...doc.controls, createControl(type, cid, maxOrder + ORDER_STEP)],
  });
}

export function updateControl(
  doc: FormDocument,
  id: string,
  patch: Partial<Omit<FormControlDef, 'id'>>,
): FormDocument {
  const next: FormDocument = {
    ...doc,
    controls: doc.controls.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
  };
  if (!('placement' in patch)) return next;
  const { header, body, footer } = splitControlsByPlacement(next.controls);
  return renumberOrders({ ...next, controls: [...header, ...body, ...footer] });
}

export function deleteControl(doc: FormDocument, id: string): FormDocument {
  return normalizeOrders({
    ...doc,
    controls: doc.controls.filter((c) => c.id !== id),
  });
}

export function duplicateControl(doc: FormDocument, id: string): FormDocument {
  const sorted = [...doc.controls].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === id);
  if (idx < 0) return doc;
  const src = sorted[idx]!;
  const newId = nextControlId(doc, `${src.id}_copy`);
  const copy: FormControlDef = {
    ...structuredClone(src),
    id: newId,
  };
  sorted.splice(idx + 1, 0, copy);
  return renumberOrders({ ...doc, controls: sorted });
}

/** Thêm control mới ngay dưới control `afterId`. */
export function insertControlAfter(
  doc: FormDocument,
  afterId: string,
  type: ControlType = 'text',
): FormDocument {
  const sorted = [...doc.controls].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === afterId);
  const baseId = type === 'iconButton' ? 'menu' : type === 'button' ? 'btn' : 'field';
  const newId = nextControlId(doc, baseId);
  const neu = createControl(type, newId, 0);
  if (idx < 0) {
    return renumberOrders({ ...doc, controls: [...sorted, neu] });
  }
  const after = sorted[idx]!;
  const gid = after.groupId?.trim();
  if (gid) neu.groupId = gid;
  if ((after.placement ?? '').trim().toLowerCase() === 'footer') {
    neu.placement = 'footer';
  }
  sorted.splice(idx + 1, 0, neu);
  return renumberOrders({ ...doc, controls: sorted });
}

/** Di chuyển control tới vị trí index (0-based) trong danh sách đã sort theo order. */
export function moveControlToIndex(doc: FormDocument, id: string, toIndex: number): FormDocument {
  const sorted = [...doc.controls].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((c) => c.id === id);
  if (from < 0) return doc;
  const [item] = sorted.splice(from, 1);
  if (!item) return doc;
  const clamped = Math.max(0, Math.min(toIndex, sorted.length));
  sorted.splice(clamped, 0, item);
  return renumberOrders({ ...doc, controls: sorted });
}

function groupControls(controls: FormControlDef[]): DesignControlGroup[] {
  return groupControlsForDesign(controls);
}

/** Di chuyển nhóm trong một vùng body|footer (indices theo groups của vùng đó). */
export function moveControlGroupToInsertIndexInZone(
  doc: FormDocument,
  zone: 'body' | 'footer',
  fromGroupIndex: number,
  insertIndexAfterRemoval: number,
): FormDocument {
  const { header, body, footer } = splitControlsByPlacement(doc.controls);
  const zoneControls = zone === 'footer' ? footer : body;
  const other = zone === 'footer' ? body : footer;
  const groups = groupControls(zoneControls);
  if (fromGroupIndex < 0 || fromGroupIndex >= groups.length) return doc;
  const next = [...groups];
  const [g] = next.splice(fromGroupIndex, 1);
  if (!g) return doc;
  const to = Math.max(0, Math.min(insertIndexAfterRemoval, next.length));
  next.splice(to, 0, g);
  const flat = next.flatMap(flattenDesignGroup);
  const mid = zone === 'footer' ? [...other, ...flat] : [...flat, ...other];
  return renumberOrders({ ...doc, controls: [...header, ...mid] });
}

/** Di chuyển nhóm tới vị trí `toGroupIndex` trong list **sau khi đã remove** nguồn (0..n-1). */
export function moveControlGroupToIndex(
  doc: FormDocument,
  fromGroupIndex: number,
  toGroupIndex: number,
): FormDocument {
  const groups = groupControls(doc.controls);
  if (fromGroupIndex < 0 || fromGroupIndex >= groups.length) return doc;
  const next = [...groups];
  const [g] = next.splice(fromGroupIndex, 1);
  if (!g) return doc;
  const to = Math.max(0, Math.min(toGroupIndex, next.length));
  next.splice(to, 0, g);
  const flat = next.flatMap(flattenDesignGroup);
  // Dùng renumberOrders — KHÔNG normalizeOrders (sort theo order cũ sẽ hoàn tác move).
  return renumberOrders({ ...doc, controls: flat });
}

/** Alias rõ nghĩa: insert index sau khi remove. */
export function moveControlGroupToInsertIndex(
  doc: FormDocument,
  fromGroupIndex: number,
  insertIndexAfterRemoval: number,
): FormDocument {
  return moveControlGroupToIndex(doc, fromGroupIndex, insertIndexAfterRemoval);
}

/**
 * @deprecated Prefer moveControlGroupToInsertIndex — slot trước/sau trên list đầy đủ dễ no-op khi thả sát item đang kéo.
 */
export function moveControlGroupToSlot(
  doc: FormDocument,
  fromGroupIndex: number,
  slotIndex: number,
): FormDocument {
  const groups = groupControls(doc.controls);
  const n = groups.length;
  if (fromGroupIndex < 0 || fromGroupIndex >= n) return doc;
  const slot = Math.max(0, Math.min(slotIndex, n));
  if (slot === fromGroupIndex || slot === fromGroupIndex + 1) return doc;
  const to = slot > fromGroupIndex ? slot - 1 : slot;
  return moveControlGroupToIndex(doc, fromGroupIndex, to);
}

export function setControlRowId(doc: FormDocument, id: string, rowId: string | undefined): FormDocument {
  return updateControl(doc, id, { rowId: rowId?.trim() || undefined });
}

export function setControlGroupId(
  doc: FormDocument,
  id: string,
  groupId: string | undefined,
): FormDocument {
  return updateControl(doc, id, { groupId: groupId?.trim() || undefined });
}

export function addList(doc: FormDocument, id: string): FormDocument {
  const lid = nextListId(doc, id.trim() || 'list');
  const bind = `ds_${lid}`;
  const actionId = nextActionId(doc, `q_${lid}`);
  const maxOrder = doc.lists.reduce((m, l) => Math.max(m, l.order), 0);
  const list: FormListDef = {
    id: lid,
    order: maxOrder + ORDER_STEP,
    bind,
    rowKey: 'id',
    columns: [
      { field: 'id', title: 'Id' },
      { field: 'name', title: 'Tên' },
    ],
  };
  const datasets = { ...(doc.datasets ?? {}), [bind]: actionId };
  const actions = {
    ...(doc.actions ?? {}),
    [actionId]: {
      type: 'sqlQuery',
      targetDataset: bind,
      command: 'SELECT 1 AS id, N\'Demo\' AS name',
      params: [],
      mockRows: [
        { id: 1, name: 'Dòng mẫu 1' },
        { id: 2, name: 'Dòng mẫu 2' },
      ],
    },
  };
  return normalizeOrders({
    ...doc,
    lists: [...doc.lists, list],
    datasets,
    actions,
  });
}

/** Action sqlQuery gắn với list.bind (qua datasets hoặc targetDataset). */
export function resolveListDataActionId(doc: FormDocument, list: FormListDef): string | null {
  const mapped = doc.datasets?.[list.bind]?.trim();
  if (mapped && doc.actions?.[mapped]) return mapped;
  for (const [id, def] of Object.entries(doc.actions ?? {})) {
    if (!def || typeof def !== 'object') continue;
    const target = String((def as Record<string, unknown>).targetDataset ?? '').trim();
    if (target === list.bind) return id;
  }
  return null;
}

export function getListMockRows(doc: FormDocument, listId: string): Record<string, unknown>[] {
  const list = doc.lists.find((l) => l.id === listId);
  if (!list) return [];
  const actionId = resolveListDataActionId(doc, list);
  if (!actionId) return [];
  const def = doc.actions?.[actionId] as Record<string, unknown> | undefined;
  const rows = def?.mockRows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<
    string,
    unknown
  >[];
}

/** Ghi mockRows vào action bind của list; tạo action stub nếu chưa có. */
export function setListMockRows(
  doc: FormDocument,
  listId: string,
  rows: Record<string, unknown>[],
): FormDocument {
  const list = doc.lists.find((l) => l.id === listId);
  if (!list) return doc;
  let actionId = resolveListDataActionId(doc, list);
  let next: FormDocument = doc;
  if (!actionId) {
    actionId = nextActionId(doc, `q_${list.id}`);
    next = {
      ...doc,
      datasets: { ...(doc.datasets ?? {}), [list.bind]: actionId },
      actions: {
        ...(doc.actions ?? {}),
        [actionId]: {
          type: 'sqlQuery',
          targetDataset: list.bind,
          command: 'SELECT 1 AS id',
          params: [],
          mockRows: rows,
        },
      },
    };
    return next;
  }
  const prev = { ...(next.actions?.[actionId] as Record<string, unknown>) };
  prev.type = prev.type || 'sqlQuery';
  prev.targetDataset = prev.targetDataset || list.bind;
  prev.mockRows = rows;
  return {
    ...next,
    datasets: { ...(next.datasets ?? {}), [list.bind]: actionId },
    actions: { ...(next.actions ?? {}), [actionId]: prev },
  };
}

export function updateList(
  doc: FormDocument,
  id: string,
  patch: Partial<Omit<FormListDef, 'id'>>,
): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)),
  };
}

export function deleteList(doc: FormDocument, id: string): FormDocument {
  return normalizeOrders({
    ...doc,
    lists: doc.lists.filter((l) => l.id !== id),
  });
}

export function addColumn(doc: FormDocument, listId: string, field: string, title: string): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      const fid = nextColumnField(l, field.trim() || 'field');
      return {
        ...l,
        columns: [...l.columns, { field: fid, title: title.trim() || fid }],
      };
    }),
  };
}

function nextColumnField(list: FormListDef, base: string): string {
  const used = new Set(list.columns.map((c) => c.field));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function duplicateColumn(
  doc: FormDocument,
  listId: string,
  field: string,
): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      const idx = l.columns.findIndex((c) => c.field === field);
      if (idx < 0) return l;
      const src = l.columns[idx]!;
      const newField = nextColumnField(l, `${src.field}_copy`);
      const cols = [...l.columns];
      cols.splice(idx + 1, 0, {
        field: newField,
        title: `${resolveLocalizedText(src.title, 'v')} copy`,
      });
      return { ...l, columns: cols };
    }),
  };
}

/** Thêm cột trống ngay sau `afterField`. */
export function insertColumnAfter(
  doc: FormDocument,
  listId: string,
  afterField: string,
): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      const idx = l.columns.findIndex((c) => c.field === afterField);
      const newField = nextColumnField(l, 'field');
      const col = { field: newField, title: 'Cột mới' };
      if (idx < 0) return { ...l, columns: [...l.columns, col] };
      const cols = [...l.columns];
      cols.splice(idx + 1, 0, col);
      return { ...l, columns: cols };
    }),
  };
}

export function updateColumn(
  doc: FormDocument,
  listId: string,
  field: string,
  patch: Partial<Omit<FormListColumnDef, 'field'>>,
): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      return {
        ...l,
        columns: l.columns.map((c) => (c.field === field ? { ...c, ...patch, field: c.field } : c)),
      };
    }),
  };
}

export function deleteColumn(doc: FormDocument, listId: string, field: string): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      return { ...l, columns: l.columns.filter((c) => c.field !== field) };
    }),
  };
}

export function moveColumn(
  doc: FormDocument,
  listId: string,
  field: string,
  toIndex: number,
): FormDocument {
  return {
    ...doc,
    lists: doc.lists.map((l) => {
      if (l.id !== listId) return l;
      const cols = [...l.columns];
      const from = cols.findIndex((c) => c.field === field);
      if (from < 0) return l;
      const [item] = cols.splice(from, 1);
      if (!item) return l;
      cols.splice(Math.max(0, Math.min(toIndex, cols.length)), 0, item);
      return { ...l, columns: cols };
    }),
  };
}

export function setEventActions(
  doc: FormDocument,
  target:
    | { kind: 'control'; id: string; event: 'onClick' | 'onChange' }
    | { kind: 'list'; id: string; event: 'onRowClick' | 'onLoadMore' | 'onSearch' },
  actionIds: string[],
): FormDocument {
  const cleaned = actionIds.filter(Boolean);
  if (target.kind === 'control') {
    return updateControl(doc, target.id, { [target.event]: cleaned.length ? cleaned : undefined });
  }
  if (target.event === 'onSearch') {
    const list = doc.lists.find((l) => l.id === target.id);
    return updateList(doc, target.id, {
      search: {
        ...(list?.search ?? { enabled: true }),
        onSearch: cleaned.length ? cleaned : undefined,
      },
    });
  }
  const patch =
    target.event === 'onLoadMore'
      ? { onLoadMore: cleaned.length ? cleaned : undefined }
      : { onRowClick: cleaned.length ? cleaned : undefined };
  return updateList(doc, target.id, patch);
}

export function validateActionId(
  doc: FormDocument,
  nextId: string,
  currentId: string,
): string | null {
  const id = nextId.trim();
  if (!id) return 'Id action không được trống.';
  if (id.length > 64) return 'Id tối đa 64 ký tự.';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    return 'Chỉ dùng chữ, số, gạch dưới; bắt đầu bằng chữ hoặc _.';
  }
  if (id !== currentId && doc.actions && Object.prototype.hasOwnProperty.call(doc.actions, id)) {
    return `Action “${id}” đã tồn tại.`;
  }
  return null;
}

function rewriteActionIdRefs(value: unknown, fromId: string, toId: string): unknown {
  if (typeof value === 'string') return value === fromId ? toId : value;
  if (Array.isArray(value)) return value.map((v) => rewriteActionIdRefs(v, fromId, toId));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteActionIdRefs(v, fromId, toId);
    }
    return out;
  }
  return value;
}

export function upsertAction(
  doc: FormDocument,
  id: string,
  def: Record<string, unknown>,
): FormDocument {
  return {
    ...doc,
    actions: { ...(doc.actions ?? {}), [id]: def },
  };
}

/** Copy action với id mới (base_copy / base_copy_2…). Không gắn vào event. */
export function duplicateAction(
  doc: FormDocument,
  id: string,
): { doc: FormDocument; newId: string } | null {
  const src = doc.actions?.[id];
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const newId = nextActionId(doc, `${id}_copy`);
  return {
    doc: upsertAction(doc, newId, structuredClone(src) as Record<string, unknown>),
    newId,
  };
}

export function deleteAction(doc: FormDocument, id: string): FormDocument {
  const actions = { ...(doc.actions ?? {}) };
  delete actions[id];
  const strip = (ids: string[] | undefined) => {
    if (!ids?.length) return ids;
    const next = ids.filter((x) => x !== id);
    return next.length ? next : undefined;
  };
  return {
    ...doc,
    actions,
    onLoad: strip(doc.onLoad),
    controls: doc.controls.map((c) => ({
      ...c,
      onClick: strip(c.onClick),
      onChange: strip(c.onChange),
    })),
    lists: doc.lists.map((l) => ({
      ...l,
      onRowClick: strip(l.onRowClick),
      onLoadMore: strip(l.onLoadMore),
      search: l.search
        ? { ...l.search, onSearch: strip(l.search.onSearch) }
        : l.search,
    })),
  };
}

/** Đổi id action + cập nhật onLoad / onClick / onChange / onRowClick / onLoadMore. */
export function renameActionId(
  doc: FormDocument,
  fromId: string,
  toIdRaw: string,
): { doc: FormDocument; error: string | null } {
  const err = validateActionId(doc, toIdRaw, fromId);
  if (err) return { doc, error: err };
  const toId = toIdRaw.trim();
  if (toId === fromId) return { doc, error: null };
  if (!doc.actions?.[fromId]) return { doc, error: `Không tìm thấy action “${fromId}”.` };

  const actions = { ...(doc.actions ?? {}) };
  actions[toId] = actions[fromId]!;
  delete actions[fromId];

  const mapIds = (ids: string[] | undefined) =>
    ids?.map((x) => (x === fromId ? toId : x));

  const next: FormDocument = {
    ...doc,
    actions,
    onLoad: mapIds(doc.onLoad),
    controls: doc.controls.map((c) => ({
      ...c,
      onClick: mapIds(c.onClick),
      onChange: mapIds(c.onChange),
    })),
    lists: doc.lists.map((l) => ({
      ...l,
      onRowClick: mapIds(l.onRowClick),
      onLoadMore: mapIds(l.onLoadMore),
      search: l.search
        ? { ...l.search, onSearch: mapIds(l.search.onSearch) }
        : l.search,
    })),
  };

  // rewrite nested refs if any string equals old id inside actions bodies (rare)
  next.actions = rewriteActionIdRefs(next.actions, fromId, toId) as FormDocument['actions'];

  return { doc: next, error: null };
}

export function setFormMeta(
  doc: FormDocument,
  patch: {
    title?: LocalizedText;
    layout?: string;
    onLoad?: string[];
    defaultFormMode?: string;
  },
): FormDocument {
  return {
    ...doc,
    ...(patch.title != null ? { title: patch.title } : {}),
    ...(patch.layout != null ? { layout: patch.layout } : {}),
    ...(patch.onLoad != null ? { onLoad: patch.onLoad } : {}),
    ...(patch.defaultFormMode != null
      ? { defaultFormMode: patch.defaultFormMode.trim() || undefined }
      : {}),
  };
}
