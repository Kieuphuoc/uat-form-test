import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type UIEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatFolderUrl, newClientMsgId, notifyModeLabel, botAvatarUrl, type ChatAttachmentItem, type ChatBotCatalogItem } from '../api/chatApi';
import { nextOaNotifyMode, oaApi, type OaContact, type OaConversation, type OaMessage } from '../api/oaApi';
import { useAuth } from '../auth/AuthContext';
import {
  IconBack,
  IconBell,
  IconBellOff,
  IconBot,
  IconCheck,
  IconClose,
  IconFile,
  IconInfo,
  IconPaperclip,
  IconRetry,
  IconSearch,
  IconSend,
  IconSettings,
  IconUsers,
  IconWait,
} from '../components/AppIcons';
import { ChatAvatar, useFileBlobUrl } from '../components/chat/ChatAvatar';
import { ChatBotCatalogSection } from '../components/chat/ChatBotCatalogSection';
import { ChatFileSection, ChatFileTile } from '../components/chat/ChatFileGrid';
import { ChatMarkdownClamped, ChatMarkdownViewer } from '../components/chat/ChatMarkdown';
import { FilePreviewModal } from '../components/chat/FilePreviewModal';
import { resizeChatImage } from '../lib/chatImageResize';
import { loadChatBots } from '../lib/chatBotsCache';
import { navigateChat } from '../lib/chatNav';
import { mobileKeyboardFocusHandlers, refocusComposer } from '../lib/keyboardBridge';
import { reloadOaConversations, patchOaConversation, markAllOaConversationsRead, subscribeOaConversations, subscribeOaMessages } from '../lib/chatTransport';

const PAGE_SIZE = 30;
const MESSAGE_LIMIT = 50;
const MAX_UNREAD_PRELOAD = 50;
const FILES_PREVIEW_LIMIT = 10;
const MARK_READ_DEBOUNCE_MS = 800;
const LIST_WIDTH_KEY = 'arito-oa:list-width';
const INFO_WIDTH_KEY = 'arito-oa:info-width';
const COMPOSER_MAX_LINES = 8;
const LINE_HEIGHT_FALLBACK = 20;
const OA_REPLY_MAX_LINES = 10;

