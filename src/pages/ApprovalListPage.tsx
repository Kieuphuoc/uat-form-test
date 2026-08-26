import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApprovalApiError, approvalApi } from '../api/approvalApi';
import { useAuth } from '../auth/AuthContext';
import type { WfDefinitionRow } from '../types/approval';

const EMPTY_START_GRAPH = JSON.stringify({
  layout: {
    start: { x: 80, y: 120 },
    end: { x: 360, y: 120 },
  },
});

export function ApprovalListPage() {
  const { jwt, status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<WfDefinitionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const rows = await approvalApi.listDefinitions();
      setItems(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Không tải danh sách.');
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
        name: (name.trim() || c),
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
      setError(e instanceof ApprovalApiError ? e.message : 'Tạo thất bại.');
    } finally {
      setBusy(false);
    }
  };

  if (!jwt) return null;

  return (
    <div className="shell wide stack">
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
      {error && <div className="banner">{error}</div>}

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
        {items.length === 0 && <p className="muted">Chưa có definition. Chạy seed SQL hoặc tạo mới.</p>}
        {items.map((d) => (
          <div key={d.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{d.name}</strong>
              <div className="muted">
                {d.code} · v{d.version} · {d.status} · #{d.id}
              </div>
            </div>
            <Link to={`/admin/approval/${d.id}`}>Design</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
