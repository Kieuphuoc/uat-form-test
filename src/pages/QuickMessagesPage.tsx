import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { chatApi, type ChatMe, type QuickMessage } from '../api/chatApi';
import {
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconPlus,
  IconTrash,
} from '../components/AppIcons';
import { ChatConfirmDialog } from '../components/chat/ChatConfirmDialog';

type ShellContext = {
  me: ChatMe | null;
  setMe?: Dispatch<SetStateAction<ChatMe | null>>;
};

const CODE_RE = /^[A-Za-z0-9_]{1,32}$/;

export function QuickMessagesPage() {
  const { me } = useOutletContext<ShellContext>();
  const unitId = me?.unit_id ?? 0;
  const [items, setItems] = useState<QuickMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editor, setEditor] = useState<QuickMessage | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (unitId <= 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setItems(await chatApi.listQuickMessages());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được tin nhắn nhanh.');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!me?.is_admin) return <Navigate to="/chat" replace />;
  if (unitId <= 0) {
    return (
      <div className="chat-page-card faq-page">
        <p className="chat-hint">Chọn công ty trước khi quản lý tin nhắn nhanh.</p>
      </div>
    );
  }

  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const canMoveUp = selectedIndex > 0;
  const canMoveDown = selectedIndex >= 0 && selectedIndex < items.length - 1;

  const openNew = () => {
    setError(null);
    setEditor('new');
    setCode('');
    setBodyText('');
  };

  const openEdit = (item: QuickMessage) => {
    setError(null);
    setEditor(item);
    setCode(item.code);
    setBodyText(item.body_text);
  };

  const closeEditor = () => {
    setEditor(null);
    setError(null);
  };

  const save = async () => {
    const nextCode = code.trim();
    if (!CODE_RE.test(nextCode)) {
      setError('Mã chỉ gồm chữ, số, gạch dưới (1–32 ký tự).');
      return;
    }
    if (!bodyText.trim()) {
      setError('Nội dung không được trống.');
      return;
    }
    setBusy(true);
    try {
      const payload = { code: nextCode, body_text: bodyText.trim() };
      if (editor && editor !== 'new') await chatApi.updateQuickMessage(editor.id, payload);
      else await chatApi.createQuickMessage(payload);
      closeEditor();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được tin nhắn nhanh.');
    } finally {
      setBusy(false);
    }
  };

  const moveSelected = async (delta: number) => {
    if (selectedIndex < 0) return;
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const [row] = next.splice(selectedIndex, 1);
    next.splice(nextIndex, 0, row);
    const ids = next.map((item) => item.id);
    setBusy(true);
    setItems(next.map((item, index) => ({ ...item, sort_order: index + 1 })));
    try {
      setItems(await chatApi.reorderQuickMessages(ids));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không sắp xếp được.');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await chatApi.deleteQuickMessage(id);
      if (selectedId === id) setSelectedId(null);
      if (editor && editor !== 'new' && editor.id === id) closeEditor();
      setDeleteId(null);
      setError(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được tin nhắn nhanh.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page-card faq-page">
      <header className="chat-page-card-head">
        <div>
          <h2>Tin nhắn nhanh</h2>
        </div>
        <div className="qm-head-actions">
          <button
            type="button"
            className="chat-icon-btn"
            title="Đưa lên"
            disabled={busy || !canMoveUp}
            onClick={() => void moveSelected(-1)}
          >
            <IconChevronUp size={18} />
          </button>
          <button
            type="button"
            className="chat-icon-btn"
            title="Đưa xuống"
            disabled={busy || !canMoveDown}
            onClick={() => void moveSelected(1)}
          >
            <IconChevronDown size={18} />
          </button>
          <button
            type="button"
            className="chat-icon-btn chat-page-card-head-action"
            title="Thêm tin nhắn nhanh"
            onClick={openNew}
          >
            <IconPlus size={18} />
          </button>
        </div>
      </header>

      {error && !editor ? <div className="chat-error">{error}</div> : null}
      <p className="muted qm-hint">
        Gõ <code>/MÃ</code> trong ô nhập tin nhắn (Chat, Zalo, OA) rồi Enter để gửi nội dung.
      </p>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="muted">Chưa có tin nhắn nhanh cho công ty này.</p>
      ) : (
        <div className="faq-table-wrap">
          <table className="faq-table qm-table">
            <thead>
              <tr>
                <th className="qm-select-col" />
                <th>STT</th>
                <th>Mã</th>
                <th>Nội dung</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? 'is-selected' : undefined}
                >
                  <td className="qm-select-col" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="radio"
                      name="qm-selected"
                      checked={selectedId === item.id}
                      onChange={() => setSelectedId(item.id)}
                      aria-label={`Chọn ${item.code}`}
                    />
                  </td>
                  <td
                    className="qm-row-main"
                    onClick={() => openEdit(item)}
                  >
                    {item.sort_order}
                  </td>
                  <td className="qm-row-main" onClick={() => openEdit(item)}>
                    <code>/{item.code}</code>
                  </td>
                  <td className="qm-row-main" onClick={() => openEdit(item)}>
                    {item.body_text}
                  </td>
                  <td className="faq-table-actions">
                    <button
                      type="button"
                      className="chat-icon-btn"
                      title="Xóa"
                      disabled={busy}
                      onClick={() => setDeleteId(item.id)}
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor ? (
        <QuickMessageDialog
          title={editor === 'new' ? 'Thêm tin nhắn nhanh' : 'Sửa tin nhắn nhanh'}
          busy={busy}
          error={error}
          okDisabled={!code.trim() || !bodyText.trim()}
          extraActions={
            editor !== 'new' ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDeleteId(editor.id)}
              >
                Xóa
              </button>
            ) : null
          }
          onCancel={closeEditor}
          onOk={() => void save()}
        >
          <label className="chat-settings-field">
            <span>Mã</span>
            <input
              autoFocus
              value={code}
              maxLength={32}
              placeholder="CTY"
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="chat-settings-field">
            <span>Nội dung</span>
            <textarea
              rows={4}
              value={bodyText}
              maxLength={2000}
              placeholder="Công ty ARITO"
              disabled={busy}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </label>
        </QuickMessageDialog>
      ) : null}

      <ChatConfirmDialog
        open={deleteId != null}
        title="Xóa tin nhắn nhanh?"
        message="Mã này sẽ không còn dùng được trong Chat, Zalo và OA."
        confirmLabel="Xóa"
        busy={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId != null) void remove(deleteId);
        }}
      />
    </div>
  );
}

function QuickMessageDialog({
  title,
  children,
  busy,
  error,
  okDisabled,
  extraActions,
  onCancel,
  onOk,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  error?: string | null;
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
      <div className="chat-modal" role="dialog" aria-modal="true" aria-labelledby="qm-dialog-title">
        <div className="chat-modal-head">
          <strong id="qm-dialog-title">{title}</strong>
          <button type="button" className="chat-icon-btn" title="Đóng" disabled={busy} onClick={onCancel}>
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
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
