import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  chatApi,
  newClientMsgId,
  type ChatMessage,
  type ChatMe,
  type ChatUser,
  type ContactRelation,
  type Conversation,
  type ConversationDetail,
} from '../api/chatApi';
import { ConversationInfo } from '../components/chat/ConversationInfo';
import { ConversationList } from '../components/chat/ConversationList';
import { MessageThread, type PendingMessage } from '../components/chat/MessageThread';
import { UserPickerDialog, type PickerMode } from '../components/chat/UserPickerDialog';
import { useAuth } from '../auth/AuthContext';
import {
  getDesktopNotificationMode,
  setChatPlatform,
  subscribeContacts,
  subscribeConversations,
  subscribeMessages,
} from '../lib/chatTransport';

const PAGE_SIZE = 30;
/** Quá ngưỡng này thì không nạp hết tin chưa đọc — mở ở cuối và để user cuộn lên. */
const MAX_UNREAD_PRELOAD = 150;
/** ss_Chat_message_list chặn limit ở 200. */
const MAX_LIST_LIMIT = 200;
const LIST_WIDTH_KEY = 'arito-chat:list-width';
const INFO_WIDTH_KEY = 'arito-chat:info-width';

type Pane = 'list' | 'thread' | 'info';
type ShellContext = { me: ChatMe | null };

