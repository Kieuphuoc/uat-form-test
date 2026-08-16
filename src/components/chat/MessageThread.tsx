import { useEffect, useRef, useState } from 'react';
import {
  chatApi,
  type ChatMember,
  type ChatMessage,
  type ContactRelation,
  type Conversation,
} from '../../api/chatApi';
import {
  IconBack,
  IconClose,
  IconDownload,
  IconFile,
  IconInfo,
  IconMore,
  IconPaperclip,
  IconReply,
  IconSend,
} from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';
import { ChatConfirmDialog } from './ChatConfirmDialog';
import { downloadChatFile, FilePreviewModal } from './FilePreviewModal';

export type PendingMessage = {
  client_msg_id: string;
  body: string;
  failed?: boolean;
};

type Props = {
  conversation: Conversation | null;
  messages: ChatMessage[];
  pending: PendingMessage[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  focusRequest: { messageId: number; atBottom: boolean; token: number } | null;
  relation?: ContactRelation | null;
  members: ChatMember[];
  busy?: boolean;
  onSend: (body: string, replyToMessageId?: number | null) => void;
  onSendAttachments: (files: File[]) => Promise<void>;
  onRecall: (messageId: number) => void;
  onRetry: (clientMsgId: string) => void;
  onLoadMore: () => Promise<void>;
  onJumpToMessage: (messageId: number) => Promise<void>;
  onBack: () => void;
  onOpenInfo: () => void;
  onAccept?: () => void;
  onBlock?: () => void;
};

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function formatFileSize(value?: number | null): string {
  if (!value || value < 1024) return `${value ?? 0} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Hôm nay';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function renderMessageBody(body: string | null | undefined, members: ChatMember[]) {
  if (!body || members.length === 0) return body;
  const names = members
    .map((member) => (member.nickname || member.email || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (names.length === 0) return body;
  const pattern = new RegExp(`(@(?:${names.join('|')}))(?=\\s|$|[.,!?;:])`, 'gi');
  return body.split(pattern).map((part, index) =>
    part.startsWith('@') ? (
      <strong className="chat-mention" key={`${index}-${part}`}>
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function AttachmentMessage({
  message,
  onPreview,
}: {
  message: ChatMessage;
  onPreview: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const isImage = message.msg_type === 'image' || message.file_content_type?.startsWith('image/');

  useEffect(() => {
    if (!isImage || !message.file_id) return;
    let disposed = false;
    let url: string | null = null;
    void chatApi.attachmentBlob(message.conversation_id, message.file_id).then((blob) => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setObjectUrl(url);
    });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isImage, message.conversation_id, message.file_id]);

  if (isImage) {
    return (
      <button type="button" className="chat-attachment-image" onClick={onPreview} title="Xem ảnh">
        {objectUrl ? (
          <img src={objectUrl} alt={message.file_name || 'Ảnh đính kèm'} />
        ) : (
          <span>Đang tải ảnh…</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chat-attachment-file"
      onClick={onPreview}
      title="Xem file"
    >
      <span className="chat-attachment-file-icon">
        <IconFile size={28} />
      </span>
      <span>
        <strong>{message.file_name || message.body || 'Tệp đính kèm'}</strong>
        <small>{formatFileSize(message.file_size_bytes)}</small>
      </span>
    </button>
  );
}

export function MessageThread({
  conversation,
  messages,
  pending,
  loading,
  hasMore,
  error,
  focusRequest,
  relation,
  members,
  busy = false,
  onSend,
  onSendAttachments,
  onRecall,
  onRetry,
  onLoadMore,
  onJumpToMessage,
  onBack,
  onOpenInfo,
  onAccept,
  onBlock,
}: Props) {
  const [draft, setDraft] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuForId, setMenuForId] = useState<number | null>(null);
  const [recallMessageId, setRecallMessageId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    fileId: string;
    fileName: string;
    contentType?: string | null;
  } | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragDepthRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const skipAutoLoadRef = useRef(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const newest = messages.length > 0 ? messages[messages.length - 1].id : 0;
    const grew = newest > lastIdRef.current;
    lastIdRef.current = newest;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (grew || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, pending.length]);

  useEffect(() => {
    if (!focusRequest?.messageId) return;
    const applyFocus = () => {
      const container = bodyRef.current;
      if (!container) return;
      if (focusRequest.atBottom) {
        container.scrollTop = container.scrollHeight;
        return;
      }
      container
        .querySelector<HTMLElement>(`[data-message-id="${focusRequest.messageId}"]`)
        ?.scrollIntoView({ block: 'center' });
    };

    // Chặn auto load-more trong lúc canh vị trí, nếu không việc dừng gần đỉnh
    // sẽ lập tức kéo thêm trang cũ.
    skipAutoLoadRef.current = true;
    const frame = window.requestAnimationFrame(applyFocus);
    // Ảnh/file đính kèm tải xong mới có chiều cao thật → canh lại một lần nữa.
    const settle = window.setTimeout(() => {
      applyFocus();
      skipAutoLoadRef.current = false;
    }, 400);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      skipAutoLoadRef.current = false;
    };
  }, [focusRequest]);

  useEffect(() => {
    lastIdRef.current = 0;
    setDraft('');
    setReplyTo(null);
    setMenuForId(null);
    setRecallMessageId(null);
    setMentionOpen(false);
    setDraggingFiles(false);
    dragDepthRef.current = 0;
    setQueuedFiles((current) => {
      current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setAttachmentError(null);
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <div className="chat-thread chat-thread--empty">
        <p className="chat-hint">Chọn một hội thoại để bắt đầu.</p>
      </div>
    );
  }

  const canSend = conversation.kind !== 'direct' || !relation || relation.can_send;
  const blockReason =
    conversation.kind === 'direct' && relation && !relation.can_send
      ? relation.send_block_reason || 'Không thể gửi tin nhắn.'
      : null;

  const addFiles = (files: File[]) => {
    if (!canSend || files.length === 0) return;
    setQueuedFiles((current) => {
      const remaining = Math.max(0, 10 - current.length);
      const accepted = files.slice(0, remaining);
      if (accepted.length < files.length) setAttachmentError('Mỗi lần gửi tối đa 10 file.');
      else setAttachmentError(null);
      return [
        ...current,
        ...accepted.map((file, index) => ({
          id: `${Date.now()}-${index}-${file.name}`,
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        })),
      ];
    });
  };

  const groupMembers = conversation.kind === 'group' ? members : [];
  const mentionMatches = groupMembers
    .filter((member) => {
      const label = (member.nickname || member.email || '').trim();
      return (
        label.length > 0 &&
        label.toLocaleLowerCase('vi').includes(mentionQuery.toLocaleLowerCase('vi'))
      );
    })
    .slice(0, 8);

  const updateMention = (value: string, caret: number) => {
    if (conversation.kind !== 'group') {
      setMentionOpen(false);
      return;
    }
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionOpen(false);
      setMentionStart(null);
      return;
    }
    const at = beforeCaret.lastIndexOf('@');
    setMentionStart(at);
    setMentionQuery(match[1]);
    setMentionIndex(0);
    setMentionOpen(true);
  };

  const chooseMention = (member: ChatMember) => {
    if (mentionStart == null) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? draft.length;
    const label = (member.nickname || member.email || '').trim();
    const next = `${draft.slice(0, mentionStart)}@${label} ${draft.slice(caret)}`;
    const nextCaret = mentionStart + label.length + 2;
    setDraft(next);
    setMentionOpen(false);
    setMentionStart(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const removeQueuedFile = (id: string) => {
    setQueuedFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const loadMoreAtTop = async () => {
    const container = bodyRef.current;
    if (!container || !hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const oldHeight = container.scrollHeight;
    try {
      await onLoadMore();
      window.requestAnimationFrame(() => {
        const current = bodyRef.current;
        if (current) current.scrollTop += current.scrollHeight - oldHeight;
      });
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && queuedFiles.length === 0) || !canSend || sendingAttachments) return;
    if (body) {
      onSend(body, replyTo?.id ?? null);
      setDraft('');
      setReplyTo(null);
    }
    if (queuedFiles.length > 0) {
      setSendingAttachments(true);
      try {
        await onSendAttachments(queuedFiles.map((item) => item.file));
        queuedFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
        setQueuedFiles([]);
        setAttachmentError(null);
      } catch {
        setAttachmentError('Không gửi được file. Bạn có thể thử lại.');
      } finally {
        setSendingAttachments(false);
      }
    }
  };

  const openPreview = (message: ChatMessage) => {
    if (!message.file_id) return;
    setPreview({
      fileId: message.file_id,
      fileName: message.file_name || message.body || 'Xem file',
      contentType: message.file_content_type,
    });
  };

  const jumpToMessage = async (messageId: number) => {
    if (!messages.some((message) => message.id === messageId)) {
      await onJumpToMessage(messageId);
    }
    window.requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${messageId}"]`,
      );
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('is-jump-highlight');
      window.requestAnimationFrame(() => target.classList.add('is-jump-highlight'));
      window.setTimeout(() => target.classList.remove('is-jump-highlight'), 1600);
    });
  };

  const downloadMessage = (message: ChatMessage) => {
    if (!message.file_id) return;
    void downloadChatFile(
      message.conversation_id,
      message.file_id,
      message.file_name || message.body || 'download',
    );
  };

  let lastDay = '';

  return (
    <div
      className={`chat-thread${draggingFiles ? ' is-dragging-files' : ''}`}
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
        if (canSend) addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {draggingFiles && (
        <div className="chat-file-drop-overlay" aria-hidden>
          <IconPaperclip size={30} />
          <strong>Thả file để đính kèm</strong>
        </div>
      )}
      <header className="chat-thread-head">
        <button type="button" className="chat-icon-btn chat-only-narrow" onClick={onBack} title="Danh sách">
          <IconBack size={18} />
        </button>
        <ChatAvatar
          name={conversation.title}
          avatarId={conversation.kind === 'group' ? null : conversation.peer_avatar_id}
          group={conversation.kind === 'group'}
          conversationId={conversation.id}
          fileId={conversation.kind === 'group' ? conversation.avatar_file_id : null}
          size={36}
        />
        <button type="button" className="chat-thread-title" onClick={onOpenInfo}>
          <span className="chat-thread-name">{conversation.title}</span>
          <span className="chat-thread-sub">
            {conversation.kind === 'group'
              ? `${conversation.member_count} thành viên`
              : 'Tin nhắn riêng'}
          </span>
        </button>
        <button type="button" className="chat-icon-btn" onClick={onOpenInfo} title="Thông tin">
          <IconInfo size={18} />
        </button>
      </header>

      {conversation.kind === 'direct' && relation?.relation === 'pending_in' && (
        <div className="chat-contact-banner">
          <div>
            <strong>Yêu cầu chat</strong>
            <p>Chấp nhận để trả lời, hoặc chặn người gửi.</p>
          </div>
          <div className="chat-contact-banner-actions">
            <button type="button" disabled={busy} onClick={onAccept}>
              Chấp nhận
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={onBlock}>
              Chặn
            </button>
          </div>
        </div>
      )}

      {conversation.kind === 'direct' && relation?.relation === 'pending_out' && (
        <div className="chat-contact-banner chat-contact-banner--info">
          <div>
            <strong>Đang chờ chấp nhận</strong>
            <p>
              Còn {Math.max(0, relation.remaining_messages)} / 3 tin có thể gửi trước khi được chấp
              nhận.
            </p>
          </div>
        </div>
      )}

      {conversation.kind === 'direct' && relation?.relation === 'blocked' && (
        <div className="chat-contact-banner chat-contact-banner--danger">
          <div>
            <strong>Đã chặn</strong>
            <p>{relation.send_block_reason || 'Không thể nhắn tin trực tiếp.'}</p>
          </div>
        </div>
      )}

      <div
        className="chat-thread-body"
        ref={bodyRef}
        onScroll={(event) => {
          if (skipAutoLoadRef.current) return;
          if (event.currentTarget.scrollTop <= 40) void loadMoreAtTop();
        }}
      >
        {hasMore && (
          <div className="chat-more">
            <button
              type="button"
              className="secondary"
              onClick={() => void loadMoreAtTop()}
              disabled={loading}
            >
              {loading ? 'Đang tải…' : 'Xem tin cũ hơn'}
            </button>
          </div>
        )}

        {messages.length === 0 && !loading && (
          <p className="chat-hint">Chưa có tin nhắn. Gửi lời chào đầu tiên.</p>
        )}

        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;

          if (m.is_recalled || m.msg_type === 'system') {
            return (
              <div key={m.id} className="chat-msg-system" data-message-id={m.id}>
                {showDay && <div className="chat-day">{day}</div>}
                <span>{m.body || 'Tin nhắn đã được thu hồi'}</span>
              </div>
            );
          }

          const showSender = !m.sender_is_me && conversation.kind === 'group';
          return (
            <div key={m.id} data-message-id={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div
                className={`chat-msg${m.sender_is_me ? ' chat-msg--mine' : ''}${
                  menuForId === m.id ? ' is-menu-open' : ''
                }`}
              >
                {!m.sender_is_me && (
                  <ChatAvatar name={m.sender_name} avatarId={m.sender_avatar_id} size={30} />
                )}
                <div className="chat-msg-main">
                  {showSender && <span className="chat-msg-sender">{m.sender_name}</span>}
                  <div className="chat-bubble-wrap">
                    <div className={`chat-bubble${m.file_id ? ' chat-bubble--attachment' : ''}`}>
                      {m.reply_to_message_id && (
                        <button
                          type="button"
                          className="chat-reply-quote"
                          title="Đi tới tin nhắn gốc"
                          onClick={() => void jumpToMessage(m.reply_to_message_id!)}
                        >
                          <strong>{m.reply_sender_name || 'Tin nhắn'}</strong>
                          <span>{m.reply_preview}</span>
                        </button>
                      )}
                      {m.file_id ? (
                        <AttachmentMessage message={m} onPreview={() => openPreview(m)} />
                      ) : (
                        renderMessageBody(m.body, groupMembers)
                      )}
                    </div>
                    <div className="chat-msg-actions">
                      <button
                        type="button"
                        className="chat-msg-action"
                        title="Trả lời"
                        onClick={() => {
                          setReplyTo(m);
                          setMenuForId(null);
                        }}
                      >
                        <IconReply size={14} />
                      </button>
                      <button
                        type="button"
                        className="chat-msg-action"
                        title="Thêm"
                        onClick={() => setMenuForId((id) => (id === m.id ? null : m.id))}
                      >
                        <IconMore size={14} />
                      </button>
                      {menuForId === m.id && (
                        <div className="chat-msg-menu" role="menu">
                          <button type="button" onClick={() => { setReplyTo(m); setMenuForId(null); }}>
                            Trả lời
                          </button>
                          {m.msg_type === 'text' && m.body && (
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(m.body || '');
                                setMenuForId(null);
                              }}
                            >
                              Sao chép
                            </button>
                          )}
                          {m.file_id && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  openPreview(m);
                                  setMenuForId(null);
                                }}
                              >
                                Xem
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadMessage(m);
                                  setMenuForId(null);
                                }}
                              >
                                <IconDownload size={14} /> Tải về máy
                              </button>
                            </>
                          )}
                          {m.can_recall && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setRecallMessageId(m.id);
                                setMenuForId(null);
                              }}
                            >
                              Thu hồi
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="chat-msg-time">{timeLabel(m.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {pending.map((p) => (
          <div key={p.client_msg_id} className="chat-msg chat-msg--mine">
            <div className="chat-msg-main">
              <div className={`chat-bubble${p.failed ? ' is-failed' : ' is-pending'}`}>{p.body}</div>
              <span className="chat-msg-time">
                {p.failed ? (
                  <button type="button" className="chat-retry" onClick={() => onRetry(p.client_msg_id)}>
                    Gửi lại
                  </button>
                ) : (
                  'Đang gửi…'
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="chat-error">{error}</div>}
      {blockReason && <div className="chat-error">{blockReason}</div>}

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {replyTo && (
          <div className="chat-reply-bar">
            <div>
              <strong>Trả lời {replyTo.sender_name || ''}</strong>
              <span>{replyTo.file_name || replyTo.body || '[Đính kèm]'}</span>
            </div>
            <button type="button" className="chat-icon-btn" onClick={() => setReplyTo(null)}>
              <IconClose size={14} />
            </button>
          </div>
        )}
        {mentionOpen && (
          <div className="chat-mention-menu" role="listbox" aria-label="Nhắc thành viên">
            {mentionMatches.length > 0 ? (
              mentionMatches.map((member, index) => (
                <button
                  key={member.user_id}
                  type="button"
                  className={index === mentionIndex ? 'is-active' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseMention(member)}
                  role="option"
                  aria-selected={index === mentionIndex}
                >
                  <ChatAvatar
                    name={member.nickname || member.email}
                    avatarId={member.avatar_id}
                    size={30}
                  />
                  <span>
                    <strong>{member.nickname || member.email}</strong>
                    {member.nickname && member.email && <small>{member.email}</small>}
                  </span>
                </button>
              ))
            ) : (
              <span className="chat-mention-empty">Không có thành viên phù hợp.</span>
            )}
          </div>
        )}
        <div className="chat-composer-row">
          <button
            type="button"
            className="chat-attach"
            disabled={!canSend || sendingAttachments}
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm file"
          >
            <IconPaperclip size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              updateMention(e.target.value, e.target.selectionStart);
            }}
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.items)
                .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => file !== null);
              if (images.length > 0) {
                e.preventDefault();
                addFiles(images);
              }
            }}
            onKeyDown={(e) => {
              if (mentionOpen) {
                if (e.key === 'ArrowDown' && mentionMatches.length > 0) {
                  e.preventDefault();
                  setMentionIndex((index) => (index + 1) % mentionMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp' && mentionMatches.length > 0) {
                  e.preventDefault();
                  setMentionIndex(
                    (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
                  );
                  return;
                }
                if ((e.key === 'Enter' || e.key === 'Tab') && mentionMatches.length > 0) {
                  e.preventDefault();
                  chooseMention(mentionMatches[mentionIndex] ?? mentionMatches[0]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={1}
            placeholder={canSend ? 'Nhập tin nhắn hoặc Ctrl+V ảnh…' : blockReason || 'Không thể gửi tin…'}
            aria-label="Nội dung tin nhắn"
            disabled={!canSend || sendingAttachments}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={!canSend || sendingAttachments || (!draft.trim() && queuedFiles.length === 0)}
            title="Gửi (Enter)"
          >
            <IconSend size={18} />
          </button>
        </div>
        {queuedFiles.length > 0 && (
          <div className="chat-attachment-tray" aria-label="File đang chờ gửi">
            {queuedFiles.map((item) => (
              <div key={item.id} className="chat-queued-file">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.file.name} />
                ) : (
                  <span className="chat-queued-file-doc">
                    <IconFile size={26} />
                  </span>
                )}
                <span className="chat-queued-file-name">{item.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeQueuedFile(item.id)}
                  disabled={sendingAttachments}
                  aria-label={`Bỏ ${item.file.name}`}
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
            {sendingAttachments && <span className="chat-attachment-uploading">Đang tải lên…</span>}
          </div>
        )}
        {attachmentError && <div className="chat-attachment-error">{attachmentError}</div>}
      </form>

      {preview && (
        <FilePreviewModal
          conversationId={conversation.id}
          fileId={preview.fileId}
          fileName={preview.fileName}
          contentType={preview.contentType}
          onClose={() => setPreview(null)}
        />
      )}
      <ChatConfirmDialog
        open={recallMessageId != null}
        title="Thu hồi tin nhắn?"
        message="Tin nhắn sẽ không còn hiển thị với mọi người. File đính kèm (nếu có) cũng sẽ bị xóa."
        confirmLabel="Thu hồi"
        busy={busy}
        onCancel={() => setRecallMessageId(null)}
        onConfirm={() => {
          if (recallMessageId == null) return;
          const id = recallMessageId;
          setRecallMessageId(null);
          onRecall(id);
        }}
      />
    </div>
  );
}
