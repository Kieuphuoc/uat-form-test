import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatApiError } from '../api/chatApi';
import { zaloApi } from '../api/zaloApi';
import { useAuth } from '../auth/AuthContext';
import {
  IconBack,
  IconCheck,
  IconClose,
  IconCopy,
  IconFile,
  IconInfo,
  IconReply,
  IconSearch,
  IconSettings,
  IconUsers,
} from '../components/AppIcons';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { ZaloFilePreviewModal } from '../components/chat/ZaloFilePreviewModal';
import { ZaloGoogleIcon } from '../components/chat/ZaloGoogleIcon';
import { ZaloComposer, type ZaloSendPayload } from '../components/chat/ZaloComposer';
import { navigateChat } from '../lib/chatNav';
import { renderTextWithLinks } from '../lib/linkifyText';
import {
  seedZaloUnread,
  subscribeDesktopNotificationMode,
  getDesktopNotificationMode,
  subscribeZaloInbox,
  watchZaloSource,
} from '../lib/chatTransport';
import {
  persistZaloAccountId,
  resolveZaloAccount,
} from '../lib/zaloAccount';
import {
  emptyZaloInbox,
  mergeZaloMessages,
  zaloDayLabel,
  zaloFolderText,
  zaloFmtTime,
  zaloHasFolder,
  zaloLabelName,
  zaloListTime,
  zaloQuotePreview,
  zaloQuoteHasContent,
  zaloQuoteText,
  zaloQuoteThumb,
  zaloDownloadHref,
  zaloAttachmentName,
  zaloAttachmentOpenHref,
  zaloAttachmentPreviewSrc,
  zaloAttachmentPreviewTarget,
  zaloBubbleAttachmentClass,
  zaloGoogleLinkKind,
  zaloIsImageAttachment,
  zaloIsLinkPreviewAttachment,
  zaloIsPreviewableAttachment,
  zaloMessageAttachments,
  zaloMessageDisplayText,
  zaloMessageLinkHref,
  type ZaloAttachment,
  type ZaloFolderConfig,
  type ZaloInboxData,
  type ZaloMessage,
  type ZaloQuote,
  type ZaloSource,
} from '../lib/zaloChat';

type Pane = 'list' | 'thread' | 'info';

const LIST_WIDTH_KEY = 'arito-zalo:list-width';
const INFO_WIDTH_KEY = 'arito-zalo:info-width';
const PAGE_SIZE = 50;
const POLL_MS = 15_000;

function conversationPulse(conv: { last_message_at?: string; unread_count?: number } | null | undefined): string {
  if (!conv) return '';
  return `${conv.last_message_at || ''}|${Number(conv.unread_count) || 0}`;
}

function isNearThreadBottom(el: HTMLDivElement | null, px = 80): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < px;
}

function storedWidth(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function lastPreview(messages: ZaloMessage[] | undefined, fallback?: string): string {
  if (!messages?.length) return fallback || 'Chưa có tin nhắn';
  const last = [...messages].reverse().find((m) => m.sender_type !== 'system') ?? messages[messages.length - 1];
  const prefix =
    last.sender_type === 'bot'
      ? 'Bot: '
      : last.sender_type === 'operator'
        ? 'Bạn: '
        : last.sender_display_name
          ? `${last.sender_display_name}: `
          : '';
  const text = zaloQuotePreview(last).replace(/\n/g, ' ').trim();
  return `${prefix}${text || 'Tin nhắn'}`;
}

function renderMentionLinkText(msg: ZaloMessage, displayText: string): ReactNode {
  const marks = [...(msg.mentions || [])].sort((a, b) => a.pos - b.pos);
  if (!marks.length) return renderTextWithLinks(displayText, msg.id);
  const parts: ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, i) => {
    const start = Math.max(0, mark.pos);
    const end = Math.min(displayText.length, mark.pos + mark.len);
    if (start < cursor) return;
    if (start > cursor) parts.push(...renderTextWithLinks(displayText.slice(cursor, start), `${msg.id}-p${i}`));
    parts.push(
      <span key={`${msg.id}-m${i}`} className="chat-mention">
        {displayText.slice(start, end)}
      </span>,
    );
    cursor = end;
  });
  if (cursor < displayText.length) parts.push(...renderTextWithLinks(displayText.slice(cursor), `${msg.id}-tail`));
  return parts;
}

