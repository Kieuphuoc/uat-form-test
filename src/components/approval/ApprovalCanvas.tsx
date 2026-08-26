import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ApprovalSelection, GraphLayout, WfEdgeRow, WfNodeRow } from '../../types/approval';

const NODE_W = 176;
const NODE_H = 68;

type Props = {
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  layout: GraphLayout;
  selection: ApprovalSelection;
  readOnly: boolean;
  highlightNodeKey?: string | null;
  doneNodeKeys?: string[];
  onSelect: (sel: ApprovalSelection) => void;
  onInsertStep: (edgeIndex: number, type: 'approve' | 'condition') => void;
  onLayoutChange: (layout: GraphLayout) => void;
};

function nodeLabel(n: WfNodeRow): string {
  if (n.node_type === 'approve') {
    try {
      const c = n.config_json ? (JSON.parse(n.config_json) as { label?: string }) : {};
      if (c.label) return c.label;
    } catch {
      /* ignore */
    }
  }
  if (n.node_type === 'condition') {
    try {
      const c = n.config_json ? (JSON.parse(n.config_json) as { field?: string }) : {};
      if (c.field) return `Điều kiện: ${c.field}`;
    } catch {
      /* ignore */
    }
  }
  if (n.node_type === 'start') return 'Bắt đầu';
  if (n.node_type === 'end') return 'Kết thúc';
  return n.node_key;
}

function edgeMidLabel(e: WfEdgeRow): string {
  if (!e.condition_json) return '';
  try {
    const c = JSON.parse(e.condition_json) as { op?: string; field?: string; value?: unknown };
    if (c.field && c.op) return `${c.field} ${c.op} ${c.value ?? ''}`;
  } catch {
    /* ignore */
  }
  return '';
}

export function ApprovalCanvas({
  nodes,
  edges,
  layout,
  selection,
  readOnly,
  highlightNodeKey = null,
  doneNodeKeys = [],
  onSelect,
  onInsertStep,
  onLayoutChange,
}: Props) {
  const doneSet = new Set(doneNodeKeys);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ key: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    key: string;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);

  const posOf = (key: string) => {
    if (dragPos?.key === key) return { x: dragPos.x, y: dragPos.y };
    return layout[key] ?? { x: 40, y: 40 };
  };

  const maxX = Math.max(720, ...nodes.map((n) => posOf(n.node_key).x + NODE_W + 48));
  const maxY = Math.max(440, ...nodes.map((n) => posOf(n.node_key).y + NODE_H + 70));

  const onNodePointerDown = (e: ReactPointerEvent, key: string) => {
    e.stopPropagation();
    setInsertAt(null);
    onSelect({ kind: 'node', node_key: key });
    if (readOnly) return;
    const p = posOf(key);
    dragRef.current = {
      key,
      ox: p.x,
      oy: p.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onNodePointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || readOnly) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    setDragPos({
      key: d.key,
      x: Math.max(0, d.ox + dx),
      y: Math.max(0, d.oy + dy),
    });
  };

  const onNodePointerUp = () => {
    const d = dragRef.current;
    if (d?.moved && dragPos?.key === d.key) {
      onLayoutChange({ ...layout, [d.key]: { x: dragPos.x, y: dragPos.y } });
    }
    dragRef.current = null;
    setDragPos(null);
  };

  return (
    <div
      className="approval-canvas"
      style={{ minWidth: maxX, minHeight: maxY }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onSelect(null);
          setInsertAt(null);
        }
      }}
    >
      <svg className="approval-canvas__edges" width={maxX} height={maxY}>
        {edges.map((edge, i) => {
          const a = posOf(edge.from_node_key);
          const b = posOf(edge.to_node_key);
          const x1 = a.x + NODE_W / 2;
          const y1 = a.y + NODE_H;
          const x2 = b.x + NODE_W / 2;
          const y2 = b.y;
          const selected = selection?.kind === 'edge' && selection.edge_index === i;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const label = edgeMidLabel(edge);
          return (
            <g
              key={`${edge.from_node_key}-${edge.to_node_key}-${i}`}
              className={selected ? 'approval-edge is-selected' : 'approval-edge'}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect({ kind: 'edge', edge_index: i });
              }}
            >
              <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} />
              <polygon points={`${x2},${y2} ${x2 - 5},${y2 - 9} ${x2 + 5},${y2 - 9}`} />
              {label ? (
                <text x={midX} y={midY - 6} textAnchor="middle">
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {!readOnly &&
        edges.map((edge, index) => {
          const a = posOf(edge.from_node_key);
          const b = posOf(edge.to_node_key);
          const x = (a.x + NODE_W / 2 + b.x + NODE_W / 2) / 2;
          const y = (a.y + NODE_H + b.y) / 2;
          return (
            <div
              key={`insert-${edge.from_node_key}-${edge.to_node_key}-${index}`}
              className="approval-insert"
              style={{ left: x, top: y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="approval-insert__plus"
                title="Chèn bước tại đây"
                onClick={() => setInsertAt((current) => (current === index ? null : index))}
              >
                +
              </button>
              {insertAt === index && (
                <div className="approval-insert__menu">
                  <button
                    type="button"
                    onClick={() => {
                      onInsertStep(index, 'approve');
                      setInsertAt(null);
                    }}
                  >
                    Thêm bước duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onInsertStep(index, 'condition');
                      setInsertAt(null);
                    }}
                  >
                    Thêm điều kiện
                  </button>
                </div>
              )}
            </div>
          );
        })}
      {nodes.map((n) => {
        const p = posOf(n.node_key);
        const selected = selection?.kind === 'node' && selection.node_key === n.node_key;
        const isCurrent = highlightNodeKey === n.node_key;
        const isDone = doneSet.has(n.node_key);
        return (
          <div
            key={n.node_key}
            className={`approval-node approval-node--${n.node_type}${selected ? ' is-selected' : ''}${isCurrent ? ' is-sim-current' : ''}${isDone ? ' is-sim-done' : ''}${readOnly ? '' : ' is-draggable'}`}
            style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
            onPointerDown={(e) => onNodePointerDown(e, n.node_key)}
            onPointerMove={onNodePointerMove}
            onPointerUp={onNodePointerUp}
            onPointerCancel={onNodePointerUp}
          >
            <span className="approval-node__type">
              {n.node_type === 'approve'
                ? 'Bước duyệt'
                : n.node_type === 'condition'
                  ? 'Điều kiện'
                  : n.node_type === 'start'
                    ? 'Khởi tạo'
                    : 'Hoàn tất'}
            </span>
            <span className="approval-node__label">{nodeLabel(n)}</span>
          </div>
        );
      })}
    </div>
  );
}
