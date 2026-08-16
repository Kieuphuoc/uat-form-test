import type { Conversation } from '../../api/chatApi';
import { IconPlus, IconSearch, IconUsers } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

type Props = {
  items: Conversation[];
  activeId: number | null;
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: number) => void;
  onNewDirect: () => void;
  onNewGroup: () => void;
  /** Tên công ty khi unit_id > 0 — hiện góc dưới panel hội thoại. */
  companyLabel?: string | null;
  companyTitle?: string | null;
};

function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) return date.toLocaleDateString('vi-VN', { weekday: 'short' });
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function ConversationList({
  items,
  activeId,
  loading,
  query,
  onQueryChange,
  onSelect,
  onNewDirect,
  onNewGroup,
  companyLabel,
  companyTitle,
}: Props) {
  return (
    <div className="chat-list">
      <div className="chat-list-head">
        <label className="chat-search">
          <IconSearch size={16} />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm hội thoại"
            aria-label="Tìm hội thoại"
          />
        </label>
        <button type="button" className="chat-icon-btn" title="Chat mới" onClick={onNewDirect}>
          <IconPlus size={18} />
        </button>
        <button type="button" className="chat-icon-btn" title="Tạo nhóm" onClick={onNewGroup}>
          <IconUsers size={18} />
        </button>
      </div>

      <div className="chat-list-body">
        {loading && items.length === 0 && <p className="chat-hint">Đang tải hội thoại…</p>}

        {!loading && items.length === 0 && (
          <p className="chat-hint">
            {!query.trim()
              ? 'Chưa có hội thoại. Bấm + để chat với đồng nghiệp.'
              : 'Không có hội thoại khớp từ khóa.'}
          </p>
        )}

        {items.map((c) => {
          const isGroup = c.kind === 'group';
          return (
            <button
              type="button"
              key={c.id}
              className={`chat-list-item${c.id === activeId ? ' is-active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <ChatAvatar
                name={c.title}
                avatarId={isGroup ? null : c.peer_avatar_id}
                group={isGroup}
                conversationId={c.id}
                fileId={isGroup ? c.avatar_file_id : null}
              />
              <span className="chat-list-main">
                <span className="chat-list-title">
                  <span className="chat-list-name">{c.title}</span>
                  <span className="chat-list-time">{timeLabel(c.last_message_at)}</span>
                </span>
                <span className="chat-list-preview">
                  {c.last_sender_name ? `${c.last_sender_name}: ` : ''}
                  {c.last_preview || 'Chưa có tin nhắn'}
                </span>
              </span>
              {c.unread_count > 0 && (
                <span className="chat-badge">{c.unread_count > 99 ? '99+' : c.unread_count}</span>
              )}
            </button>
          );
        })}
      </div>

      {companyLabel ? (
        <div className="chat-company-label" title={companyTitle || undefined}>
          {companyLabel}
        </div>
      ) : null}
    </div>
  );
}
