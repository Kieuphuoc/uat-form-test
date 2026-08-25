import { useRef, type DragEvent } from 'react';
import {
  addColumn,
  deleteColumn,
  moveColumn,
  renameColumnField,
  updateColumn,
} from '../../lib/formDocOps';
import { inferColumnSizeMode, resolveGridColgroup, type ColumnSizeMode } from '../../lib/gridColumnLayout';
import { resolveLocalizedText } from '../../lib/localizedText';
import type { FormListColumnDef } from '../../types/form';
import type { FormDocument } from '../../types/formDoc';

type Props = {
  doc: FormDocument;
  listId: string;
  onCommit: (next: FormDocument) => void;
  onClose: () => void;
};

const SIZE_MODES: { id: ColumnSizeMode; label: string }[] = [
  { id: 'fixed', label: 'fixed (px)' },
  { id: 'flex', label: 'flex (tự co)' },
  { id: 'percent', label: 'percent (%)' },
];

function widthPlaceholder(mode: ColumnSizeMode): string {
  if (mode === 'fixed') return '120px';
  if (mode === 'percent') return '20%';
  return '1';
}

export function DesignGridEditor({ doc, listId, onCommit, onClose }: Props) {
  const list = doc.lists.find((l) => l.id === listId);
  const dragField = useRef<string | null>(null);

  if (!list) {
    return (
      <div className="design-grid-editor-backdrop" role="presentation" onClick={onClose}>
        <div className="design-grid-editor" role="dialog" aria-label="Design Grid">
          <p className="muted">List không tồn tại.</p>
          <button type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    );
  }

  const previewCols = resolveGridColgroup(list.columns, {}, 720).cols;

  const patchCol = (field: string, patch: Partial<Omit<FormListColumnDef, 'field'>>) => {
    onCommit(updateColumn(doc, listId, field, patch));
  };

  const onDropRow = (toIndex: number) => {
    const from = dragField.current;
    dragField.current = null;
    if (!from) return;
    onCommit(moveColumn(doc, listId, from, toIndex));
  };

  return (
    <div className="design-grid-editor-backdrop" role="presentation" onClick={onClose}>
      <div
        className="design-grid-editor"
        role="dialog"
        aria-labelledby="design-grid-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="design-grid-editor__head">
          <strong id="design-grid-editor-title">Design Grid — {list.id}</strong>
          <button type="button" className="design-icon-btn" title="Đóng" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="muted design-grid-editor__hint">
          Cột dùng chung <code>lists[].columns[]</code>. Size: fixed (px), flex (phần còn lại), percent (%
          màn hình).
        </p>
        <div className="design-grid-editor__preview" aria-hidden>
          <div className="design-grid-editor__preview-row">
            {previewCols.map((c) => {
              const col = list.columns.find((x) => x.field === c.key);
              return (
                <div key={c.key} className="design-grid-editor__preview-cell" style={c.style}>
                  {col ? resolveLocalizedText(col.title, 'v') || col.field : c.key}
                </div>
              );
            })}
          </div>
        </div>
        <div className="design-grid-editor__table-wrap">
          <table className="design-grid-editor__table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>field</th>
                <th>title</th>
                <th>type</th>
                <th>size</th>
                <th>width</th>
                <th>minWidth</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {list.columns.map((col, idx) => {
                const mode = inferColumnSizeMode(col);
                return (
                  <tr
                    key={col.field}
                    draggable
                    onDragStart={(e: DragEvent) => {
                      dragField.current = col.field;
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropRow(idx);
                    }}
                  >
                    <td className="muted" title="Kéo đổi thứ tự">
                      ⋮⋮
                    </td>
                    <td>
                      <input
                        key={col.field}
                        defaultValue={col.field}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== col.field) {
                            onCommit(renameColumnField(doc, listId, col.field, next));
                          }
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={resolveLocalizedText(col.title, 'v')}
                        onChange={(e) => patchCol(col.field, { title: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={col.type ?? 'text'}
                        onChange={(e) =>
                          patchCol(col.field, {
                            type: e.target.value === 'text' ? undefined : e.target.value,
                          })
                        }
                      >
                        <option value="text">text</option>
                        <option value="checkbox">checkbox</option>
                        <option value="icon">icon</option>
                        <option value="image">image</option>
                        <option value="stepper">stepper</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={mode}
                        onChange={(e) => {
                          const sizeMode = e.target.value as ColumnSizeMode;
                          const width =
                            sizeMode === 'fixed' ? '120px' : sizeMode === 'percent' ? '20%' : '1';
                          patchCol(col.field, { sizeMode, width });
                        }}
                      >
                        {SIZE_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={col.width ?? ''}
                        placeholder={widthPlaceholder(mode)}
                        onChange={(e) =>
                          patchCol(col.field, { width: e.target.value.trim() || undefined })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={col.minWidth ?? ''}
                        placeholder={mode === 'flex' ? '80px' : ''}
                        onChange={(e) =>
                          patchCol(col.field, { minWidth: e.target.value.trim() || undefined })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="design-icon-btn"
                        title="Xóa cột"
                        onClick={() => onCommit(deleteColumn(doc, listId, col.field))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="design-grid-editor__foot">
          <button
            type="button"
            onClick={() => onCommit(addColumn(doc, listId, 'field', 'Cột mới'))}
          >
            + Thêm cột
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Xong
          </button>
        </footer>
      </div>
    </div>
  );
}
