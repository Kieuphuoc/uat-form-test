import { useEffect, useMemo, useRef, useState } from 'react';
import { chatApi, type ChatUser } from '../../api/chatApi';
import { IconClose, IconSearch } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

export type PickerMode = 'direct' | 'group' | 'add-members';

type Props = {
  mode: PickerMode;
  /** user_id đã ở trong nhóm — không cho chọn lại. */
  excludeUserIds?: number[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPickDirect: (user: ChatUser, lookup: string) => void;
  onSubmitMany: (userIds: number[], title: string) => void;
};

const TITLES: Record<PickerMode, string> = {
  direct: 'Chat mới',
  group: 'Tạo nhóm',
  'add-members': 'Thêm thành viên',
};

export function UserPickerDialog({
  mode,
  excludeUserIds = [],
  busy,
  error,
  onClose,
  onPickDirect,
  onSubmitMany,
}: Props) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selected, setSelected] = useState<ChatUser[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalRecord, setTotalRecord] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const multi = mode !== 'direct';

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const requestId = ++requestRef.current;
      setLoading(true);
      setLoadError(null);
      void chatApi
        .searchUsers(query, mode, page, pageSize)
        .then((result) => {
          if (requestId !== requestRef.current) return;
          setUsers(result.items.filter((u) => !excluded.has(u.user_id)));
          setTotalRecord(result.total_record);
          setPage(result.page);
          setPageSize(result.page_size);
        })
        .catch((e: unknown) => {
          if (requestId === requestRef.current) {
            setLoadError(e instanceof Error ? e.message : 'Không tải được danh bạ.');
          }
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false);
        });
    }, 300);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [query, page, pageSize, excluded, mode]);

  const toggle = (user: ChatUser) => {
    setSelected((prev) =>
      prev.some((u) => u.user_id === user.user_id)
        ? prev.filter((u) => u.user_id !== user.user_id)
        : [...prev, user],
    );
  };

  const canSubmit =
    selected.length > 0 && (mode !== 'group' || title.trim().length > 0) && !busy;
  const totalPages = Math.max(1, Math.ceil(totalRecord / Math.max(1, pageSize)));

  return (
    <div className="chat-modal-backdrop" role="dialog" aria-modal>
      <div className="chat-modal">
        <header className="chat-modal-head">
          <strong>{TITLES[mode]}</strong>
          <button type="button" className="chat-icon-btn" onClick={onClose} title="Đóng">
            <IconClose size={18} />
          </button>
        </header>

        {mode === 'group' && (
          <label className="field chat-modal-field">
            Tên nhóm
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Kế toán - Kho"
            />
          </label>
        )}

        <label className="chat-search chat-modal-search">
          <IconSearch size={16} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm người dùng"
            autoFocus
          />
        </label>

        {multi && selected.length > 0 && (
          <div className="chat-chips">
            {selected.map((u) => (
              <button key={u.user_id} type="button" className="chat-chip" onClick={() => toggle(u)}>
                {u.nickname || u.email || `Người dùng ${u.user_id}`}
                <IconClose size={12} />
              </button>
            ))}
          </div>
        )}

        <div className="chat-modal-body">
          {loading && <p className="chat-hint">Đang tìm…</p>}
          {loadError && <div className="banner">{loadError}</div>}
          {!loading && users.length === 0 && !loadError && (
            <p className="chat-hint">Không tìm thấy người dùng.</p>
          )}
          {users.map((u) => {
            const checked = selected.some((s) => s.user_id === u.user_id);
            return (
              <button
                type="button"
                key={u.user_id}
                className={`chat-user-item${checked ? ' is-checked' : ''}`}
                onClick={() => (multi ? toggle(u) : onPickDirect(u, query.trim()))}
                disabled={busy}
              >
                <ChatAvatar name={u.nickname || u.email} avatarId={u.avatar_id} size={36} />
                <span className="chat-user-main">
                  <span className="chat-user-name">{u.nickname || `Người dùng ${u.user_id}`}</span>
                  <span className="chat-user-sub">{u.department || u.email || u.phone || ''}</span>
                </span>
                {multi && <span className="chat-check">{checked ? '✓' : ''}</span>}
              </button>
            );
          })}
        </div>

        <div className="chat-modal-pagination">
          <button
            type="button"
            className="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Trước
          </button>
          <span>
            Trang {page}/{totalPages} · {totalRecord} người
          </span>
          <button
            type="button"
            className="secondary"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Sau
          </button>
        </div>

        {error && <div className="banner">{error}</div>}

        {multi && (
          <footer className="chat-modal-foot">
            <button type="button" className="secondary" onClick={onClose}>
              Hủy
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmitMany(selected.map((u) => u.user_id), title.trim())}
            >
              {mode === 'group' ? 'Tạo nhóm' : `Thêm (${selected.length})`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
