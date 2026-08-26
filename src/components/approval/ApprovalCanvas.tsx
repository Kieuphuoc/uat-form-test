import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ApprovalSelection, GraphLayout, WfEdgeRow, WfNodeRow } from '../../types/approval';

const NODE_W = 140;
const NODE_H = 56;

type Props = {
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  layout: GraphLayout;
  selection: ApprovalSelection;
  linkFrom: string | null;
  readOnly: boolean;
  onSelect: (sel: ApprovalSelection) => void;
  onMove: (nodeKey: string, x: number, y: number) => void;
  onPickLinkTarget: (nodeKey: string) => void;
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
      if (c.field) return `if ${c.field}`;
    } catch {
      /* ignore */
    }
  }
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
  linkFrom,
  readOnly,
  onSelect,
  onMove,
  onPickLinkTarget,
}: Props) {
  const dragRef = useRef<{ key: string; ox: number; oy: number; sx: number; sy: number } | null>(
    null,
  );
  const [dragPos, setDragPos] = useState<{ key: string; x: number; y: number } | null>(null);

  const posOf = useCallback(
    (key: string) => {
      if (dragPos?.key === key) return { x: dragPos.x, y: dragPos.y };
      return layout[key] ?? { x: 40, y: 40 };
    },
    [dragPos, layout],
  );

  const onPointerDown = (e: ReactPointerEvent, key: string) => {
    if (readOnly) {
      onSelect({ kind: 'node', node_key: key });
      return;
    }
    if (linkFrom) {
      e.stopPropagation();
      onPickLinkTarget(key);
      return;
    }
    const p = posOf(key);
    dragRef.current = { key, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSelect({ kind: 'node', node_key: key });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDragPos({
      key: d.key,
      x: Math.max(0, d.ox + (e.clientX - d.sx)),
      y: Math.max(0, d.oy + (e.clientY - d.sy)),
    });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d && dragPos?.key === d.key) {
      onMove(d.key, dragPos.x, dragPos.y);
    }
    dragRef.current = null;
    setDragPos(null);
  };

  const maxX = Math.max(640, ...nodes.map((n) => posOf(n.node_key).x + NODE_W + 40));
  const maxY = Math.max(360, ...nodes.map((n) => posOf(n.node_key).y + NODE_H + 40));

  return (
    <div
      className="approval-canvas"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => onSelect(null)}
    >
      {linkFrom && (
        <div className="approval-canvas__hint">
          Đang nối từ <code>{linkFrom}</code> — click node đích (Esc hủy)
        </div>
      )}
      <svg className="approval-canvas__edges" width={maxX} height={maxY}>
        {edges.map((edge, i) => {
          const a = posOf(edge.from_node_key);
          const b = posOf(edge.to_node_key);
          const x1 = a.x + NODE_W / 2;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x + NODE_W / 2;
          const y2 = b.y + NODE_H / 2;
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
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
              <polygon
                points={`${x2},${y2} ${x2 - 8},${y2 - 5} ${x2 - 8},${y2 + 5}`}
                transform={`rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI} ${x2} ${y2})`}
              />
              {label ? (
                <text x={midX} y={midY - 6} textAnchor="middle">
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((n) => {
        const p = posOf(n.node_key);
        const selected = selection?.kind === 'node' && selection.node_key === n.node_key;
        return (
          <div
            key={n.node_key}
            className={`approval-node approval-node--${n.node_type}${selected ? ' is-selected' : ''}${linkFrom === n.node_key ? ' is-link-from' : ''}`}
            style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, n.node_key);
            }}
          >
            <span className="approval-node__type">{n.node_type}</span>
            <span className="approval-node__label">{nodeLabel(n)}</span>
          </div>
        );
      })}
    </div>
  );
}
