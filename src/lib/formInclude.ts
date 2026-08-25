import type { FormControlDef, FormListDef } from '../types/form';
import type { FormDocument } from '../types/formDoc';
import { formatFormJson } from './formatFormJson';

export type FormFragmentDoc = {
  id: string;
  kind: 'controls' | 'listBundle' | string;
  controls?: FormControlDef[];
  lists?: FormListDef[];
  datasets?: Record<string, string>;
  actions?: string[];
};

export type FormSharedBundle = {
  actions: Record<string, Record<string, unknown>>;
  fragments: Record<string, FormFragmentDoc>;
};

export function emptySharedBundle(): FormSharedBundle {
  return { actions: {}, fragments: {} };
}

export function isIncludeType(type?: string | null): boolean {
  return (type ?? '').trim().toLowerCase() === 'include';
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Source (có type=include) + shared → formDoc design/runtime (stamp includeOf). */
export function mergeFormDocument(
  source: FormDocument,
  shared: FormSharedBundle,
): FormDocument {
  const actions: Record<string, Record<string, unknown>> = {
    ...clone(shared.actions),
    ...(source.actions ?? {}),
  };
  const datasets: Record<string, string> = { ...(source.datasets ?? {}) };

  const localRowIds = new Set(
    source.controls
      .filter((c) => !isIncludeType(c.type))
      .map((c) => c.rowId?.trim())
      .filter((x): x is string => !!x),
  );

  const usedControlIds = new Set<string>();
  const controls: FormControlDef[] = [];
  /** Order tuần tự theo thứ tự slot — không dùng slot.order*1000 (làm include luôn bị đẩy xuống cuối). */
  let controlOrder = 0;

  const sortedControls = [...source.controls].sort((a, b) => a.order - b.order);
  for (const slot of sortedControls) {
    if (!isIncludeType(slot.type)) {
      if (usedControlIds.has(slot.id)) throw new Error(`Trùng control id “${slot.id}”.`);
      usedControlIds.add(slot.id);
      const { fragment: _f, ...rest } = slot;
      controls.push({
        ...rest,
        order: (++controlOrder) * 10,
        includeOf: undefined,
        includeSlotId: undefined,
      });
      continue;
    }

    const fragId = (slot.fragment ?? '').trim();
    if (!fragId) throw new Error(`Control include “${slot.id}” thiếu fragment.`);
    const frag = shared.fragments[fragId];
    if (!frag?.controls?.length) throw new Error(`Không tìm thấy fragment controls “${fragId}”.`);

    for (const c of [...frag.controls].sort((a, b) => a.order - b.order)) {
      if (usedControlIds.has(c.id)) throw new Error(`Trùng control id “${c.id}” (include ∪ local).`);
      usedControlIds.add(c.id);
      const row = c.rowId?.trim();
      if (row && localRowIds.has(row)) {
        throw new Error(`Fragment “${fragId}” dùng rowId “${row}” trùng control local.`);
      }
      controls.push({
        ...clone(c),
        order: (++controlOrder) * 10,
        fragment: undefined,
        includeOf: fragId,
        includeSlotId: slot.id,
      });
    }

    for (const aid of frag.actions ?? []) {
      if (actions[aid]) continue;
      if (shared.actions[aid]) actions[aid] = clone(shared.actions[aid]!);
    }
  }

  const usedListIds = new Set<string>();
  const lists: FormListDef[] = [];
  let listOrder = 0;
  const sortedLists = [...source.lists].sort((a, b) => a.order - b.order);
  for (const slot of sortedLists) {
    if (!isIncludeType(slot.type)) {
      if (usedListIds.has(slot.id)) throw new Error(`Trùng list id “${slot.id}”.`);
      usedListIds.add(slot.id);
      lists.push({
        ...slot,
        type: slot.type,
        order: (++listOrder) * 10,
        fragment: undefined,
        includeOf: undefined,
        includeSlotId: undefined,
      });
      continue;
    }

    const fragId = (slot.fragment ?? '').trim();
    if (!fragId) throw new Error(`List include “${slot.id}” thiếu fragment.`);
    const frag = shared.fragments[fragId];
    if (!frag?.lists?.length) throw new Error(`Không tìm thấy fragment lists “${fragId}”.`);

    for (const l of [...frag.lists].sort((a, b) => a.order - b.order)) {
      if (usedListIds.has(l.id)) throw new Error(`Trùng list id “${l.id}” (include ∪ local).`);
      usedListIds.add(l.id);
      lists.push({
        ...clone(l),
        type: undefined,
        fragment: undefined,
        order: (++listOrder) * 10,
        includeOf: fragId,
        includeSlotId: slot.id,
      });
    }

    if (frag.datasets) Object.assign(datasets, frag.datasets);
    for (const aid of frag.actions ?? []) {
      if (actions[aid]) continue;
      if (shared.actions[aid]) actions[aid] = clone(shared.actions[aid]!);
    }
  }

  return {
    ...source,
    controls,
    lists,
    datasets,
    actions,
  };
}

export type CollapseResult = {
  source: FormDocument;
  shared: FormSharedBundle;
  dirtyFragmentIds: string[];
  dirtySharedActions: boolean;
};

/**
 * formDoc đã merge (có includeOf) → source (type=include slots) + cập nhật fragments.
 * sharedActionIds: id action thuộc shared/actions.json.
 */
export function collapseFormDocument(
  merged: FormDocument,
  prevShared: FormSharedBundle,
  sharedActionIds: Set<string>,
): CollapseResult {
  const fragments = clone(prevShared.fragments);
  const dirtyFragmentIds = new Set<string>();
  const sharedActions = clone(prevShared.actions);
  let dirtySharedActions = false;

  const sourceControls: FormControlDef[] = [];
  const sortedControls = [...merged.controls].sort((a, b) => a.order - b.order);
  let i = 0;
  while (i < sortedControls.length) {
    const c = sortedControls[i]!;
    const of = c.includeOf?.trim();
    if (!of) {
      const { includeOf: _a, includeSlotId: _b, fragment: _f, ...rest } = c;
      sourceControls.push({ ...rest, order: (sourceControls.length + 1) * 10 });
      i += 1;
      continue;
    }

    const slotId = c.includeSlotId?.trim() || `inc_${of}`;
    const cluster: FormControlDef[] = [];
    while (i < sortedControls.length && sortedControls[i]!.includeOf?.trim() === of) {
      const x = sortedControls[i]!;
      const { includeOf: _a, includeSlotId: _b, fragment: _f, ...rest } = x;
      cluster.push({ ...rest, order: (cluster.length + 1) * 10 });
      i += 1;
    }

    sourceControls.push({
      id: slotId,
      type: 'include',
      fragment: of,
      order: (sourceControls.length + 1) * 10,
    });

    fragments[of] = {
      id: of,
      kind: 'controls',
      controls: cluster,
      actions: fragments[of]?.actions,
      datasets: fragments[of]?.datasets,
      lists: fragments[of]?.lists,
    };
    dirtyFragmentIds.add(of);
  }

  const sourceLists: FormListDef[] = [];
  const sortedLists = [...merged.lists].sort((a, b) => a.order - b.order);
  let j = 0;
  while (j < sortedLists.length) {
    const l = sortedLists[j]!;
    const of = l.includeOf?.trim();
    if (!of) {
      const { includeOf: _a, includeSlotId: _b, fragment: _f, ...rest } = l;
      sourceLists.push({ ...rest, type: rest.type === 'include' ? undefined : rest.type, order: (sourceLists.length + 1) * 10 });
      j += 1;
      continue;
    }

    const slotId = l.includeSlotId?.trim() || `inc_${of}`;
    const cluster: FormListDef[] = [];
    while (j < sortedLists.length && sortedLists[j]!.includeOf?.trim() === of) {
      const x = sortedLists[j]!;
      const { includeOf: _a, includeSlotId: _b, fragment: _f, type: _t, ...rest } = x;
      cluster.push({ ...rest, order: (cluster.length + 1) * 10 });
      j += 1;
    }

    sourceLists.push({
      id: slotId,
      type: 'include',
      fragment: of,
      order: (sourceLists.length + 1) * 10,
      bind: '',
      columns: [],
    });

    const prev = fragments[of];
    fragments[of] = {
      id: of,
      kind: 'listBundle',
      lists: cluster,
      datasets: prev?.datasets,
      actions: prev?.actions,
      controls: prev?.controls,
    };
    dirtyFragmentIds.add(of);
  }

  const localActions: Record<string, Record<string, unknown>> = {};
  for (const [id, def] of Object.entries(merged.actions ?? {})) {
    if (sharedActionIds.has(id)) {
      sharedActions[id] = clone(def);
      dirtySharedActions = true;
    } else {
      localActions[id] = clone(def);
    }
  }

  // datasets: bỏ dataset chỉ thuộc fragment listBundle
  const fragDatasetKeys = new Set<string>();
  for (const frag of Object.values(fragments)) {
    if (frag.datasets) {
      for (const k of Object.keys(frag.datasets)) fragDatasetKeys.add(k);
    }
  }
  const datasets: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged.datasets ?? {})) {
    if (!fragDatasetKeys.has(k)) datasets[k] = v;
  }

  const source: FormDocument = {
    id: merged.id,
    title: merged.title,
    layout: merged.layout,
    defaultFormMode: merged.defaultFormMode,
    pc: merged.pc,
    controls: sourceControls,
    lists: sourceLists,
    datasets,
    onLoad: merged.onLoad,
    actions: localActions,
  };

  return {
    source,
    shared: { actions: sharedActions, fragments },
    dirtyFragmentIds: [...dirtyFragmentIds],
    dirtySharedActions,
  };
}

export function sharedBundleFromApi(data: unknown): FormSharedBundle {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const actions =
    o.actions && typeof o.actions === 'object' && !Array.isArray(o.actions)
      ? (o.actions as Record<string, Record<string, unknown>>)
      : {};
  const fragmentsRaw =
    o.fragments && typeof o.fragments === 'object' && !Array.isArray(o.fragments)
      ? (o.fragments as Record<string, FormFragmentDoc>)
      : {};
  const fragments: Record<string, FormFragmentDoc> = {};
  for (const [k, v] of Object.entries(fragmentsRaw)) {
    fragments[k] = { ...v, id: v.id || k };
  }
  return { actions, fragments };
}

export function formatSourceJson(source: FormDocument, baseText: string): string {
  let base: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(baseText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  const { includeOf: _i, ...doc } = source as FormDocument & { includeOf?: unknown };
  return formatFormJson({ ...base, ...doc });
}
