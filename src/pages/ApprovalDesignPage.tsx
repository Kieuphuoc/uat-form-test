import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApprovalApiError, approvalApi } from '../api/approvalApi';
import { useAuth } from '../auth/AuthContext';
import { ApprovalCanvas } from '../components/approval/ApprovalCanvas';
import { ApprovalInspector } from '../components/approval/ApprovalInspector';
import { ApprovalTestPanel } from '../components/approval/ApprovalTestPanel';
import { useApprovalToast } from '../hooks/useApprovalToast';
import {
  addConditionBranch,
  autoLayoutApprovalGraph,
  deleteApprovalStep,
  insertStepOnEdge,
  mergeLayoutWithAuto,
  removeConditionBranch,
  validateApprovalGraph,
  type ApprovalGraph,
} from '../lib/approvalGraph';
import { ApprovalHistory, type ApprovalSnapshot } from '../lib/approvalHistory';
import type {
  ApprovalSelection,
  GraphJson,
  GraphLayout,
  SaveDefinitionRequest,
  WfAssigneeRow,
  WfDefinitionDetail,
  WfEdgeRow,
  WfNodeRow,
} from '../types/approval';

function parseGraph(json?: string | null): GraphJson {
  if (!json) return {};
  try {
    return JSON.parse(json) as GraphJson;
  } catch {
    return {};
  }
}

