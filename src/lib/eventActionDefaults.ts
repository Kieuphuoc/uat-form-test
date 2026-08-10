import { setEventActions, setFormMeta, upsertAction } from './formDocOps';
import type { FormDocument } from '../types/formDoc';

export type FormEventKind = 'onLoad' | 'onClick' | 'onChange' | 'onRowClick' | 'onLoadMore' | 'onSearch';

export type EventJumpContext = {
  event: FormEventKind;
  /** Action ids đang gắn / được chọn trên event. */
  actionIds: string[];
  controlId?: string;
  listId?: string;
};

/** Gợi ý id khi event chưa gắn action nào. */
export function suggestEventActionId(
  event: FormEventKind,
  ctx?: { controlId?: string; listId?: string; formId?: string },
): string {
  switch (event) {
    case 'onLoad':
      return ctx?.formId ? `q_${ctx.formId}` : 'q_onload';
    case 'onClick': {
      const c = ctx?.controlId ?? 'btn';
      if (/picker|pick|open/i.test(c)) return 'open_picker';
      if (/save|submit/i.test(c)) return 'save';
      if (/close|cancel/i.test(c)) return 'close_form';
      return `${c}_onClick`;
    }
    case 'onChange':
      return `${ctx?.controlId ?? 'field'}_onChange`;
    case 'onRowClick':
      return `${ctx?.listId ?? 'list'}_onRowClick`;
    case 'onLoadMore':
      return `q_${ctx?.listId ?? 'list'}_page`;
    case 'onSearch':
      return `q_${ctx?.listId ?? 'list'}_search`;
  }
}

/** Default action khi tạo mới từ event Property. */
export function defaultActionDefForEvent(
  event: FormEventKind,
  actionId: string,
  ctx?: { controlId?: string; listId?: string },
): Record<string, unknown> {
  const id = actionId.trim();
  switch (event) {
    case 'onLoad':
      return {
        type: 'sqlQuery',
        targetDataset: 'default',
        command: 'SELECT TOP 50 id, title FROM demo ORDER BY id DESC -- TODO',
        params: [],
        mock: true,
        mockRows: [
          { id: 1, title: 'Mẫu 1' },
          { id: 2, title: 'Mẫu 2' },
        ],
      };
    case 'onChange': {
      const controlId = ctx?.controlId ?? 'keyword';
      return {
        type: 'sqlQuery',
        targetDataset: 'default',
        command:
          "SELECT TOP 30 id, name FROM Items WHERE @q = N'' OR name LIKE N'%' + @q + N'%'",
        params: [{ name: 'q', from: `control.${controlId}` }],
        mock: true,
        mockRows: [{ id: '1', name: 'Mẫu A' }],
      };
    }
    case 'onClick': {
      if (/picker|open|show/i.test(id)) {
        return {
          type: 'showForm',
          formId: 'picker',
          mode: 'modal',
          formMode: 'view',
          returnMap: {},
        };
      }
      if (/close|cancel/i.test(id)) {
        return {
          type: 'closeForm',
          returnMap: {},
        };
      }
      if (/save|submit|exec/i.test(id)) {
        return {
          type: 'sqlExec',
          command: 'EXEC sp_save @id -- TODO',
          params: [{ name: 'id', from: 'control.id' }],
        };
      }
      return {
        type: 'message',
        message: `Chạy ${id}`,
        level: 'info',
      };
    }
    case 'onRowClick':
      return {
        type: 'setValue',
        values: {
          'state.selectedId': 'row.id',
          'state.selectedName': 'row.name',
        },
      };
    case 'onLoadMore':
      return {
        type: 'sqlQuery',
        targetDataset: `ds_${ctx?.listId ?? 'list'}`,
        command:
          'SELECT id, name FROM demo ORDER BY id OFFSET (@page - 1) * @pageSize ROWS FETCH NEXT @pageSize ROWS ONLY',
        params: [
          { name: 'page', from: 'state.page' },
          { name: 'pageSize', from: 'literal:20' },
        ],
        mock: false,
      };
    case 'onSearch':
      return {
        type: 'sqlQuery',
        targetDataset: `ds_${ctx?.listId ?? 'list'}`,
        command:
          "SELECT TOP 50 id, name FROM demo WHERE @q = N'' OR name LIKE N'%' + @q + N'%' ORDER BY name",
        params: [{ name: 'q', from: `state.${ctx?.listId ?? 'list'}Query` }],
        mock: false,
      };
  }
}

/** Tạo action còn thiếu; gắn vào event nếu chưa có trong danh sách gắn. */
export function ensureEventActions(
  doc: FormDocument,
  ctx: EventJumpContext & { formId?: string },
): { doc: FormDocument; focusId: string; changed: boolean } {
  let ids = ctx.actionIds.map((x) => x.trim()).filter(Boolean);
  if (!ids.length) {
    ids = [suggestEventActionId(ctx.event, ctx)];
  }

  let next = doc;
  let changed = false;
  for (const id of ids) {
    if (!next.actions?.[id]) {
      next = upsertAction(
        next,
        id,
        defaultActionDefForEvent(ctx.event, id, {
          controlId: ctx.controlId,
          listId: ctx.listId,
        }),
      );
      changed = true;
    }
  }

  const focusId = ids[0]!;

  if (ctx.event === 'onLoad') {
    const prev = next.onLoad ?? [];
    const merged = uniqueIds([...prev, ...ids]);
    if (merged.length !== prev.length || merged.some((id, i) => id !== prev[i])) {
      next = setFormMeta(next, { onLoad: merged });
      changed = true;
    }
  } else if (ctx.event === 'onClick' || ctx.event === 'onChange') {
    if (!ctx.controlId) return { doc: next, focusId, changed };
    const c = next.controls.find((x) => x.id === ctx.controlId);
    const prev = (ctx.event === 'onClick' ? c?.onClick : c?.onChange) ?? [];
    const merged = uniqueIds([...prev, ...ids]);
    if (merged.length !== prev.length || merged.some((id, i) => id !== prev[i])) {
      next = setEventActions(
        next,
        { kind: 'control', id: ctx.controlId, event: ctx.event },
        merged,
      );
      changed = true;
    }
  } else if (
    (ctx.event === 'onRowClick' || ctx.event === 'onLoadMore' || ctx.event === 'onSearch') &&
    ctx.listId
  ) {
    const list = next.lists.find((x) => x.id === ctx.listId);
    const prev =
      ctx.event === 'onRowClick'
        ? list?.onRowClick ?? []
        : ctx.event === 'onLoadMore'
          ? list?.onLoadMore ?? []
          : list?.search?.onSearch ?? [];
    const merged = uniqueIds([...prev, ...ids]);
    if (merged.length !== prev.length || merged.some((id, i) => id !== prev[i])) {
      next = setEventActions(
        next,
        { kind: 'list', id: ctx.listId, event: ctx.event },
        merged,
      );
      changed = true;
    }
  }

  return { doc: next, focusId, changed };
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
