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
  onAddBranch: (conditionNodeKey: string) => void;
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
  onAddBranch,
}: Props) {
  if (!selection) {
    return (
      <div className="approval-inspector muted">
        Chọn một bước trên sơ đồ để cấu hình. Dùng nút <strong>+</strong> trên đường nối để
        chèn bước mới.
      </div>
    );
  }

  if (selection.kind === 'edge') {
    const edge = edges[selection.edge_index];
    if (!edge) return <div className="muted">Edge không tồn tại.</div>;
    const cond = parseCondition(edge.condition_json);
    return (
      <div className="approval-inspector stack">
        <strong>Nhánh điều kiện</strong>
        <div className="muted">
          Đi đến bước: {edge.to_node_key}
        </div>
        <label className="field">
          Trường dữ liệu
          <input
            disabled={readOnly}
            value={cond.field ?? ''}
            placeholder="Ví dụ: so_ngay"
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
          Phép so sánh
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
          Giá trị
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
            Xóa nhánh
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
      <strong>
        {node.node_type === 'approve'
          ? 'Bước duyệt'
          : node.node_type === 'condition'
            ? 'Điều kiện phân nhánh'
            : node.node_type === 'start'
              ? 'Bắt đầu quy trình'
              : 'Kết thúc quy trình'}
      </strong>

      {node.node_type === 'condition' && (
        <label className="field">
          Trường dùng để xét điều kiện
          <input
            disabled={readOnly}
            value={String(cfg.field ?? '')}
            placeholder="Ví dụ: so_ngay"
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
            Tên bước
            <input
              disabled={readOnly}
              value={String(cfg.label ?? '')}
              placeholder="Ví dụ: Trưởng phòng duyệt"
              onChange={(e) => {
                const next = { ...cfg, label: e.target.value };
                onChangeNode(node.node_key, { config_json: JSON.stringify(next) });
              }}
            />
          </label>
          <label className="field">
            Cách xác định người duyệt
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
              <option value="role">Theo vai trò từ hệ thống nguồn</option>
              <option value="user">Một người cố định</option>
              <option value="payload">Theo trường dữ liệu gửi lên</option>
            </select>
          </label>
          <label className="field">
            {assignee?.resolve_type === 'user'
              ? 'User ID'
              : assignee?.resolve_type === 'payload'
                ? 'Tên trường dữ liệu'
                : 'Mã vai trò'}
            <input
              disabled={readOnly}
              value={assignee?.resolve_value || ''}
              placeholder="Ví dụ: truong_phong"
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

      {node.node_type === 'condition' && (
        <div className="approval-branches stack">
          <strong>Các nhánh</strong>
          {edges
            .map((edge, index) => ({ edge, index }))
            .filter(({ edge }) => edge.from_node_key === node.node_key)
            .map(({ edge, index }, branchIndex) => {
              const condition = parseCondition(edge.condition_json);
              return (
                <div key={`${edge.to_node_key}-${index}`} className="approval-branch-card">
                  <strong>Nhánh {branchIndex + 1}</strong>
                  <input
                    disabled={readOnly}
                    value={condition.field ?? ''}
                    aria-label={`Trường nhánh ${branchIndex + 1}`}
                    placeholder="Trường dữ liệu"
                    onChange={(event) =>
                      onChangeEdge(index, {
                        condition_json: JSON.stringify({
                          ...condition,
                          field: event.target.value.trim(),
                          op: condition.op || '<=',
                          value: condition.value ?? 1,
                        }),
                      })
                    }
                  />
                  <div className="row">
                    <select
                      disabled={readOnly}
                      value={condition.op || '<='}
                      aria-label={`Phép so sánh nhánh ${branchIndex + 1}`}
                      onChange={(event) =>
                        onChangeEdge(index, {
                          condition_json: JSON.stringify({
                            ...condition,
                            op: event.target.value,
                          }),
                        })
                      }
                    >
                      <option value="<=">&lt;=</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="==">=</option>
                      <option value="!=">≠</option>
                    </select>
                    <input
                      type="number"
                      disabled={readOnly}
                      value={condition.value ?? ''}
                      aria-label={`Giá trị nhánh ${branchIndex + 1}`}
                      onChange={(event) =>
                        onChangeEdge(index, {
                          condition_json: JSON.stringify({
                            ...condition,
                            value: Number(event.target.value),
                          }),
                        })
                      }
                    />
                  </div>
                  <small>Đi đến: {edge.to_node_key}</small>
                  {!readOnly && (
                    <button type="button" className="secondary" onClick={() => onDeleteEdge(index)}>
                      Xóa nhánh
                    </button>
                  )}
                </div>
              );
            })}
          {!readOnly && (
            <button type="button" className="secondary" onClick={() => onAddBranch(node.node_key)}>
              + Thêm nhánh
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {node.node_type !== 'start' && node.node_type !== 'end' && (
            <button type="button" className="secondary" onClick={() => onDeleteNode(node.node_key)}>
              Xóa bước
            </button>
          )}
        </div>
      )}
    </div>
  );
}