type Pane = 'list' | 'thread' | 'info';
type ListMode = 'conversations' | 'contacts';

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function storedWidth(key: string, fallback: number): number {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

function formatFileSize(value?: number | null): string {
  if (!value || value < 1024) return `${value ?? 0} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function resizeComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const styles = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight) || LINE_HEIGHT_FALLBACK;
  const pad = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const max = lineHeight * COMPOSER_MAX_LINES + pad;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

function previewOf(item: OaConversation): string {
  const prefix = item.last_direction === 'outbound' ? 'Nhân viên: ' : '';
  return `${prefix}${item.last_preview || 'Chưa có tin nhắn'}`;
}

function compareOaMessages(a: OaMessage, b: OaMessage): number {
  const aLocal = a.id < 0;
  const bLocal = b.id < 0;
  if (aLocal !== bLocal) return aLocal ? 1 : -1;
  const byTime = (a.created_at || '').localeCompare(b.created_at || '');
  if (byTime !== 0) return byTime;
  return a.id - b.id;
}

function mergeMessages(current: OaMessage[], incoming: OaMessage[]): OaMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map<number, OaMessage>();
  const idByClient = new Map<string, number>();
  for (const item of current) {
    byId.set(item.id, item);
    if (item.client_msg_id) idByClient.set(item.client_msg_id, item.id);
  }
  for (const item of incoming) {
    let next = item;
    if (next.client_msg_id) {
      const existingId = idByClient.get(next.client_msg_id);
      if (existingId != null && existingId !== next.id) {
        const existing = byId.get(existingId);
        if (existing && existing.id > 0 && next.id < 0) continue;
        if (existing?.attachment_url && !next.attachment_url) {
          next = { ...next, attachment_url: existing.attachment_url };
        }
        byId.delete(existingId);
      }
    }
    byId.set(next.id, next);
    if (next.client_msg_id) idByClient.set(next.client_msg_id, next.id);
  }
  return [...byId.values()].sort(compareOaMessages);
}

function isNearThreadBottom(el: HTMLElement | null, px = 80): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < px;
}

function firstUnreadMessageId(items: OaMessage[], lastReadId: number, unreadCount: number): number {
  if (unreadCount <= 0 || items.length === 0) return 0;
  if (lastReadId > 0) {
    return items.find((m) => m.id > lastReadId && m.direction === 'inbound')?.id ?? 0;
  }
  const inbound = items.filter((m) => m.direction === 'inbound' && m.id > 0);
  if (inbound.length === 0) return 0;
  return inbound[Math.max(0, inbound.length - unreadCount)]?.id ?? 0;
}

function isImageMessage(msg: OaMessage): boolean {
  return msg.msg_type === 'image' || !!msg.file_content_type?.startsWith('image/');
}

function messageFileName(msg: OaMessage): string {
  return msg.file_name || msg.body || (isImageMessage(msg) ? 'Ảnh đính kèm' : 'Tệp đính kèm');
}

const IMAGE_THUMB_SIZE = 256;

function useOaFileUrl(threadId: number, fileId?: string | null, size = 0): string | null {
  const key = threadId > 0 && fileId ? `oa:${threadId}:${fileId}:${size}` : null;
  return useFileBlobUrl(
    key,
    threadId > 0 && fileId ? () => oaApi.attachmentBlob(threadId, fileId, size) : null,
  );
}

function OaFileTile({
  threadId,
  item,
  onOpen,
}: {
  threadId: number;
  item: ChatAttachmentItem;
  onOpen: () => void;
}) {
  const imageUrl = useOaFileUrl(threadId, item.is_image ? item.file_id : null, IMAGE_THUMB_SIZE);
  return (
    <ChatFileTile
      fileName={item.file_name}
      isImage={item.is_image}
      imageUrl={imageUrl}
      onOpen={onOpen}
    />
  );
}

function OaAttachmentBlock({
  msg,
  threadId,
  onPreview,
}: {
  msg: OaMessage;
  threadId: number;
  onPreview: () => void;
}) {
  const isImage = isImageMessage(msg);
  const fileThreadId = msg.thread_id || threadId;
  const remoteUrl = useOaFileUrl(fileThreadId, msg.file_id, isImage ? IMAGE_THUMB_SIZE : 0);
  const src = msg.attachment_url || remoteUrl;
  const canPreview = !!msg.file_id;

  if (isImage) {
    return (
      <button
        type="button"
        className="chat-attachment-image"
        title={canPreview ? 'Xem ảnh' : messageFileName(msg)}
        disabled={!canPreview && !src}
        onClick={() => {
          if (canPreview) onPreview();
        }}
      >
        {src ? <img src={src} alt={messageFileName(msg)} /> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chat-attachment-file"
      title={messageFileName(msg)}
      disabled={!canPreview}
      onClick={() => {
        if (canPreview) onPreview();
      }}
    >
      <span className="chat-attachment-file-icon">
        <IconFile size={28} />
      </span>
      <span>
        <strong>{messageFileName(msg)}</strong>
        <small>{formatFileSize(msg.file_size_bytes)}</small>
      </span>
    </button>
  );
}

function OaComposer({
  canSend,
  blockReason,
  placeholder,
  onSend,
}: {
  canSend: boolean;
  blockReason: string;
  placeholder: string;
  onSend: (text: string, files: File[]) => void | Promise<void>;
}) {
  const { mobile } = useAuth();
  const keyboardHandlers = useMemo(() => mobileKeyboardFocusHandlers(mobile), [mobile]);
  const [draft, setDraft] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canSendRef = useRef(canSend);
  const queuedRef = useRef<QueuedFile[]>([]);
  const submittingRef = useRef(false);
  queuedRef.current = queuedFiles;

  useEffect(() => {
    canSendRef.current = canSend;
  }, [canSend]);

  const addFiles = useCallback((files: File[]) => {
    if (!canSendRef.current || files.length === 0) return;
    setQueuedFiles((current) => {
      const remaining = Math.max(0, 10 - current.length);
      const accepted = files.slice(0, remaining);
      setAttachmentError(accepted.length < files.length ? 'Mỗi lần gửi tối đa 10 file.' : null);
      return [
        ...current,
        ...accepted.map((file, index) => ({
          id: `${Date.now()}-${index}-${file.name}`,
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        })),
      ];
    });
  }, []);

  useEffect(() => {
    const addQueuedFiles = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      if (Array.isArray(files)) addFiles(files);
    };
    window.addEventListener('arito-oa-add-files', addQueuedFiles);
    return () => {
      window.removeEventListener('arito-oa-add-files', addQueuedFiles);
      queuedRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
  }, [addFiles]);

  const removeFile = (id: string) => {
    setQueuedFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const submit = () => {
    const text = draft.trim();
    const queued = queuedRef.current;
    if ((!text && queued.length === 0) || !canSendRef.current || submittingRef.current) return;
    submittingRef.current = true;
    const files = queued.map((item) => item.file);
    queued.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setDraft('');
    setQueuedFiles([]);
    setAttachmentError(null);
    window.requestAnimationFrame(() => {
      resizeComposer(textareaRef.current);
      refocusComposer(textareaRef.current);
      submittingRef.current = false;
    });
    void Promise.resolve(onSend(text, files)).then(() => refocusComposer(textareaRef.current));
  };

  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <form className="chat-composer oa-composer" onSubmit={submitForm}>
      {!canSend ? <div className="chat-composer-block">{blockReason}</div> : null}
      <div className="chat-composer-row">
        <button
          type="button"
          className="chat-attach"
          disabled={!canSend}
          title="Đính kèm file"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPaperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <textarea
          ref={textareaRef}
          value={draft}
          onFocus={keyboardHandlers.onFocus}
          onBlur={keyboardHandlers.onBlur}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            resizeComposer(event.currentTarget);
          }}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
              .map((item) => item.getAsFile())
              .filter((file): file is File => file !== null);
            if (images.length > 0) {
              event.preventDefault();
              addFiles(images);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          disabled={!canSend}
          rows={1}
          title={canSend ? 'Enter để gửi, Shift+Enter xuống dòng' : blockReason}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={!canSend || (!draft.trim() && queuedFiles.length === 0)}
          title="Gửi (Enter)"
        >
          <IconSend size={18} />
        </button>
      </div>
      {queuedFiles.length > 0 && (
        <div className="chat-attachment-tray" aria-label="File đang chờ gửi">
          {queuedFiles.map((item) => (
            <div
              key={item.id}
              className={`chat-queued-file${item.previewUrl ? ' chat-queued-file--image' : ''}`}
            >
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.file.name} />
              ) : (
                <span className="chat-queued-file-doc">
                  <IconFile size={26} />
                </span>
              )}
              {!item.previewUrl && <span className="chat-queued-file-name">{item.file.name}</span>}
              <button type="button" onClick={() => removeFile(item.id)} aria-label={`Bỏ ${item.file.name}`}>
                x
              </button>
            </div>
          ))}
        </div>
      )}
      {attachmentError && <div className="chat-attachment-error">{attachmentError}</div>}
    </form>
  );
}

export function OaChatPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { mobile } = useAuth();
  const routeId = Number(params.conversationId || 0);
  const [pane, setPane] = useState<Pane>(routeId > 0 ? 'thread' : 'list');
  const [listMode, setListMode] = useState<ListMode>('conversations');
  const [conversations, setConversations] = useState<OaConversation[]>([]);
  const [contacts, setContacts] = useState<OaContact[]>([]);
  const [selected, setSelected] = useState<OaConversation | null>(null);
  const [messages, setMessages] = useState<OaMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState('');
  const [listWidth, setListWidth] = useState(() => storedWidth(LIST_WIDTH_KEY, 320));
  const [infoWidth, setInfoWidth] = useState(() => storedWidth(INFO_WIDTH_KEY, 300));
  const [infoVisible, setInfoVisible] = useState(true);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [preview, setPreview] = useState<{
    fileId: string;
    fileName: string;
    contentType?: string | null;
  } | null>(null);
  const [mdViewer, setMdViewer] = useState<{ title: string; text: string } | null>(null);
  const [infoFiles, setInfoFiles] = useState<ChatAttachmentItem[]>([]);
  const [infoFilesTotal, setInfoFilesTotal] = useState(0);
  const [infoFolderUrl, setInfoFolderUrl] = useState<string | null>(null);
  const [infoFilesThreadId, setInfoFilesThreadId] = useState(0);
  const [bots, setBots] = useState<ChatBotCatalogItem[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReplyBusy, setAiReplyBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);
  const localUrlsRef = useRef<string[]>([]);
  const optimisticIdRef = useRef(-1);
  const pendingFilesRef = useRef(new Map<string, File>());
  const messagesRef = useRef<OaMessage[]>([]);
  /** Mốc catch-up theo after_id; -1 khi đang mở hội thoại để chặn fetch nửa vời. */
  const lastIdRef = useRef(-1);
  const markReadTimerRef = useRef<number | null>(null);
  const pendingReadIdRef = useRef(0);
  const lastReadIdRef = useRef(0);
  const openGenRef = useRef(0);
  const infoThreadRef = useRef(0);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const nearBottomRef = useRef(true);
  /** Chặn mark-read khi scroll chương trình (mở hội thoại) — không đụng unread thật. */
  const ignoreScrollReadRef = useRef(false);
  const [threadFocusKey, setThreadFocusKey] = useState(0);
  const [unreadPill, setUnreadPill] = useState<{ count: number; messageId: number } | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [stickyExpired, setStickyExpired] = useState(false);

  const selectedId = selected?.id ?? 0;
  const visibleInfoFiles = infoFilesThreadId === selectedId ? infoFiles : [];
  const visibleInfoTotal = infoFilesThreadId === selectedId ? infoFilesTotal : 0;
  const stickyUntil = selected?.active_bot_until ?? null;

  useEffect(() => {
    setStickyExpired(false);
    if (!stickyUntil) return undefined;
    const ms = Date.parse(stickyUntil) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) {
      setStickyExpired(true);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStickyExpired(true);
      void reloadOaConversations();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [stickyUntil, selected?.id, selected?.active_bot_folder_id]);
  const canSend = !!selected?.can_send;
  const blockReason = selected?.send_block_reason || 'Chọn hội thoại để trả lời.';
  const remainingQuota = selected
    ? Math.max(0, (selected.outbound_limit || 8) - (selected.outbound_window_count || 0))
    : 0;
  const composerPlaceholder = selected?.can_send
    ? `Nhập tin nhắn... còn ${remainingQuota}/${selected.outbound_limit || 8} tin tương tác`
    : blockReason;
  messagesRef.current = messages;

  const onOpenLarge = useCallback((text: string) => {
    setMdViewer({ title: selected?.title || 'Nội dung tin nhắn', text });
  }, [selected?.title]);

  useEffect(() => {
    return () => {
      localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
  }, [listWidth]);

  useEffect(() => {
    window.localStorage.setItem(INFO_WIDTH_KEY, String(infoWidth));
  }, [infoWidth]);

  useEffect(() => {
    void loadChatBots()
      .then((items) => setBots(items))
      .catch(() => setBots([]));
  }, []);

  const applyAi = async (body: { bot_folder_id?: string | null; enabled?: boolean | null }) => {
    if (!selected || aiBusy) return;
    setAiBusy(true);
    try {
      const next = await oaApi.setAi(selected.id, body);
      setSelected(next);
      setConversations((prev) => prev.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được AI OA.');
    } finally {
      setAiBusy(false);
    }
  };

  const triggerAiReply = async () => {
    if (!selected || aiReplyBusy || !selected.ai_effective) return;
    setAiReplyBusy(true);
    try {
      const message = await oaApi.triggerAiReply(selected.id);
      setMessages((prev) => mergeMessages(prev, [message]));
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              ai_pending: false,
              last_direction: 'outbound',
              last_message_id: message.id,
              last_message_at: message.created_at,
              last_preview: message.body || prev.last_preview,
            }
          : prev,
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                ai_pending: false,
                last_direction: 'outbound',
                last_message_id: message.id,
                last_message_at: message.created_at,
                last_preview: message.body || c.last_preview,
              }
            : c,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI không trả lời được.');
    } finally {
      setAiReplyBusy(false);
    }
  };

  const canTriggerAiReply =
    !!selected?.ai_effective &&
    !aiReplyBusy &&
    (selected.ai_pending || selected.last_direction === 'inbound');

  useEffect(() => {
    setPreview(null);
    const switched = infoThreadRef.current !== selectedId;
    infoThreadRef.current = selectedId;
    if (switched) {
      setInfoFiles([]);
      setInfoFilesTotal(0);
      setInfoFolderUrl(null);
      setInfoFilesThreadId(0);
    }
    if (selectedId <= 0) return;
    let disposed = false;
    void oaApi.listAttachments(selectedId, FILES_PREVIEW_LIMIT).then(
      (result) => {
        if (disposed) return;
        setInfoFiles(result.items ?? []);
        setInfoFilesTotal(result.total ?? result.items?.length ?? 0);
        setInfoFolderUrl(chatFolderUrl(result.folder_id, result.folder_name));
        setInfoFilesThreadId(selectedId);
      },
      () => {
        if (!disposed) {
          setInfoFiles([]);
          setInfoFilesTotal(0);
          setInfoFolderUrl(null);
          setInfoFilesThreadId(0);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [selectedId, selected?.last_message_id]);

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

  const openInfo = useCallback(() => {
    if (window.matchMedia('(max-width: 1023px)').matches || mobile) setPane('info');
    else setInfoVisible((value) => !value);
  }, [mobile]);

  const closeInfo = useCallback(() => {
    if (window.matchMedia('(max-width: 1023px)').matches || mobile) setPane('thread');
    else setInfoVisible(false);
  }, [mobile]);

  const queueMarkRead = useCallback((threadId: number, messageId: number) => {
    if (threadId <= 0 || messageId <= pendingReadIdRef.current) return;
    pendingReadIdRef.current = messageId;
    lastReadIdRef.current = messageId;
    if (markReadTimerRef.current !== null) window.clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = window.setTimeout(() => {
      markReadTimerRef.current = null;
      void oaApi
        .markRead(threadId, pendingReadIdRef.current)
        .then((res) => {
          patchOaConversation(threadId, {
            unread_count: 0,
            last_read_message_id: res.last_read_message_id,
          });
          setUnreadPill(null);
        })
        .catch(() => undefined);
    }, MARK_READ_DEBOUNCE_MS);
  }, []);

  const markThreadRead = useCallback(async (threadId: number, messageId?: number) => {
    if (threadId <= 0) return;
    try {
      const res = await oaApi.markRead(threadId, messageId);
      pendingReadIdRef.current = Math.max(pendingReadIdRef.current, res.last_read_message_id);
      lastReadIdRef.current = res.last_read_message_id;
      patchOaConversation(threadId, {
        unread_count: 0,
        last_read_message_id: res.last_read_message_id,
      });
      if (threadId === selectedId) setUnreadPill(null);
    } catch {
      // Đánh dấu đọc lỗi không chặn xem tin.
    }
  }, [selectedId]);

  const markAllRead = useCallback(async () => {
    try {
      await oaApi.markAllRead();
      markAllOaConversationsRead();
      pendingReadIdRef.current = Math.max(pendingReadIdRef.current, lastIdRef.current);
      lastReadIdRef.current = Math.max(lastReadIdRef.current, lastIdRef.current);
      setUnreadPill(null);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không đánh dấu đã đọc được.');
    }
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      setContacts(await oaApi.listContacts({ search, page: 1, pageSize: PAGE_SIZE }));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không tải được danh bạ OA.');
    } finally {
      setLoadingContacts(false);
    }
  }, [search]);

  const openThread = useCallback(async (id: number) => {
    if (!id) return;
    const gen = ++openGenRef.current;
    setLoadingThread(true);
    lastIdRef.current = -1;
    pendingReadIdRef.current = 0;
    lastReadIdRef.current = 0;
    setUnreadPill(null);
    setPreview(null);
    setMessages([]);
    setHasMore(false);
    setInfoFiles([]);
    setInfoFilesTotal(0);
    setInfoFolderUrl(null);
    setInfoFilesThreadId(0);
    const fromList = conversationsRef.current.find((item) => item.id === id);
    if (fromList) setSelected(fromList);
    try {
      const opened = await oaApi.openConversation(id, Math.min(100, MESSAGE_LIMIT + MAX_UNREAD_PRELOAD));
      if (gen !== openGenRef.current) return;
      setSelected(opened.conversation);
      setMessages(opened.messages);
      setHasMore(opened.has_more);
      setPane('thread');
      const lastId = opened.messages.at(-1)?.id ?? 0;
      lastIdRef.current = lastId;
      const lastRead = opened.conversation.last_read_message_id ?? 0;
      lastReadIdRef.current = lastRead;
      pendingReadIdRef.current = lastRead;
      const unread = opened.conversation.unread_count || 0;
      if (unread > 0) {
        setUnreadPill({
          count: unread,
          messageId: firstUnreadMessageId(opened.messages, lastRead, unread),
        });
      }
      nearBottomRef.current = true;
      setThreadFocusKey(Date.now());
    } catch (ex) {
      if (gen !== openGenRef.current) return;
      lastIdRef.current = 0;
      setError(ex instanceof Error ? ex.message : 'Không tải được hội thoại OA.');
    } finally {
      if (gen === openGenRef.current) setLoadingThread(false);
    }
  }, []);

  /** Danh sách OA do chatTransport giữ cache và vá tại chỗ theo realtime. */
  useEffect(() => {
    setLoadingList(true);
    const sub = subscribeOaConversations(search, (items) => {
      setConversations(items);
      setLoadingList(false);
    });
    return () => sub.stop();
  }, [search]);

  /** Bám hội thoại đang chọn theo danh sách mới nhất, hoặc mở hội thoại đầu tiên. */
  useEffect(() => {
    if (conversations.length === 0) return;
    const id = routeId > 0 ? routeId : selectedId;
    if (id > 0) {
      const match = conversations.find((item) => item.id === id);
      if (match) {
        setSelected((prev) => (prev?.id === match.id ? { ...prev, ...match } : prev));
      }
      return;
    }
    if (listMode !== 'conversations' || mobile) return;
    if (window.matchMedia('(max-width: 1023px)').matches) return;
    navigateChat(navigate, `/chat/oa/${conversations[0].id}`, { replace: true });
  }, [conversations, listMode, mobile, navigate, routeId, selectedId]);

  useEffect(() => {
    if (listMode === 'contacts') void loadContacts();
  }, [listMode, loadContacts]);

  useEffect(() => {
    if (routeId > 0) void openThread(routeId);
  }, [openThread, routeId]);

  const scrollThreadToEnd = useCallback(() => {
    const apply = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = isNearThreadBottom(el);
    };
    apply();
    window.requestAnimationFrame(() => {
      apply();
      window.requestAnimationFrame(apply);
    });
  }, []);

  /** Canh cuối thread sau khi React vẽ tin — setTimeout(0) trong openThread chạy trước paint. */
  useEffect(() => {
    if (threadFocusKey <= 0 || loadingThread) return;
    ignoreScrollReadRef.current = true;
    const apply = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = isNearThreadBottom(el);
    };
    const frame = window.requestAnimationFrame(() => {
      apply();
      window.requestAnimationFrame(apply);
    });
    const settle = window.setTimeout(() => {
      apply();
      ignoreScrollReadRef.current = false;
    }, 400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      ignoreScrollReadRef.current = false;
    };
  }, [threadFocusKey, loadingThread]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const sub = subscribeOaMessages(
      selectedId,
      () => lastIdRef.current,
      (items) => {
        setMessages((current) => mergeMessages(current, items));
        const newest = items.reduce((max, item) => (item.id > max ? item.id : max), 0);
        if (newest > lastIdRef.current) lastIdRef.current = newest;
        const inbound = items.filter((item) => item.direction === 'inbound' && item.id > 0);
        const atBottom = nearBottomRef.current || isNearThreadBottom(scrollRef.current);
        const watching = document.visibilityState === 'visible' && document.hasFocus();
        if (atBottom && watching) {
          if (newest > 0) queueMarkRead(selectedId, newest);
          setUnreadPill(null);
          scrollThreadToEnd();
          return;
        }
        if (inbound.length > 0) {
          setUnreadPill((prev) => ({
            count: (prev?.count ?? 0) + inbound.length,
            messageId: prev?.messageId || inbound[0].id,
          }));
        }
      },
    );
    return () => sub.stop();
  }, [queueMarkRead, selectedId, scrollThreadToEnd]);

  useEffect(() => () => {
    if (markReadTimerRef.current !== null) window.clearTimeout(markReadTimerRef.current);
  }, []);

  /** Refresh thủ công: nơi duy nhất còn kéo lịch sử từ Zalo. */
  const syncThread = async () => {
    if (!selectedId || syncing) return;
    setSyncing(true);
    try {
      const opened = await oaApi.syncConversation(selectedId, MESSAGE_LIMIT);
      setSelected(opened.conversation);
      setMessages((current) => mergeMessages(current, opened.messages));
      setHasMore(opened.has_more);
      const newest = opened.messages.at(-1)?.id ?? 0;
      if (newest > lastIdRef.current) lastIdRef.current = newest;
      void reloadOaConversations();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không đồng bộ được hội thoại OA.');
    } finally {
      setSyncing(false);
    }
  };

  const loadOlder = async () => {
    const firstId = messages.find((item) => item.id > 0)?.id;
    if (!selectedId || !firstId) return;
    const older = await oaApi.listMessages(selectedId, { beforeId: firstId, limit: MESSAGE_LIMIT });
    setMessages((current) => mergeMessages(older, current));
    setHasMore(older.length >= MESSAGE_LIMIT);
  };

  const jumpToUnread = async () => {
    if (!selectedId || !unreadPill) return;
    let targetId = unreadPill.messageId;
    let items = messagesRef.current;
    if (targetId <= 0) {
      targetId = firstUnreadMessageId(items, lastReadIdRef.current, unreadPill.count);
    }
    for (let i = 0; i < 6 && targetId > 0 && !items.some((item) => item.id === targetId); i += 1) {
      const firstId = items.find((item) => item.id > 0)?.id;
      if (!firstId || firstId <= targetId) break;
      const older = await oaApi.listMessages(selectedId, { beforeId: firstId, limit: MESSAGE_LIMIT });
      if (older.length === 0) break;
      items = mergeMessages(older, items);
      if (!targetId) targetId = firstUnreadMessageId(items, lastReadIdRef.current, unreadPill.count);
    }
    setMessages(items);
    const newest = items.reduce((max, item) => (item.id > max ? item.id : max), 0);
    window.requestAnimationFrame(() => {
      const node =
        targetId > 0
          ? scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${targetId}"]`)
          : null;
      if (node) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        node.classList.add('is-jump-highlight');
        window.setTimeout(() => node.classList.remove('is-jump-highlight'), 1600);
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    await markThreadRead(selectedId, newest || undefined);
  };

  const toggleNotify = async () => {
    if (!selectedId || notifyBusy) return;
    const next = nextOaNotifyMode(selected?.notify_mode);
    setNotifyBusy(true);
    try {
      const saved = await oaApi.setNotifyMode(selectedId, next);
      patchOaConversation(selectedId, { notify_mode: saved.notify_mode });
      setSelected((prev) => (prev && prev.id === selectedId ? { ...prev, notify_mode: saved.notify_mode } : prev));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không đổi được cài thông báo.');
    } finally {
      setNotifyBusy(false);
    }
  };

  const onThreadScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    nearBottomRef.current = isNearThreadBottom(el);
    if (ignoreScrollReadRef.current) return;
    if (nearBottomRef.current && unreadPill) {
      const newest = messagesRef.current.reduce((max, item) => (item.id > max ? item.id : max), 0);
      if (newest > 0) queueMarkRead(selectedId, newest);
    }
  };

  /** Sau khi gửi tin: làm mới danh sách, effect đồng bộ sẽ cập nhật lại hội thoại đang chọn. */
  const refreshSelectedFromList = () => reloadOaConversations();

  const markFailed = (clientMsgId: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.client_msg_id === clientMsgId && item.send_status
          ? { ...item, send_status: 'failed' }
          : item,
      ),
    );
  };

  const deliverText = async (threadId: number, clientMsgId: string, text: string) => {
    try {
      const message = await oaApi.sendMessage(threadId, text, clientMsgId);
      setMessages((current) => mergeMessages(current, [message]));
      setError('');
      setUnreadPill(null);
      patchOaConversation(threadId, { unread_count: 0, last_read_message_id: message.id });
      void refreshSelectedFromList();
    } catch (ex) {
      markFailed(clientMsgId);
      setError(ex instanceof Error ? ex.message : 'Không gửi được tin OA.');
    }
  };

  const deliverFile = async (threadId: number, clientMsgId: string, file: File) => {
    try {
      const prepared = await resizeChatImage(file);
      const message = await oaApi.sendAttachment(threadId, prepared, clientMsgId);
      if (message.file_content_type?.startsWith('image/') && !message.attachment_url) {
        const existing = messagesRef.current.find((item) => item.client_msg_id === clientMsgId);
        if (existing?.attachment_url) message.attachment_url = existing.attachment_url;
      }
      pendingFilesRef.current.delete(clientMsgId);
      setMessages((current) => mergeMessages(current, [message]));
      setError('');
      setUnreadPill(null);
      patchOaConversation(threadId, { unread_count: 0, last_read_message_id: message.id });
      void refreshSelectedFromList();
    } catch (ex) {
      markFailed(clientMsgId);
      setError(ex instanceof Error ? ex.message : 'Không gửi được file OA.');
    }
  };

  const sendMessage = (text: string, files: File[]) => {
    if (!selectedId || !canSend || (!text.trim() && files.length === 0)) return;
    const now = new Date().toISOString();
    const created: OaMessage[] = [];

    const trimmed = text.trim();
    if (trimmed) {
      const clientMsgId = newClientMsgId();
      created.push({
        id: optimisticIdRef.current--,
        thread_id: selectedId,
        direction: 'outbound',
        sender_type: 'agent',
        sender_user_id: null,
        msg_type: 'text',
        body: trimmed,
        client_msg_id: clientMsgId,
        sender_is_me: true,
        created_at: now,
        send_status: 'sending',
      });
    }

    for (const file of files) {
      const clientMsgId = newClientMsgId();
      const isImage = file.type.startsWith('image/');
      let previewUrl: string | null = null;
      if (isImage) {
        previewUrl = URL.createObjectURL(file);
        localUrlsRef.current.push(previewUrl);
      }
      pendingFilesRef.current.set(clientMsgId, file);
      created.push({
        id: optimisticIdRef.current--,
        thread_id: selectedId,
        direction: 'outbound',
        sender_type: 'agent',
        sender_user_id: null,
        msg_type: isImage ? 'image' : 'file',
        body: file.name,
        client_msg_id: clientMsgId,
        file_name: file.name,
        file_content_type: file.type || null,
        file_size_bytes: file.size,
        attachment_url: previewUrl,
        sender_is_me: true,
        created_at: now,
        send_status: 'sending',
      });
    }

    setMessages((current) => mergeMessages(current, created));
    scrollThreadToEnd();

    void (async () => {
      for (const item of created) {
        if (!item.client_msg_id) continue;
        if (item.msg_type === 'text' && item.body) {
          await deliverText(selectedId, item.client_msg_id, item.body);
          continue;
        }
        const file = pendingFilesRef.current.get(item.client_msg_id);
        if (file) await deliverFile(selectedId, item.client_msg_id, file);
      }
    })();
  };

  const retryMessage = (clientMsgId: string) => {
    if (!selectedId) return;
    const item = messagesRef.current.find((msg) => msg.client_msg_id === clientMsgId);
    if (!item) return;
    setMessages((current) =>
      current.map((msg) =>
        msg.client_msg_id === clientMsgId ? { ...msg, send_status: 'sending' } : msg,
      ),
    );
    if (item.msg_type === 'text' && item.body) {
      void deliverText(selectedId, clientMsgId, item.body);
      return;
    }
    const file = pendingFilesRef.current.get(clientMsgId);
    if (file) void deliverFile(selectedId, clientMsgId, file);
    else markFailed(clientMsgId);
  };

  const openContact = async (contact: OaContact) => {
    setLoadingThread(true);
    try {
      const conversation = contact.conversation_id
        ? conversations.find((item) => item.id === contact.conversation_id)
          ?? await oaApi.openContact(contact.id)
        : await oaApi.openContact(contact.id);
      setSelected(conversation);
      navigateChat(navigate, `/chat/oa/${conversation.id}`);
      setListMode('conversations');
      setPane('thread');
      await openThread(conversation.id);
      void reloadOaConversations();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Không mở được contact OA.');
    } finally {
      setLoadingThread(false);
    }
  };

  const unreadTotal = useMemo(
    () => conversations.filter((item) => (item.unread_count || 0) > 0).length,
    [conversations],
  );

  const messageSenderName = (msg: OaMessage): string => {
    if (msg.direction === 'inbound') return selected?.title || 'Khách hàng';
    if (msg.sender_type === 'bot') return 'AI';
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

  const currentItemsLabel = listMode === 'contacts'
    ? `${contacts.length} danh bạ`
    : `${conversations.length} hội thoại`;
  const loadingCurrentList = listMode === 'contacts' ? loadingContacts : loadingList;

  return (
    <div className="chat-app oa-chat" data-pane={pane}>
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
            <div className="chat-list-head zalo-list-head oa-list-head">
              <div className="zalo-list-title">
                <strong>Zalo OA</strong>
                <span className="muted">
                  {loadingCurrentList ? 'Đang tải...' : currentItemsLabel}
                </span>
              </div>
              <div className="zalo-source-pick">
                <button
                  type="button"
                  className={`chat-icon-btn${listMode === 'contacts' ? ' is-active' : ''}`}
                  title="Danh bạ OA"
                  onClick={() => setListMode((mode) => (mode === 'contacts' ? 'conversations' : 'contacts'))}
                >
                  <IconUsers size={16} />
                </button>
                {unreadTotal > 0 && (
                  <>
                    <button
                      type="button"
                      className="chat-icon-btn"
                      title="Đánh dấu đã đọc tất cả"
                      onClick={() => void markAllRead()}
                    >
                      <IconCheck size={16} />
                    </button>
                    <span className="chat-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
                  </>
                )}
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Cài đặt OA"
                  onClick={() => navigateChat(navigate, '/chat/settings')}
                >
                  <IconSettings size={16} />
                </button>
              </div>
            </div>
            <div className="oa-list-tools">
              <label className="chat-search">
                <IconSearch size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={listMode === 'contacts' ? 'Tìm danh bạ OA' : 'Tìm hội thoại OA'}
                  aria-label={listMode === 'contacts' ? 'Tìm danh bạ OA' : 'Tìm hội thoại OA'}
                />
              </label>
            </div>
            <div className="chat-list-body">
              {listMode === 'conversations' ? (
                <>
                  {conversations.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className={`chat-list-item${item.id === selectedId ? ' is-active' : ''}`}
                      onClick={() => {
                        navigateChat(navigate, `/chat/oa/${item.id}`);
                        setPane('thread');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigateChat(navigate, `/chat/oa/${item.id}`);
                          setPane('thread');
                        }
                      }}
                    >
                      <ChatAvatar name={item.title} imageSrc={item.avatar_url} size={42} />
                      <span className="chat-list-main">
                        <span className="chat-list-title">
                          <span className="chat-list-name-row">
                            <span className="chat-list-name">{item.title}</span>
                            {item.notify_mode === 'mute' ? (
                              <span className="chat-list-notify" title="Tắt thông báo">
                                <IconBellOff size={13} />
                              </span>
                            ) : null}
                          </span>
                          <span className="chat-list-time">{formatTime(item.last_message_at)}</span>
                        </span>
                        <span className="chat-list-preview">{previewOf(item)}</span>
                      </span>
                      {item.unread_count > 0 ? (
                        <button
                          type="button"
                          className="chat-badge"
                          title="Đánh dấu đã đọc"
                          onClick={(event) => {
                            event.stopPropagation();
                            void markThreadRead(item.id);
                          }}
                        >
                          {item.unread_count > 99 ? '99+' : item.unread_count}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!conversations.length && !loadingList ? (
                    <p className="chat-hint">Chưa có hội thoại OA. Tin mới sẽ xuất hiện sau khi webhook nhận event.</p>
                  ) : null}
                </>
              ) : (
                <>
                  {contacts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`chat-list-item${item.conversation_id === selectedId ? ' is-active' : ''}`}
                      onClick={() => void openContact(item)}
                    >
                      <ChatAvatar name={item.title} imageSrc={item.avatar_url} size={42} />
                      <span className="chat-list-main">
                        <span className="chat-list-title">
                          <span className="chat-list-name-row">
                            <span className="chat-list-name">{item.title}</span>
                          </span>
                          <span className="chat-list-time">{formatTime(item.last_message_at || item.last_oa)}</span>
                        </span>
                        <span className="chat-list-preview">
                          {item.last_preview || (item.is_following ? 'Đang follow OA' : 'Chưa follow / đã unfollow')}
                        </span>
                      </span>
                      {item.unread_count > 0 ? <span className="chat-badge">{item.unread_count}</span> : null}
                    </button>
                  ))}
                  {!contacts.length && !loadingContacts ? (
                    <p className="chat-hint">Không có danh bạ OA phù hợp.</p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </aside>

        <div
          className="chat-splitter chat-splitter--list"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước danh sách OA"
          onPointerDown={(event) => beginResize('list', event)}
        />

        <main className="chat-panel chat-panel--thread">
          {selected ? (
            <div
              className={`chat-thread oa-thread${draggingFiles ? ' is-dragging-files' : ''}`}
              onDragEnter={(event) => {
                if (!canSend || !event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                dragDepthRef.current += 1;
                setDraggingFiles(true);
              }}
              onDragOver={(event) => {
                if (!canSend || !event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                if (dragDepthRef.current === 0) setDraggingFiles(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepthRef.current = 0;
                setDraggingFiles(false);
                if (canSend) {
                  window.dispatchEvent(new CustomEvent('arito-oa-add-files', { detail: Array.from(event.dataTransfer.files) }));
                }
              }}
            >
              {draggingFiles && (
                <div className="chat-file-drop-overlay" aria-hidden>
                  <IconPaperclip size={30} />
                  <strong>Thả file để đính kèm</strong>
                </div>
              )}
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
                <button type="button" className="chat-thread-title" onClick={openInfo}>
                  <span className="chat-thread-name">{selected.title}</span>
                  <span className="chat-thread-sub">
                    {selected.window_expires_at
                      ? `Hạn trả lời ${formatTime(selected.window_expires_at)}`
                      : 'Zalo Official Account'}
                  </span>
                </button>
                <button
                  type="button"
                  className="chat-icon-btn"
                  onClick={() => void syncThread()}
                  disabled={syncing}
                  title="Đồng bộ lại từ Zalo"
                >
                  <IconRetry size={18} />
                </button>
                {(selected.unread_count || 0) > 0 || unreadPill ? (
                  <button
                    type="button"
                    className="chat-icon-btn"
                    title="Đánh dấu đã đọc"
                    onClick={() => void markThreadRead(selectedId, lastIdRef.current || undefined)}
                  >
                    <IconCheck size={18} />
                  </button>
                ) : null}
                <button type="button" className="chat-icon-btn" onClick={openInfo} title="Thông tin">
                  <IconInfo size={18} />
                </button>
              </header>

              <div className="zalo-thread-scroll">
              <div className="chat-thread-body" ref={scrollRef} onScroll={onThreadScroll}>
                {hasMore ? (
                  <div className="chat-more">
                    <button type="button" className="secondary" onClick={() => void loadOlder()}>
                      Tải tin cũ hơn
                    </button>
                  </div>
                ) : null}
                {loadingThread ? <div className="chat-empty">Đang tải hội thoại...</div> : null}
                {messages
                  .filter((msg) => !msg.thread_id || msg.thread_id === selectedId)
                  .map((msg) => {
                  const isBot = msg.sender_type === 'bot';
                  const isOutbound = msg.direction === 'outbound';
                  const otherAgent = isOutbound && !msg.sender_is_me && !isBot;
                  const sending = msg.send_status === 'sending';
                  const failed = msg.send_status === 'failed';
                  const attachment =
                    (msg.msg_type !== 'text' && msg.msg_type !== 'template')
                    || !!msg.file_id
                    || !!msg.file_name
                    || !!msg.attachment_url;
                  const avatar = messageAvatar(msg);
                  return (
                    <div key={msg.client_msg_id || msg.id} data-message-id={msg.id > 0 ? msg.id : undefined}>
                      <div
                        className={`chat-msg${isOutbound ? ' chat-msg--mine chat-msg--oa-outbound' : ''}${
                          isBot ? ' oa-msg--bot' : ''
                        }${sending ? ' is-sending' : ''}${failed ? ' is-failed' : ''}`}
                      >
                        {isBot ? (
                          <span className="chat-avatar oa-msg-avatar--bot" aria-hidden="true">
                            <IconBot size={16} />
                          </span>
                        ) : (
                          <ChatAvatar
                            name={avatar.name}
                            imageSrc={avatar.imageSrc}
                            avatarId={avatar.avatarId}
                            size={30}
                          />
                        )}
                        <div className="chat-msg-main">
                          {otherAgent || isBot ? (
                            <span className="chat-msg-sender">{messageSenderName(msg)}</span>
                          ) : null}
                          <div className="chat-msg-row">
                            <div className="chat-bubble-wrap">
                              <div
                                className={`chat-bubble${attachment ? ' chat-bubble--attachment' : ''}${
                                  sending ? ' is-pending' : ''
                                }${failed ? ' is-failed' : ''}`}
                              >
                                {attachment ? (
                                  <OaAttachmentBlock
                                    msg={msg}
                                    threadId={selectedId}
                                    onPreview={() => {
                                      if (!msg.file_id) return;
                                      setPreview({
                                        fileId: msg.file_id,
                                        fileName: messageFileName(msg),
                                        contentType: msg.file_content_type,
                                      });
                                    }}
                                  />
                                ) : (
                                  <ChatMarkdownClamped
                                    text={msg.body || `[${msg.msg_type}]`}
                                    maxLines={OA_REPLY_MAX_LINES}
                                    onOpenLarge={onOpenLarge}
                                  />
                                )}
                                <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
                              </div>
                            </div>
                            {sending ? (
                              <div className="chat-msg-actions is-status" aria-label="Đang gửi">
                                <span className="chat-msg-wait">
                                  <IconWait size={16} />
                                </span>
                              </div>
                            ) : failed ? (
                              <div className="chat-msg-actions is-status">
                                <button
                                  type="button"
                                  className="chat-msg-action"
                                  title="Gửi lại"
                                  onClick={() => msg.client_msg_id && retryMessage(msg.client_msg_id)}
                                >
                                  <IconRetry size={14} />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
                {unreadPill && unreadPill.count > 0 ? (
                  <button type="button" className="zalo-new-msg-pill" onClick={() => void jumpToUnread()}>
                    {unreadPill.count > 99 ? '99+' : unreadPill.count} tin chưa đọc
                  </button>
                ) : null}
              </div>

              <OaComposer
                canSend={canSend}
                blockReason={blockReason}
                placeholder={composerPlaceholder}
                onSend={sendMessage}
              />
            </div>
          ) : (
            <div className="chat-thread chat-thread--empty">
              <p className="chat-hint">Chọn một hội thoại OA để bắt đầu.</p>
            </div>
          )}
        </main>

        <div
          className="chat-splitter chat-splitter--info"
          role="separator"
          aria-orientation="vertical"
          aria-label="Đổi kích thước trang thông tin OA"
          onPointerDown={(event) => beginResize('info', event)}
        />

        <aside className="chat-panel chat-panel--info" aria-hidden={!infoVisible}>
          {selected ? (
            <div className="chat-info">
              <header className="chat-info-head">
                <strong>Thông tin</strong>
                <div className="chat-info-head-actions">
                  <button
                    type="button"
                    className={`chat-icon-btn${selected.notify_mode === 'mute' ? ' is-muted' : ''}`}
                    title={notifyModeLabel(selected.notify_mode === 'mute' ? 'mute' : 'all')}
                    disabled={notifyBusy}
                    onClick={() => void toggleNotify()}
                  >
                    {selected.notify_mode === 'mute' ? <IconBellOff size={18} /> : <IconBell size={18} />}
                  </button>
                  <button
                    type="button"
                    className={`zalo-ai-switch-wrap${selected.ai_effective ? ' is-on' : ''}`}
                    title={selected.ai_effective ? 'AI đang bật' : 'AI đang tắt'}
                    disabled={aiBusy}
                    onClick={() =>
                      void applyAi({
                        enabled: !selected.ai_effective,
                      })
                    }
                  >
                    <span className={`zalo-ai-switch${selected.ai_effective ? ' is-on' : ''}`}>
                      <span>{selected.ai_effective ? 'ON' : 'OFF'}</span>
                    </span>
                  </button>
                  {selected.ai_effective ? (
                    <button
                      type="button"
                      className="chat-icon-btn"
                      title="Trả lời AI"
                      disabled={!canTriggerAiReply}
                      onClick={() => void triggerAiReply()}
                    >
                      <IconBot size={18} />
                    </button>
                  ) : null}
                  <button type="button" className="chat-icon-btn" onClick={closeInfo} title="Đóng">
                    <IconClose size={18} />
                  </button>
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
                <div className="chat-info-section">
                  <div className="chat-info-section-head">
                    <span>AI Chatbots</span>
                  </div>
                  <p className="muted oa-info-line" style={{ margin: '0 0 8px' }}>
                    {selected.ai_effective
                      ? `Tự trả lời sau ${selected.auto_reply_delay_seconds ?? 30}s nếu nhân sự chưa trả lời.`
                      : 'Bật AI ở góc phải để bot trả lời khách.'}
                  </p>
                  <label className="chat-settings-field">
                    <span>Bot cho khách này</span>
                    <select
                      value={selected.ai_bot_folder_id || selected.default_bot_folder_id || ''}
                      disabled={aiBusy || bots.length === 0}
                      onChange={(e) =>
                        void applyAi({
                          bot_folder_id: e.target.value || '',
                          enabled: true,
                        })
                      }
                    >
                      <option value="">
                        {selected.default_bot_folder_id ? 'Mặc định OA' : '— Chưa chọn —'}
                      </option>
                      {bots.map((bot) => (
                        <option key={bot.folder_id} value={bot.folder_id}>
                          {bot.title || bot.folder_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    const homeId =
                      selected.ai_bot_folder_id || selected.default_bot_folder_id || '';
                    const stickyId = (selected.active_bot_folder_id ?? '').trim();
                    const switched =
                      !stickyExpired &&
                      stickyId.length > 0 &&
                      homeId.length > 0 &&
                      stickyId.toLowerCase() !== homeId.toLowerCase();
                    const current = bots.find(
                      (bot) =>
                        bot.folder_id.toLowerCase() ===
                        (switched ? stickyId : homeId).toLowerCase(),
                    );
                    const name = switched
                      ? selected.active_bot_title || current?.title
                      : current?.title;
                    if (!name && !current) return null;
                    return (
                      <div className="chat-info-active-bot" style={{ marginTop: 10 }}>
                        <ChatAvatar
                          name={name || 'Bot'}
                          size={40}
                          imageSrc={botAvatarUrl(
                            switched ? selected.active_bot_avatar_url : current?.avatar_url,
                          )}
                        />
                        <span className="chat-contact-main">
                          <strong>{name}</strong>
                          <span className="muted">
                            {switched
                              ? selected.active_bot_until
                                ? `Đổi từ gợi ý · đến ${new Date(selected.active_bot_until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                                : 'Đổi từ gợi ý'
                              : selected.ai_effective
                                ? 'Bot đang hỗ trợ khách này'
                                : 'AI đang tắt'}
                          </span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <ChatFileSection total={visibleInfoTotal} folderUrl={infoFolderUrl}>
                  {visibleInfoFiles.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Chưa có file nào.
                    </p>
                  ) : (
                    <div className="chat-file-grid">
                      {visibleInfoFiles.map((item) => (
                        <OaFileTile
                          key={item.file_id}
                          threadId={selected.id}
                          item={item}
                          onOpen={() =>
                            setPreview({
                              fileId: item.file_id,
                              fileName: item.file_name,
                              contentType: item.content_type,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </ChatFileSection>
                <ChatBotCatalogSection title="Danh sách Chatbots" compact />
              </div>
            </div>
          ) : (
            <div className="chat-empty">Chưa chọn hội thoại.</div>
          )}
        </aside>
      </div>

      {preview && selectedId > 0 ? (
        <FilePreviewModal
          conversationId={selectedId}
          fileId={preview.fileId}
          fileName={preview.fileName}
          contentType={preview.contentType}
          getBlob={(fileId) => oaApi.attachmentBlob(selectedId, fileId)}
          onClose={() => setPreview(null)}
        />
      ) : null}

      {mdViewer ? (
        <ChatMarkdownViewer
          title={mdViewer.title}
          text={mdViewer.text}
          onClose={() => setMdViewer(null)}
        />
      ) : null}

      {error ? (
        <div className="zalo-toast" onClick={() => setError('')} role="button" tabIndex={0}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
