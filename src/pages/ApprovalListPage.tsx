import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApprovalApiError, approvalApi } from '../api/approvalApi';
import { useAuth } from '../auth/AuthContext';
import { useApprovalToast } from '../hooks/useApprovalToast';
import type { WfDefinitionRow } from '../types/approval';

const EMPTY_START_GRAPH = JSON.stringify({
  layout: {
    start: { x: 80, y: 120 },
    end: { x: 360, y: 120 },
  },
});

type CodeGroup = {
  code: string;
  primary: WfDefinitionRow;
  older: WfDefinitionRow[];
};

function groupByCode(items: WfDefinitionRow[]): CodeGroup[] {
  const map = new Map<string, WfDefinitionRow[]>();
  for (const row of items) {
    const list = map.get(row.code) ?? [];
    list.push(row);
    map.set(row.code, list);
  }
  const groups: CodeGroup[] = [];
  for (const [code, rows] of map) {
    const sorted = [...rows].sort((a, b) => b.version - a.version || b.id - a.id);
    groups.push({
      code,
      primary: sorted[0],
      older: sorted.slice(1),
    });
  }
  return groups.sort((a, b) => a.code.localeCompare(b.code));
}

export function ApprovalListPage() {
  const { jwt, status, user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast, toastNode } = useApprovalToast();
  const [items, setItems] = useState<WfDefinitionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawerCode, setDrawerCode] = useState<string | null>(null);

  const groups = useMemo(() => groupByCode(items), [items]);
  const drawerGroup = groups.find((g) => g.code === drawerCode) ?? null;

  const reload = async () => {
    try {
      const rows = await approvalApi.listDefinitions();
      setItems(rows);
      setLoadError(null);
    } catch (e) {
      const msg =
        e instanceof ApprovalApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Không tải danh sách.';
      setLoadError(msg === 'Failed to fetch' ? 'Không kết nối Approval.Api (kiểm tra :5410).' : msg);
    }
  };

  useEffect(() => {
    if (status !== 'ready' || !jwt) return;
    void reload();
  }, [status, jwt]);

  const onCreate = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    try {
      const detail = await approvalApi.createDefinition({
        code: c,
        name: name.trim() || c,
        graph_json: EMPTY_START_GRAPH,
        nodes: [
          { node_key: 'start', node_type: 'start', config_json: '{}', sort_order: 0 },
          { node_key: 'end', node_type: 'end', config_json: '{}', sort_order: 1 },
        ],
        edges: [{ from_node_key: 'start', to_node_key: 'end', sort_order: 0, condition_json: null }],
        assignees: [],
      });
      navigate(`/admin/approval/${detail.definition.id}`);
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Tạo thất bại.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (d: WfDefinitionRow) => {
    if (d.status !== 'draft') return;
    if (!window.confirm(`Xóa draft “${d.name}” (v${d.version}, #${d.id})? Không hoàn tác được.`)) {
      return;
    }
    setBusy(true);
    try {
      await approvalApi.deleteDefinition(d.id);
      showToast('Đã xóa draft.', 'success');
      await reload();
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Xóa thất bại.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onCloneVersion = async (d: WfDefinitionRow) => {
    if (
      !window.confirm(
        `Tạo phiên bản mới từ “${d.name}” v${d.version}? Graph sẽ được copy sang draft mới.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const full = await approvalApi.getDefinition(d.id);
      const created = await approvalApi.createDefinition({
        id: null,
        code: full.definition.code,
        name: full.definition.name,
        graph_json: full.definition.graph_json,
        nodes: full.nodes.map((n, i) => ({
          node_key: n.node_key,
          node_type: n.node_type,
          config_json: n.config_json ?? '{}',
          sort_order: n.sort_order ?? i,
        })),
        edges: full.edges.map((e, i) => ({
          from_node_key: e.from_node_key,
          to_node_key: e.to_node_key,
          sort_order: e.sort_order ?? i,
          condition_json: e.condition_json ?? null,
        })),
        assignees: full.assignees.map((a) => ({
          node_key: a.node_key,
          resolve_type: a.resolve_type,
          resolve_value: a.resolve_value,
        })),
      });
      navigate(`/admin/approval/${created.definition.id}`);
    } catch (e) {
      showToast(e instanceof ApprovalApiError ? e.message : 'Tạo phiên bản mới thất bại.', 'error');
      setBusy(false);
    }
  };

  if (!jwt) return null;

  return (
    <div className="shell wide stack">
      {toastNode}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Approval Hub</h1>
        <div className="row">
          <span className="muted">{user?.nickname || user?.email || 'admin'}</span>
          <button type="button" className="secondary" onClick={() => logout()}>
            Đăng xuất
          </button>
          <Link to="/admin">Form Admin</Link>
          <Link to="/">Home</Link>
        </div>
      </div>
      {loadError && <div className="banner">{loadError}</div>}

      <div className="card stack">
        <strong>Tạo luồng draft</strong>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="leave_request"
            />
          </label>
          <label className="field" style={{ flex: 2 }}>
            name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Duyệt nghỉ phép"
            />
          </label>
          <button type="button" disabled={busy || !code.trim()} onClick={() => void onCreate()}>
            Tạo
          </button>
        </div>
      </div>

      <div className="card stack">
        {groups.length === 0 && <p className="muted">Chưa có definition. Chạy seed SQL hoặc tạo mới.</p>}
        {groups.map(({ code: groupCode, primary: d, older }) => (
          <div key={groupCode} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>{d.name}</strong>
              <div className="muted">
                {d.code} · v{d.version} ·{' '}
                <span className={`approval-status approval-status--${d.status}`}>{d.status}</span> ·
                #{d.id}
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {d.status === 'draft' && (
                <>
                  <Link to={`/admin/approval/${d.id}`}>Sửa</Link>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void onDelete(d)}
                  >
                    Xóa
                  </button>
                </>
              )}
              {d.status === 'published' && (
                <>
                  <Link to={`/admin/approval/${d.id}`}>Xem</Link>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void onCloneVersion(d)}
                  >
                    Tạo phiên bản mới
                  </button>
                </>
              )}
              {d.status === 'archived' && <Link to={`/admin/approval/${d.id}`}>Xem</Link>}
              {older.length > 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDrawerCode(groupCode)}
                >
                  Bản cũ ({older.length})
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {drawerGroup && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setDrawerCode(null)}
        >
          <div
            className="modal approval-versions-drawer"
            role="dialog"
            aria-labelledby="approval-versions-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong id="approval-versions-title">Bản cũ · {drawerGroup.code}</strong>
              <button type="button" className="secondary" onClick={() => setDrawerCode(null)}>
                Đóng
              </button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Bản hiện tại trên list: v{drawerGroup.primary.version} ({drawerGroup.primary.status})
            </p>
            <div className="stack">
              {drawerGroup.older.map((d) => (
                <div
                  key={d.id}
                  className="row"
                  style={{ justifyContent: 'space-between', gap: 12 }}
                >
                  <div className="muted">
                    v{d.version} ·{' '}
                    <span className={`approval-status approval-status--${d.status}`}>
                      {d.status}
                    </span>{' '}
                    · #{d.id}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <Link to={`/admin/approval/${d.id}`} onClick={() => setDrawerCode(null)}>
                      Xem
                    </Link>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void onCloneVersion(d)}
                    >
                      Tạo phiên bản mới
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
