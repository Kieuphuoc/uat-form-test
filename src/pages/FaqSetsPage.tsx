import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  chatApi,
  type ChatMe,
  type ChatUser,
  type FaqApprover,
  type FaqItem,
  type FaqSet,
} from '../api/chatApi';
import { fetchAuthUnits, type AuthUnit } from '../api/dataSelectionApi';
import { ChatConfirmDialog } from '../components/chat/ChatConfirmDialog';
import { FaqMarkdownViewer } from '../components/chat/FaqMarkdownViewer';
import { FaqEmbedEditorOverlay } from '../components/chat/FaqEmbedEditorOverlay';
import {
  IconBack,
  IconBook,
  IconCheck,
  IconClose,
  IconEdit,
  IconImage,
  IconPlus,
  IconSettings,
  IconTrash,
} from '../components/AppIcons';
import { navigateChat } from '../lib/chatNav';

type ShellContext = {
  me: ChatMe | null;
  setMe?: Dispatch<SetStateAction<ChatMe | null>>;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

const NO_MATCH_LABEL: Record<string, string> = {
  silent: 'Im lặng',
  fixed_text: 'Câu cố định',
  transfer: 'Chuyển nhân viên',
  fallback_rag: 'Fallback RAG',
};

/** Số ký tự tối thiểu trước khi gọi API tìm công ty / user. */
const FAQ_SEARCH_MIN_CHARS = 2;
/** Chờ sau lần gõ cuối trước khi gọi API (ms). */
const FAQ_SEARCH_DEBOUNCE_MS = 300;

function statusClass(status: string) {
  return `faq-status faq-status--${status || 'draft'}`;
}

function clip(value: string, max = 120) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function FaqSetsPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const { setId: setIdParam } = useParams<{ setId?: string }>();
  const setId = setIdParam ? Number(setIdParam) : 0;
  const canOpen = !!me?.can_review_faq || !!me?.can_manage_faq_sets;
  const canCreate = !!me?.can_manage_faq_sets;
  const unitId = me?.unit_id ?? 0;
  const [sets, setSets] = useState<FaqSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSets(await chatApi.listFaqSets());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được bộ FAQ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canOpen) return;
    void loadSets();
  }, [canOpen, loadSets, unitId]);

  if (me && !canOpen) return <Navigate to="/chat" replace />;

  const createSet = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      await chatApi.createFaqSet({ code: code.trim(), name: name.trim() });
      setCode('');
      setName('');
      setCreateOpen(false);
      await loadSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được bộ FAQ.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setBusy(true);
    setError(null);
    try {
      await chatApi.deleteFaqSet(deleteId);
      setDeleteId(null);
      await loadSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được bộ FAQ.');
    } finally {
      setBusy(false);
    }
  };

  if (setId > 0) {
    return (
      <FaqSetDetailPage
        setId={setId}
        me={me}
        onBack={() => navigateChat(navigate, '/chat/faq')}
        onDeleted={() => navigateChat(navigate, '/chat/faq')}
      />
    );
  }

  return (
    <div className="chat-page-card faq-page">
      <header className="chat-page-card-head">
        <div>
          <h2>Bộ FAQ</h2>
        </div>
        {canCreate && unitId > 0 ? (
          <button
            type="button"
            className="chat-icon-btn chat-page-card-head-action"
            title="Thêm bộ FAQ"
            onClick={() => {
              setError(null);
              setCreateOpen(true);
            }}
          >
            <IconPlus size={18} />
          </button>
        ) : null}
      </header>

      {error && !createOpen && <div className="chat-error">{error}</div>}
      {unitId <= 0 && <p className="chat-hint">Chọn công ty trước khi quản lý bộ FAQ.</p>}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : sets.length === 0 ? (
        <p className="muted">Chưa có bộ FAQ cho công ty này.</p>
      ) : (
        <ul className="faq-set-list">
          {sets.map((set) => (
            <li key={set.id}>
              <button
                type="button"
                className="faq-set-row"
                onClick={() => navigateChat(navigate, `/chat/faq/${set.id}`)}
              >
                <IconBook size={18} />
                <span>
                  <strong>{set.code}</strong>
                  <em>{set.name}</em>
                  <small>
                    {set.approved_count} đã duyệt · {set.pending_count} chờ · {set.item_count} mục
                  </small>
                </span>
              </button>
              {set.can_manage ? (
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Xóa bộ FAQ"
                  onClick={() => setDeleteId(set.id)}
                >
                  <IconTrash size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <FaqFormDialog
          title="Thêm bộ FAQ"
          busy={busy}
          error={error}
          okDisabled={!code.trim() || !name.trim()}
          onCancel={() => {
            setCreateOpen(false);
            setError(null);
          }}
          onOk={() => void createSet()}
        >
          <label className="chat-settings-field">
            <span>Mã bộ</span>
            <input
              autoFocus
              value={code}
              maxLength={64}
              placeholder="CSKH-2"
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="chat-settings-field">
            <span>Tên</span>
            <input
              value={name}
              maxLength={200}
              placeholder="Chăm sóc khách hàng"
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </FaqFormDialog>
      )}

      <ChatConfirmDialog
        open={deleteId != null}
        title="Xóa bộ FAQ?"
        message="Sẽ xóa SQL, folder File.Api và AI FAQ (nếu có). Không đụng folder CSKH đang dùng."
        confirmLabel={busy ? 'Đang xóa…' : 'Xóa'}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function FaqSetDetailPage({
  setId,
  me,
  onBack,
  onDeleted,
}: {
  setId: number;
  me: ChatMe | null;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const canAssign = !!me?.is_admin || !!me?.is_admin_unit;
  const [set, setSet] = useState<FaqSet | null>(null);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [approvers, setApprovers] = useState<FaqApprover[]>([]);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<FaqItem | 'new' | null>(null);
  const [viewer, setViewer] = useState<FaqItem | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteSetOpen, setDeleteSetOpen] = useState(false);
  const [embedEditorOpen, setEmbedEditorOpen] = useState(false);
  const [directory, setDirectory] = useState<ChatUser[]>([]);
  const [dirQuery, setDirQuery] = useState('');
  const [authUnits, setAuthUnits] = useState<AuthUnit[]>([]);
  const [unitQuery, setUnitQuery] = useState('');
  const [unitSearchLoading, setUnitSearchLoading] = useState(false);
  const [dirSearchLoading, setDirSearchLoading] = useState(false);
  const [knownUnits, setKnownUnits] = useState<Record<number, AuthUnit>>({});

  const canReview = !!set?.can_review;
  const canConfig = !!set?.can_manage || !!me?.is_admin_unit;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSet, list] = await Promise.all([
        chatApi.getFaqSet(setId),
        chatApi.listFaqItems(setId, pendingOnly ? 'pending' : undefined),
      ]);
      setSet(nextSet);
      setItems(list.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được bộ FAQ.');
    }
  }, [pendingOnly, setId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!settingsOpen) {
      setUnitQuery('');
      setDirQuery('');
      setAuthUnits([]);
      setDirectory([]);
      setKnownUnits({});
      return;
    }
    void chatApi
      .listFaqApprovers(setId)
      .then(setApprovers)
      .catch(() => setApprovers([]));
  }, [setId, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !me?.is_admin) return;

    const q = unitQuery.trim();
    if (q.length < FAQ_SEARCH_MIN_CHARS) {
      setAuthUnits([]);
      setUnitSearchLoading(false);
      return;
    }

    setUnitSearchLoading(true);
    const timer = window.setTimeout(() => {
      void fetchAuthUnits(q)
        .then((res) => {
          const items = res.success && res.data ? res.data : [];
          setAuthUnits(items);
          if (items.length > 0) {
            setKnownUnits((prev) => {
              const next = { ...prev };
              for (const unit of items) next[unit.unitId] = unit;
              return next;
            });
          }
        })
        .catch(() => setAuthUnits([]))
        .finally(() => setUnitSearchLoading(false));
    }, FAQ_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      setUnitSearchLoading(false);
    };
  }, [me?.is_admin, settingsOpen, unitQuery]);

  useEffect(() => {
    if (!settingsOpen || !canAssign) return;

    const q = dirQuery.trim();
    if (q.length < FAQ_SEARCH_MIN_CHARS) {
      setDirectory([]);
      setDirSearchLoading(false);
      return;
    }

    setDirSearchLoading(true);
    const timer = window.setTimeout(() => {
      void chatApi
        .companyDirectory(q, 1, 20)
        .then((page) => setDirectory(page.items ?? []))
        .catch(() => setDirectory([]))
        .finally(() => setDirSearchLoading(false));
    }, FAQ_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      setDirSearchLoading(false);
    };
  }, [canAssign, dirQuery, settingsOpen]);

  const openNew = () => {
    setEditor('new');
    setQuestion('');
    setAnswer('');
    setError(null);
  };

  const openEdit = (item: FaqItem) => {
    setEditor(item);
    setQuestion(item.question);
    setAnswer(item.answer_md);
    setError(null);
  };

  const saveItem = async (nextStatus?: 'pending' | 'approved') => {
    if (!canReview) return;
    setBusy(true);
    setError(null);
    try {
      let saved: FaqItem;
      if (editor && editor !== 'new') {
        saved = await chatApi.updateFaqItem(setId, editor.id, { question, answer_md: answer });
      } else {
        saved = await chatApi.createFaqItem(setId, { question, answer_md: answer });
      }
      if (nextStatus === 'pending') saved = await chatApi.submitFaqItem(setId, saved.id);
      if (nextStatus === 'approved') saved = await chatApi.approveFaqItem(setId, saved.id);
      setEditor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được mục FAQ.');
    } finally {
      setBusy(false);
    }
  };

  const runStatus = async (itemId: number, action: 'approve' | 'reject') => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'approve') await chatApi.approveFaqItem(setId, itemId);
      else await chatApi.rejectFaqItem(setId, itemId);
      if (editor && editor !== 'new' && editor.id === itemId) setEditor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không cập nhật được mục FAQ.');
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const uploaded = await chatApi.uploadFaqFile(setId, file);
      const snippet = `![${uploaded.file_name}](faq-file:${uploaded.file_id})`;
      setAnswer((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không upload được ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    if (!set || !canConfig) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await chatApi.updateFaqSet(setId, {
        name: set.name,
        min_score: set.min_score,
        suggest_score: set.suggest_score,
        auto_score: set.auto_score,
        reply_mode: set.reply_mode,
        no_match_action: set.no_match_action,
        no_match_text: set.no_match_text ?? '',
        unit_ids: set.unit_ids,
      });
      setSet(saved);
      setSettingsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được cấu hình.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page-card faq-page">
      <header className="chat-page-card-head">
        <button type="button" className="chat-icon-btn" title="Danh sách bộ FAQ" onClick={onBack}>
          <IconBack size={18} />
        </button>
        <div className="faq-title">
          <h2>
            {set?.code || '…'} — {set?.name || ''}
          </h2>
          {canConfig ? (
            <button
              type="button"
              className="chat-icon-btn"
              title="Cấu hình bộ FAQ"
              onClick={() => {
                setError(null);
                setSettingsOpen(true);
              }}
            >
              <IconSettings size={18} />
            </button>
          ) : null}
        </div>
        {canReview ? (
          <button
            type="button"
            className="chat-icon-btn chat-page-card-head-action"
            title="Thêm câu hỏi"
            onClick={openNew}
          >
            <IconPlus size={18} />
          </button>
        ) : null}
      </header>

      {error && !editor && !settingsOpen && <div className="chat-error">{error}</div>}

      {canReview ? (
        <label className={`faq-filter${pendingOnly ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Lọc chờ duyệt
        </label>
      ) : null}

      {items.length === 0 ? (
        <p className="muted">{pendingOnly ? 'Không có mục chờ duyệt.' : 'Chưa có câu hỏi.'}</p>
      ) : (
        <div className="faq-table-wrap">
          <table className="faq-table">
            <thead>
              <tr>
                <th>Câu hỏi</th>
                <th>Câu trả lời</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.question}</td>
                  <td>
                    <button
                      type="button"
                      className="faq-table-answer"
                      title="Xem markdown"
                      onClick={() => setViewer(item)}
                    >
                      {clip(item.answer_md, 160) || '—'}
                    </button>
                  </td>
                  <td>
                    <span className={statusClass(item.status)}>
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </td>
                  <td className="faq-table-actions">
                    {canReview && item.status === 'pending' ? (
                      <button
                        type="button"
                        className="chat-icon-btn"
                        title="Duyệt"
                        disabled={busy}
                        onClick={() => void runStatus(item.id, 'approve')}
                      >
                        <IconCheck size={16} />
                      </button>
                    ) : null}
                    {canReview ? (
                      <button
                        type="button"
                        className="chat-icon-btn"
                        title="Sửa"
                        onClick={() => openEdit(item)}
                      >
                        <IconEdit size={16} />
                      </button>
                    ) : null}
                    {canReview ? (
                      <button
                        type="button"
                        className="chat-icon-btn"
                        title="Xóa"
                        onClick={() => setDeleteItemId(item.id)}
                      >
                        <IconTrash size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewer && !editor ? (
        <FaqMarkdownViewer
          setId={setId}
          item={viewer}
          canEdit={canReview}
          onClose={() => setViewer(null)}
          onEdit={() => {
            openEdit(viewer);
            setViewer(null);
          }}
        />
      ) : null}

      {editor && (
        <FaqFormDialog
          title={editor === 'new' ? 'Thêm câu hỏi' : 'Sửa câu hỏi'}
          busy={busy}
          wide
          error={error}
          okDisabled={!question.trim()}
          okLabel="Lưu"
          extraActions={
            canReview ? (
              <>
                {editor !== 'new' && editor.status !== 'pending' && editor.status !== 'approved' ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || !question.trim()}
                    onClick={() => void saveItem('pending')}
                  >
                    Gửi duyệt
                  </button>
                ) : null}
                {editor !== 'new' && editor.status !== 'approved' ? (
                  <button
                    type="button"
                    disabled={busy || !question.trim()}
                    onClick={() => void saveItem('approved')}
                  >
                    Duyệt
                  </button>
                ) : null}
              </>
            ) : null
          }
          onCancel={() => setEditor(null)}
          onOk={() => void saveItem()}
        >
          <label className="chat-settings-field">
            <span>Câu hỏi</span>
            <input
              autoFocus
              value={question}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <label className="chat-settings-field">
            <span className="faq-answer-label">
              Câu trả lời (Markdown: ##, **…)
              <button
                type="button"
                className="chat-icon-btn faq-embed-editor-btn"
                title="Soạn bằng BlockNote (Portal)"
                disabled={busy || !set?.folder_id}
                onClick={() => setEmbedEditorOpen(true)}
              >
                <IconBook size={16} />
              </button>
            </span>
            <textarea
              rows={10}
              value={answer}
              disabled={busy}
              placeholder={'## Tiêu đề\n**đậm** nội dung…'}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </label>
          <label className="secondary faq-file-btn">
            <IconImage size={14} />
            Ảnh
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void uploadImage(file);
              }}
            />
          </label>
        </FaqFormDialog>
      )}

      {embedEditorOpen && set?.folder_id ? (
        <FaqEmbedEditorOverlay
          open={embedEditorOpen}
          folderId={set.folder_id}
          title={question}
          content={answer}
          onApply={(markdown) => setAnswer(markdown)}
          onClose={() => setEmbedEditorOpen(false)}
        />
      ) : null}

      {settingsOpen && set && (
        <FaqFormDialog
          title="Cấu hình bộ FAQ"
          busy={busy}
          wide
          error={error}
          okLabel="Ok"
          extraActions={
            <>
              {set.can_sync ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void chatApi
                      .syncFaqSet(setId)
                      .then(() => load())
                      .catch((e: unknown) =>
                        setError(e instanceof Error ? e.message : 'Không đồng bộ được.'),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Đồng bộ
                </button>
              ) : null}
              {set.can_manage ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDeleteSetOpen(true)}
                >
                  Xóa bộ
                </button>
              ) : null}
            </>
          }
          onCancel={() => setSettingsOpen(false)}
          onOk={() => void saveConfig()}
        >
          <div className="faq-config-grid">
            <label className="chat-settings-field">
              <span>min_score</span>
              <input
                type="number"
                step="0.01"
                min={0.1}
                max={1}
                value={set.min_score}
                onChange={(e) => setSet({ ...set, min_score: Number(e.target.value) })}
              />
            </label>
            <label className="chat-settings-field">
              <span>suggest_score</span>
              <input
                type="number"
                step="0.01"
                min={0.1}
                max={1}
                value={set.suggest_score}
                onChange={(e) => setSet({ ...set, suggest_score: Number(e.target.value) })}
              />
            </label>
            <label className="chat-settings-field">
              <span>auto_score</span>
              <input
                type="number"
                step="0.01"
                min={0.1}
                max={1}
                value={set.auto_score}
                onChange={(e) => setSet({ ...set, auto_score: Number(e.target.value) })}
              />
            </label>
            <label className="chat-settings-field">
              <span>Khi không khớp</span>
              <select
                value={set.no_match_action}
                onChange={(e) => setSet({ ...set, no_match_action: e.target.value })}
              >
                {Object.entries(NO_MATCH_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="chat-settings-field faq-config-wide">
              <span>Câu cố định (nếu chọn)</span>
              <input
                value={set.no_match_text ?? ''}
                onChange={(e) => setSet({ ...set, no_match_text: e.target.value })}
              />
            </label>
          </div>
          {set.can_manage ? (
            <div className="faq-approver-box">
              <strong>Công ty (unit)</strong>
              <p className="muted">Chọn một hoặc nhiều công ty được dùng bộ FAQ này.</p>
              {(set.unit_ids ?? []).length > 0 ? (
                <ul className="faq-dir-list faq-selected-list">
                  {(set.unit_ids ?? []).map((unitId) => {
                    const unit = knownUnits[unitId];
                    const label = unit
                      ? `${unit.maUnit} — ${unit.tenUnit}`
                      : `Công ty #${unitId}`;
                    return (
                      <li key={unitId}>
                        <label className="faq-filter">
                          <input
                            type="checkbox"
                            checked
                            onChange={() => {
                              const current = new Set(set.unit_ids ?? []);
                              current.delete(unitId);
                              setSet({ ...set, unit_ids: [...current] });
                            }}
                          />
                          {label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <input
                className="faq-dir-search"
                placeholder={`Tìm công ty (≥${FAQ_SEARCH_MIN_CHARS} ký tự)…`}
                value={unitQuery}
                onChange={(e) => setUnitQuery(e.target.value)}
              />
              {unitQuery.trim().length > 0 && unitQuery.trim().length < FAQ_SEARCH_MIN_CHARS ? (
                <p className="chat-hint">
                  Nhập thêm {FAQ_SEARCH_MIN_CHARS - unitQuery.trim().length} ký tự để tìm.
                </p>
              ) : unitSearchLoading ? (
                <p className="chat-hint">Đang tìm…</p>
              ) : unitQuery.trim().length >= FAQ_SEARCH_MIN_CHARS && authUnits.length === 0 ? (
                <p className="chat-hint">Không có công ty phù hợp.</p>
              ) : unitQuery.trim().length >= FAQ_SEARCH_MIN_CHARS ? (
                <ul className="faq-dir-list">
                  {authUnits
                    .filter((unit) => !(set.unit_ids ?? []).includes(unit.unitId))
                    .map((unit) => (
                      <li key={unit.unitId}>
                        <label className="faq-filter">
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={(e) => {
                              if (!e.target.checked) return;
                              setKnownUnits((prev) => ({ ...prev, [unit.unitId]: unit }));
                              const current = new Set(set.unit_ids ?? []);
                              current.add(unit.unitId);
                              setSet({ ...set, unit_ids: [...current] });
                            }}
                          />
                          {unit.maUnit} — {unit.tenUnit}
                        </label>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="chat-hint">
                  Gõ ít nhất {FAQ_SEARCH_MIN_CHARS} ký tự để hiện danh sách công ty.
                </p>
              )}
            </div>
          ) : null}
          {canAssign ? (
            <div className="faq-approver-box">
              <strong>Người được gán duyệt</strong>
              <p className="muted">Admin unit luôn duyệt được.</p>
              <ul className="faq-approver-list">
                {approvers.map((user) => (
                  <li key={user.user_id}>
                    <span>
                      {user.nickname || user.email || `#${user.user_id}`}
                      {user.email ? ` · ${user.email}` : ''}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        void chatApi
                          .removeFaqApprover(setId, user.user_id)
                          .then(() =>
                            chatApi.listFaqApprovers(setId).then(setApprovers),
                          )
                          .catch((e: unknown) =>
                            setError(e instanceof Error ? e.message : 'Không gỡ được người duyệt.'),
                          );
                      }}
                    >
                      Gỡ
                    </button>
                  </li>
                ))}
              </ul>
              <input
                className="faq-dir-search"
                placeholder={`Tìm user công ty (≥${FAQ_SEARCH_MIN_CHARS} ký tự)…`}
                value={dirQuery}
                onChange={(e) => setDirQuery(e.target.value)}
              />
              {dirQuery.trim().length > 0 && dirQuery.trim().length < FAQ_SEARCH_MIN_CHARS ? (
                <p className="chat-hint">
                  Nhập thêm {FAQ_SEARCH_MIN_CHARS - dirQuery.trim().length} ký tự để tìm.
                </p>
              ) : dirSearchLoading ? (
                <p className="chat-hint">Đang tìm…</p>
              ) : dirQuery.trim().length >= FAQ_SEARCH_MIN_CHARS &&
                directory.filter((user) => !approvers.some((a) => a.user_id === user.user_id))
                  .length === 0 ? (
                <p className="chat-hint">Không có user phù hợp.</p>
              ) : dirQuery.trim().length >= FAQ_SEARCH_MIN_CHARS ? (
                <ul className="faq-dir-list">
                  {directory
                    .filter((user) => !approvers.some((a) => a.user_id === user.user_id))
                    .slice(0, 8)
                    .map((user) => (
                      <li key={user.user_id}>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            void chatApi
                              .addFaqApprover(setId, user.user_id)
                              .then(setApprovers)
                              .catch((e: unknown) =>
                                setError(
                                  e instanceof Error ? e.message : 'Không gán được người duyệt.',
                                ),
                              );
                          }}
                        >
                          {user.nickname || user.email || `#${user.user_id}`}
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="chat-hint">
                  Gõ ít nhất {FAQ_SEARCH_MIN_CHARS} ký tự để hiện danh sách user.
                </p>
              )}
            </div>
          ) : null}
        </FaqFormDialog>
      )}

      <ChatConfirmDialog
        open={deleteItemId != null}
        title="Xóa câu hỏi?"
        message="Mục hỏi–đáp sẽ bị xóa khỏi bộ FAQ."
        confirmLabel={busy ? 'Đang xóa…' : 'Xóa'}
        busy={busy}
        onConfirm={() => {
          if (deleteItemId == null) return;
          setBusy(true);
          void chatApi
            .deleteFaqItem(setId, deleteItemId)
            .then(() => {
              setDeleteItemId(null);
              return load();
            })
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'Không xóa được mục FAQ.'),
            )
            .finally(() => setBusy(false));
        }}
        onCancel={() => setDeleteItemId(null)}
      />

      <ChatConfirmDialog
        open={deleteSetOpen}
        title="Xóa bộ FAQ?"
        message="Xóa SQL, folder File.Api và AI FAQ gắn folder này."
        confirmLabel={busy ? 'Đang xóa…' : 'Xóa'}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void chatApi
            .deleteFaqSet(setId)
            .then(onDeleted)
            .catch((e: unknown) => {
              setError(e instanceof Error ? e.message : 'Không xóa được bộ FAQ.');
              setBusy(false);
            });
        }}
        onCancel={() => setDeleteSetOpen(false)}
      />
    </div>
  );
}

function FaqFormDialog({
  title,
  children,
  busy,
  error,
  wide,
  okLabel = 'Ok',
  okDisabled,
  extraActions,
  onCancel,
  onOk,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  error?: string | null;
  wide?: boolean;
  okLabel?: string;
  okDisabled?: boolean;
  extraActions?: ReactNode;
  onCancel: () => void;
  onOk: () => void;
}) {
  return (
    <div
      className="chat-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className={`chat-modal${wide ? ' faq-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-dialog-title"
      >
        <div className="chat-modal-head">
          <strong id="faq-dialog-title">{title}</strong>
          <button
            type="button"
            className="chat-icon-btn"
            title="Đóng"
            disabled={busy}
            onClick={onCancel}
          >
            <IconClose size={17} />
          </button>
        </div>
        <div className="chat-modal-body faq-dialog-body">
          {error ? <div className="chat-error">{error}</div> : null}
          {children}
        </div>
        <div className="chat-modal-foot">
          {extraActions}
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Hủy
          </button>
          <button type="button" disabled={busy || okDisabled} onClick={onOk}>
            {busy ? 'Đang lưu…' : okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
