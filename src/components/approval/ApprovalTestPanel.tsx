import { useState } from 'react';
import { ApprovalApiError, approvalApi } from '../../api/approvalApi';
import { getJwtUserId, getJwt } from '../../api/client';
import type { WfInstanceDetail } from '../../types/approval';

type Props = {
  definitionCode: string;
};

export function ApprovalTestPanel({ definitionCode }: Props) {
  const [soNgay, setSoNgay] = useState(1);
  const [docId, setDocId] = useState(() => `test-${Date.now()}`);
  const [tpUser, setTpUser] = useState(() => {
    const jwt = getJwt();
    return jwt ? getJwtUserId(jwt) || 3 : 3;
  });
  const [gdUser, setGdUser] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WfInstanceDetail | null>(null);
  const [comment, setComment] = useState('');

  const runStart = async () => {
    if (!definitionCode.trim()) {
      setError('Thiếu definition code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await approvalApi.start({
        definition_code: definitionCode.trim(),
        source_system: 'form-web-test',
        source_doc_type: 'manual',
        source_doc_id: docId.trim() || `test-${Date.now()}`,
        actor_user_id: tpUser,
        payload: { so_ngay: soNgay },
        assignees: {
          truong_phong: tpUser,
          giam_doc: gdUser,
        },
      });
      setDetail(res);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Start thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!detail?.instance.id) return;
    setBusy(true);
    try {
      setDetail(await approvalApi.getInstance(detail.instance.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Refresh thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (taskId: number, action: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      const res = await approvalApi.decide(taskId, { action, comment: comment || null });
      setDetail(res);
    } catch (e) {
      setError(e instanceof ApprovalApiError ? e.message : 'Decide thất bại.');
    } finally {
      setBusy(false);
    }
  };

  const pending = detail?.tasks.filter((t) => t.status === 'pending') ?? [];

  return (
    <div className="approval-test card stack">
      <strong>Test Start / Decide</strong>
      <p className="muted" style={{ margin: 0 }}>
        Start dùng StaticToken; Decide dùng JWT (user phải khớp assignee).
      </p>
      {error && <div className="banner">{error}</div>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="field">
          so_ngay
          <input
            type="number"
            value={soNgay}
            onChange={(e) => setSoNgay(Number(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          source_doc_id
          <input value={docId} onChange={(e) => setDocId(e.target.value)} />
        </label>
        <label className="field">
          truong_phong user_id
          <input
            type="number"
            value={tpUser}
            onChange={(e) => setTpUser(Number(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          giam_doc user_id
          <input
            type="number"
            value={gdUser}
            onChange={(e) => setGdUser(Number(e.target.value) || 0)}
          />
        </label>
        <button type="button" disabled={busy || !definitionCode} onClick={() => void runStart()}>
          Start
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !detail}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => setDocId(`test-${Date.now()}`)}
        >
          Doc id mới
        </button>
      </div>

      {detail && (
        <div className="stack">
          <div className="muted">
            instance #{detail.instance.id} · {detail.instance.status} · node{' '}
            {detail.instance.current_node_key || '—'} · code {detail.instance.def_code}
          </div>
          <label className="field">
            comment (decide)
            <input value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {pending.length === 0 && (
            <p className="muted">Không còn task pending (hoặc đã completed/rejected).</p>
          )}
          {pending.map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                task #{t.id} · {t.node_key} · assignee {t.assignee_user_id}
              </span>
              <div className="row">
                <button type="button" disabled={busy} onClick={() => void decide(t.id, 'approve')}>
                  Approve
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void decide(t.id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {detail.decisions.length > 0 && (
            <div className="muted">
              Decisions:{' '}
              {detail.decisions
                .map((d) => `${d.action}@${d.task_id}`)
                .join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