export function ApprovalDesignPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { jwt, user, logout } = useAuth();
  const { showToast, toastNode } = useApprovalToast();
  const [detail, setDetail] = useState<WfDefinitionDetail | null>(null);
  const [nodes, setNodes] = useState<WfNodeRow[]>([]);
  const [edges, setEdges] = useState<WfEdgeRow[]>([]);
  const [assignees, setAssignees] = useState<WfAssigneeRow[]>([]);
  const [layout, setLayout] = useState<GraphLayout>({});
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [selection, setSelection] = useState<ApprovalSelection>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [histTick, setHistTick] = useState(0);
  const [simHighlight, setSimHighlight] = useState<{
    currentKey: string | null;
    doneKeys: string[];
  }>({ currentKey: null, doneKeys: [] });
  const historyRef = useRef(new ApprovalHistory());
  const busyRef = useRef(false);
  const readOnlyRef = useRef(false);
  const onSaveRef = useRef<() => Promise<void>>(async () => undefined);

  const readOnly = detail?.definition.status !== 'draft';
  readOnlyRef.current = readOnly;
  busyRef.current = busy;

  const validationErrors = useMemo(
    () => validateApprovalGraph({ nodes, edges, assignees }),
    [nodes, edges, assignees],
  );

  const applySnapshot = (s: ApprovalSnapshot) => {
    setNodes(s.nodes);
    setEdges(s.edges);
    setAssignees(s.assignees);
    setLayout(s.layout);
    setSelection(null);
    setHistTick((n) => n + 1);
  };

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setLoadError('id không hợp lệ.');
      return;
    }
    try {
      const d = await approvalApi.getDefinition(id);
      const g = parseGraph(d.definition.graph_json);
      const nextLayout = mergeLayoutWithAuto(d.nodes, d.edges, g.layout);
      setDetail(d);
      setCode(d.definition.code);
      setName(d.definition.name);
      setNodes(d.nodes);
      setEdges(d.edges);
      setAssignees(d.assignees);
      setLayout(nextLayout);
      setLoadError(null);
      setSelection(null);
      historyRef.current.reset({
        nodes: d.nodes,
        edges: d.edges,
        assignees: d.assignees,
        layout: nextLayout,
      });
      setHistTick((n) => n + 1);
      if (d.definition.status === 'published') {
        showToast(
          `Đang xem bản published v${d.definition.version}. Tạo phiên bản mới để sửa.`,
          'info',
        );
      }
    } catch (e) {
      setLoadError(e instanceof ApprovalApiError ? e.message : 'Không tải definition.');
    }
  }, [id, showToast]);

  useEffect(() => {
    if (!jwt) return;
    void load();
  }, [jwt, load]);

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
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(' '), 'error');
      return;
    }
    setBusy(true);
    try {
      const d = await approvalApi.updateDefinition(detail.definition.id, buildSaveBody());
      const g = parseGraph(d.definition.graph_json);
      const nextLayout = mergeLayoutWithAuto(d.nodes, d.edges, g.layout ?? layout);
      setDetail(d);
      setNodes(d.nodes);
      setEdges(d.edges);
      setAssignees(d.assignees);
      setLayout(nextLayout);
      showToast('Đã lưu draft.', 'success');
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Lưu thất bại.', 'error');
    } finally {
      setBusy(false);
    }
  };
  onSaveRef.current = onSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === 's') {
        e.preventDefault();
        if (readOnlyRef.current) {
          showToast('Bản published — tạo phiên bản mới rồi mới lưu.', 'info');
          return;
        }
        if (busyRef.current) return;
        void onSaveRef.current();
        return;
      }

      if (readOnlyRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const s = historyRef.current.undo();
        if (s) applySnapshot(s);
        else showToast('Không còn bước Undo.', 'info');
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        const s = historyRef.current.redo();
        if (s) applySnapshot(s);
        else showToast('Không còn bước Redo.', 'info');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showToast]);

  const onPublish = async () => {
    if (!detail || readOnly) return;
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(' '), 'error');
      return;
    }
    setBusy(true);
    try {
      await approvalApi.updateDefinition(detail.definition.id, buildSaveBody());
      const d = await approvalApi.publishDefinition(detail.definition.id);
      setDetail(d);
      showToast(
        `Đã publish v${d.definition.version}. Bản published cũ (cùng code) đã archive.`,
        'success',
      );
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Publish thất bại.', 'error');
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
      showToast(e instanceof ApprovalApiError ? e.message : 'Tạo phiên bản mới thất bại.', 'error');
      setBusy(false);
    }
  };

  /** Copy thành quy trình mới (code mới) — không vào nhóm “Bản cũ” của bản gốc. */
  const onCopyAsNew = async () => {
    if (!detail) return;
    const baseCode = (code.trim() || detail.definition.code).replace(/_copy(_[a-z0-9]+)?$/i, '');
    const suggested = `${baseCode}_copy`;
    const newCode = window.prompt(
      'Copy thành quy trình mới (code riêng, không phải phiên bản của bản hiện tại). Nhập mã mới:',
      suggested,
    );
    if (newCode == null) return;
    const trimmed = newCode.trim();
    if (!trimmed) {
      showToast('Cần nhập mã quy trình mới.', 'error');
      return;
    }
    if (trimmed === detail.definition.code) {
      showToast('Mã mới phải khác mã hiện tại — nếu giữ cùng code sẽ thành phiên bản (Bản cũ).', 'error');
      return;
    }
    const baseName = name.trim() || detail.definition.name;
    const newName = baseName.endsWith('(bản sao)') ? baseName : `${baseName} (bản sao)`;
    setBusy(true);
    try {
      const body = buildSaveBody();
      const d = await approvalApi.createDefinition({
        ...body,
        id: null,
        code: trimmed,
        name: newName,
      });
      showToast(`Đã copy → ${trimmed} (draft mới).`, 'success');
      window.location.assign(`/admin/approval/${d.definition.id}`);
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Copy thất bại.', 'error');
      setBusy(false);
    }
  };

  const currentGraph = (): ApprovalGraph => ({ nodes, edges, assignees });

  const applyGraph = (graph: ApprovalGraph, selectedNodeKey?: string, relayout = true) => {
    const nextLayout = relayout
      ? autoLayoutApprovalGraph(graph.nodes, graph.edges)
      : mergeLayoutWithAuto(graph.nodes, graph.edges, layout);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setAssignees(graph.assignees);
    setLayout(nextLayout);
    setSelection(selectedNodeKey ? { kind: 'node', node_key: selectedNodeKey } : null);
    queueMicrotask(() => {
      historyRef.current.push({
        nodes: graph.nodes,
        edges: graph.edges,
        assignees: graph.assignees,
        layout: nextLayout,
      });
      setHistTick((n) => n + 1);
    });
  };

  const onInsertStep = (edgeIndex: number, type: 'approve' | 'condition') => {
    try {
      const result = insertStepOnEdge(currentGraph(), edgeIndex, type);
      applyGraph(result, result.selectedNodeKey, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không thể chèn bước.', 'error');
    }
  };

  const onAddBranch = (conditionNodeKey: string) => {
    try {
      const result = addConditionBranch(currentGraph(), conditionNodeKey);
      applyGraph(result, result.selectedNodeKey, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không thể thêm nhánh.', 'error');
    }
  };

  const onDeleteStep = (nodeKey: string) => {
    try {
      applyGraph(deleteApprovalStep(currentGraph(), nodeKey), undefined, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không thể xóa bước.', 'error');
    }
  };

  const onAutoLayout = () => {
    if (readOnly) return;
    const next = autoLayoutApprovalGraph(nodes, edges);
    setLayout(next);
    queueMicrotask(() => {
      historyRef.current.push({ nodes, edges, assignees, layout: next });
      setHistTick((n) => n + 1);
    });
  };

  const onLayoutChange = (next: GraphLayout) => {
    setLayout(next);
    queueMicrotask(() => {
      historyRef.current.push({ nodes, edges, assignees, layout: next });
      setHistTick((n) => n + 1);
    });
  };

  const onChangeNode = (nodeKey: string, patch: Partial<WfNodeRow>) => {
    if (readOnly) return;
    const nextNodes = nodes.map((n) => (n.node_key === nodeKey ? { ...n, ...patch } : n));
    setNodes(nextNodes);
    queueMicrotask(() => {
      historyRef.current.push({ nodes: nextNodes, edges, assignees, layout });
      setHistTick((n) => n + 1);
    });
  };

  const onChangeEdge = (index: number, patch: Partial<WfEdgeRow>) => {
    if (readOnly) return;
    const nextEdges = edges.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setEdges(nextEdges);
    queueMicrotask(() => {
      historyRef.current.push({ nodes, edges: nextEdges, assignees, layout });
      setHistTick((n) => n + 1);
    });
  };

  const onChangeAssignee = (nodeKey: string, resolve_type: string, resolve_value: string) => {
    if (readOnly) return;
    const nextAssignees = [
      ...assignees.filter((a) => a.node_key !== nodeKey),
      { node_key: nodeKey, resolve_type, resolve_value },
    ];
    setAssignees(nextAssignees);
    queueMicrotask(() => {
      historyRef.current.push({ nodes, edges, assignees: nextAssignees, layout });
      setHistTick((n) => n + 1);
    });
  };

  const statusBadge = useMemo(() => {
    if (!detail) return '';
    return `${detail.definition.status} · v${detail.definition.version}`;
  }, [detail]);

  const canUndo = histTick >= 0 && historyRef.current.canUndo();
  const canRedo = histTick >= 0 && historyRef.current.canRedo();

  if (!jwt) return null;

  return (
    <div className="approval-design">
      {toastNode}
      <header className="approval-design__bar row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/admin/approval">← List</Link>
          <strong>Approval Design</strong>
          <span className="muted">{statusBadge}</span>
        </div>
        <div className="row">
          {!readOnly && (
            <>
              <button
                type="button"
                className="secondary"
                disabled={!canUndo}
                onClick={() => {
                  const s = historyRef.current.undo();
                  if (s) applySnapshot(s);
                  else showToast('Không còn bước Undo.', 'info');
                }}
              >
                Undo
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!canRedo}
                onClick={() => {
                  const s = historyRef.current.redo();
                  if (s) applySnapshot(s);
                  else showToast('Không còn bước Redo.', 'info');
                }}
              >
                Redo
              </button>
              <button type="button" className="secondary" onClick={onAutoLayout}>
                Tự sắp xếp
              </button>
            </>
          )}
          <span className="muted">{user?.nickname || user?.email}</span>
          <button type="button" className="secondary" onClick={() => logout()}>
            Đăng xuất
          </button>
        </div>
      </header>

      {loadError && <div className="banner">{loadError}</div>}
      {readOnly && detail?.definition.status === 'published' && (
        <div className="banner">
          Đang xem bản published v{detail.definition.version}. Để sửa luồng: tạo phiên bản mới
          (copy toàn bộ graph), chỉnh sửa rồi Publish — bản published cũ sẽ được archive.
        </div>
      )}

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
              <div className="approval-builder-help">
                <strong>Cách thiết kế</strong>
                <ol>
                  <li>Bấm dấu + trên đường nối để thêm bước.</li>
                  <li>Kéo node để chỉnh vị trí; mũi tên đi theo.</li>
                  <li>Ctrl+S lưu · Ctrl+Z / Ctrl+Y Undo/Redo.</li>
                </ol>
              </div>
              {validationErrors.length > 0 && (
                <div className="approval-validation">
                  <strong>Cần hoàn thiện</strong>
                  <ul>
                    {validationErrors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                disabled={busy || validationErrors.length > 0}
                onClick={() => void onSave()}
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={busy || validationErrors.length > 0}
                onClick={() => void onPublish()}
              >
                Publish
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void onCopyAsNew()}>
                Copy thành quy trình mới
              </button>
            </>
          )}
          {readOnly && (
            <>
              <button type="button" disabled={busy} onClick={() => void onCloneDraft()}>
                Tạo phiên bản mới (v{(detail?.definition.version ?? 0) + 1})
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void onCopyAsNew()}>
                Copy thành quy trình mới
              </button>
            </>
          )}
        </aside>

        <main className="approval-design__main">
          <ApprovalCanvas
            nodes={nodes}
            edges={edges}
            layout={layout}
            selection={selection}
            readOnly={readOnly}
            highlightNodeKey={simHighlight.currentKey}
            doneNodeKeys={simHighlight.doneKeys}
            onSelect={setSelection}
            onInsertStep={onInsertStep}
            onLayoutChange={onLayoutChange}
          />
        </main>

        <aside className="approval-design__inspector">
          <ApprovalInspector
            selection={selection}
            nodes={nodes}
            edges={edges}
            assignees={assignees}
            readOnly={readOnly}
            onChangeNode={onChangeNode}
            onChangeEdge={onChangeEdge}
            onChangeAssignee={onChangeAssignee}
            onDeleteNode={onDeleteStep}
            onDeleteEdge={(index) => {
              try {
                applyGraph(removeConditionBranch(currentGraph(), index), undefined, true);
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'Không thể xóa nhánh.', 'error');
              }
            }}
            onAddBranch={onAddBranch}
          />
        </aside>
      </div>

      <ApprovalTestPanel
        definitionCode={code || detail?.definition.code || ''}
        assignees={assignees}
        nodes={nodes}
        onHighlightChange={setSimHighlight}
        onToast={showToast}
      />
    </div>
  );
}
