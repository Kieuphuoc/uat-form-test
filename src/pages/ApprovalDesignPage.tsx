import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApprovalApiError, approvalApi } from '../api/approvalApi';
import { useAuth } from '../auth/AuthContext';
import { ApprovalCanvas } from '../components/approval/ApprovalCanvas';
import { ApprovalInspector } from '../components/approval/ApprovalInspector';
import { ApprovalTestPanel } from '../components/approval/ApprovalTestPanel';
import type {
  ApprovalSelection,
  GraphJson,
  GraphLayout,
  SaveDefinitionRequest,
  WfAssigneeRow,
  WfDefinitionDetail,
  WfEdgeRow,
  WfNodeRow,
  WfNodeType,
} from '../types/approval';

function parseGraph(json?: string | null): GraphJson {
  if (!json) return {};
  try {
    return JSON.parse(json) as GraphJson;
  } catch {
    return {};
  }
}

function ensureLayout(nodes: WfNodeRow[], graphJson?: string | null): GraphLayout {
  const g = parseGraph(graphJson);
  const layout = { ...(g.layout || {}) };
  nodes.forEach((n, i) => {
    if (!layout[n.node_key]) {
      layout[n.node_key] = { x: 60 + (i % 3) * 200, y: 60 + Math.floor(i / 3) * 110 };
    }
  });
  return layout;
}

function uniqueKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export function ApprovalDesignPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { jwt, user, logout } = useAuth();
  const [detail, setDetail] = useState<WfDefinitionDetail | null>(null);
  const [nodes, setNodes] = useState<WfNodeRow[]>([]);
  const [edges, setEdges] = useState<WfEdgeRow[]>([]);
  const [assignees, setAssignees] = useState<WfAssigneeRow[]>([]);
  const [layout, setLayout] = useState<GraphLayout>({});
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<ApprovalSelection>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const readOnly = detail?.definition.status !== 'draft';

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setError('id không hợp lệ.');
      return;
    }
    try {
      const d = await approvalApi.getDefinition(id);
      setDetail(d);
      setCode(d.definition.code);
      setName(d.definition.name);
      setNodes(d.nodes);
      setEdges(d.edges);
      setAssignees(d.assignees);
      setLayout(ensureLayout(d.nodes, d.definition.graph_json));
      setError(null);
      setSelection(null);
      setLinkFrom(null);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Không tải definition.');
    }
  }, [id]);

  useEffect(() => {
    if (!jwt) return;
    void load();
  }, [jwt, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLinkFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const buildSaveBody = (): SaveDefinitionRequest => {
    const graph: GraphJson = {
      ...parseGraph(detail?.definition.graph_json),
      layout,
    };
    return {
      id: detail?.definition.id,
      code: code.trim(),
      name: name.trim() || code.trim(),
      graph_json: JSON.stringify(graph),
      nodes: nodes.map((n, i) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        config_json: n.config_json ?? '{}',
        sort_order: n.sort_order ?? i,
      })),
      edges: edges.map((e, i) => ({
        from_node_key: e.from_node_key,
        to_node_key: e.to_node_key,
        sort_order: e.sort_order ?? i,
        condition_json: e.condition_json ?? null,
      })),
      assignees: assignees.map((a) => ({
        node_key: a.node_key,
        resolve_type: a.resolve_type,
        resolve_value: a.resolve_value,
      })),
    };
  };

  const onSave = async () => {
    if (readOnly || !detail) return;
    setBusy(true);
    setMessage(null);
    try {
      const d = await approvalApi.updateDefinition(detail.definition.id, buildSaveBody());
      setDetail(d);
      setNodes(d.nodes);
      setEdges(d.edges);
      setAssignees(d.assignees);
      setLayout(ensureLayout(d.nodes, d.definition.graph_json));
      setMessage('Đã lưu draft.');
      setError(null);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Lưu thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!detail || readOnly) return;
    setBusy(true);
    try {
      await approvalApi.updateDefinition(detail.definition.id, buildSaveBody());
      const d = await approvalApi.publishDefinition(detail.definition.id);
      setDetail(d);
      setMessage(`Đã publish v${d.definition.version}.`);
      setError(null);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Publish thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const onCloneDraft = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const body = buildSaveBody();
      const d = await approvalApi.createDefinition({
        ...body,
        id: null,
        code: detail.definition.code,
        name: detail.definition.name,
      });
      window.location.assign(`/admin/approval/${d.definition.id}`);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Clone draft thất bại.');
      setBusy(false);
    }
  };

  const addNode = (type: WfNodeType) => {
    if (readOnly) return;
    const keys = new Set(nodes.map((n) => n.node_key));
    const key = uniqueKey(type === 'condition' ? 'if' : type, keys);
    const next: WfNodeRow = {
      node_key: key,
      node_type: type,
      config_json:
        type === 'condition'
          ? JSON.stringify({ field: 'so_ngay' })
          : type === 'approve'
            ? JSON.stringify({ label: key })
            : '{}',
      sort_order: nodes.length,
    };
    setNodes((prev) => [...prev, next]);
    setLayout((prev) => ({
      ...prev,
      [key]: { x: 80 + (nodes.length % 4) * 40, y: 80 + nodes.length * 24 },
    }));
    if (type === 'approve') {
      setAssignees((prev) => [
        ...prev.filter((a) => a.node_key !== key),
        { node_key: key, resolve_type: 'role', resolve_value: 'truong_phong' },
      ]);
    }
    setSelection({ kind: 'node', node_key: key });
  };

  const onPickLinkTarget = (toKey: string) => {
    if (!linkFrom || readOnly) return;
    if (linkFrom === toKey) {
      setLinkFrom(null);
      return;
    }
    setEdges((prev) => {
      const next = [
        ...prev,
        {
          from_node_key: linkFrom,
          to_node_key: toKey,
          sort_order: prev.filter((e) => e.from_node_key === linkFrom).length,
          condition_json: null as string | null,
        },
      ];
      setSelection({ kind: 'edge', edge_index: next.length - 1 });
      return next;
    });
    setLinkFrom(null);
  };

  const statusBadge = useMemo(() => {
    if (!detail) return '';
    return `${detail.definition.status} · v${detail.definition.version}`;
  }, [detail]);

  if (!jwt) return null;

  return (
    <div className="approval-design">
      <header className="approval-design__bar row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/admin/approval">← List</Link>
          <strong>Approval Design</strong>
          <span className="muted">{statusBadge}</span>
        </div>
        <div className="row">
          <span className="muted">{user?.nickname || user?.email}</span>
          <button type="button" className="secondary" onClick={() => logout()}>
            Đăng xuất
          </button>
        </div>
      </header>

      {error && <div className="banner">{error}</div>}
      {message && <div className="banner banner--ok">{message}</div>}

      <div className="approval-design__body">
        <aside className="approval-design__side stack">
          <label className="field">
            code
            <input value={code} disabled={readOnly} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="field">
            name
            <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </label>
          {!readOnly && (
            <>
              <strong>Palette</strong>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {(['start', 'condition', 'approve', 'end'] as WfNodeType[]).map((t) => (
                  <button key={t} type="button" className="secondary" onClick={() => addNode(t)}>
                    + {t}
                  </button>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={() => void onSave()}>
                Save draft
              </button>
              <button type="button" disabled={busy} onClick={() => void onPublish()}>
                Publish
              </button>
            </>
          )}
          {readOnly && (
            <button type="button" disabled={busy} onClick={() => void onCloneDraft()}>
              Tạo bản draft mới
            </button>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            Published chỉ xem + Test. Sửa: clone draft rồi Save/Publish.
          </p>
        </aside>

        <main className="approval-design__main">
          <ApprovalCanvas
            nodes={nodes}
            edges={edges}
            layout={layout}
            selection={selection}
            linkFrom={linkFrom}
            readOnly={readOnly}
            onSelect={setSelection}
            onMove={(key, x, y) => setLayout((prev) => ({ ...prev, [key]: { x, y } }))}
            onPickLinkTarget={onPickLinkTarget}
          />
        </main>

        <aside className="approval-design__inspector">
          <ApprovalInspector
            selection={selection}
            nodes={nodes}
            edges={edges}
            assignees={assignees}
            readOnly={readOnly}
            onChangeNode={(nodeKey, patch) =>
              setNodes((prev) => prev.map((n) => (n.node_key === nodeKey ? { ...n, ...patch } : n)))
            }
            onChangeEdge={(index, patch) =>
              setEdges((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
            }
            onChangeAssignee={(nodeKey, resolve_type, resolve_value) =>
              setAssignees((prev) => {
                const rest = prev.filter((a) => a.node_key !== nodeKey);
                return [...rest, { node_key: nodeKey, resolve_type, resolve_value }];
              })
            }
            onDeleteNode={(nodeKey) => {
              setNodes((prev) => prev.filter((n) => n.node_key !== nodeKey));
              setEdges((prev) =>
                prev.filter((e) => e.from_node_key !== nodeKey && e.to_node_key !== nodeKey),
              );
              setAssignees((prev) => prev.filter((a) => a.node_key !== nodeKey));
              setLayout((prev) => {
                const next = { ...prev };
                delete next[nodeKey];
                return next;
              });
              setSelection(null);
            }}
            onDeleteEdge={(index) => {
              setEdges((prev) => prev.filter((_, i) => i !== index));
              setSelection(null);
            }}
            onStartLink={(nodeKey) => setLinkFrom(nodeKey)}
          />
        </aside>
      </div>

      <ApprovalTestPanel definitionCode={code || detail?.definition.code || ''} />
    </div>
  );
}
