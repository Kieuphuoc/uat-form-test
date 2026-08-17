import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  IconBack,
  IconCheck,
  IconClose,
  IconCopy,
  IconEdit,
  IconInfo,
  IconPaperclip,
  IconReply,
  IconSearch,
  IconSend,
} from '../components/AppIcons';
import {
  createZaloMockData,
  zaloDayLabel,
  zaloFolderText,
  zaloFmtTime,
  zaloHasFolder,
  zaloLabelName,
  zaloListTime,
  zaloNowIso,
  zaloUid,
  type ZaloConversation,
  type ZaloFolderConfig,
  type ZaloInboxData,
  type ZaloMessage,
} from '../lib/zaloChat';

type Pane = 'list' | 'thread' | 'info';

const LIST_WIDTH_KEY = 'arito-zalo:list-width';
const INFO_WIDTH_KEY = 'arito-zalo:info-width';

function storedWidth(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function ZaloAvatar({
  name,
  size = 36,
  group = false,
}: {
  name?: string | null;
  size?: number;
  group?: boolean;
}) {
  return (
    <span
      className={`chat-avatar${group ? ' chat-avatar--group' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

function lastPreview(messages: ZaloMessage[] | undefined): string {
  if (!messages?.length) return 'Chưa có tin nhắn';
  const last = [...messages].reverse().find((m) => m.sender_type !== 'system') ?? messages[messages.length - 1];
  const prefix =
    last.sender_type === 'bot'
      ? 'Bot: '
      : last.sender_type === 'operator'
        ? 'Bạn: '
        : last.sender_display_name
          ? `${last.sender_display_name}: `
          : '';
  const text = (last.content || (last.files?.length ? '[Tệp đính kèm]' : '')).replace(/\n/g, ' ').trim();
  return `${prefix}${text || 'Tin nhắn'}`;
}

function renderMentionText(msg: ZaloMessage) {
  const text = msg.content || '';
  const marks = [...(msg.mentions || [])].sort((a, b) => a.pos - b.pos);
  if (!marks.length) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, i) => {
    const start = Math.max(0, mark.pos);
    const end = Math.min(text.length, mark.pos + mark.len);
    if (start < cursor) return;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <span key={`${msg.id}-m${i}`} className="chat-mention">
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function senderLabel(msg: ZaloMessage): string {
  if (msg.sender_type === 'bot') return 'Bot AI · Tự động';
  if (msg.sender_type === 'operator') return msg.sender_display_name || 'Bạn (Thủ công)';
  return msg.sender_display_name || 'Người dùng';
}

/**
 * Hộp thư Zalo — giao diện FE độc lập với /chat (không dùng chatApi / SignalR).
 * Dữ liệu hiện là mock; chỗ gửi / AI / nhãn chỉ cập nhật local để sẵn sàng gắn API sau.
 */
export function ZaloChatPage() {
  const { mobile } = useAuth();
  const [data, setData] = useState<ZaloInboxData>(() => createZaloMockData());
  const [activeId, setActiveId] = useState<string | null>('c1');
  const [pane, setPane] = useState<Pane>('list');
  const [navFilter, setNavFilter] = useState<'all' | 'unassigned'>('all');
  const [labelFilter, setLabelFilter] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingQuote, setPendingQuote] = useState<ZaloMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [folderModal, setFolderModal] = useState(false);
  const [folderDraft, setFolderDraft] = useState<ZaloFolderConfig>({});
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({ c1: true });
  const [infoVisible, setInfoVisible] = useState(true);
  const [listWidth, setListWidth] = useState(() => storedWidth(LIST_WIDTH_KEY, 320));
  const [infoWidth, setInfoWidth] = useState(() => storedWidth(INFO_WIDTH_KEY, 300));

  const toastTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipScrollRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const unreadConvCount = useMemo(
    () => data.conversations.filter((c) => (c.unread_count || 0) > 0).length,
    [data.conversations],
  );
  const unassignedCount = useMemo(
    () => data.conversations.filter((c) => !zaloHasFolder(data.folderMap, c.zalo_thread_id)).length,
    [data.conversations, data.folderMap],
  );

  const filtered = useMemo(() => {
    let list = [...data.conversations];
    if (navFilter === 'unassigned') {
      list = list.filter((c) => !zaloHasFolder(data.folderMap, c.zalo_thread_id));
    }
    if (labelFilter) {
      list = list.filter((c) => (c.zalo_labels || []).some((l) => l.id === labelFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q));
    return list;
  }, [data.conversations, data.folderMap, navFilter, labelFilter, query]);

  const conv = data.conversations.find((c) => c.id === activeId) ?? null;
  const messages = conv ? data.messages[conv.id] || [] : [];
  const members = conv ? data.members[conv.id] || [] : [];
  const assigned = conv ? zaloHasFolder(data.folderMap, conv.zalo_thread_id) : false;
  const folderLabel = conv ? zaloFolderText(data.folderMap, conv.zalo_thread_id) : null;

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => `${m.display_name} ${m.zalo_uid}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [mentionOpen, mentionQuery, members]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length]);

  const patchConv = useCallback((id: string, patch: Partial<ZaloConversation>) => {
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const pushMessage = useCallback((conversationId: string, msg: ZaloMessage) => {
    setData((prev) => ({
      ...prev,
      messages: {
        ...prev.messages,
        [conversationId]: [...(prev.messages[conversationId] || []), msg],
      },
    }));
  }, []);

  const selectConversation = (id: string) => {
    setActiveId(id);
    patchConv(id, { unread_count: 0, has_external_unread: false });
    setPendingQuote(null);
    setPendingFiles([]);
    setDraft('');
    setMentionOpen(false);
    setPane('thread');
  };

  const toggleAi = (id?: string) => {
    const target = data.conversations.find((c) => c.id === (id || activeId));
    if (!target) return;
    const next = target.ai_enabled === false;
    patchConv(target.id, { ai_enabled: next });
    pushMessage(target.id, {
      id: zaloUid(),
      sender_type: 'system',
      content: next ? '✓ AI đã bật cho hội thoại này' : 'AI đã tắt cho hội thoại này',
      zalo_created_at: zaloNowIso(),
    });
    showToast(next ? 'Đã bật AI (giao diện mẫu)' : 'Đã tắt AI (giao diện mẫu)');
  };

  const toggleLabel = (labelId: string) => {
    if (!conv) return;
    const meta = data.labels.find((l) => l.id === labelId);
    if (!meta) return;
    const on = (conv.zalo_labels || []).some((x) => x.id === labelId);
    patchConv(conv.id, {
      zalo_labels: on
        ? conv.zalo_labels.filter((x) => x.id !== labelId)
        : [...(conv.zalo_labels || []), { id: meta.id, name: meta.name, color: meta.color }],
    });
  };

  const copyThread = async () => {
    if (!conv) return;
    try {
      await navigator.clipboard.writeText(String(conv.zalo_thread_id));
      setCopied(true);
      showToast('Đã copy thread ID');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('Không copy được');
    }
  };

  const loadMore = () => {
    if (!conv) return;
    const extra = data.older[conv.id] || [];
    skipScrollRef.current = true;
    setData((prev) => ({
      ...prev,
      messages: {
        ...prev.messages,
        [conv.id]: [...extra, ...(prev.messages[conv.id] || [])],
      },
    }));
    setHasMore((prev) => ({ ...prev, [conv.id]: false }));
  };

  const sendMessage = () => {
    if (!conv) return;
    const text = draft;
    if (!text.trim() && pendingFiles.length === 0) return;
    const mentions: { pos: number; len: number }[] = [];
    members.forEach((m) => {
      const token = `@${m.display_name}`;
      let from = 0;
      while (from < text.length) {
        const p = text.indexOf(token, from);
        if (p < 0) break;
        mentions.push({ pos: p, len: token.length });
        from = p + token.length;
      }
    });
    const now = zaloNowIso();
    pushMessage(conv.id, {
      id: zaloUid(),
      sender_type: 'operator',
      sender_display_name: 'Bạn (Thủ công)',
      content: text,
      files: [...pendingFiles],
      quote: pendingQuote
        ? { from: pendingQuote.sender_display_name || senderLabel(pendingQuote), msg: pendingQuote.content }
        : null,
      mentions,
      zalo_created_at: now,
    });
    patchConv(conv.id, { last_message_at: now, unread_count: 0 });
    setDraft('');
    setPendingQuote(null);
    setPendingFiles([]);
    setMentionOpen(false);
    showToast('Đã gửi (giao diện mẫu — chưa lên Zalo)');
  };

  const onComposerChange = (value: string, caret: number) => {
    setDraft(value);
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at >= 0 && !before.slice(at).includes(' ')) {
      setMentionQuery(before.slice(at + 1));
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const at = before.lastIndexOf('@');
    const prefix = at >= 0 && !before.slice(at).includes(' ') ? before.slice(0, at) : before;
    setDraft(`${prefix}@${name} ${after}`);
    setMentionOpen(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const openFolderModal = () => {
    if (!conv) return;
    const cfg = data.folderMap[String(conv.zalo_thread_id)] || {};
    setFolderDraft({
      ragFolderId: cfg.ragFolderId || '',
      faqFolderId: cfg.faqFolderId || '',
      label: cfg.label || '',
    });
    setFolderModal(true);
  };

  const saveFolder = () => {
    if (!conv) return;
    setData((prev) => ({
      ...prev,
      folderMap: { ...prev.folderMap, [String(conv.zalo_thread_id)]: { ...folderDraft } },
    }));
    setFolderModal(false);
    showToast('Đã lưu Folder AI (giao diện mẫu)');
  };

  useEffect(() => {
    window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    window.localStorage.setItem(INFO_WIDTH_KEY, String(infoWidth));
  }, [infoWidth]);

  const beginResize = (which: 'list' | 'info', event: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia('(max-width: 1023px)').matches) return;
    event.preventDefault();
    const startX = event.clientX;
    const start = which === 'list' ? listWidth : infoWidth;
    const bodyWidth = bodyRef.current?.clientWidth ?? window.innerWidth;
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const proposed = which === 'list' ? start + delta : start - delta;
      const max =
        which === 'list'
          ? Math.max(260, bodyWidth - infoWidth - 360)
          : Math.max(240, bodyWidth - listWidth - 360);
      const next = Math.round(Math.min(max, Math.max(which === 'list' ? 240 : 220, proposed)));
      if (which === 'list') setListWidth(next);
      else setInfoWidth(next);
    };
    const onUp = () => {
      document.body.classList.remove('chat-is-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    document.body.classList.add('chat-is-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const openInfo = () => {
    if (window.matchMedia('(max-width: 1023px)').matches || mobile) setPane('info');
    else setInfoVisible((v) => !v);
  };

  return (
    <div className="chat-app zalo-chat" data-pane={pane}>
      <div
        ref={bodyRef}
        className={`chat-body${infoVisible ? '' : ' chat-body--info-hidden'}`}
        style={
          {
            '--chat-list-width': `${listWidth}px`,
            '--chat-info-width': `${infoWidth}px`,
          } as React.CSSProperties
        }
      >
        <aside className="chat-panel chat-panel--list">
          <div className="chat-list">
            <div className="chat-list-head zalo-list-head">
              <div className="zalo-list-title">
                <strong>Tin nhắn Zalo</strong>
                <span className="muted">{data.conversations.length} hội thoại — giao diện mẫu</span>
              </div>
            </div>
            <div className="zalo-list-filters">
              <button
                type="button"
                className={navFilter === 'all' ? 'active' : undefined}
                onClick={() => setNavFilter('all')}
              >
                Tất cả
                {unreadConvCount > 0 && <span className="chat-badge">{unreadConvCount}</span>}
              </button>
              <button
                type="button"
                className={navFilter === 'unassigned' ? 'active' : undefined}
                onClick={() => setNavFilter('unassigned')}
              >
                Chưa gán
                {unassignedCount > 0 && (
                  <span className="chat-badge zalo-badge-muted">{unassignedCount}</span>
                )}
              </button>
            </div>
            <div className="zalo-list-tools">
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                aria-label="Lọc theo nhãn"
              >
                <option value="">Tất cả nhãn</option>
                {data.labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {zaloLabelName(l)}
                  </option>
                ))}
              </select>
              <label className="chat-search">
                <IconSearch size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên nhóm..."
                  aria-label="Tìm hội thoại Zalo"
                />
              </label>
            </div>

            <div className="chat-list-body">
              {filtered.length === 0 && (
                <p className="chat-hint">Không có hội thoại phù hợp</p>
              )}
              {filtered.map((c) => {
                const unreadN = Number(c.unread_count) || 0;
                const asg = zaloHasFolder(data.folderMap, c.zalo_thread_id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`chat-list-item${c.id === activeId ? ' is-active' : ''}`}
                    onClick={() => selectConversation(c.id)}
                  >
                    <ZaloAvatar name={c.name} group={c.is_group} />
                    <span className="chat-list-main">
                      <span className="chat-list-title">
                        <span className="chat-list-name-row">
                          <span className={`chat-list-name${unreadN > 0 ? ' zalo-list-unread' : ''}`}>
                            {c.name}
                          </span>
                        </span>
                        <span className="chat-list-time">{zaloListTime(c.last_message_at)}</span>
                      </span>
                      <span className="chat-list-preview">{lastPreview(data.messages[c.id])}</span>
                      <span className="zalo-list-meta">
                        {asg ? (
                          <span className="zalo-chip zalo-chip--folder">
                            {zaloFolderText(data.folderMap, c.zalo_thread_id)}
                          </span>
                        ) : (
                          <span className="zalo-chip zalo-chip--folder-off">Chưa gán folder</span>
                        )}
                        <span className={`zalo-ai${c.ai_enabled !== false ? ' is-on' : ''}`}>
                          <span className="zalo-ai-dot" />
                          {c.ai_enabled !== false ? 'AI Bật' : 'AI Tắt'}
                        </span>
                        {(c.zalo_labels || []).map((l) => (
                          <span
                            key={l.id}
                            className="zalo-chip zalo-chip--label"
                            style={{ background: l.color }}
                          >
                            {zaloLabelName(l)}
                          </span>
                        ))}
                      </span>
                    </span>
                    {unreadN > 0 && (
                      <span className="chat-badge">{unreadN > 99 ? '99+' : unreadN}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div
          className="chat-splitter chat-splitter--list"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước danh sách hội thoại Zalo"
          onPointerDown={(event) => beginResize('list', event)}
        />

        <main className="chat-panel chat-panel--thread">
          {!conv ? (
            <div className="chat-thread chat-thread--empty">
              <p className="chat-hint">Chọn một hội thoại để bắt đầu</p>
            </div>
          ) : (
            <div className="chat-thread">
              <header className="chat-thread-head">
                <button
                  type="button"
                  className="chat-icon-btn chat-only-narrow"
                  onClick={() => setPane('list')}
                  title="Danh sách"
                >
                  <IconBack size={18} />
                </button>
                <ZaloAvatar name={conv.name} size={40} group={conv.is_group} />
                <button type="button" className="chat-thread-title" onClick={openInfo}>
                  <span className="chat-thread-name zalo-thread-name">
                    <span>{conv.name}</span>
                    <span className={`zalo-kind${conv.is_group ? ' is-group' : ''}`}>
                      {conv.is_group ? 'Nhóm' : 'Cá nhân'}
                    </span>
                  </span>
                  <span className="chat-thread-sub zalo-thread-id">
                    Thread: {conv.zalo_thread_id}
                  </span>
                </button>
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Copy thread ID"
                  onClick={() => void copyThread()}
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </button>
                <span className="zalo-ai-switch-wrap">
                  <span>AI</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={conv.ai_enabled !== false}
                    className={`zalo-ai-switch${conv.ai_enabled !== false ? ' is-on' : ''}`}
                    onClick={() => toggleAi()}
                    title={conv.ai_enabled !== false ? 'Tắt AI' : 'Bật AI'}
                  >
                    <span>{conv.ai_enabled !== false ? 'ON' : 'OFF'}</span>
                  </button>
                </span>
                <button type="button" className="chat-icon-btn" title="Thông tin" onClick={openInfo}>
                  <IconInfo size={18} />
                </button>
              </header>

              <div className="zalo-thread-labels">
                <span className="muted">
                  {assigned ? `Folder: ${folderLabel}` : 'Chưa gán Folder AI'}
                </span>
                {data.labels.map((l) => {
                  const on = (conv.zalo_labels || []).some((x) => x.id === l.id);
                  return (
                    <button
                      type="button"
                      key={l.id}
                      className={`zalo-label-btn${on ? ' is-on' : ''}`}
                      style={on ? { background: l.color, borderColor: l.color, color: '#fff' } : undefined}
                      onClick={() => toggleLabel(l.id)}
                    >
                      {zaloLabelName(l)}
                    </button>
                  );
                })}
              </div>

              <div ref={threadRef} className="chat-thread-body">
                {hasMore[conv.id] && (
                  <div className="chat-more">
                    <button type="button" className="secondary" onClick={loadMore}>
                      ↑ Xem thêm tin nhắn cũ hơn
                    </button>
                  </div>
                )}
                {messages.length === 0 && (
                  <p className="chat-hint" style={{ textAlign: 'center' }}>
                    Chưa có tin nhắn nào trong hội thoại này.
                  </p>
                )}
                {messages.map((msg, index) => {
                  const day = zaloDayLabel(msg.zalo_created_at);
                  const prevDay = index > 0 ? zaloDayLabel(messages[index - 1].zalo_created_at) : '';
                  const showDay = Boolean(day && day !== prevDay);
                  if (msg.sender_type === 'system') {
                    const on = String(msg.content || '').startsWith('✓');
                    return (
                      <div key={msg.id}>
                        {showDay && <div className="chat-day">{day}</div>}
                        <div className={`chat-msg-system zalo-system${on ? ' is-on' : ' is-off'}`}>
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    );
                  }
                  const mine = msg.sender_type === 'bot' || msg.sender_type === 'operator';
                  return (
                    <div key={msg.id}>
                      {showDay && <div className="chat-day">{day}</div>}
                      <div className={`chat-msg${mine ? ' chat-msg--mine' : ''}${msg.sender_type === 'bot' ? ' zalo-msg--bot' : ''}`}>
                        {!mine && <ZaloAvatar name={senderLabel(msg)} size={28} />}
                        <div className="chat-msg-main">
                          <span className="chat-msg-sender">{senderLabel(msg)}</span>
                          <div className="chat-bubble">
                            {msg.quote && (
                              <div className="chat-reply-quote">
                                <strong>{msg.quote.from}</strong>
                                <span>{msg.quote.msg || 'Tin nhắn'}</span>
                              </div>
                            )}
                            <span className="zalo-msg-text">{renderMentionText(msg)}</span>
                            {(msg.files || []).map((name) => (
                              <div key={name} className="zalo-msg-file">
                                📎 {name}
                              </div>
                            ))}
                          </div>
                          <span className="chat-msg-time">
                            {zaloFmtTime(msg.zalo_created_at)}
                            <button
                              type="button"
                              className="zalo-reply-btn"
                              onClick={() => setPendingQuote(msg)}
                            >
                              <IconReply size={12} /> Trả lời
                            </button>
                          </span>
                        </div>
                        {mine && (
                          <ZaloAvatar
                            name={msg.sender_type === 'bot' ? 'AI' : 'Bạn'}
                            size={28}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="chat-composer">
                {pendingQuote && (
                  <div className="chat-reply-bar">
                    <div>
                      <strong>{pendingQuote.sender_display_name || senderLabel(pendingQuote)}</strong>
                      <span>{pendingQuote.content || 'Tin nhắn'}</span>
                    </div>
                    <button type="button" className="chat-icon-btn" onClick={() => setPendingQuote(null)}>
                      <IconClose size={16} />
                    </button>
                  </div>
                )}
                {pendingFiles.length > 0 && (
                  <div className="chat-attachment-tray">
                    {pendingFiles.map((name, i) => (
                      <span key={`${name}-${i}`} className="zalo-pending-file">
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <IconClose size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {mentionOpen && mentionMatches.length > 0 && (
                  <div className="chat-mention-menu">
                    {mentionMatches.map((m) => (
                      <button type="button" key={m.id} onClick={() => insertMention(m.display_name)}>
                        <ZaloAvatar name={m.display_name} size={24} />
                        <span>{m.display_name}</span>
                        <small>{m.zalo_uid}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="chat-composer-row">
                  <button
                    type="button"
                    className="chat-attach"
                    title="Đính kèm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconPaperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => {
                      const names = Array.from(e.target.files || []).map((f) => f.name);
                      setPendingFiles((prev) => [...prev, ...names].slice(0, 8));
                      e.target.value = '';
                    }}
                  />
                  <textarea
                    ref={composerRef}
                    rows={2}
                    value={draft}
                    placeholder="Nhập tin nhắn để trả lời thủ công..."
                    onChange={(e) => onComposerChange(e.target.value, e.target.selectionStart || 0)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="chat-send"
                    disabled={!draft.trim() && pendingFiles.length === 0}
                    onClick={sendMessage}
                    title="Gửi"
                  >
                    <IconSend size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <div
          className="chat-splitter chat-splitter--info"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước trang thông tin Zalo"
          onPointerDown={(event) => beginResize('info', event)}
        />

        <aside className="chat-panel chat-panel--info" aria-hidden={!infoVisible}>
          <div className="chat-info">
            <header className="chat-info-head">
              <strong>Thông tin hội thoại</strong>
              <button
                type="button"
                className="chat-icon-btn"
                title="Đóng"
                onClick={() => {
                  if (window.matchMedia('(max-width: 1023px)').matches || mobile) setPane('thread');
                  else setInfoVisible(false);
                }}
              >
                <IconClose size={18} />
              </button>
            </header>
            {!conv ? (
              <p className="chat-hint">Chọn hội thoại để xem thông tin.</p>
            ) : (
              <div className="chat-info-body">
                <div className="chat-info-hero">
                  <ZaloAvatar name={conv.name} size={64} group={conv.is_group} />
                  <strong className="chat-info-name">{conv.name}</strong>
                  <span className={`zalo-kind${conv.is_group ? ' is-group' : ''}`}>
                    {conv.is_group ? 'Nhóm Zalo' : 'Chat cá nhân'}
                  </span>
                </div>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Thread</div>
                  <button type="button" className="zalo-info-copy" onClick={() => void copyThread()}>
                    <code>{conv.zalo_thread_id}</code>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </button>
                </section>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Trả lời AI</div>
                  <button
                    type="button"
                    className={`zalo-ai-row${conv.ai_enabled !== false ? ' is-on' : ''}`}
                    onClick={() => toggleAi()}
                  >
                    <span>
                      <strong>{conv.ai_enabled !== false ? 'AI đang bật' : 'AI đang tắt'}</strong>
                      <small>
                        {conv.ai_enabled !== false
                          ? 'Bot tự trả lời tin nhắn đến.'
                          : 'Chỉ trả lời thủ công từ hộp thư này.'}
                      </small>
                    </span>
                    <span className={`zalo-ai-switch${conv.ai_enabled !== false ? ' is-on' : ''}`}>
                      <span>{conv.ai_enabled !== false ? 'ON' : 'OFF'}</span>
                    </span>
                  </button>
                </section>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">
                    Folder AI
                    <button type="button" className="chat-info-link" onClick={openFolderModal}>
                      <IconEdit size={13} /> Sửa
                    </button>
                  </div>
                  {assigned ? (
                    <div className="zalo-folder-card">
                      <strong>{folderLabel}</strong>
                      {data.folderMap[conv.zalo_thread_id]?.ragFolderId && (
                        <small>RAG: {data.folderMap[conv.zalo_thread_id].ragFolderId}</small>
                      )}
                      {data.folderMap[conv.zalo_thread_id]?.faqFolderId && (
                        <small>FAQ: {data.folderMap[conv.zalo_thread_id].faqFolderId}</small>
                      )}
                    </div>
                  ) : (
                    <p className="chat-hint" style={{ padding: 0 }}>
                      Chưa gán folder. Bấm Sửa để cấu hình RAG / FAQ.
                    </p>
                  )}
                </section>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Nhãn</div>
                  <div className="zalo-label-wrap">
                    {data.labels.map((l) => {
                      const on = (conv.zalo_labels || []).some((x) => x.id === l.id);
                      return (
                        <button
                          type="button"
                          key={l.id}
                          className={`zalo-label-btn${on ? ' is-on' : ''}`}
                          style={on ? { background: l.color, borderColor: l.color, color: '#fff' } : undefined}
                          onClick={() => toggleLabel(l.id)}
                        >
                          {zaloLabelName(l)}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Thành viên · {members.length}</div>
                  <ul className="chat-member-list">
                    {members.map((m) => (
                      <li key={m.id}>
                        <ZaloAvatar name={m.display_name} size={32} />
                        <span className="chat-member-main">
                          <span className="chat-member-name">{m.display_name}</span>
                          <span className="chat-member-sub">UID {m.zalo_uid}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </aside>
      </div>

      {folderModal && conv && (
        <div className="zalo-modal-backdrop" role="dialog" aria-modal="true">
          <div className="zalo-modal">
            <header>
              <div>
                <h2>Cấu hình folder</h2>
                <p>
                  {conv.name} — {conv.zalo_thread_id}
                </p>
              </div>
              <button type="button" className="chat-icon-btn" onClick={() => setFolderModal(false)}>
                <IconClose size={18} />
              </button>
            </header>
            <div className="zalo-modal-body">
              <label>
                RAG Folder ID
                <input
                  value={folderDraft.ragFolderId || ''}
                  onChange={(e) => setFolderDraft((d) => ({ ...d, ragFolderId: e.target.value }))}
                />
              </label>
              <label>
                FAQ Folder ID
                <input
                  value={folderDraft.faqFolderId || ''}
                  onChange={(e) => setFolderDraft((d) => ({ ...d, faqFolderId: e.target.value }))}
                />
              </label>
              <label>
                Ghi chú (label)
                <input
                  value={folderDraft.label || ''}
                  onChange={(e) => setFolderDraft((d) => ({ ...d, label: e.target.value }))}
                />
              </label>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setFolderModal(false)}>
                Hủy
              </button>
              <button type="button" onClick={saveFolder}>
                Lưu
              </button>
            </footer>
          </div>
        </div>
      )}

      {toast && <div className="zalo-toast">{toast}</div>}
    </div>
  );
}
