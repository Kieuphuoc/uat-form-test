import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  chatApi,
  isEmbedBot,
  nextNotifyMode,
  normalizeNotifyMode,
  newClientMsgId,
  type ChatMessage,
  type ChatMe,
  type ChatUser,
  type ContactRelation,
  type Conversation,
  type ConversationDetail,
  type ChatAttachmentList,
} from '../api/chatApi';
import { BotEmbedThread } from '../components/chat/BotEmbedThread';
import { ConversationInfo } from '../components/chat/ConversationInfo';
import { ConversationList } from '../components/chat/ConversationList';
import { MessageThread } from '../components/chat/MessageThread';
import { UserPickerDialog, type PickerMode } from '../components/chat/UserPickerDialog';
import { useAuth } from '../auth/AuthContext';
import { resizeChatImage } from '../lib/chatImageResize';
import { navigateChat } from '../lib/chatNav';
import { useQuickMessages } from '../lib/useQuickMessages';
import {
  getDesktopNotificationMode,
  setChatActorUserId,
  setChatPlatform,
  setConversationNotifyMode,
  subscribeContacts,
  subscribeConversationRead,
  subscribeConversations,
  subscribeDesktopNotificationMode,
  subscribeMessages,
  syncConversationNotifyModes,
  reloadConversations,
  loadMoreConversations,
} from '../lib/chatTransport';

const PAGE_SIZE = 30;
/** Quá ngưỡng này thì không nạp hết tin chưa đọc — mở ở cuối và để user cuộn lên. */
const MAX_UNREAD_PRELOAD = 150;
/** ss_Chat_message_list chặn limit ở 200. */
const MAX_LIST_LIMIT = 200;
const LIST_WIDTH_KEY = 'arito-chat:list-width';
const INFO_WIDTH_KEY = 'arito-chat:info-width';

type Pane = 'list' | 'thread' | 'info';
type ShellContext = {
  me: ChatMe | null;
  onOpenDataSelect?: () => void;
};

