import { useMemo, useState } from 'react';
import { ApprovalApiError, approvalApi } from '../../api/approvalApi';
import { getJwt, getJwtUserId } from '../../api/client';
import type { WfAssigneeRow, WfInstanceDetail, WfNodeRow } from '../../types/approval';

type Props = {
  definitionCode: string;
  assignees: WfAssigneeRow[];
  nodes: WfNodeRow[];
  onHighlightChange: (highlight: {
    currentKey: string | null;
    doneKeys: string[];
  }) => void;
  onToast: (text: string, level?: 'info' | 'success' | 'error') => void;
};

function nodeTitle(nodes: WfNodeRow[], key: string | null | undefined): string {
  if (!key) return '—';
  const n = nodes.find((x) => x.node_key === key);
  if (!n) return key;
  if (n.node_type === 'start') return 'Bắt đầu';
  if (n.node_type === 'end') return 'Kết thúc';
  try {
    const c = n.config_json ? (JSON.parse(n.config_json) as { label?: string; field?: string }) : {};
    if (n.node_type === 'approve' && c.label) return c.label;
    if (n.node_type === 'condition' && c.field) return `Điều kiện: ${c.field}`;
  } catch {
    /* ignore */
  }
  return key;
}

export function ApprovalTestPanel({
  definitionCode,
  assignees,
  nodes,
  onHighlightChange,
  onToast,
}: Props) {
  const me = useMemo(() => {
    const jwt = getJwt();
    return jwt ? getJwtUserId(jwt) || 0 : 0;
  }, []);

  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<WfInstanceDetail | null>(null);
  const [comment, setComment] = useState('');

  const roleAssignees = useMemo(() => {
    const map: Record<string, number> = {};
    const uid = me > 0 ? me : 3;
    for (const a of assignees) {
      if (a.resolve_type === 'role' && a.resolve_value) {
        map[a.resolve_value] = uid;
      }
    }
    if (!map.truong_phong) map.truong_phong = uid;
    if (!map.giam_doc) map.giam_doc = uid;
    return map;
  }, [assignees, me]);

  const applyHighlight = (inst: WfInstanceDetail | null) => {
    if (!inst) {
      onHighlightChange({ currentKey: null, doneKeys: [] });
      return;
    }
    const done = inst.tasks.filter((t) => t.status === 'done').map((t) => t.node_key);
    const pending = inst.tasks.find((t) => t.status === 'pending');
    const current =
      pending?.node_key
      ?? (inst.instance.status === 'completed' || inst.instance.status === 'rejected'
        ? inst.instance.current_node_key
        : inst.instance.current_node_key);
    onHighlightChange({ currentKey: current ?? null, doneKeys: done });
  };

  const runScenario = async (soNgay: number, label: string) => {
    if (!definitionCode.trim()) {
      onToast('Thiếu mã luồng (code).', 'error');
      return;
    }
    if (me <= 0) {
      onToast('Chưa đăng nhập — không gán được người duyệt.', 'error');
      return;
    }
    setBusy(true);
    try {
      const docId = `sim-${soNgay}-${Date.now()}`;
      const res = await approvalApi.start({
        definition_code: definitionCode.trim(),
        source_system: 'form-web-sim',
        source_doc_type: 'scenario',
        source_doc_id: docId,
        actor_user_id: me,
        payload: { so_ngay: soNgay },
        assignees: roleAssignees,
      });
      setDetail(res);
      applyHighlight(res);
      onToast(`Đã chạy “${label}” · instance #${res.instance.id}`, 'success');
    } catch (e) {
      onToast(e instanceof ApprovalApiError ? e.message : 'Start thất bại.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (taskId: number, action: 'approve' | 'reject') => {
    setBusy(true);
    try {
      const res = await approvalApi.decide(taskId, { action, comment: comment || null });
      setDetail(res);
      applyHighlight(res);
      onToast(
        action === 'approve' ? 'Đã duyệt — chuyển bước tiếp theo.' : 'Đã từ chối phiên duyệt.',
        action === 'approve' ? 'success' : 'info',
      );
    } catch (e) {
      onToast(e instanceof ApprovalApiError ? e.message : 'Decide thất bại.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const myPending =
    detail?.tasks.filter((t) => t.status === 'pending' && t.assignee_user_id === me) ?? [];
  const otherPending =
    detail?.tasks.filter((t) => t.status === 'pending' && t.assignee_user_id !== me) ?? [];

  return (
    <div className="approval-sim card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Mô phỏng duyệt</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          Người duyệt test = bạn (user {me || '—'})
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chọn kịch bản → bước hiện tại sáng trên sơ đồ → Duyệt / Từ chối.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          disabled={busy || !definitionCode}
          onClick={() => void runScenario(1, '≤ 1 ngày')}
        >
          Thử ≤ 1 ngày
        </button>
        <button
          type="button"
          disabled={busy || !definitionCode}
          onClick={() => void runScenario(3, '> 1 ngày')}
        >
          Thử &gt; 1 ngày
        </button>
        {detail && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setDetail(null);
              applyHighlight(null);
            }}
          >
            Xóa mô phỏng
          </button>
        )}
      </div>

      {detail && (
        <div className="approval-sim__body">
          <div className="approval-sim__status">
            Phiên #{detail.instance.id} ·{' '}
            <strong>{detail.instance.status}</strong> · đang ở{' '}
            <strong>{nodeTitle(nodes, detail.instance.current_node_key)}</strong>
          </div>

          <ol className="approval-sim__timeline">
            <li className="is-done">Đã gửi duyệt (so_ngay trong payload)</li>
            {detail.decisions.map((d) => {
              const task = detail.tasks.find((t) => t.id === d.task_id);
              return (
                <li key={d.id} className="is-done">
                  {d.action === 'approve' ? 'Duyệt' : d.action === 'reject' ? 'Từ chối' : d.action}{' '}
                  · {nodeTitle(nodes, task?.node_key)}
                  {d.comment ? ` — ${d.comment}` : ''}
                </li>
              );
            })}
            {detail.tasks
              .filter((t) => t.status === 'pending')
              .map((t) => (
                <li key={t.id} className="is-current">
                  Đang chờ · {nodeTitle(nodes, t.node_key)} (user {t.assignee_user_id})
                </li>
              ))}
            {detail.instance.status === 'completed' && (
              <li className="is-done">Hoàn tất</li>
            )}
            {detail.instance.status === 'rejected' && (
              <li className="is-error">Đã từ chối</li>
            )}
          </ol>

          {myPending.length > 0 && (
            <div className="stack">
              <label className="field">
                Ghi chú (tuỳ chọn)
                <input value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              {myPending.map((t) => (
                <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>Bạn cần xử lý: {nodeTitle(nodes, t.node_key)}</span>
                  <div className="row">
                    <button type="button" disabled={busy} onClick={() => void decide(t.id, 'approve')}>
                      Duyệt
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void decide(t.id, 'reject')}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {otherPending.length > 0 && myPending.length === 0 && (
            <p className="muted">
              Task đang chờ user khác ({otherPending.map((t) => t.assignee_user_id).join(', ')}).
              Scenario mặc định gán tất cả role cho bạn — hãy chạy lại kịch bản.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
