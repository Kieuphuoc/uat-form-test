import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { alignSoloRowStyle, controlLayoutStyle, controlTextStyle, controlVisualStyle, needsAlignSoloRow } from '../../lib/controlLayout';
import {
  groupControlsByRowId,
  resolveGroupBackground,
  resolveGroupDefaultCollapsed,
  resolveGroupIcon,
  resolveGroupLabel,
  type DesignControlGroup,
  type RowLayoutGroup,
} from '../../lib/controlGroups';
import {
  getListMockRows,
  groupControlsForDesign,
  splitControlsByPlacement,
} from '../../lib/formDocOps';
import { resolveLocalizedText } from '../../lib/localizedText';
import type { FormControlDef, FormListDef } from '../../types/form';
import type { DesignSelection, FormDocument } from '../../types/formDoc';
import {
  isPcLayoutActive,
  pcColumnCount,
  pcGridContainerStyle,
  pcGridItemStyle,
  pcSpanForDesignGroup,
  type DesignViewport,
} from '../../lib/pcLayout';
import { LiveClockLabel } from '../LiveClockLabel';
import { DesignContextMenu, type ContextMenuState } from './DesignContextMenu';

type Props = {
  doc: FormDocument;
  selection: DesignSelection | null;
  /** Phone (360) hoặc PC (~960). Mặc định phone. */
  viewport?: DesignViewport;
  onSelect: (sel: DesignSelection) => void;
  onRequestAddControl: () => void;
  onRequestAddIconButton?: () => void;
  onRequestAddList: () => void;
  onCopyControl: (id: string) => void;
  onInsertControl?: (id: string) => void;
  onDeleteControl: (id: string) => void;
  onDeleteList: (id: string) => void;
  onAddColumn: (listId: string) => void;
  onCopyColumn: (listId: string, field: string) => void;
  onInsertColumn?: (listId: string, field: string) => void;
  onDeleteColumn: (listId: string, field: string) => void;
  onMoveGroupToInsertIndex: (
    zone: 'body' | 'footer',
    fromGroupIndex: number,
    insertIndexAfterRemoval: number,
  ) => void;
  onMoveColumn: (listId: string, field: string, toIndex: number) => void;
  onPatchControlLabel: (id: string, value: string) => void;
};

function displayLabel(c: FormControlDef): string {
  if (c.type === 'button' || c.type === 'iconButton' || c.type === 'label')
    return resolveLocalizedText(c.text, 'v') || c.id;
  return resolveLocalizedText(c.label, 'v') || c.id;
}