function ZaloMessageText({ msg }: { msg: ZaloMessage }) {
  const displayText = zaloMessageDisplayText(msg);
  if (!displayText) return null;

  const linkHref = zaloMessageLinkHref(msg);
  const googleKind = zaloGoogleLinkKind(linkHref);
  const contentText = (msg.content || '').trim();
  const usesTitleLink =
    !!googleKind
    && zaloMessageAttachments(msg).some(zaloIsLinkPreviewAttachment)
    && displayText !== contentText
    && !!linkHref;

  return (
    <span className="zalo-msg-text">
      {googleKind && linkHref ? (
        <a
          className="zalo-google-link-icon"
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Mở Google ${googleKind}`}
          onClick={(event) => event.stopPropagation()}
        >
          <ZaloGoogleIcon kind={googleKind} size={18} />
        </a>
      ) : null}
      <span className="zalo-msg-text-body">
        {usesTitleLink ? (
          <a href={linkHref} target="_blank" rel="noopener noreferrer" className="zalo-msg-link">
            {displayText}
          </a>
        ) : (
          renderMentionLinkText(msg, displayText)
        )}
      </span>
    </span>
  );
}

function ZaloAttachmentBlock({
  file,
  onPreview,
}: {
  file: ZaloAttachment;
  onPreview: (file: ZaloAttachment) => void;
}) {
  const name = zaloAttachmentName(file);
  const previewSrc = zaloAttachmentPreviewSrc(file);
  const openHref = zaloAttachmentOpenHref(file);
  const image = zaloIsImageAttachment(file) && !!previewSrc;
  const previewable = zaloIsPreviewableAttachment(file) && !!openHref;

  if (image) {
    return (
      <button type="button" className="chat-attachment-image" onClick={() => onPreview(file)} title="Xem ảnh">
        <img src={previewSrc} alt={name} />
      </button>
    );
  }

  if (previewable) {
    return (
      <button type="button" className="chat-attachment-file" onClick={() => onPreview(file)} title="Xem file">
        <span className="chat-attachment-file-icon">
          <IconFile size={28} />
        </span>
        <span>
          <strong>{name}</strong>
          <small>Xem file</small>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chat-attachment-file"
      title={openHref ? 'Tải xuống' : name}
      disabled={!openHref}
      onClick={() => {
        if (openHref) zaloDownloadHref(openHref, name);
      }}
    >
      <span className="chat-attachment-file-icon">
        <IconFile size={28} />
      </span>
      <span>
        <strong>{name}</strong>
        {openHref ? <small>Tải xuống</small> : null}
      </span>
    </button>
  );
}

function senderLabel(msg: ZaloMessage): string {
  if (msg.sender_type === 'bot') return 'Bot AI · Tự động';
  if (msg.sender_type === 'operator') {
    return msg.operator_display_name || msg.sender_display_name || 'Bạn (Thủ công)';
  }
  return msg.sender_display_name || 'Người dùng';
}

function ZaloQuotedBlock({ quote, onJump }: { quote: ZaloQuote; onJump: () => void }) {
  const thumb = zaloQuoteThumb(quote);
  const text = zaloQuoteText(quote);
  return (
    <button type="button" className="chat-reply-quote" title="Đi tới tin nhắn gốc" onClick={onJump}>
      <strong>{quote.from || 'Tin nhắn'}</strong>
      {text !== '[Hình ảnh]' ? <span>{text}</span> : null}
      {thumb ? <img src={thumb} alt="" /> : text === '[Hình ảnh]' ? <span>{text}</span> : null}
    </button>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ChatApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Hộp thư Zalo Arito — dữ liệu từ Chat.Api proxy sang Node.
 * Setting folder/nhãn ở trang admin Node; trang này luôn hiện hết hội thoại.
 */
export function ZaloChatPage() {
  const { mobile } = useAuth();
  const navigate = useNavigate();
  const [sources, setSources] = useState<ZaloSource[]>([]);
  const [infraSourceId, setInfraSourceId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [data, setData] = useState<ZaloInboxData>(() => emptyZaloInbox());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('list');
  const [labelFilter, setLabelFilter] = useState('');
  const [query, setQuery] = useState('');
  const [pendingQuote, setPendingQuote] = useState<ZaloMessage | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderModal, setFolderModal] = useState(false);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState<ZaloFolderConfig & { minutes?: number }>({});
  const [filePreview, setFilePreview] = useState<ZaloAttachment | null>(null);
  const [infoVisible, setInfoVisible] = useState(true);
  const [listWidth, setListWidth] = useState(() => storedWidth(LIST_WIDTH_KEY, 320));
  const [infoWidth, setInfoWidth] = useState(() => storedWidth(INFO_WIDTH_KEY, 300));
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [notiRegistered, setNotiRegistered] = useState(false);
  const [notiLoading, setNotiLoading] = useState(false);
  const [notiToggling, setNotiToggling] = useState(false);

  const toastTimer = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const skipScrollRef = useRef(false);
  const sendingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const infraSourceIdRef = useRef(infraSourceId);
  const accountIdRef = useRef(accountId);
  const messagesRef = useRef(data.messages);
  const conversationsRef = useRef(data.conversations);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const openFilePreview = useCallback((file: ZaloAttachment) => {
    setFilePreview(zaloAttachmentPreviewTarget(file));
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    infraSourceIdRef.current = infraSourceId;
  }, [infraSourceId]);

  useEffect(() => {
    accountIdRef.current = accountId;
    if (accountId) persistZaloAccountId(accountId);
    watchZaloSource(accountId);
  }, [accountId]);

  useEffect(() => {
    messagesRef.current = data.messages;
  }, [data.messages]);

  useEffect(() => {
    conversationsRef.current = data.conversations;
  }, [data.conversations]);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!sourceMenuRef.current?.contains(event.target as Node)) setSourceMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sourceMenuOpen]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const refreshList = useCallback(async (infraId: string, accId: string) => {
    setListLoading(true);
    try {
      const [conversations, labels, folderMap] = await Promise.all([
        zaloApi.listConversations(infraId, accId),
        zaloApi.listLabels(infraId, accId).catch(() => []),
        zaloApi.getFolderMap(infraId, accId).catch(() => ({})),
      ]);
      setData((prev) => ({ ...prev, conversations, labels, folderMap }));
      seedZaloUnread(accId, conversations);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Không tải được hộp thư Zalo.'));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (infraId: string, accId: string, conversationId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const [items, members] = await Promise.all([
        zaloApi.listMessages(infraId, accId, conversationId, { limit: PAGE_SIZE }),
        zaloApi.listMembers(infraId, accId, conversationId).catch(() => []),
      ]);
      setData((prev) => ({
        ...prev,
        messages: { ...prev.messages, [conversationId]: mergeZaloMessages([], items) },
        members: { ...prev.members, [conversationId]: members },
      }));
      setHasMore((prev) => ({ ...prev, [conversationId]: items.length >= PAGE_SIZE }));
      void zaloApi.markRead(infraId, accId, conversationId).catch(() => undefined);
    } catch (e) {
      if (!silent) showToast(errorMessage(e, 'Không tải được tin nhắn.'));
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, [showToast]);

  const pollThread = useCallback(async (infraId: string, accId: string, conversationId: string) => {
    const current = messagesRef.current[conversationId] || [];
    const newest = current[current.length - 1]?.id;
    try {
      const items = newest
        ? await zaloApi.listMessages(infraId, accId, conversationId, { afterId: newest, limit: PAGE_SIZE })
        : await zaloApi.listMessages(infraId, accId, conversationId, { limit: PAGE_SIZE });
      if (items.length === 0) return;
      const known = new Set(current.map((msg) => msg.id));
      const added = items.reduce((sum, msg) => sum + (msg.id && !known.has(msg.id) ? 1 : 0), 0);
      const atBottom = isNearThreadBottom(threadRef.current);
      skipScrollRef.current = !(added > 0 && atBottom);
      setData((prev) => ({
        ...prev,
        messages: {
          ...prev.messages,
          [conversationId]: mergeZaloMessages(prev.messages[conversationId] || [], items),
        },
      }));
      if (added > 0 && !atBottom && conversationId === activeIdRef.current) {
        setNewMsgCount((n) => n + added);
      }
    } catch {
      // Poll lỗi im lặng; lần sau thử lại.
    }
  }, []);

  const refreshConversations = useCallback(async (infraId: string, accId: string, pollActiveIfChanged = false) => {
    try {
      const conversations = await zaloApi.listConversations(infraId, accId);
      const current = activeIdRef.current;
      const shouldPoll =
        pollActiveIfChanged
        && !!current
        && conversationPulse(conversationsRef.current.find((c) => c.id === current))
          !== conversationPulse(conversations.find((c) => c.id === current));
      setData((prev) => ({ ...prev, conversations }));
      seedZaloUnread(accId, conversations);
      setError(null);
      if (shouldPoll && current) void pollThread(infraId, accId, current);
    } catch {
      // Poll list lỗi im lặng; lần sau thử lại.
    }
  }, [pollThread]);

  useEffect(() => {
    let cancelled = false;
    void zaloApi
      .listSources()
      .then((response) => {
        if (cancelled) return;
        const items = response.items ?? [];
        setInfraSourceId(response.infra_source_id || '');
        setSources(items);
        const resolved = resolveZaloAccount(items);
        setAccountId(resolved.accountId);
        if (resolved.error || items.length === 0) {
          setListLoading(false);
          setError(resolved.error || 'Chưa có phân quyền tài khoản Zalo.');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setListLoading(false);
          setError(errorMessage(e, 'Không tải được danh sách tài khoản Zalo.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!infraSourceId || !accountId) return;
    setActiveId(null);
    setData(emptyZaloInbox());
    setHasMore({});
    setNewMsgCount(0);
    setPane('list');
    void refreshList(infraSourceId, accountId);
  }, [infraSourceId, accountId, refreshList]);

  useEffect(() => {
    setNewMsgCount(0);
  }, [activeId]);

  useEffect(() => {
    if (!infraSourceId || !accountId) return;
    const timer = window.setInterval(() => {
      void refreshConversations(infraSourceId, accountId, true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [infraSourceId, accountId, refreshConversations]);

  useEffect(() => {
    const notifyTimer = { id: 0 as number, pollActive: false };
    const sub = subscribeZaloInbox((event) => {
      const accId = accountIdRef.current;
      if (!accId || event.source_id !== accId) return;
      if (event.conversation_id === activeIdRef.current) notifyTimer.pollActive = true;
      if (notifyTimer.id) window.clearTimeout(notifyTimer.id);
      notifyTimer.id = window.setTimeout(() => {
        const infraId = infraSourceIdRef.current;
        const shouldPoll = notifyTimer.pollActive;
        notifyTimer.pollActive = false;
        if (!infraId || !accId) return;
        void refreshConversations(infraId, accId);
        const current = activeIdRef.current;
        if (shouldPoll && current) void pollThread(infraId, accId, current);
      }, 250);
      if (event.notify && event.conversation_id !== activeIdRef.current) {
        const who = event.conversation_name || 'Zalo';
        showToast(`${who}: ${event.preview || 'Tin nhắn mới'}`);
      }
    });
    return () => {
      sub.stop();
      if (notifyTimer.id) window.clearTimeout(notifyTimer.id);
    };
  }, [refreshConversations, pollThread, showToast]);

  const unreadConvCount = useMemo(
    () => data.conversations.filter((c) => (c.unread_count || 0) > 0).length,
    [data.conversations],
  );

  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    const applyTitle = () => {
      const mode = getDesktopNotificationMode();
      document.title = mode === 'badge' && unreadConvCount > 0 ? `(${unreadConvCount}) ${baseTitle}` : baseTitle;
    };
    applyTitle();
    const sub = subscribeDesktopNotificationMode(applyTitle);
    return () => {
      sub.stop();
      document.title = baseTitle;
    };
  }, [unreadConvCount]);

  const filtered = useMemo(() => {
    let list = [...data.conversations];
    if (labelFilter) {
      list = list.filter((c) => (c.zalo_labels || []).some((l) => l.id === labelFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q));
    return list;
  }, [data.conversations, labelFilter, query]);

  const conv = data.conversations.find((c) => c.id === activeId) ?? null;
  const messages = conv ? data.messages[conv.id] || [] : [];
  const members = conv ? data.members[conv.id] || [] : [];
  const assigned = conv ? zaloHasFolder(data.folderMap, conv.zalo_thread_id) : false;
  const folderLabel = conv ? zaloFolderText(data.folderMap, conv.zalo_thread_id) : null;
  const sourceName = sources.find((s) => s.id === accountId)?.name || 'Zalo';
  const firstConversationId = filtered[0]?.id;

  useEffect(() => {
    if (activeId || listLoading || !infraSourceId || !accountId || !firstConversationId) return;
    setActiveId(firstConversationId);
    setPendingQuote(null);
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === firstConversationId ? { ...c, unread_count: 0, has_external_unread: false } : c,
      ),
    }));
    if (!mobile) setPane('thread');
    void loadThread(infraSourceId, accountId, firstConversationId);
  }, [accountId, activeId, firstConversationId, infraSourceId, listLoading, loadThread, mobile]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length]);

  const selectConversation = (id: string) => {
    setActiveId(id);
    setNotiRegistered(false);
    setData((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, unread_count: 0, has_external_unread: false } : c,
      ),
    }));
    setPendingQuote(null);
    setPane('thread');
    if (infraSourceId && accountId) void loadThread(infraSourceId, accountId, id);
  };

  useEffect(() => {
    if (!conv || !infraSourceId || !accountId) return;
    let cancelled = false;
    setNotiLoading(true);
    void zaloApi
      .getNotificationStatus(infraSourceId, accountId, conv.id)
      .then((res) => {
        if (!cancelled) setNotiRegistered(res.registered);
      })
      .catch(() => {
        if (!cancelled) setNotiRegistered(false);
      })
      .finally(() => {
        if (!cancelled) setNotiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conv?.id, infraSourceId, accountId]);

  const toggleNotification = async () => {
    if (!conv || !infraSourceId || !accountId || notiToggling) return;
    setNotiToggling(true);
    try {
      if (notiRegistered) {
        await zaloApi.unregisterNotification(infraSourceId, accountId, conv.id);
        setNotiRegistered(false);
        showToast('Đã hủy đăng ký thông báo');
      } else {
        await zaloApi.registerNotification(infraSourceId, accountId, conv.id);
        setNotiRegistered(true);
        showToast('Đã đăng ký thông báo Zalo');
      }
    } catch (e) {
      showToast(errorMessage(e, 'Không cập nhật đăng ký thông báo.'));
    } finally {
      setNotiToggling(false);
    }
  };

  const toggleAi = async () => {
    if (!conv || !infraSourceId || !accountId) return;
    const next = conv.ai_enabled === false;
    try {
      await zaloApi.setAi(infraSourceId, accountId, conv.id, next);
      setData((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === conv.id ? { ...c, ai_enabled: next } : c,
        ),
      }));
      showToast(next ? 'Đã bật AI' : 'Đã tắt AI');
    } catch (e) {
      showToast(errorMessage(e, 'Không đổi được trạng thái AI.'));
    }
  };

  const toggleLabel = async (labelId: string) => {
    if (!conv || !infraSourceId || !accountId) return;
    const meta = data.labels.find((l) => l.id === labelId);
    if (!meta) return;
    const on = (conv.zalo_labels || []).some((x) => x.id === labelId);
    try {
      if (on) await zaloApi.removeLabel(infraSourceId, accountId, conv.id, labelId);
      else await zaloApi.addLabel(infraSourceId, accountId, conv.id, labelId);
      setData((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => {
          if (c.id !== conv.id) return c;
          const labels = on
            ? (c.zalo_labels || []).filter((x) => x.id !== labelId)
            : [...(c.zalo_labels || []), meta];
          return { ...c, zalo_labels: labels };
        }),
      }));
    } catch (e) {
      showToast(errorMessage(e, 'Không gắn được nhãn.'));
    }
  };

  const openFolderModal = () => {
    if (!conv) return;
    const cfg = data.folderMap[String(conv.zalo_thread_id)] || {};
    setFolderDraft({
      ragFolderId: cfg.ragFolderId || '',
      faqFolderId: cfg.faqFolderId || '',
      label: cfg.label || '',
      minutes: Number.isFinite(conv.notify_grace_minutes) ? Number(conv.notify_grace_minutes) : 2,
    });
    setFolderModal(true);
  };

  const saveFolder = async () => {
    if (!conv || !infraSourceId || !accountId || savingFolder) return;
    const rag = (folderDraft.ragFolderId || '').trim();
    const faq = (folderDraft.faqFolderId || '').trim();
    const label = (folderDraft.label || '').trim();
    const minutes = Number(folderDraft.minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      showToast('Số phút phải là số nguyên từ 0 đến 1440.');
      return;
    }
    setSavingFolder(true);
    try {
      await zaloApi.setNotifyGrace(infraSourceId, accountId, conv.zalo_thread_id, minutes);
      if (!rag && !faq) {
        await zaloApi.deleteFolderMap(infraSourceId, accountId, conv.zalo_thread_id);
        setData((prev) => {
          const folderMap = { ...prev.folderMap };
          delete folderMap[conv.zalo_thread_id];
          return {
            ...prev,
            folderMap,
            conversations: prev.conversations.map((c) =>
              c.id === conv.id ? { ...c, notify_grace_minutes: minutes } : c,
            ),
          };
        });
      } else {
        const next: ZaloFolderConfig = { ragFolderId: rag, faqFolderId: faq, label };
        await zaloApi.saveFolderMap(infraSourceId, accountId, conv.zalo_thread_id, next);
        setData((prev) => ({
          ...prev,
          folderMap: { ...prev.folderMap, [conv.zalo_thread_id]: next },
          conversations: prev.conversations.map((c) =>
            c.id === conv.id ? { ...c, notify_grace_minutes: minutes } : c,
          ),
        }));
      }
      setFolderModal(false);
      showToast('Đã lưu Folder AI');
    } catch (e) {
      showToast(errorMessage(e, 'Không lưu được Folder AI.'));
    } finally {
      setSavingFolder(false);
    }
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

  const copyUid = async (uid: string) => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      showToast('Đã copy UID');
      window.setTimeout(() => setCopiedUid((cur) => (cur === uid ? null : cur)), 1500);
    } catch {
      showToast('Không copy được');
    }
  };

  const loadMore = async () => {
    if (!conv || !infraSourceId || !accountId || loadingMoreRef.current) return;
    if (!hasMore[conv.id]) return;
    const oldest = messages[0]?.id;
    if (!oldest) return;
    const el = threadRef.current;
    const oldHeight = el?.scrollHeight ?? 0;
    loadingMoreRef.current = true;
    skipScrollRef.current = true;
    try {
      const extra = await zaloApi.listMessages(infraSourceId, accountId, conv.id, { beforeId: oldest, limit: PAGE_SIZE });
      setData((prev) => ({
        ...prev,
        messages: {
          ...prev.messages,
          [conv.id]: mergeZaloMessages(prev.messages[conv.id] || [], extra),
        },
      }));
      setHasMore((prev) => ({ ...prev, [conv.id]: extra.length >= PAGE_SIZE }));
      window.requestAnimationFrame(() => {
        const current = threadRef.current;
        if (current) current.scrollTop += current.scrollHeight - oldHeight;
      });
    } catch (e) {
      showToast(errorMessage(e, 'Không tải thêm tin nhắn.'));
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const sendMessage = useCallback(async (payload: ZaloSendPayload) => {
    const conversationId = activeIdRef.current;
    const infraId = infraSourceIdRef.current;
    const accId = accountIdRef.current;
    if (!conversationId || !infraId || !accId || sendingRef.current) return;
    if (!payload.text.trim() && payload.files.length === 0) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const saved = await zaloApi.sendMessage(infraId, accId, conversationId, payload);
      let next = saved;
      if (payload.files.length && !(next.files && next.files.length)) {
        next = {
          ...next,
          files: payload.files.map((file) => ({
            href: '',
            fileName: file.name,
            kind: file.type.startsWith('image/') ? 'photo' : 'file',
          })),
        };
      }
      if (payload.quoteMessageId && !next.quote) {
        const quoted = (messagesRef.current[conversationId] || []).find(
          (m) => m.id === payload.quoteMessageId || m.zalo_msg_id === payload.quoteMessageId,
        );
        if (quoted) {
          const files = zaloMessageAttachments(quoted);
          next = {
            ...next,
            quote: {
              from: senderLabel(quoted),
              msg: zaloQuotePreview(quoted),
              attach: files.find(zaloIsImageAttachment) || files[0],
              globalMsgId: quoted.zalo_msg_id || quoted.id,
            },
          };
        }
      }
      setData((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === conversationId ? { ...c, last_message_at: next.zalo_created_at, unread_count: 0 } : c,
        ),
        messages: {
          ...prev.messages,
          [conversationId]: mergeZaloMessages(prev.messages[conversationId] || [], next.id ? [next] : []),
        },
      }));
      if (!next.id) void loadThread(infraId, accId, conversationId, true);
      setPendingQuote(null);
    } catch (e) {
      showToast(errorMessage(e, 'Không gửi được tin nhắn.'));
      throw e;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [loadThread, showToast]);

  const onClearQuote = useCallback(() => setPendingQuote(null), []);

  const jumpToLatest = useCallback(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setNewMsgCount(0);
    const infraId = infraSourceIdRef.current;
    const accId = accountIdRef.current;
    const cid = activeIdRef.current;
    if (infraId && accId && cid) void zaloApi.markRead(infraId, accId, cid).catch(() => undefined);
  }, []);

  const jumpToQuoted = useCallback((quote: ZaloQuote) => {
    const id = quote.globalMsgId;
    if (!id || !threadRef.current) return;
    const el = threadRef.current.querySelector(`[data-zalo-msg="${CSS.escape(id)}"]`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('is-jump-highlight');
    window.setTimeout(() => el.classList.remove('is-jump-highlight'), 1600);
  }, []);

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
                <span className="muted">
                  {listLoading ? 'Đang tải...' : `${data.conversations.length} hội thoại`}
                </span>
              </div>
              <div className="zalo-source-pick" ref={sourceMenuRef}>
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Nhóm người dùng"
                  onClick={() => navigateChat(navigate, '/chat/zalo/users')}
                >
                  <IconUsers size={16} />
                </button>
                <span className="zalo-source-name" title={sourceName}>
                  {sources.length === 0 ? 'Chưa có nguồn' : sourceName}
                </span>
                {unreadConvCount > 0 && (
                  <span className="chat-badge">{unreadConvCount > 99 ? '99+' : unreadConvCount}</span>
                )}
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Đổi nguồn Zalo"
                  aria-expanded={sourceMenuOpen}
                  aria-haspopup="listbox"
                  disabled={sources.length === 0}
                  onClick={() => setSourceMenuOpen((open) => !open)}
                >
                  <IconSettings size={16} />
                </button>
                {sourceMenuOpen && sources.length > 0 && (
                  <div className="zalo-source-menu" role="listbox" aria-label="Nguồn Zalo">
                    {sources.map((source) => (
                      <button
                        type="button"
                        key={source.id}
                        role="option"
                        aria-selected={accountId === source.id}
                        className={accountId === source.id ? 'is-active' : undefined}
                        onClick={() => {
                          setAccountId(source.id);
                          setSourceMenuOpen(false);
                        }}
                      >
                        <span>{source.name}</span>
                        {accountId === source.id && unreadConvCount > 0 && (
                          <span className="chat-badge">{unreadConvCount > 99 ? '99+' : unreadConvCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              {error && <p className="chat-hint">{error}</p>}
              {!error && !listLoading && filtered.length === 0 && (
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
                    <ChatAvatar name={c.name} group={c.is_group} imageSrc={c.avatar_url} size={36} />
                    <span className="chat-list-main">
                      <span className="chat-list-title">
                        <span className="chat-list-name-row">
                          <span className={`chat-list-name${unreadN > 0 ? ' zalo-list-unread' : ''}`}>
                            {c.name}
                          </span>
                        </span>
                        <span className="chat-list-time">{zaloListTime(c.last_message_at)}</span>
                      </span>
                      <span className="chat-list-preview">
                        {lastPreview(data.messages[c.id], c.last_preview)}
                      </span>
                      <span className="zalo-list-meta">
                        {asg && (
                          <span className="zalo-chip zalo-chip--folder">
                            {zaloFolderText(data.folderMap, c.zalo_thread_id)}
                          </span>
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
                <ChatAvatar name={conv.name} size={40} group={conv.is_group} imageSrc={conv.avatar_url} />
                <button type="button" className="chat-thread-title" onClick={openInfo}>
                  <span className="chat-thread-name zalo-thread-name">
                    <span>{conv.name}</span>
                    <span className={`zalo-kind${conv.is_group ? ' is-group' : ''}`}>
                      {conv.is_group ? 'Nhóm' : 'Cá nhân'}
                    </span>
                  </span>
                  <span className="chat-thread-sub">{sourceName}</span>
                </button>
                <span className="zalo-ai-switch-wrap">
                  <span>AI</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={conv.ai_enabled !== false}
                    className={`zalo-ai-switch${conv.ai_enabled !== false ? ' is-on' : ''}`}
                    onClick={() => void toggleAi()}
                    title={conv.ai_enabled !== false ? 'Tắt AI' : 'Bật AI'}
                  >
                    <span>{conv.ai_enabled !== false ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-icon-btn"
                    title="Folder AI"
                    onClick={openFolderModal}
                  >
                    <IconSettings size={16} />
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
                      onClick={() => void toggleLabel(l.id)}
                    >
                      {zaloLabelName(l)}
                    </button>
                  );
                })}
              </div>

              <div className="zalo-thread-scroll">
                <div
                  ref={threadRef}
                  className="chat-thread-body"
                  onScroll={(event) => {
                    if (event.currentTarget.scrollTop <= 40) void loadMore();
                    if (isNearThreadBottom(event.currentTarget)) setNewMsgCount((n) => (n === 0 ? n : 0));
                  }}
                >
                {hasMore[conv.id] && (
                  <div className="chat-more">
                    <button type="button" className="secondary" onClick={() => void loadMore()}>
                      ↑ Xem thêm tin nhắn cũ hơn
                    </button>
                  </div>
                )}
                {threadLoading && messages.length === 0 && (
                  <p className="chat-hint" style={{ textAlign: 'center' }}>
                    Đang tải tin nhắn...
                  </p>
                )}
                {!threadLoading && messages.length === 0 && (
                  <p className="chat-hint" style={{ textAlign: 'center' }}>
                    Chưa có tin nhắn nào trong hội thoại này.
                  </p>
                )}
                {messages.map((msg, index) => {
                  const day = zaloDayLabel(msg.zalo_created_at);
                  const prevDay = index > 0 ? zaloDayLabel(messages[index - 1].zalo_created_at) : '';
                  const mine = msg.sender_type === 'bot' || msg.sender_type === 'operator';
                  const on = msg.content.includes('bật');
                  const member = members.find((m) => m.zalo_uid && m.zalo_uid === msg.sender_zalo_uid);
                  const avatarSrc = msg.sender_avatar_url || member?.avatar_url;
                  return (
                    <div key={msg.id} data-zalo-msg={msg.zalo_msg_id || msg.id} data-message-id={msg.id}>
                      {day && day !== prevDay && <div className="chat-day">{day}</div>}
                      {msg.sender_type === 'system' ? (
                        <div className={`chat-msg-system zalo-system${on ? ' is-on' : ' is-off'}`}>
                          {msg.content}
                        </div>
                      ) : (
                      <div className={`chat-msg${mine ? ' chat-msg--mine' : ''}${msg.sender_type === 'bot' ? ' zalo-msg--bot' : ''}`}>
                        {!mine && (
                          <ChatAvatar
                            name={senderLabel(msg)}
                            imageSrc={avatarSrc}
                            size={28}
                          />
                        )}
                        <div className="chat-msg-main">
                          {!mine && <span className="chat-msg-sender">{senderLabel(msg)}</span>}
                          <div className="chat-msg-row">
                            {msg.sender_type === 'operator' &&
                              (msg.operator_display_name || msg.sender_display_name) && (
                                <span className="zalo-msg-operator">
                                  {msg.operator_display_name || msg.sender_display_name}
                                </span>
                              )}
                            <div className="chat-bubble-wrap">
                              <div className={`chat-bubble${zaloBubbleAttachmentClass(msg)}`}>
                                {zaloQuoteHasContent(msg.quote) && msg.quote && (
                                  <ZaloQuotedBlock
                                    quote={msg.quote}
                                    onJump={() => jumpToQuoted(msg.quote!)}
                                  />
                                )}
                                {zaloMessageAttachments(msg).map((file) => (
                                  <ZaloAttachmentBlock
                                    key={`${msg.id}-${zaloAttachmentPreviewSrc(file) || zaloAttachmentOpenHref(file) || zaloAttachmentName(file)}`}
                                    file={file}
                                    onPreview={openFilePreview}
                                  />
                                ))}
                                {zaloMessageDisplayText(msg) ? <ZaloMessageText msg={msg} /> : null}
                                <span className="chat-msg-time">{zaloFmtTime(msg.zalo_created_at)}</span>
                              </div>
                            </div>
                            <div className="chat-msg-actions">
                              <button
                                type="button"
                                className="chat-msg-action"
                                title="Trả lời"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPendingQuote(msg);
                                }}
                              >
                                <IconReply size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
                </div>
                {newMsgCount > 0 && (
                  <button type="button" className="zalo-new-msg-pill" onClick={jumpToLatest}>
                    {newMsgCount > 99 ? '99+' : newMsgCount} tin mới
                  </button>
                )}
              </div>

              <ZaloComposer
                key={conv.id}
                members={members}
                pendingQuote={pendingQuote}
                sending={sending}
                onClearQuote={onClearQuote}
                onSend={sendMessage}
              />
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

        <aside className="chat-panel chat-panel--info">
          <div className="chat-info">
            <header className="chat-info-head">
              <strong>Thông tin</strong>
              <button
                type="button"
                className="chat-icon-btn"
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
                  <ChatAvatar name={conv.name} size={64} group={conv.is_group} imageSrc={conv.avatar_url} />
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
                  <button
                    type="button"
                    className={`zalo-ai-row${notiRegistered ? ' is-on' : ''}`}
                    disabled={notiLoading || notiToggling}
                    onClick={() => void toggleNotification()}
                  >
                    <span>
                      <strong>
                        {notiLoading
                          ? 'Đang kiểm tra...'
                          : notiRegistered
                            ? 'Đã đăng ký thông báo'
                            : 'Chưa đăng ký thông báo'}
                      </strong>
                      <small>
                        {notiRegistered
                          ? 'Nhận thông báo ARITO qua hội thoại này (kênh zalo_conversation).'
                          : 'Đăng ký để nhận thông báo ARITO qua hội thoại Zalo này.'}
                      </small>
                    </span>
                    <span className={`zalo-ai-switch${notiRegistered ? ' is-on' : ''}`}>
                      <span>{notiRegistered ? 'ON' : 'OFF'}</span>
                    </span>
                  </button>
                </section>

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Trả lời AI</div>
                  <button
                    type="button"
                    className={`zalo-ai-row${conv.ai_enabled !== false ? ' is-on' : ''}`}
                    onClick={() => void toggleAi()}
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

                {conv.ai_enabled !== false && (
                <section className="chat-info-section">
                  <div className="chat-info-section-head">
                    Folder AI
                    <button
                      type="button"
                      className="chat-icon-btn"
                      title="Cấu hình Folder AI"
                      onClick={openFolderModal}
                    >
                      <IconSettings size={16} />
                    </button>
                  </div>
                  {assigned || data.folderMap[conv.zalo_thread_id]?.label ? (
                    <div className="zalo-folder-card">
                      {data.folderMap[conv.zalo_thread_id]?.label && (
                        <strong>{data.folderMap[conv.zalo_thread_id].label}</strong>
                      )}
                      {data.folderMap[conv.zalo_thread_id]?.ragFolderId && <small>RAG</small>}
                      {data.folderMap[conv.zalo_thread_id]?.faqFolderId && <small>FAQ</small>}
                    </div>
                  ) : null}
                </section>
                )}

                <section className="chat-info-section">
                  <div className="chat-info-section-head">Thành viên · {members.length}</div>
                  <ul className="chat-member-list">
                    {members.map((m) => (
                      <li key={m.id}>
                        <ChatAvatar name={m.display_name} imageSrc={m.avatar_url} size={32} />
                        <span className="chat-member-main">
                          <span className="chat-member-name">{m.display_name}</span>
                        </span>
                        <span className="chat-member-actions">
                          <button
                            type="button"
                            className="chat-icon-btn"
                            title="Copy UID"
                            onClick={() => void copyUid(m.zalo_uid)}
                          >
                            {copiedUid === m.zalo_uid ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          </button>
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
                <h2>Cấu hình Folder AI</h2>
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
              <label>
                Số phút
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={folderDraft.minutes ?? ''}
                  onChange={(e) =>
                    setFolderDraft((d) => ({
                      ...d,
                      minutes: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                />
              </label>
              <p className="muted" style={{ margin: 0 }}>
                Thời gian chờ thông báo, 0–1440 phút.
              </p>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setFolderModal(false)}>
                Hủy
              </button>
              <button type="button" disabled={savingFolder} onClick={() => void saveFolder()}>
                {savingFolder ? 'Đang lưu...' : 'Lưu'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {filePreview && (
        <ZaloFilePreviewModal
          fileName={zaloAttachmentName(filePreview)}
          openHref={zaloAttachmentOpenHref(filePreview)}
          isImage={zaloIsImageAttachment(filePreview)}
          onClose={() => setFilePreview(null)}
        />
      )}
      {toast && <div className="zalo-toast">{toast}</div>}
    </div>
  );
}