function storedWidth(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<number, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Tin chưa đọc đầu tiên của người khác. Ưu tiên mốc last_read_message_id; khi mốc này là 0
 * (chưa từng đọc, hoặc API cũ không trả về) thì đếm ngược unread_count từ tin mới nhất —
 * tránh coi cả lịch sử là chưa đọc rồi nhảy lên đầu hội thoại.
 */
function firstUnreadMessageId(
  items: ChatMessage[],
  lastReadId: number,
  unreadCount: number,
): number {
  if (unreadCount <= 0 || items.length === 0) return 0;
  if (lastReadId > 0) {
    return items.find((m) => m.id > lastReadId && !m.sender_is_me)?.id ?? 0;
  }
  return items[Math.max(0, items.length - unreadCount)]?.id ?? 0;
}

/**
 * Một trang chat duy nhất cho cả PC và mobile:
 * - rộng: 3 panel như Zalo PC (danh sách | hội thoại | thông tin)
 * - hẹp: 1 panel, hai panel còn lại mở/đóng như Zalo mobile
 * Shell (header/nav) do ChatAppShell đảm nhiệm.
 */
export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { mobile } = useAuth();
  const { me } = useOutletContext<ShellContext>();

  const activeId = Number(conversationId) > 0 ? Number(conversationId) : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [conversationQuery, setConversationQuery] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('list');
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listWidth, setListWidth] = useState(() => storedWidth(LIST_WIDTH_KEY, 320));
  const [infoWidth, setInfoWidth] = useState(() => storedWidth(INFO_WIDTH_KEY, 300));
  const [infoVisible, setInfoVisible] = useState(true);
  const [focusRequest, setFocusRequest] = useState<{
    messageId: number;
    atBottom: boolean;
    token: number;
  } | null>(null);

  const lastIdRef = useRef(0);
  const readIdRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(
    () => detail?.conversation ?? conversations.find((c) => c.id === activeId) ?? null,
    [detail, conversations, activeId],
  );
  const relation = detail?.relation ?? null;
  const companyLabel =
    me?.unit_id && me.unit_id > 0
      ? me.unit?.unit_name || me.unit?.unit_code || `Công ty #${me.unit_id}`
      : null;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const beginResize = useCallback(
    (target: 'list' | 'info', event: React.PointerEvent<HTMLDivElement>) => {
      if (window.matchMedia('(max-width: 1023px)').matches) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = target === 'list' ? listWidth : infoWidth;
      const bodyWidth = bodyRef.current?.clientWidth ?? window.innerWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const proposed = target === 'list' ? startWidth + delta : startWidth - delta;
        const max = target === 'list'
          ? Math.max(260, bodyWidth - infoWidth - 360)
          : Math.max(240, bodyWidth - listWidth - 360);
        const next = Math.round(Math.min(max, Math.max(target === 'list' ? 240 : 220, proposed)));
        if (target === 'list') setListWidth(next);
        else setInfoWidth(next);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('chat-is-resizing');
      };

      document.body.classList.add('chat-is-resizing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [infoWidth, listWidth],
  );

  useEffect(() => {
    window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    window.localStorage.setItem(INFO_WIDTH_KEY, String(infoWidth));
  }, [infoWidth]);

  useEffect(() => {
    setChatPlatform(mobile ? 'mobile' : 'web');
  }, [mobile]);

  useEffect(() => {
    if (mobile) return;
    const mode = getDesktopNotificationMode();
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = mode === 'badge' && totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [mobile, totalUnread]);

  const refreshConversations = useCallback(async () => {
    try {
      const items = await chatApi.listConversations(conversationSearch);
      setConversations(items);
      if (!conversationSearch)
        setTotalUnread(items.reduce((sum, item) => sum + item.unread_count, 0));
    } catch (e) {
      setError(errorMessage(e, 'Không tải được danh sách hội thoại.'));
    }
  }, [conversationSearch]);

  const refreshDetail = useCallback(async () => {
    if (!activeId) return;
    try {
      setDetail(await chatApi.getConversation(activeId));
    } catch {
      /* giữ detail cũ */
    }
  }, [activeId]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setConversationSearch(conversationQuery.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [conversationQuery]);

  const markRead = useCallback(
    async (conversation: number, messageId: number) => {
      if (messageId <= 0 || readIdRef.current >= messageId) return;
      readIdRef.current = messageId;
      try {
        await chatApi.markRead(conversation, messageId);
        setConversations((prev) =>
          prev.map((c) => (c.id === conversation ? { ...c, unread_count: 0 } : c)),
        );
      } catch {
        // Đọc-đánh dấu lỗi không ảnh hưởng việc xem tin.
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      try {
        const items = await chatApi.listConversations();
        setConversations(items);
        setTotalUnread(items.reduce((sum, item) => sum + item.unread_count, 0));
      } catch (e) {
        setError(errorMessage(e, 'Không tải được danh sách hội thoại.'));
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setListLoading(true);
    const sub = subscribeConversations(conversationSearch, (items) => {
      setConversations(items);
      if (!conversationSearch)
        setTotalUnread(items.reduce((sum, item) => sum + item.unread_count, 0));
      setListLoading(false);
    });
    return () => sub.stop();
  }, [conversationSearch]);

  useEffect(() => {
    const sub = subscribeContacts(() => {
      void refreshDetail();
      void refreshConversations();
    });
    return () => sub.stop();
  }, [refreshConversations, refreshDetail]);

  // Đổi hội thoại → nạp lại chi tiết + lịch sử.
  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      setMessages([]);
      setPending([]);
      return;
    }

    let cancelled = false;
    // -1 khóa polling cho tới khi trang lịch sử đầu tiên nạp xong.
    lastIdRef.current = -1;
    readIdRef.current = 0;
    setPending([]);
    setThreadLoading(true);
    setError(null);
    setPane('thread');

    void (async () => {
      try {
        const info = await chatApi.getConversation(activeId);
        const lastReadId = info.conversation.last_read_message_id ?? 0;
        const unreadCount = Math.max(0, info.conversation.unread_count ?? 0);
        // 30 tin cũ + phần chưa đọc, gộp trong một lượt để không nạp thừa lịch sử.
        const preload = unreadCount <= MAX_UNREAD_PRELOAD ? unreadCount : 0;
        const limit = Math.min(MAX_LIST_LIMIT, PAGE_SIZE + preload);
        const items = await chatApi.listMessages(activeId, { limit });
        if (cancelled) return;
        setDetail(info);
        setMessages(items);
        setHasMore(items.length >= limit);
        const newest = items.length > 0 ? items[items.length - 1].id : 0;
        const unreadId = firstUnreadMessageId(items, lastReadId, preload);
        setFocusRequest({
          messageId: unreadId || newest,
          atBottom: unreadId === 0,
          token: Date.now(),
        });
        lastIdRef.current = newest;
        readIdRef.current = lastReadId;
        void markRead(activeId, newest);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setMessages([]);
          setError(errorMessage(e, 'Không mở được hội thoại.'));
        }
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, markRead]);

  useEffect(() => {
    if (!activeId) return;
    const sub = subscribeMessages(
      activeId,
      () => lastIdRef.current,
      (items) => {
        setMessages((prev) => mergeMessages(prev, items));
        const newest = items[items.length - 1]?.id ?? 0;
        if (newest > lastIdRef.current) lastIdRef.current = newest;
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          if (newest > 0) {
            setFocusRequest({ messageId: newest, atBottom: true, token: Date.now() });
          }
          void markRead(activeId, newest);
        }
        void refreshConversations();
        void refreshDetail();
      },
    );
    return () => sub.stop();
  }, [activeId, markRead, refreshConversations, refreshDetail]);

  useEffect(() => {
    if (!activeId) return;
    const focusLatestUnread = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const current = messagesRef.current;
      const newest = current[current.length - 1]?.id ?? 0;
      if (newest <= 0) return;
      const firstUnread = current.find(
        (message) => message.id > readIdRef.current && !message.sender_is_me,
      );
      setFocusRequest({
        messageId: firstUnread?.id ?? newest,
        atBottom: !firstUnread,
        token: Date.now(),
      });
      void markRead(activeId, newest);
    };
    window.addEventListener('focus', focusLatestUnread);
    document.addEventListener('visibilitychange', focusLatestUnread);
    return () => {
      window.removeEventListener('focus', focusLatestUnread);
      document.removeEventListener('visibilitychange', focusLatestUnread);
    };
  }, [activeId, markRead]);

  const deliver = useCallback(
    async (clientMsgId: string, body: string, replyToMessageId?: number | null) => {
      if (!activeId) return;
      try {
        const message = await chatApi.sendMessage(activeId, body, clientMsgId, replyToMessageId);
        setPending((prev) => prev.filter((p) => p.client_msg_id !== clientMsgId));
        setMessages((prev) => mergeMessages(prev, [message]));
        if (message.id > lastIdRef.current) lastIdRef.current = message.id;
        readIdRef.current = message.id;
        void refreshConversations();
        void refreshDetail();
        setError(null);
      } catch (e) {
        setPending((prev) =>
          prev.map((p) => (p.client_msg_id === clientMsgId ? { ...p, failed: true } : p)),
        );
        setError(errorMessage(e, 'Không gửi được tin.'));
        void refreshDetail();
      }
    },
    [activeId, refreshConversations, refreshDetail],
  );

  const onSend = useCallback(
    (body: string, replyToMessageId?: number | null) => {
      if (relation && !relation.can_send) return;
      const clientMsgId = newClientMsgId();
      setPending((prev) => [...prev, { client_msg_id: clientMsgId, body }]);
      void deliver(clientMsgId, body, replyToMessageId);
    },
    [deliver, relation],
  );

  const onRetry = useCallback(
    (clientMsgId: string) => {
      const item = pending.find((p) => p.client_msg_id === clientMsgId);
      if (!item) return;
      setPending((prev) =>
        prev.map((p) => (p.client_msg_id === clientMsgId ? { ...p, failed: false } : p)),
      );
      void deliver(clientMsgId, item.body);
    },
    [deliver, pending],
  );

  const onSendAttachments = useCallback(
    async (files: File[]) => {
      if (!activeId || (relation && !relation.can_send)) return;
      try {
        const uploaded = [];
        for (const file of files) {
          uploaded.push(await chatApi.uploadAttachment(activeId, file));
        }
        for (const attachment of uploaded) {
          const message = await chatApi.sendAttachment(activeId, attachment, newClientMsgId());
          setMessages((prev) => mergeMessages(prev, [message]));
          if (message.id > lastIdRef.current) lastIdRef.current = message.id;
        }
        void refreshConversations();
        void refreshDetail();
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Không gửi được file đính kèm.'));
        void refreshDetail();
        throw e;
      }
    },
    [activeId, relation, refreshConversations, refreshDetail],
  );

  const onLoadMore = useCallback(async () => {
    if (!activeId || messages.length === 0) return;
    setThreadLoading(true);
    try {
      const older = await chatApi.listMessages(activeId, {
        beforeId: messages[0].id,
        limit: PAGE_SIZE,
      });
      setMessages((prev) => mergeMessages(prev, older));
      setHasMore(older.length >= PAGE_SIZE);
    } catch (e) {
      setError(errorMessage(e, 'Không tải được tin cũ.'));
    } finally {
      setThreadLoading(false);
    }
  }, [activeId, messages]);

  const onJumpToMessage = useCallback(
    async (messageId: number) => {
      if (!activeId || messages.some((message) => message.id === messageId)) return;
      try {
        // before_id là exclusive; target + 1 và limit 1 trả đúng tin cần tìm.
        const target = await chatApi.listMessages(activeId, {
          beforeId: messageId + 1,
          limit: 1,
        });
        setMessages((prev) => mergeMessages(prev, target.filter((message) => message.id === messageId)));
      } catch (e) {
        setError(errorMessage(e, 'Không tải được tin nhắn gốc.'));
      }
    },
    [activeId, messages],
  );

  const openConversation = useCallback(
    (id: number) => {
      if (id === activeId) {
        const current = messagesRef.current;
        const newest = current[current.length - 1]?.id ?? 0;
        const firstUnread = current.find(
          (message) => message.id > readIdRef.current && !message.sender_is_me,
        );
        if (newest > 0) {
          setFocusRequest({
            messageId: firstUnread?.id ?? newest,
            atBottom: !firstUnread,
            token: Date.now(),
          });
          void markRead(id, newest);
        }
      }
      navigate(`/chat/${id}`);
      setPane('thread');
    },
    [activeId, markRead, navigate],
  );

  const onPickDirect = useCallback(
    async (peer: ChatUser, lookup: string) => {
      setBusy(true);
      setPickerError(null);
      try {
        const conversation = await chatApi.createDirect(peer.user_id, lookup);
        setPicker(null);
        await refreshConversations();
        openConversation(conversation.id);
      } catch (e) {
        setPickerError(errorMessage(e, 'Không tạo được hội thoại.'));
      } finally {
        setBusy(false);
      }
    },
    [openConversation, refreshConversations],
  );

  const onSubmitMany = useCallback(
    async (userIds: number[], title: string) => {
      setBusy(true);
      setPickerError(null);
      try {
        if (picker === 'group') {
          const conversation = await chatApi.createGroup(title, userIds);
          setPicker(null);
          await refreshConversations();
          openConversation(conversation.id);
        } else if (picker === 'add-members' && activeId) {
          await chatApi.addMembers(activeId, userIds);
          setPicker(null);
          setDetail(await chatApi.getConversation(activeId));
          await refreshConversations();
        }
      } catch (e) {
        setPickerError(errorMessage(e, 'Không thực hiện được.'));
      } finally {
        setBusy(false);
      }
    },
    [activeId, openConversation, picker, refreshConversations],
  );

  const onRename = useCallback(
    async (title: string) => {
      if (!activeId) return;
      setBusy(true);
      try {
        await chatApi.rename(activeId, title);
        setDetail(await chatApi.getConversation(activeId));
        await refreshConversations();
      } catch (e) {
        setError(errorMessage(e, 'Không đổi được tên nhóm.'));
      } finally {
        setBusy(false);
      }
    },
    [activeId, refreshConversations],
  );

  const onSetAvatar = useCallback(
    async (file: File) => {
      if (!activeId) return;
      setBusy(true);
      try {
        await chatApi.setGroupAvatar(activeId, file);
        setDetail(await chatApi.getConversation(activeId));
        await refreshConversations();
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Không cập nhật được ảnh nhóm.'));
      } finally {
        setBusy(false);
      }
    },
    [activeId, refreshConversations],
  );

  const onRecall = useCallback(
    async (messageId: number) => {
      if (!activeId) return;
      try {
        const recalled = await chatApi.recallMessage(activeId, messageId);
        setMessages((prev) => mergeMessages(prev, [recalled]));
        void refreshConversations();
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Không thu hồi được tin nhắn.'));
      }
    },
    [activeId, refreshConversations],
  );

  const onLeave = useCallback(async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const result = await chatApi.leave(activeId);
      await refreshConversations();
      setPane('list');
      navigate('/chat');
      if (result.disbanded) setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không rời được nhóm.'));
    } finally {
      setBusy(false);
    }
  }, [activeId, navigate, refreshConversations]);

  const applyRelation = useCallback((next: ContactRelation) => {
    setDetail((prev) => (prev ? { ...prev, relation: next } : prev));
  }, []);

  const onAccept = useCallback(async () => {
    const peerId = activeConversation?.peer_user_id;
    if (!peerId) return;
    setBusy(true);
    try {
      applyRelation(await chatApi.acceptContact(peerId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không chấp nhận được yêu cầu.'));
    } finally {
      setBusy(false);
    }
  }, [activeConversation?.peer_user_id, applyRelation]);

  const onBlock = useCallback(async () => {
    const peerId = activeConversation?.peer_user_id;
    if (!peerId) return;
    setBusy(true);
    try {
      applyRelation(await chatApi.blockContact(peerId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không chặn được.'));
    } finally {
      setBusy(false);
    }
  }, [activeConversation?.peer_user_id, applyRelation]);

  const onUnblock = useCallback(async () => {
    const peerId = activeConversation?.peer_user_id;
    if (!peerId) return;
    setBusy(true);
    try {
      applyRelation(await chatApi.unblockContact(peerId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không bỏ chặn được.'));
    } finally {
      setBusy(false);
    }
  }, [activeConversation?.peer_user_id, applyRelation]);

  const memberIds = useMemo(() => detail?.members.map((m) => m.user_id) ?? [], [detail]);

  return (
    <div className="chat-app" data-pane={pane}>
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
          <ConversationList
            items={conversations}
            activeId={activeId}
            loading={listLoading}
            query={conversationQuery}
            onQueryChange={setConversationQuery}
            onSelect={openConversation}
            onNewDirect={() => {
              setPickerError(null);
              setPicker('direct');
            }}
            onNewGroup={() => {
              setPickerError(null);
              setPicker('group');
            }}
            companyLabel={companyLabel}
            companyTitle={me?.unit?.address || companyLabel}
          />
        </aside>

        <div
          className="chat-splitter chat-splitter--list"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước danh sách hội thoại"
          onPointerDown={(event) => beginResize('list', event)}
        />

        <main className="chat-panel chat-panel--thread">
          <MessageThread
            conversation={activeConversation}
            messages={messages}
            pending={pending}
            loading={threadLoading}
            hasMore={hasMore}
            error={error}
            focusRequest={focusRequest}
            relation={relation}
            members={detail?.members ?? []}
            busy={busy}
            onSend={onSend}
            onSendAttachments={onSendAttachments}
            onRecall={(messageId) => void onRecall(messageId)}
            onRetry={onRetry}
            onLoadMore={onLoadMore}
            onJumpToMessage={onJumpToMessage}
            onBack={() => {
              setPane('list');
              navigate('/chat');
            }}
            onOpenInfo={() => {
              if (window.matchMedia('(max-width: 1023px)').matches) setPane('info');
              else setInfoVisible((value) => !value);
            }}
            onAccept={() => void onAccept()}
            onBlock={() => void onBlock()}
          />
        </main>

        <div
          className="chat-splitter chat-splitter--info"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước trang thông tin"
          onPointerDown={(event) => beginResize('info', event)}
        />

        <aside className="chat-panel chat-panel--info" aria-hidden={!infoVisible}>
          <ConversationInfo
            conversation={activeConversation}
            members={detail?.members ?? []}
            relation={relation}
            busy={busy}
            onClose={() => {
              if (window.matchMedia('(max-width: 1023px)').matches) setPane('thread');
              else setInfoVisible(false);
            }}
            onRename={(title) => void onRename(title)}
            onSetAvatar={onSetAvatar}
            onAddMembers={() => {
              setPickerError(null);
              setPicker('add-members');
            }}
            onLeave={() => void onLeave()}
            onBlock={() => void onBlock()}
            onUnblock={() => void onUnblock()}
            onAccept={() => void onAccept()}
          />
        </aside>
      </div>

      {picker && (
        <UserPickerDialog
          mode={picker}
          excludeUserIds={picker === 'add-members' ? memberIds : []}
          busy={busy}
          error={pickerError}
          onClose={() => setPicker(null)}
          onPickDirect={(u, lookup) => void onPickDirect(u, lookup)}
          onSubmitMany={(ids, title) => void onSubmitMany(ids, title)}
        />
      )}
    </div>
  );
}