export function DesignCanvas({
  doc,
  selection,
  viewport = 'phone',
  onSelect,
  onRequestAddControl,
  onRequestAddIconButton,
  onRequestAddList,
  onCopyControl,
  onInsertControl,
  onDeleteControl,
  onDeleteList,
  onAddColumn,
  onCopyColumn,
  onInsertColumn,
  onDeleteColumn,
  onMoveGroupToInsertIndex,
  onMoveColumn,
  onPatchControlLabel,
}: Props) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [draggingGroup, setDraggingGroup] = useState<number | null>(null);
  const [dragZone, setDragZone] = useState<'body' | 'footer' | null>(null);
  /** Visual line index 0..n (n+1 lines). */
  const [dropLine, setDropLine] = useState<number | null>(null);
  /** Override collapsed theo groupId trên canvas. */
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  const editRef = useRef<HTMLInputElement>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragZoneRef = useRef<'body' | 'footer' | null>(null);
  /** Insert index after removing dragged group (0..n-1). */
  const insertAtRef = useRef<number | null>(null);
  const bodyGroupElsRef = useRef<(HTMLElement | null)[]>([]);
  const footerGroupElsRef = useRef<(HTMLElement | null)[]>([]);
  const moveRef = useRef(onMoveGroupToInsertIndex);
  const dragColumn = useRef<{ listId: string; field: string } | null>(null);
  moveRef.current = onMoveGroupToInsertIndex;

  const { header: headerControls, body: bodyOnly, footer: footerControls } = useMemo(
    () => splitControlsByPlacement(doc.controls),
    [doc.controls],
  );
  const pcActive = isPcLayoutActive(doc, { viewportMode: viewport });
  const pcCols = pcColumnCount(doc, { viewportMode: viewport });
  /** Design: header controls hiện cùng vùng body (có type badge). */
  const bodyControls = useMemo(
    () => [...headerControls, ...bodyOnly],
    [headerControls, bodyOnly],
  );
  const bodyGroups = useMemo(() => groupControlsForDesign(bodyControls), [bodyControls]);
  const footerGroups = useMemo(() => groupControlsForDesign(footerControls), [footerControls]);
  const lists = useMemo(() => [...doc.lists].sort((a, b) => a.order - b.order), [doc.lists]);

  useEffect(() => {
    bodyGroupElsRef.current.length = bodyGroups.length;
  }, [bodyGroups.length]);
  useEffect(() => {
    footerGroupElsRef.current.length = footerGroups.length;
  }, [footerGroups.length]);

  const isSelected = useCallback(
    (sel: DesignSelection) => {
      if (!selection) return false;
      if (selection.kind !== sel.kind) return false;
      if (sel.kind === 'form') return true;
      if (sel.kind === 'control' && selection.kind === 'control') return selection.id === sel.id;
      if (sel.kind === 'list' && selection.kind === 'list') return selection.id === sel.id;
      if (sel.kind === 'column' && selection.kind === 'column') {
        return selection.listId === sel.listId && selection.field === sel.field;
      }
      return false;
    },
    [selection],
  );

  const beginEdit = useCallback(
    (c: FormControlDef) => {
      if (c.type === 'hidden') return;
      setEditingId(c.id);
      setEditValue(displayLabel(c));
      onSelect({ kind: 'control', id: c.id });
    },
    [onSelect],
  );

  const finishEdit = useCallback(() => {
    if (!editingId) return;
    onPatchControlLabel(editingId, editValue);
    setEditingId(null);
  }, [editingId, editValue, onPatchControlLabel]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const resolveInsertFromY = useCallback(
    (clientY: number, fromIndex: number, zone: 'body' | 'footer') => {
      const els = zone === 'footer' ? footerGroupElsRef.current : bodyGroupElsRef.current;
      // Sortable: bỏ qua group đang kéo, tìm vị trí chèn trong list còn lại.
      for (let i = 0; i < els.length; i++) {
        if (i === fromIndex) continue;
        const el = els[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          // original index i → insert index after removal
          return i > fromIndex ? i - 1 : i;
        }
      }
      return Math.max(0, els.length - 1);
    },
    [],
  );

  /** Convert insert-after-removal → visual drop line (0..n). */
  const insertToDropLine = (fromIndex: number, insertAt: number) =>
    insertAt >= fromIndex ? insertAt + 1 : insertAt;

  const clearDragState = useCallback(() => {
    dragFromRef.current = null;
    dragZoneRef.current = null;
    insertAtRef.current = null;
    setDraggingGroup(null);
    setDragZone(null);
    setDropLine(null);
  }, []);

  const startGroupDrag = (
    e: ReactPointerEvent<HTMLSpanElement>,
    groupIndex: number,
    zone: 'body' | 'footer',
  ) => {
    e.preventDefault();
    e.stopPropagation();

    dragFromRef.current = groupIndex;
    dragZoneRef.current = zone;
    insertAtRef.current = groupIndex;
    setDraggingGroup(groupIndex);
    setDragZone(zone);
    setDropLine(null);

    const onMove = (ev: PointerEvent) => {
      const from = dragFromRef.current;
      const z = dragZoneRef.current;
      if (from == null || !z) return;
      const insertAt = resolveInsertFromY(ev.clientY, from, z);
      insertAtRef.current = insertAt;
      setDropLine(insertAt === from ? null : insertToDropLine(from, insertAt));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      const from = dragFromRef.current;
      const insertAt = insertAtRef.current;
      const z = dragZoneRef.current;
      clearDragState();
      if (from == null || insertAt == null || !z) return;
      if (insertAt === from) return;
      moveRef.current(z, from, insertAt);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        if (selection?.kind !== 'control') return;
        const c = doc.controls.find((x) => x.id === selection.id);
        if (!c) return;
        e.preventDefault();
        beginEdit(c);
        return;
      }
      if (e.key === 'Escape') {
        setMenu(null);
        setEditingId(null);
        if (draggingGroup != null) clearDragState();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (selection?.kind === 'control') {
          e.preventDefault();
          onCopyControl(selection.id);
        } else if (selection?.kind === 'column') {
          e.preventDefault();
          onCopyColumn(selection.listId, selection.field);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable)
        ) {
          return;
        }
        if (selection?.kind === 'control') {
          e.preventDefault();
          onDeleteControl(selection.id);
        } else if (selection?.kind === 'list') {
          e.preventDefault();
          onDeleteList(selection.id);
        } else if (selection?.kind === 'column') {
          e.preventDefault();
          onDeleteColumn(selection.listId, selection.field);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selection,
    doc.controls,
    beginEdit,
    onDeleteControl,
    onDeleteList,
    onDeleteColumn,
    onCopyControl,
    onCopyColumn,
    draggingGroup,
    clearDragState,
  ]);

  const openMenu = (e: ReactMouseEvent, state: ContextMenuState) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(state);
  };

  const renderControlBody = (c: FormControlDef, inRow: boolean): ReactNode => {
    const selected = isSelected({ kind: 'control', id: c.id });
    const isEditing = editingId === c.id;
    const heightStyle: CSSProperties | undefined = c.height?.trim()
      ? { height: c.height.trim(), minHeight: c.height.trim() }
      : undefined;
    const labelText = resolveLocalizedText(c.label, 'v').trim();
    const showLabel = c.type !== 'label' && labelText.length > 0;
    const placeholderText = resolveLocalizedText(c.placeholder, 'v');
    const textStyle = controlTextStyle(c);
    const alignSolo = needsAlignSoloRow(c);
    const visualStyle = controlVisualStyle(c, inRow, { alignSolo });
    const labelFmt = (c.format ?? '').trim().toLowerCase();
    const btnStyle: CSSProperties | undefined =
      c.type === 'button'
        ? {
            ...visualStyle,
            ...(c.color?.trim() ? { background: c.color.trim(), borderColor: c.color.trim() } : {}),
          }
        : undefined;

    return (
      <div
        key={c.id}
        className={`design-canvas-item${selected ? ' selected' : ''}${c.visible === false ? ' hidden-mark' : ''}`}
        style={controlLayoutStyle(c, inRow, { alignSolo })}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: 'control', id: c.id });
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (c.type === 'label' && (labelFmt === 'livedate' || labelFmt === 'livetime')) return;
          beginEdit(c);
        }}
        onContextMenu={(e) =>
          openMenu(e, {
            x: e.clientX,
            y: e.clientY,
            target: { kind: 'control', id: c.id },
          })
        }
      >
        {c.type !== 'iconButton' && c.type !== 'button' && (
          <span className="design-canvas-type">{c.type}</span>
        )}
        {c.type === 'hidden' ? (
          <span className="muted">hidden · {c.id}</span>
        ) : c.type === 'iconButton' ? (
          isEditing ? (
            <input
              ref={editRef}
              className="design-inline-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishEdit();
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button type="button" className="form-icon-btn" tabIndex={-1} onClick={(e) => e.preventDefault()}>
              <span
                className="form-icon-btn__tile"
                style={{ background: c.color?.trim() || '#2f6fed' }}
              >
                {c.icon || '⬜'}
              </span>
              <span className="form-icon-btn__label" style={textStyle}>
                {displayLabel(c)}
              </span>
            </button>
          )
        ) : c.type === 'button' ? (
          isEditing ? (
            <input
              ref={editRef}
              className="design-inline-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishEdit();
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button type="button" className="form-btn" tabIndex={-1} style={btnStyle} onClick={(e) => e.preventDefault()}>
              {c.icon ? <span className="form-btn__icon">{c.icon}</span> : null}
              <span className="form-btn__text">{displayLabel(c)}</span>
            </button>
          )
        ) : c.type === 'label' ? (
          labelFmt === 'livedate' ? (
            <LiveClockLabel
              kind="liveDate"
              className="form-label-control form-live-date"
              style={textStyle}
            />
          ) : labelFmt === 'livetime' ? (
            <LiveClockLabel
              kind="liveTime"
              className="form-label-control form-live-time"
              style={textStyle}
            />
          ) : labelFmt === 'personnel' ||
            (c.bind ?? '').trim().toLowerCase() === 'sessionuser' ? (
            <div className="form-personnel-row" style={textStyle}>
              <span className="form-personnel-row__label">
                {resolveLocalizedText(c.text, 'v').trim() || 'Nhân sự'}
              </span>
              <span className="form-personnel-row__value">(user đang login)</span>
            </div>
          ) : isEditing ? (
            <input
              ref={editRef}
              className="design-inline-edit"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={finishEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishEdit();
                if (e.key === 'Escape') setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="form-label-control" style={textStyle}>
              {displayLabel(c)}
            </p>
          )
        ) : c.type === 'maps' ? (
          <div className="form-maps form-maps--design" style={heightStyle}>
            <span className="form-maps__overlay">maps · {c.id}</span>
          </div>
        ) : (
          <label className="field">
            {isEditing ? (
              <span>
                <input
                  ref={editRef}
                  className="design-inline-edit"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={finishEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            ) : showLabel ? (
              <span>
                {labelText}
                {c.required ? ' *' : ''}
              </span>
            ) : null}
            {c.type === 'textarea' ? (
              <textarea
                disabled
                readOnly
                placeholder={placeholderText || ''}
                style={{ ...heightStyle, ...textStyle }}
                tabIndex={-1}
              />
            ) : c.type === 'select' ? (
              <select disabled tabIndex={-1} style={textStyle}>
                <option>—</option>
              </select>
            ) : c.type === 'date' ? (
              <div className="form-date-picker">
                <div className="form-date-picker__row">
                  <input
                    className="form-date-picker__input"
                    disabled
                    readOnly
                    tabIndex={-1}
                    placeholder={
                      (c.format || 'dd/MM/yyyy')
                        .replace(/yyyy/g, '    ')
                        .replace(/dd|MM|HH|hh|mm|ss/g, '  ')
                    }
                    style={textStyle}
                    defaultValue=""
                  />
                  <button type="button" className="form-date-picker__icon-btn" tabIndex={-1} disabled>
                    📅
                  </button>
                </div>
              </div>
            ) : c.type === 'time' ? (
              <div className="form-time-picker">
                <div className="form-time-picker__row">
                  <input
                    className="form-time-picker__input"
                    disabled
                    readOnly
                    tabIndex={-1}
                    placeholder="00:00"
                    style={textStyle}
                    defaultValue=""
                  />
                  <button type="button" className="form-time-picker__icon-btn" tabIndex={-1} disabled>
                    🕐
                  </button>
                </div>
              </div>
            ) : (
              <input
                disabled
                readOnly
                tabIndex={-1}
                type={c.type === 'number' ? 'number' : 'text'}
                placeholder={placeholderText || ''}
                style={{ ...heightStyle, ...textStyle }}
              />
            )}
          </label>
        )}
      </div>
    );
  };

  const renderDropLine = (slot: number, zone: 'body' | 'footer') => (
    <div
      key={`${zone}:slot:${slot}`}
      className={`design-drop-slot${
        dropLine === slot && draggingGroup != null && dragZone === zone ? ' active' : ''
      }`}
      style={pcActive && zone === 'body' ? { gridColumn: '1 / -1' } : undefined}
      aria-hidden
    />
  );

  const renderRowUnits = (units: RowLayoutGroup[]): ReactNode[] =>
    units.map((u) => {
      if (u.kind === 'single') {
        const body = renderControlBody(u.control, false);
        if (needsAlignSoloRow(u.control)) {
          return (
            <div
              key={`align-solo:${u.control.id}`}
              className="form-control-row design-canvas-row form-control-row--align-solo"
              style={alignSoloRowStyle(u.control)}
            >
              {body}
            </div>
          );
        }
        return body;
      }
      return (
        <div key={`row:${u.rowId}`} className="form-control-row design-canvas-row">
          {u.controls.map((c) => renderControlBody(c, true))}
        </div>
      );
    });

  const renderAccordionBody = (controls: FormControlDef[], groupId: string) => {
    const defaultCollapsed = resolveGroupDefaultCollapsed(controls);
    const collapsed =
      groupCollapsed[groupId] !== undefined ? groupCollapsed[groupId]! : defaultCollapsed;
    const label = resolveGroupLabel(controls, groupId, 'v');
    const icon = resolveGroupIcon(controls);
    const background = resolveGroupBackground(controls);
    return (
      <div
        className={`form-control-group design-form-control-group${collapsed ? ' is-collapsed' : ''}`}
        style={background ? { background } : undefined}
      >
        <button
          type="button"
          className="form-control-group-toggle"
          aria-expanded={!collapsed}
          title="Ẩn/hiện group"
          onClick={(e) => {
            e.stopPropagation();
            setGroupCollapsed((prev) => ({ ...prev, [groupId]: !collapsed }));
          }}
        >
          <span className="form-control-group-chevron" aria-hidden>
            {collapsed ? '▸' : '▾'}
          </span>
          {icon ? (
            <span className="form-control-group-icon" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="form-control-group-title">{label}</span>
          <span className="design-group-id-badge">{groupId}</span>
        </button>
        {!collapsed && (
          <div className="form-control-group-body design-canvas-group-body">
            {renderRowUnits(groupControlsByRowId(controls))}
          </div>
        )}
      </div>
    );
  };

  const renderInnerLayout = (controls: FormControlDef[]): ReactNode[] => {
    const sorted = [...controls].sort((a, b) => a.order - b.order);
    const nodes: ReactNode[] = [];
    let i = 0;
    while (i < sorted.length) {
      const gid = sorted[i]!.groupId?.trim();
      if (gid) {
        const cluster: FormControlDef[] = [];
        while (i < sorted.length && sorted[i]!.groupId?.trim() === gid) {
          cluster.push(sorted[i]!);
          i++;
        }
        nodes.push(
          <div key={`inc-group:${gid}:${cluster[0]!.id}`}>{renderAccordionBody(cluster, gid)}</div>,
        );
      } else {
        const run: FormControlDef[] = [];
        while (i < sorted.length && !sorted[i]!.groupId?.trim()) {
          run.push(sorted[i]!);
          i++;
        }
        nodes.push(...renderRowUnits(groupControlsByRowId(run)));
      }
    }
    return nodes;
  };

  const renderGroup = (
    g: DesignControlGroup,
    groupIndex: number,
    zone: 'body' | 'footer',
  ) => {
    const controls = g.kind === 'single' ? [g.control] : g.controls;
    const anySelected = controls.some((c) => isSelected({ kind: 'control', id: c.id }));
    const selectedId =
      selection?.kind === 'control' && controls.some((c) => c.id === selection.id)
        ? selection.id
        : null;
    const isDragging = draggingGroup === groupIndex && dragZone === zone;
    const inRow = g.kind === 'row';
    const isInclude = g.kind === 'include';
    const isAccordion = g.kind === 'group';
    const groupKey =
      g.kind === 'single'
        ? `g:${g.control.id}`
        : g.kind === 'row'
          ? `row:${g.rowId}`
          : g.kind === 'group'
            ? `group:${g.groupId}`
            : `inc:${g.fragmentId}`;
    const elsRef = zone === 'footer' ? footerGroupElsRef : bodyGroupElsRef;

    return (
      <div
        key={groupKey}
        ref={(el) => {
          elsRef.current[groupIndex] = el;
        }}
        data-design-group={groupIndex}
        data-design-zone={zone}
        className={`design-canvas-group${anySelected ? ' has-selected' : ''}${inRow ? ' is-row' : ''}${isInclude ? ' is-include' : ''}${isAccordion ? ' is-accordion' : ''}${isDragging ? ' dragging' : ''}`}
      >
        <div className="design-group-rail">
          <span
            className="design-drag-handle"
            title={
              isInclude
                ? `Kéo cả cụm include “${g.fragmentId}”`
                : isAccordion
                  ? `Kéo cả group “${g.groupId}”`
                  : inRow
                    ? 'Giữ và kéo để sắp xếp (cả hàng nếu cùng rowId)'
                    : 'Giữ và kéo để sắp xếp'
            }
            onPointerDown={(e) => startGroupDrag(e, groupIndex, zone)}
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
          </span>
          {isInclude && (
            <span className="design-include-badge" title={`Fragment: ${g.fragmentId}`}>
              include
            </span>
          )}
          {isAccordion && (
            <span className="design-group-badge" title={`groupId: ${g.groupId}`}>
              group
            </span>
          )}
          {selectedId && !isInclude && (
            <div className="design-item-actions">
              <button
                type="button"
                className="design-item-action"
                title="Copy xuống dưới"
                aria-label="Copy"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyControl(selectedId);
                }}
              >
                ⧉
              </button>
              <button
                type="button"
                className="design-item-action"
                title="Thêm control xuống dưới"
                aria-label="Insert"
                onClick={(e) => {
                  e.stopPropagation();
                  onInsertControl?.(selectedId);
                }}
              >
                ＋
              </button>
            </div>
          )}
        </div>
        <div
          className={
            inRow
              ? 'form-control-row design-canvas-row'
              : isInclude
                ? 'design-canvas-group-body design-include-body'
                : isAccordion
                  ? 'design-canvas-group-body design-accordion-wrap'
                  : 'design-canvas-group-body'
          }
        >
          {isAccordion
            ? renderAccordionBody(controls, g.groupId)
            : isInclude
              ? renderInnerLayout(controls)
              : inRow
                ? controls.map((c) => renderControlBody(c, true))
                : controls.map((c) => renderControlBody(c, false))}
        </div>
      </div>
    );
  };

  const renderList = (list: FormListDef) => {
    const selected = isSelected({ kind: 'list', id: list.id });
    const mockRows = getListMockRows(doc, list.id);
    const inc = list.includeOf?.trim();
    return (
      <div
        key={list.id}
        className={`design-canvas-list${selected ? ' selected' : ''}${inc ? ' is-include' : ''}`}
        style={pcActive ? { gridColumn: '1 / -1' } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: 'list', id: list.id });
        }}
        onContextMenu={(e) =>
          openMenu(e, {
            x: e.clientX,
            y: e.clientY,
            target: { kind: 'list', id: list.id },
          })
        }
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong className="muted">
            {list.id}
            {inc ? (
              <span className="design-include-badge" title={`Fragment: ${inc}`}>
                {' '}
                include:{inc}
              </span>
            ) : null}
          </strong>
          <span className="muted">
            bind: {list.bind}
            {mockRows.length ? ` · mock ${mockRows.length}` : ''}
          </span>
        </div>
        <table className="data">
          <thead>
            <tr>
              {list.columns.map((col, colIndex) => {
                const colSel = isSelected({ kind: 'column', listId: list.id, field: col.field });
                return (
                  <th
                    key={col.field}
                    className={`design-canvas-col${colSel ? ' selected' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      dragColumn.current = { listId: list.id, field: col.field };
                      e.dataTransfer.effectAllowed = 'move';
                      e.stopPropagation();
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const from = dragColumn.current;
                      dragColumn.current = null;
                      if (!from || from.listId !== list.id) return;
                      onMoveColumn(list.id, from.field, colIndex);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ kind: 'column', listId: list.id, field: col.field });
                    }}
                    onContextMenu={(e) =>
                      openMenu(e, {
                        x: e.clientX,
                        y: e.clientY,
                        target: { kind: 'column', listId: list.id, field: col.field },
                      })
                    }
                  >
                    <div className="design-col-head-row">
                      <span className="design-col-title">
                        {resolveLocalizedText(col.title, 'v')}
                        <span className="muted"> · {col.field}</span>
                      </span>
                      {colSel && (
                        <div className="design-item-actions design-item-actions--row">
                          <button
                            type="button"
                            className="design-item-action"
                            title="Copy cột xuống dưới"
                            aria-label="Copy"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCopyColumn(list.id, col.field);
                            }}
                          >
                            ⧉
                          </button>
                          <button
                            type="button"
                            className="design-item-action"
                            title="Thêm cột xuống dưới"
                            aria-label="Insert"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInsertColumn?.(list.id, col.field);
                            }}
                          >
                            ＋
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {mockRows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, list.columns.length)} className="muted">
                  Chưa có mockRows — mở Property List để thêm
                </td>
              </tr>
            ) : (
              mockRows.slice(0, 5).map((row, idx) => (
                <tr key={idx}>
                  {list.columns.map((col) => (
                    <td key={col.field}>
                      {row[col.field] == null ? '' : String(row[col.field])}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {mockRows.length > 5 && (
              <tr>
                <td colSpan={Math.max(1, list.columns.length)} className="muted">
                  … +{mockRows.length - 5} dòng
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const focusedForMenu =
    selection?.kind === 'control'
      ? ({ kind: 'control' as const, id: selection.id })
      : selection?.kind === 'column'
        ? ({ kind: 'column' as const, listId: selection.listId, field: selection.field })
        : null;

  return (
    <div
      className={`design-canvas-wrap${draggingGroup != null ? ' is-dragging' : ''}`}
      onClick={() => {
        setMenu(null);
        onSelect({ kind: 'form' });
      }}
      onContextMenu={(e) =>
        openMenu(e, {
          x: e.clientX,
          y: e.clientY,
          target: { kind: 'canvas' },
        })
      }
    >
      <div className={viewport === 'pc' ? 'design-pc design-canvas-pc' : 'design-phone design-canvas-phone'}>
        <div className="shell embedded">
          <div className="form-shell form-shell--design">
            <div
              className={`form-scroll ${
                doc.layout === 'drawer' ? 'form-drawer' : pcActive ? 'form-pc-grid' : 'stack'
              }`}
              style={pcActive ? pcGridContainerStyle(pcCols) : undefined}
            >
            <h1
              className={
                isSelected({ kind: 'form' })
                  ? `design-canvas-title selected${doc.layout === 'drawer' ? ' form-drawer-title' : ''}`
                  : `design-canvas-title${doc.layout === 'drawer' ? ' form-drawer-title' : ''}`
              }
              style={pcActive ? { gridColumn: '1 / -1' } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: 'form' });
              }}
            >
              {resolveLocalizedText(doc.title, 'v') || doc.id}
            </h1>

            <div
              className={`design-canvas-groups${
                draggingGroup != null && dragZone === 'body' ? ' is-dragging' : ''
              }${pcActive ? ' form-pc-grid' : ''}`}
              style={pcActive ? { display: 'contents' } : undefined}
            >
              {renderDropLine(0, 'body')}
              {bodyGroups.map((g, i) => {
                const wrapKey =
                  g.kind === 'single'
                    ? `wrap:${g.control.id}`
                    : g.kind === 'row'
                      ? `wrap:${g.rowId}`
                      : g.kind === 'group'
                        ? `wrap:group:${g.groupId}`
                        : `wrap:inc:${g.fragmentId}`;
                return (
                  <div
                    key={wrapKey}
                    style={pcActive ? pcGridItemStyle(pcSpanForDesignGroup(g, pcCols)) : undefined}
                  >
                    {renderGroup(g, i, 'body')}
                    {renderDropLine(i + 1, 'body')}
                  </div>
                );
              })}
            </div>

            {lists.map(renderList)}

            {doc.controls.length === 0 && doc.lists.length === 0 && (
              <p className="muted" style={pcActive ? { gridColumn: '1 / -1' } : undefined}>
                Chuột phải để thêm control / list.
              </p>
            )}
            </div>

            <div className="form-footer design-canvas-footer">
              <div className="design-canvas-footer-label muted">Footer (pin cuối form)</div>
              <div
                className={`design-canvas-groups form-footer-inner stack${
                  draggingGroup != null && dragZone === 'footer' ? ' is-dragging' : ''
                }`}
              >
                {renderDropLine(0, 'footer')}
                {footerGroups.map((g, i) => {
                  const wrapKey =
                    g.kind === 'single'
                      ? `wrap:ft:${g.control.id}`
                      : g.kind === 'row'
                        ? `wrap:ft:${g.rowId}`
                        : g.kind === 'group'
                          ? `wrap:ft:group:${g.groupId}`
                          : `wrap:ft:inc:${g.fragmentId}`;
                  return (
                    <div key={wrapKey}>
                      {renderGroup(g, i, 'footer')}
                      {renderDropLine(i + 1, 'footer')}
                    </div>
                  );
                })}
                {footerGroups.length === 0 && (
                  <p className="muted design-canvas-footer-empty">
                    Đặt placement = footer trên control (button/label…).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {menu && (
        <DesignContextMenu
          menu={menu}
          focused={focusedForMenu}
          onClose={() => setMenu(null)}
          onAddControl={onRequestAddControl}
          onAddIconButton={onRequestAddIconButton}
          onAddList={onRequestAddList}
          onEditControl={(id) => {
            onSelect({ kind: 'control', id });
            const c = doc.controls.find((x) => x.id === id);
            if (c) beginEdit(c);
          }}
          onCopyControl={onCopyControl}
          onDeleteControl={onDeleteControl}
          onDeleteList={onDeleteList}
          onAddColumn={onAddColumn}
          onCopyColumn={onCopyColumn}
          onDeleteColumn={onDeleteColumn}
          onSelectColumn={(listId, field) => onSelect({ kind: 'column', listId, field })}
          onSelectList={(id) => onSelect({ kind: 'list', id })}
          onSelectControl={(id) => onSelect({ kind: 'control', id })}
        />
      )}
    </div>
  );
}
