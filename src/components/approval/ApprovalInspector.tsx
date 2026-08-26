import type {
  ApprovalSelection,
  EdgeCondition,
  WfAssigneeRow,
  WfEdgeRow,
  WfNodeRow,
} from '../../types/approval';

type Props = {
  selection: ApprovalSelection;
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  assignees: WfAssigneeRow[];
  readOnly: boolean;
  onChangeNode: (nodeKey: string, patch: Partial<WfNodeRow>) => void;
  onChangeEdge: (index: number, patch: Partial<WfEdgeRow>) => void;
  onChangeAssignee: (nodeKey: string, resolve_type: string, resolve_value: string) => void;
  onDeleteNode: (nodeKey: string) => void;
  onDeleteEdge: (index: number) => void;
  onStartLink: (nodeKey: string) => void;
};

function parseConfig(json?: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseCondition(json?: string | null): EdgeCondition {
  if (!json) return {};
  try {
    return JSON.parse(json) as EdgeCondition;
  } catch {
    return {};
  }
}

export function ApprovalInspector({
  selection,
  nodes,
  edges,
  assignees,
  readOnly,
  onChangeNode,
  onChangeEdge,
  onChangeAssignee,
  onDeleteNode,
  onDeleteEdge,
  onStartLink,
}: Props) {
  if (!selection) {
    return (
      <div className="approval-inspector muted">
        Chọn node hoặc cạnh để chỉnh. Draft mới có thể thêm node từ palette trái.
      </div>
    );
  }

  if (selection.kind === 'edge') {
    const edge = edges[selection.edge_index];
    if (!edge) return <div className="muted">Edge không tồn tại.</div>;
    const cond = parseCondition(edge.condition_json);
    return (
      <div className="approval-inspector stack">
        <strong>Edge</strong>
        <div className="muted">
          {edge.from_node_key} → {edge.to_node_key}
        </div>
        <label className="field">
          sort_order
          <input
            type="number"
            disabled={readOnly}
            value={edge.sort_order}
            onChange={(e) =>
              onChangeEdge(selection.edge_index, { sort_order: Number(e.target.value) || 0 })
            }
          />
        </label>
        <label className="field">
          condition field
          <input
            disabled={readOnly}
            value={cond.field ?? ''}
            placeholder="so_ngay (trống = luôn đi)"
            onChange={(e) => {
              const field = e.target.value.trim();
              if (!field) {
                onChangeEdge(selection.edge_index, { condition_json: null });
                return;
              }
              const next: EdgeCondition = {
                field,
                op: cond.op || '<=',
                value: cond.value ?? 1,
              };
              onChangeEdge(selection.edge_index, { condition_json: JSON.stringify(next) });
            }}
          />
        </label>
        <label className="field">
          op
          <select
            disabled={readOnly || !cond.field}
            value={cond.op || '<='}
            onChange={(e) => {
              const next = { ...cond, op: e.target.value };
              onChangeEdge(selection.edge_index, { condition_json: JSON.stringify(next) });
            }}
          >
            <option value="<=">&lt;=</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="==">==</option>
            <option value="!=">!=</option>
          </select>
        </label>
        <label className="field">
          value
          <input
            type="number"
            disabled={readOnly || !cond.field}
            value={cond.value ?? ''}
            onChange={(e) => {
              const next = { ...cond, value: Number(e.target.value) };
              onChangeEdge(selection.edge_index, { condition_json: JSON.stringify(next) });
            }}
          />
        </label>
        {!readOnly && (
          <button type="button" className="secondary" onClick={() => onDeleteEdge(selection.edge_index)}>
            Xóa cạnh
          </button>
        )}
      </div>
    );
  }

  const node = nodes.find((n) => n.node_key === selection.node_key);
  if (!node) return <div className="muted">Node không tồn tại.</div>;
  const cfg = parseConfig(node.config_json);
  const assignee = assignees.find((a) => a.node_key === node.node_key);

  return (
    <div className="approval-inspector stack">
      <strong>Node · {node.node_type}</strong>
      <label className="field">
        node_key
        <input value={node.node_key} disabled />
      </label>

      {node.node_type === 'condition' && (
        <label className="field">
          field (payload)
          <input
            disabled={readOnly}
            value={String(cfg.field ?? '')}
            placeholder="so_ngay"
            onChange={(e) => {
              const next = { ...cfg, field: e.target.value.trim() };
              onChangeNode(node.node_key, { config_json: JSON.stringify(next) });
            }}
          />
        </label>
      )}

      {node.node_type === 'approve' && (
        <>
          <label className="field">
            label
            <input
              disabled={readOnly}
              value={String(cfg.label ?? '')}
              placeholder="Trưởng phòng"
              onChange={(e) => {
                const next = { ...cfg, label: e.target.value };
                onChangeNode(node.node_key, { config_json: JSON.stringify(next) });
              }}
            />
          </label>
          <label className="field">
            resolve_type
            <select
              disabled={readOnly}
              value={assignee?.resolve_type || 'role'}
              onChange={(e) =>
                onChangeAssignee(
                  node.node_key,
                  e.target.value,
                  assignee?.resolve_value || 'truong_phong',
                )
              }
            >
              <option value="role">role</option>
              <option value="user">user</option>
              <option value="payload">payload</option>
            </select>
          </label>
          <label className="field">
            resolve_value
            <input
              disabled={readOnly}
              value={assignee?.resolve_value || ''}
              placeholder="truong_phong / giam_doc / user_id"
              onChange={(e) =>
                onChangeAssignee(
                  node.node_key,
                  assignee?.resolve_type || 'role',
                  e.target.value.trim(),
                )
              }
            />
          </label>
        </>
      )}

      {!readOnly && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="secondary" onClick={() => onStartLink(node.node_key)}>
            Nối cạnh từ đây
          </button>
          {node.node_type !== 'start' && (
            <button type="button" className="secondary" onClick={() => onDeleteNode(node.node_key)}>
              Xóa node
            </button>
          )}
        </div>
      )}
    </div>
  );
}
