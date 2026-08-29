import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { oaApi, type OaConversation, type OaMessage } from '../api/oaApi';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { IconBack, IconInfo, IconSend } from '../components/AppIcons';
import { navigateChat } from '../lib/chatNav';
import { subscribeOaConversations, subscribeOaInbox, subscribeOaMessages } from '../lib/chatTransport';

const PAGE_SIZE = 30;
const MESSAGE_LIMIT = 50;

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewOf(item: OaConversation): string {
  const prefix = item.last_direction === 'outbound' ? 'Nhân viên: ' : '';
  return `${prefix}${item.last_preview || 'Chưa có tin nhắn'}`;
}

function mergeMessages(current: OaMessage[], incoming: OaMessage[]): OaMessage[] {
  const map = new Map<number, OaMessage>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export function OaChatPage() {
  const params = useParams();
  const navigate = useNavigate();
  const routeId = Number(params.conversationId || 0);
  const [pane, setPane] = useState<'list' | 'thread' | 'info'>(routeId > 0 ? 'thread' : 'list');
  const [conversations, setConversations] = useState<OaConversation[]>([]);
  const [selected, setSelected] = useState<OaConversation | null>(null);
  const [messages, setMessages] = useState<OaMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedId = selected?.id ?? 0;
  const canSend = !!selected?.can_send && !sending;
  const blockReason = selected?.send_block_reason || 'Chọn hội thoại để trả lời.';

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const items = await oaApi.listConversations({ search, page: 1, pageSize: PAGE_SIZE });
      setConversations(items);
      if (routeId > 0) {
        const routeItem = items.find((item) => item.id === routeId);
        if (routeItem) setSelected(routeItem);
      } else if (!selectedId && items[0]) {
        navigateChat(navigate, `/chat/oa/${items[0].id}`, { replace: true });
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không tải được danh sách OA.');
    } finally {
      setLoadingList(false);
    }
  }, [navigate, routeId, search, selectedId]);

  const openThread = useCallback(async (id: number) => {
    if (!id) return;
    setLoadingThread(true);
    try {
      const opened = await oaApi.openConversation(id, MESSAGE_LIMIT);
      setSelected(opened.conversation);
      setMessages(opened.messages);
      setHasMore(opened.has_more);
      setPane('thread');
      const lastId = opened.messages.at(-1)?.id;
      if (lastId) void oaApi.markRead(id, lastId);
      window.setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 0);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không tải được hội thoại OA.');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (routeId > 0) void openThread(routeId);
  }, [openThread, routeId]);

  useEffect(() => {
    const subList = subscribeOaConversations(() => void loadList());
    const subInbox = subscribeOaInbox((event) => {
      if (event.conversation.id === selectedId) {
        setSelected(event.conversation);
        void openThread(event.conversation.id);
      }
    });
    return () => {
      subList.stop();
      subInbox.stop();
    };
  }, [loadList, openThread, selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const sub = subscribeOaMessages(selectedId, (message) => {
      setMessages((current) => mergeMessages(current, [message]));
      void oaApi.markRead(selectedId, message.id);
      window.setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 0);
    });
    return () => sub.stop();
  }, [selectedId]);

  const loadOlder = async () => {
    const firstId = messages[0]?.id;
    if (!selectedId || !firstId) return;
    const older = await oaApi.listMessages(selectedId, { beforeId: firstId, limit: MESSAGE_LIMIT });
    setMessages((current) => mergeMessages(older, current));
    setHasMore(older.length >= MESSAGE_LIMIT);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !canSend || !draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const message = await oaApi.sendMessage(selectedId, text);
      setMessages((current) => mergeMessages(current, [message]));
      await loadList();
    } catch (ex) {
      setDraft(text);
      setError(ex instanceof Error ? ex.message : 'Không gửi được tin OA.');
    } finally {
      setSending(false);
    }
  };

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0),
    [conversations],
  );

  const messageSenderName = (msg: OaMessage): string => {
    if (msg.direction === 'inbound') return selected?.title || 'Khách hàng';
    if (msg.sender_is_me) return 'Bạn';
    return msg.sender_name || (msg.sender_user_id ? `User ${msg.sender_user_id}` : 'Nhân viên');
  };

  const messageAvatar = (msg: OaMessage) => {
    if (msg.direction === 'inbound') {
      return {
        name: selected?.title || msg.sender_name || 'Khách hàng',
        imageSrc: msg.sender_avatar_url || selected?.avatar_url || null,
        avatarId: null,
      };
    }
    return {
      name: messageSenderName(msg),
      imageSrc: null,
      avatarId: msg.sender_avatar_id || null,
    };
  };

  return (
    <div className="chat-app oa-chat" data-pane={pane}>
      <div className="chat-body oa-chat-body">
        <aside className="chat-panel chat-panel--list">
          <div className="chat-list-head">
            <div>
              <h2>Zalo OA</h2>
              <p>{unreadTotal > 0 ? `${unreadTotal} tin chưa đọc` : 'CSKH qua Official Account'}</p>
            </div>
            {loadingList ? <span className="muted">Đang tải...</span> : null}
          </div>
          <div className="chat-search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên khách hàng..."
            />
          </div>
          <div className="chat-list">
            {conversations.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chat-list-item${item.id === selectedId ? ' active' : ''}`}
                onClick={() => {
                  navigateChat(navigate, `/chat/oa/${item.id}`);
                  setPane('thread');
                }}
              >
                <ChatAvatar name={item.title} imageSrc={item.avatar_url} size={42} />
                <span className="chat-list-main">
                  <span className="chat-list-title">
                    <strong>{item.title}</strong>
                    <small>{formatTime(item.last_message_at)}</small>
                  </span>
                  <span className="chat-list-preview">{previewOf(item)}</span>
                </span>
                {item.unread_count > 0 ? <span className="chat-unread">{item.unread_count}</span> : null}
              </button>
            ))}
            {!conversations.length && !loadingList ? (
              <div className="chat-empty">Chưa có hội thoại OA. Tin mới sẽ xuất hiện sau khi webhook nhận event.</div>
            ) : null}
          </div>
        </aside>

        <div className="chat-splitter chat-splitter--list" role="separator" aria-orientation="vertical" />

        <main className="chat-panel chat-panel--thread">
          {selected ? (
            <div className="chat-thread oa-thread">
              <header className="chat-thread-head">
                <button
                  type="button"
                  className="chat-icon-btn chat-only-narrow"
                  onClick={() => setPane('list')}
                  title="Danh sách"
                >
                  <IconBack size={18} />
                </button>
                <ChatAvatar name={selected.title} imageSrc={selected.avatar_url} size={38} />
                <button type="button" className="chat-thread-title" onClick={() => setPane('info')}>
                  <span className="chat-thread-name">{selected.title}</span>
                  <span className="chat-thread-sub">
                    {selected.window_expires_at
                      ? `Hạn trả lời ${formatTime(selected.window_expires_at)}`
                      : 'Zalo Official Account'}
                  </span>
                </button>
                <button type="button" className="chat-icon-btn" onClick={() => setPane('info')} title="Thông tin">
                  <IconInfo size={18} />
                </button>
              </header>

              <div className="chat-thread-body" ref={scrollRef}>
                {hasMore ? (
                  <div className="chat-more">
                    <button type="button" className="secondary" onClick={loadOlder}>
                      Tải tin cũ hơn
                    </button>
                  </div>
                ) : null}
                {loadingThread ? <div className="chat-empty">Đang tải hội thoại...</div> : null}
                {messages.map((msg) => {
                  const avatar = messageAvatar(msg);
                  const mine = msg.direction === 'outbound' && msg.sender_is_me;
                  return (
                    <div
                      key={msg.id}
                      className={`oa-message ${msg.direction === 'outbound' ? 'oa-message--mine' : 'oa-message--theirs'}`}
                    >
                      {!mine ? (
                        <ChatAvatar
                          name={avatar.name}
                          imageSrc={avatar.imageSrc}
                          avatarId={avatar.avatarId}
                          size={30}
                        />
                      ) : null}
                      <div className="oa-message-main">
                        <span className="oa-message-sender">{messageSenderName(msg)}</span>
                        <div className="oa-message-bubble">
                          <div>{msg.body || `[${msg.msg_type}]`}</div>
                          <small>{formatTime(msg.created_at)}</small>
                        </div>
                      </div>
                      {mine ? (
                        <ChatAvatar
                          name={avatar.name}
                          imageSrc={avatar.imageSrc}
                          avatarId={avatar.avatarId}
                          size={30}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <form className="chat-composer oa-composer" onSubmit={submit}>
                {!selected.can_send ? <div className="chat-composer-block">{blockReason}</div> : null}
                <div className="chat-composer-row">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={selected.can_send ? 'Nhập tin nhắn OA...' : blockReason}
                    disabled={!selected.can_send || sending}
                    rows={2}
                  />
                  <button type="submit" className="chat-send" disabled={!canSend || !draft.trim()}>
                    <IconSend size={18} />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="chat-thread chat-thread--empty">
              <p className="chat-hint">Chọn một hội thoại OA để bắt đầu.</p>
            </div>
          )}
        </main>

        <div className="chat-splitter chat-splitter--info" role="separator" aria-orientation="vertical" />

        <aside className="chat-panel chat-panel--info">
          {selected ? (
            <>
              <header className="chat-info-head">
                <div>
                  <strong>Thông tin OA</strong>
                  <span className="muted">Khách hàng</span>
                </div>
              </header>
              <div className="chat-info-body">
                <div className="chat-info-hero">
                  <ChatAvatar name={selected.title} imageSrc={selected.avatar_url} size={64} />
                  <strong className="chat-info-name">{selected.title}</strong>
                  <span className="muted">{selected.is_following ? 'Đang follow OA' : 'Chưa follow / đã unfollow'}</span>
                </div>
                <div className="chat-info-section">
                  <div className="chat-info-section-head">
                    <span>Liên kết</span>
                  </div>
                  <dl className="oa-info-list">
                    <div>
                      <dt>Zalo user</dt>
                      <dd>{selected.zalo_user_id}</dd>
                    </div>
                    <div>
                      <dt>AritoID</dt>
                      <dd>{selected.arito_user_id || 'Chưa map'}</dd>
                    </div>
                    <div>
                      <dt>OA</dt>
                      <dd>{selected.oa_id}</dd>
                    </div>
                  </dl>
                </div>
                <div className="chat-info-section">
                  <div className="chat-info-section-head">
                    <span>Cửa sổ tư vấn</span>
                  </div>
                  <p className="muted oa-info-line">
                    {selected.window_expires_at ? `Hạn trả lời: ${formatTime(selected.window_expires_at)}` : 'Chưa có tương tác.'}
                  </p>
                  <p className="muted oa-info-line">
                    Đã gửi {selected.outbound_window_count}/{selected.outbound_limit} tin.
                  </p>
                  {!selected.can_send ? <div className="chat-composer-block">{selected.send_block_reason}</div> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty">Chưa chọn hội thoại.</div>
          )}
        </aside>
      </div>

      {error ? (
        <div className="zalo-toast" onClick={() => setError('')} role="button" tabIndex={0}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