function storedWidth(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function compareChatMessages(a: ChatMessage, b: ChatMessage): number {
  const aLocal = a.id < 0;
  const bLocal = b.id < 0;
  if (aLocal !== bLocal) return aLocal ? 1 : -1;
  if (aLocal) {
    const byTime = a.created_at.localeCompare(b.created_at);
    return byTime !== 0 ? byTime : a.id - b.id;
  }
  return a.id - b.id;
}

function mergeMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<number, ChatMessage>();
  const idByClient = new Map<string, number>();
  for (const m of prev) {
    byId.set(m.id, m);
    if (m.client_msg_id) idByClient.set(m.client_msg_id, m.id);
  }
  for (const m of incoming) {
    if (m.client_msg_id) {
      const existingId = idByClient.get(m.client_msg_id);
      if (existingId != null && existingId !== m.id) byId.delete(existingId);
    }
    byId.set(m.id, m);
    if (m.client_msg_id) idByClient.set(m.client_msg_id, m.id);
  }
  return [...byId.values()].sort(compareChatMessages);
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

function applySentMessage(conversation: Conversation, message: ChatMessage): Conversation {
  const mine = message.sender_is_me;
  const preview =
    message.msg_type === 'image'
      ? '[Hình ảnh]'
      : message.msg_type === 'file'
        ? '[Tệp đính kèm]'
        : (message.body ?? '').replace(/\n/g, ' ').trim();
  const clipped = preview.length > 120 ? preview.slice(0, 120) : preview;
  return {
    ...conversation,
    last_message_id: message.id,
    last_message_at: message.created_at,
    last_preview: clipped ? (mine ? `Bạn: ${clipped}` : clipped) : conversation.last_preview,
    last_read_message_id: message.id,
    unread_count: 0,
  };
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
  const { me, onOpenDataSelect } = useOutletContext<ShellContext>();

  const activeId = Number(conversationId) > 0 ? Number(conversationId) : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [conversationQuery, setConversationQuery] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [peerOpening, setPeerOpening] = useState(() => {
    const peer = Number(new URLSearchParams(window.location.search).get('peer'));
    return Number.isFinite(peer) && peer > 0;
  });
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [openAttachments, setOpenAttachments] = useState<ChatAttachmentList | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiWaiting, setAiWaiting] = useState(false);
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
  const quickMessages = useQuickMessages(me?.unit_id);

  const lastIdRef = useRef(0);
  const readIdRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const optimisticIdRef = useRef(-1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const aiWaitTimer = useRef<number | null>(null);
  const peerOpenedRef = useRef(0);

  const stopAiWait = useCallback(() => {
    setAiWaiting(false);
    if (aiWaitTimer.current != null) {
      window.clearTimeout(aiWaitTimer.current);
      aiWaitTimer.current = null;
    }
  }, []);

  const startAiWait = useCallback(() => {
    setAiWaiting(true);
    if (aiWaitTimer.current != null) window.clearTimeout(aiWaitTimer.current);
    aiWaitTimer.current = window.setTimeout(() => setAiWaiting(false), 180_000);
  }, []);

  const activeConversation = useMemo(() => {
    if (detail?.conversation.id === activeId) return detail.conversation;
    return conversations.find((c) => c.id === activeId) ?? null;
  }, [detail, conversations, activeId]);
  const relation = detail?.conversation.id === activeId ? detail.relation ?? null : null;
  const embedConversation = isEmbedBot(activeConversation);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (me?.user_id) setChatActorUserId(me.user_id);
  }, [me?.user_id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const peer = Number(params.get('peer'));
    if (!Number.isFinite(peer) || peer <= 0 || peerOpenedRef.current === peer) return;
    peerOpenedRef.current = peer;
    setPeerOpening(true);
    const lookup = params.get('lookup')?.trim() || undefined;
    let cancelled = false;
    void (async () => {
      try {
        const conversation = await chatApi.createDirect(peer, lookup);
        if (cancelled) return;
        params.delete('peer');
        params.delete('lookup');
        const qs = params.toString();
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
        );
        try {
          await reloadConversations();
        } catch {
          /* hội thoại vẫn mở được dù danh sách chưa refresh */
        }
        if (cancelled) return;
        navigateChat(navigate, `/chat/${conversation.id}`, { replace: true });
        setPane('thread');
      } catch (e) {
        if (!cancelled) {
          peerOpenedRef.current = 0;
          setError(errorMessage(e, 'Không mở được hội thoại.'));
        }
      } finally {
        if (!cancelled) setPeerOpening(false);
      }
    })();
    return () => {
      cancelled = true;
      if (peerOpenedRef.current === peer) peerOpenedRef.current = 0;
    };
  }, [navigate]);

  useEffect(() => {
    syncConversationNotifyModes(conversations);
  }, [conversations]);

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
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    const applyTitle = () => {
      const mode = getDesktopNotificationMode();
      document.title = mode === 'badge' && totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
    };
    applyTitle();
    const sub = subscribeDesktopNotificationMode(applyTitle);
    return () => {
      sub.stop();
      document.title = baseTitle;
    };
  }, [mobile, totalUnread, me?.desktop_notification]);

  const refreshConversations = useCallback(async () => {
    try {
      await reloadConversations();
    } catch (e) {
      setError(errorMessage(e, 'Không tải được danh sách hội thoại.'));
    }
  }, []);

  const onListLoadMore = useCallback(() => {
    if (!listHasMore || listLoadingMore || listLoading) return;
    setListLoadingMore(true);
    void loadMoreConversations().finally(() => setListLoadingMore(false));
  }, [listHasMore, listLoadingMore, listLoading]);

  const refreshDetail = useCallback(async () => {
    if (!activeId) return;
    try {
      const info = await chatApi.getConversation(activeId);
      setDetail(info);
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
    setListLoading(true);
    const sub = subscribeConversations(conversationSearch, (items, meta) => {
      setConversations(items);
      setListHasMore(meta.hasMore);
      if (!conversationSearch)
        setTotalUnread(items.filter((item) => (item.unread_count || 0) > 0).length);
      setListLoading(false);
    });
    return () => sub.stop();
  }, [conversationSearch]);

  useEffect(() => {
    if (activeId || listLoading || conversationSearch || mobile || peerOpening) return;
    if (conversations.length === 0) return;
    if (window.matchMedia('(max-width: 1023px)').matches) return;
    navigateChat(navigate, `/chat/${conversations[0].id}`, { replace: true });
  }, [activeId, listLoading, conversationSearch, conversations, mobile, navigate, peerOpening]);

  useEffect(() => {
    const sub = subscribeConversationRead((event) => {
      if (!me?.user_id || event.user_id !== me.user_id) return;
      setConversations((prev) => {
        const next = prev.map((item) =>
          item.id === event.conversation_id
            ? {
                ...item,
                unread_count: 0,
                last_read_message_id: event.last_read_message_id,
              }
            : item,
        );
        if (!conversationSearch)
          setTotalUnread(next.filter((item) => (item.unread_count || 0) > 0).length);
        return next;
      });
    });
    return () => sub.stop();
  }, [me?.user_id, conversationSearch]);

  useEffect(() => {
    const sub = subscribeContacts(() => {
      void refreshDetail();
    });
    return () => sub.stop();
  }, [refreshDetail]);

  // Đổi hội thoại → nạp lại chi tiết + lịch sử.
  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      setOpenAttachments(null);
      setMessages([]);
      setPane('list');
      return;
    }

    let cancelled = false;
    // -1 khóa polling cho tới khi trang lịch sử đầu tiên nạp xong.
    lastIdRef.current = -1;
    readIdRef.current = 0;
    stopAiWait();
    setThreadLoading(true);
    setError(null);
    setPane('thread');
    setOpenAttachments(null);

    void (async () => {
      try {
        const fromList = conversations.find((item) => item.id === activeId);
        const unreadCount = Math.max(0, fromList?.unread_count ?? 0);
        const preload = unreadCount > 0 && unreadCount <= MAX_UNREAD_PRELOAD ? unreadCount : fromList ? 0 : PAGE_SIZE;
        const limit = Math.min(MAX_LIST_LIMIT, PAGE_SIZE + preload);
        const opened = await chatApi.openConversation(activeId, { limit, fileLimit: 10 });
        if (cancelled) return;
        setDetail(opened);
        setOpenAttachments(opened.attachments ?? null);
        if (isEmbedBot(opened.conversation)) {
          setMessages([]);
          setHasMore(false);
          lastIdRef.current = 0;
          readIdRef.current = 0;
          stopAiWait();
          return;
        }
        const lastReadId = opened.conversation.last_read_message_id ?? 0;
        const items = opened.messages ?? [];
        stopAiWait();
        setMessages(items);
        setHasMore(opened.has_more || items.length >= limit);
        const newest = items.length > 0 ? items[items.length - 1].id : 0;
        const unreadId = firstUnreadMessageId(
          items,
          lastReadId,
          Math.max(0, opened.conversation.unread_count ?? unreadCount),
        );
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
          setOpenAttachments(null);
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
  }, [activeId, markRead, stopAiWait]);

  useEffect(() => {
    if (!activeId || embedConversation) return;
    const sub = subscribeMessages(
      activeId,
      () => lastIdRef.current,
      (items) => {
        setMessages((prev) => mergeMessages(prev, items));
        const newest = items[items.length - 1]?.id ?? 0;
        if (newest > lastIdRef.current) lastIdRef.current = newest;
        if (items.some((item) => !item.sender_is_me)) {
          stopAiWait();
          void refreshDetail();
        }
        if (document.visibilityState === 'visible' && document.hasFocus()) {
          if (newest > 0) {
            setFocusRequest({ messageId: newest, atBottom: true, token: Date.now() });
          }
          void markRead(activeId, newest);
        }
      },
    );
    return () => sub.stop();
  }, [activeId, embedConversation, markRead, refreshDetail, stopAiWait]);

  useEffect(() => {
    if (!activeId || embedConversation) return;
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
  }, [activeId, embedConversation, markRead]);

  const deliver = useCallback(
    async (clientMsgId: string, body: string, replyToMessageId?: number | null) => {
      if (!activeId) return;
      try {
        const message = await chatApi.sendMessage(activeId, body, clientMsgId, replyToMessageId);
        setMessages((prev) => mergeMessages(prev, [message]));
        if (message.id > lastIdRef.current) lastIdRef.current = message.id;
        readIdRef.current = message.id;
        setDetail((prev) =>
          prev?.conversation.id === activeId
            ? { ...prev, conversation: applySentMessage(prev.conversation, message) }
            : prev,
        );
        setConversations((prev) =>
          prev.map((item) => (item.id === activeId ? applySentMessage(item, message) : item)),
        );
        setError(null);
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) =>
            m.client_msg_id === clientMsgId && m.send_status
              ? { ...m, send_status: 'failed' }
              : m,
          ),
        );
        setError(errorMessage(e, 'Không gửi được tin.'));
        stopAiWait();
        void refreshDetail();
      }
    },
    [activeId, refreshDetail, stopAiWait],
  );

  const onSend = useCallback(
    (body: string, replyToMessageId?: number | null) => {
      if (!activeId) return;
      if (relation && !relation.can_send) return;
      if (isEmbedBot(activeConversation)) return;
      if (activeConversation?.kind === 'bot' && activeConversation.bot_active === false) return;
      const clientMsgId = newClientMsgId();
      const reply = replyToMessageId
        ? messagesRef.current.find((m) => m.id === replyToMessageId)
        : undefined;
      const optimistic: ChatMessage = {
        id: optimisticIdRef.current--,
        conversation_id: activeId,
        sender_user_id: me?.user_id ?? 0,
        sender_name: me?.nickname ?? null,
        sender_avatar_id: me?.avatar_id ?? null,
        sender_is_me: true,
        msg_type: 'text',
        body,
        client_msg_id: clientMsgId,
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToMessageId ?? null,
        reply_preview: reply?.file_name || reply?.body || null,
        reply_sender_name: reply?.sender_is_me ? 'Bạn' : reply?.sender_name ?? null,
        send_status: 'sending',
      };
      setMessages((prev) => mergeMessages(prev, [optimistic]));
      if (activeConversation?.kind === 'bot') startAiWait();
      void deliver(clientMsgId, body, replyToMessageId);
    },
    [activeId, deliver, relation, activeConversation, startAiWait, me],
  );

  const onRetry = useCallback(
    (clientMsgId: string) => {
      const item = messagesRef.current.find((m) => m.client_msg_id === clientMsgId);
      if (!item?.body) return;
      if (isEmbedBot(activeConversation)) return;
      if (activeConversation?.kind === 'bot' && activeConversation.bot_active === false) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.client_msg_id === clientMsgId ? { ...m, send_status: 'sending' } : m,
        ),
      );
      if (activeConversation?.kind === 'bot') startAiWait();
      void deliver(clientMsgId, item.body, item.reply_to_message_id);
    },
    [deliver, activeConversation, startAiWait],
  );

  const onSendAttachments = useCallback(
    async (files: File[]) => {
      const botFolder = (activeConversation?.bot_folder_id ?? '').toLowerCase();
      const isFaqBuild = botFolder.startsWith('faq-build:');
      const botBlocked = activeConversation?.kind === 'bot' && !isFaqBuild;
      if (!activeId || isEmbedBot(activeConversation) || botBlocked || (relation && !relation.can_send)) return;
      try {
        const uploaded = [];
        for (const file of files) {
          uploaded.push(await chatApi.uploadAttachment(activeId, await resizeChatImage(file)));
        }
        let last: ChatMessage | undefined;
        for (const attachment of uploaded) {
          const message = await chatApi.sendAttachment(activeId, attachment, newClientMsgId());
          setMessages((prev) => mergeMessages(prev, [message]));
          if (message.id > lastIdRef.current) lastIdRef.current = message.id;
          last = message;
        }
        if (last) {
          const sent = last;
          readIdRef.current = sent.id;
          setDetail((prev) =>
            prev?.conversation.id === activeId
              ? { ...prev, conversation: applySentMessage(prev.conversation, sent) }
              : prev,
          );
          setConversations((prev) =>
            prev.map((item) => (item.id === activeId ? applySentMessage(item, sent) : item)),
          );
        }
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Không gửi được file đính kèm.'));
        void refreshDetail();
        throw e;
      }
    },
    [activeId, activeConversation?.kind, relation, refreshDetail],
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
      navigateChat(navigate, `/chat/${id}`);
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

  const onToggleNotify = useCallback(async () => {
    if (!activeId || !activeConversation) return;
    const next = nextNotifyMode(activeConversation.notify_mode);
    setBusy(true);
    try {
      const saved = await chatApi.setNotifyMode(activeId, next);
      const mode = normalizeNotifyMode(saved.notify_mode);
      setConversationNotifyMode(activeId, mode);
      setConversations((prev) =>
        prev.map((item) => (item.id === activeId ? { ...item, notify_mode: mode } : item)),
      );
      setDetail((prev) =>
        prev && prev.conversation.id === activeId
          ? { ...prev, conversation: { ...prev.conversation, notify_mode: mode } }
          : prev,
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không đổi được cài thông báo.'));
    } finally {
      setBusy(false);
    }
  }, [activeId, activeConversation]);

  const onSetAvatar = useCallback(
    async (file: File) => {
      if (!activeId) return;
      setBusy(true);
      try {
        await chatApi.setGroupAvatar(activeId, await resizeChatImage(file));
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
      navigateChat(navigate, '/chat');
      if (result.disbanded) setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không rời được nhóm.'));
    } finally {
      setBusy(false);
    }
  }, [activeId, navigate, refreshConversations]);

  const onDeleteConversation = useCallback(async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      await chatApi.hideConversation(activeId);
      setConversations((prev) => prev.filter((item) => item.id !== activeId));
      await refreshConversations();
      setPane('list');
      navigateChat(navigate, '/chat');
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không xóa được hội thoại.'));
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
            hasMore={listHasMore}
            loadingMore={listLoadingMore}
            query={conversationQuery}
            onQueryChange={setConversationQuery}
            onSelect={openConversation}
            onLoadMore={onListLoadMore}
            onNewDirect={() => {
              setPickerError(null);
              setPicker('direct');
            }}
            onNewGroup={() => {
              setPickerError(null);
              setPicker('group');
            }}
            onOpenContacts={() => navigateChat(navigate, '/chat/contacts')}
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
          {!activeId && (listLoading || peerOpening || (!mobile && !conversationSearch && conversations.length > 0)) ? (
            <div className="chat-thread chat-thread--empty">
              <p className="chat-hint">Đang tải hội thoại…</p>
            </div>
          ) : embedConversation && activeConversation ? (
            <BotEmbedThread
              conversation={activeConversation}
              error={error}
              onBack={() => {
                setPane('list');
                navigateChat(navigate, '/chat');
              }}
              onOpenInfo={() => {
                if (window.matchMedia('(max-width: 1023px)').matches) setPane('info');
                else setInfoVisible((value) => !value);
              }}
            />
          ) : (
            <MessageThread
              conversation={activeConversation}
              messages={messages}
              aiWaiting={aiWaiting}
              loading={threadLoading}
              hasMore={hasMore}
              error={error}
              focusRequest={focusRequest}
              relation={relation}
              members={detail?.members ?? []}
              busy={busy}
              quickMessages={quickMessages}
              selfUserId={me?.user_id}
              canReviewFaq={!!me?.can_review_faq}
              onSend={onSend}
              onSendAttachments={onSendAttachments}
              onRecall={(messageId) => void onRecall(messageId)}
              onRetry={onRetry}
              onLoadMore={onLoadMore}
              onJumpToMessage={onJumpToMessage}
              onBack={() => {
                setPane('list');
                navigateChat(navigate, '/chat');
              }}
              onOpenInfo={() => {
                if (window.matchMedia('(max-width: 1023px)').matches) setPane('info');
                else setInfoVisible((value) => !value);
              }}
              onAccept={() => void onAccept()}
              onBlock={() => void onBlock()}
            />
          )}
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
            members={detail?.conversation.id === activeId ? detail.members : []}
            relation={relation}
            seedAttachments={detail?.conversation.id === activeId ? openAttachments : null}
            attachmentsPending={
              threadLoading || (!!activeId && detail?.conversation.id !== activeId)
            }
            busy={busy}
            embedCompany={
              onOpenDataSelect
                ? {
                    label:
                      me?.unit?.unit_name ||
                      me?.unit?.unit_code ||
                      (me?.unit_id && me.unit_id > 0 ? `Công ty #${me.unit_id}` : 'Chọn công ty'),
                    title: me?.unit?.address
                      ? `Thay đổi công ty và dữ liệu — ${me.unit.address}`
                      : 'Thay đổi công ty và dữ liệu',
                    onClick: onOpenDataSelect,
                  }
                : null
            }
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
            onDelete={() => void onDeleteConversation()}
            onToggleNotify={() => void onToggleNotify()}
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
