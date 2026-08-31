import { useCallback, useEffect, useRef, useState } from 'react';
import { botAvatarUrl, botTypeLabel, type ChatMember, type ChatMessage, type ContactRelation, type Conversation } from '../../api/chatApi';
import { ChatComposer } from './ChatComposer';
import { ChatMarkdown, ChatMarkdownClamped, ChatMarkdownViewer } from './ChatMarkdown';
import {
  IconBack,
  IconDownload,
  IconFile,
  IconInfo,
  IconMore,
  IconPaperclip,
  IconReply,
  IconRetry,
  IconWait,
} from '../AppIcons';
import { ChatAvatar, useChatFileUrl } from './ChatAvatar';
import { ChatConfirmDialog } from './ChatConfirmDialog';
import { downloadChatFile, FilePreviewModal } from './FilePreviewModal';

type Props = {
  conversation: Conversation | null;
  messages: ChatMessage[];
  loading: boolean;
  aiWaiting?: boolean;
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

/** Cạnh ô ảnh trong bubble (px) — khớp bản resize sẵn của File.Api. */
const IMAGE_THUMB_SIZE = 256;

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

function AttachmentMessage({
  message,
  onPreview,
}: {
  message: ChatMessage;
  onPreview: () => void;
}) {
  const isImage = message.msg_type === 'image' || message.file_content_type?.startsWith('image/');
  // Ô vuông cố định trước khi ảnh về → chiều cao thread không đổi, không mất vị trí scroll.
  const thumbUrl = useChatFileUrl(
    message.conversation_id,
    isImage ? message.file_id : null,
    IMAGE_THUMB_SIZE,
  );

  if (isImage) {
    return (
      <button type="button" className="chat-attachment-image" onClick={onPreview} title="Xem ảnh">
        {thumbUrl ? <img src={thumbUrl} alt={message.file_name || 'Ảnh đính kèm'} /> : null}
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
  loading,
  aiWaiting = false,
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
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [menuForId, setMenuForId] = useState<number | null>(null);
  const [recallMessageId, setRecallMessageId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    fileId: string;
    fileName: string;
    contentType?: string | null;
  } | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [mdViewer, setMdViewer] = useState<{ title: string; text: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastStampRef = useRef('');
  const dragDepthRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const skipAutoLoadRef = useRef(false);
  const addFilesRef = useRef<((files: File[]) => void) | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const stamp = last
      ? `${messages.length}:${last.id}:${last.client_msg_id ?? ''}:${last.send_status ?? ''}`
      : '';
    const grew = stamp !== lastStampRef.current;
    lastStampRef.current = stamp;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (grew || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
    lastStampRef.current = '';
    setReplyTo(null);
    setMenuForId(null);
    setRecallMessageId(null);
    setPreview(null);
    setDraggingFiles(false);
    dragDepthRef.current = 0;
  }, [conversation?.id]);

  const onOpenBotMarkdown = useCallback((text: string) => {
    setMdViewer({ title: conversation?.title || 'Nội dung AI', text });
  }, [conversation?.title]);

  const onClearReply = useCallback(() => setReplyTo(null), []);

  if (!conversation) {
    return (
      <div className="chat-thread chat-thread--empty">
        <p className="chat-hint">Chọn một hội thoại để bắt đầu.</p>
      </div>
    );
  }

  const isBot = conversation.kind === 'bot';
  const botDisabled = isBot && conversation.bot_active === false;
  const canSend =
    !botDisabled && (conversation.kind !== 'direct' || !relation || relation.can_send);
  const canAttach = canSend && !isBot;
  const botSrc = isBot ? botAvatarUrl(conversation.bot_avatar_url) : null;
  const blockReason = botDisabled
    ? 'Chatbots đã tắt. Bạn vẫn xem được lịch sử.'
    : conversation.kind === 'direct' && relation && !relation.can_send
      ? relation.send_block_reason || 'Không thể gửi tin nhắn.'
      : null;

  const addFiles = (files: File[]) => {
    addFilesRef.current?.(files);
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
        if (!canAttach || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (!canAttach || !event.dataTransfer.types.includes('Files')) return;
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
        if (canAttach) addFiles(Array.from(event.dataTransfer.files));
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
          avatarId={conversation.kind === 'group' || isBot ? null : conversation.peer_avatar_id}
          group={conversation.kind === 'group'}
          conversationId={conversation.id}
          fileId={conversation.kind === 'group' ? conversation.avatar_file_id : null}
          imageSrc={botSrc}
          size={36}
        />
        <button type="button" className="chat-thread-title" onClick={onOpenInfo}>
          <span className="chat-thread-name">{conversation.title}</span>
          <span className="chat-thread-sub">
            {conversation.kind === 'group'
              ? `${conversation.member_count} thành viên`
              : isBot
                ? botDisabled
                  ? 'Chatbots đã tắt — chỉ xem lịch sử'
                  : conversation.bot_description || botTypeLabel(conversation)
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
          const sending = m.send_status === 'sending';
          const failed = m.send_status === 'failed';

          if (m.is_recalled || m.msg_type === 'system') {
            return (
              <div key={m.client_msg_id || m.id} className="chat-msg-system" data-message-id={m.id}>
                {showDay && <div className="chat-day">{day}</div>}
                <span>{m.body || 'Tin nhắn đã được thu hồi'}</span>
              </div>
            );
          }

          const showSender = !m.sender_is_me && conversation.kind === 'group';
          return (
            <div key={m.client_msg_id || m.id} data-message-id={m.id > 0 ? m.id : undefined}>
              {showDay && <div className="chat-day">{day}</div>}
              <div
                className={`chat-msg${m.sender_is_me ? ' chat-msg--mine' : ''}${
                  menuForId === m.id ? ' is-menu-open' : ''
                }${sending ? ' is-sending' : ''}${failed ? ' is-failed' : ''}`}
              >
                {!m.sender_is_me && (
                  <ChatAvatar
                    name={m.sender_name || conversation.title}
                    avatarId={isBot ? null : m.sender_avatar_id}
                    imageSrc={isBot ? botSrc : null}
                    size={30}
                  />
                )}
                <div className="chat-msg-main">
                  {showSender && <span className="chat-msg-sender">{m.sender_name}</span>}
                  <div className="chat-msg-row">
                    <div className="chat-bubble-wrap">
                      <div
                        className={`chat-bubble${m.file_id ? ' chat-bubble--attachment' : ''}${
                          sending ? ' is-pending' : ''
                        }${failed ? ' is-failed' : ''}`}
                      >
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
                        ) : m.body ? (
                          isBot && !m.sender_is_me ? (
                            <ChatMarkdownClamped
                              text={m.body}
                              onOpenLarge={onOpenBotMarkdown}
                            />
                          ) : (
                            <ChatMarkdown text={m.body} />
                          )
                        ) : null}
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
                          onClick={() => m.client_msg_id && onRetry(m.client_msg_id)}
                        >
                          <IconRetry size={14} />
                        </button>
                      </div>
                    ) : (
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
                    )}
                  </div>
                  <span className="chat-msg-time">
                    {failed ? (
                      <button
                        type="button"
                        className="chat-retry"
                        onClick={() => m.client_msg_id && onRetry(m.client_msg_id)}
                      >
                        Gửi lại
                      </button>
                    ) : (
                      timeLabel(m.created_at)
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}


        {aiWaiting && (
          <div className="chat-msg">
            <ChatAvatar name={conversation.title} imageSrc={botSrc} size={30} />
            <div className="chat-msg-main">
              <div className="chat-bubble chat-bubble--waiting" aria-label="AI đang trả lời">
                <span className="chat-typing">
                  <i />
                  <i />
                  <i />
                </span>
                <span>AI đang soạn…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="chat-error">{error}</div>}
      {blockReason && <div className="chat-error">{blockReason}</div>}

      <ChatComposer
        key={conversation.id}
        conversationKind={conversation.kind}
        canSend={canSend}
        canAttach={canAttach}
        isBot={isBot}
        aiWaiting={aiWaiting}
        blockReason={blockReason}
        replyTo={replyTo}
        members={members}
        onClearReply={onClearReply}
        onSend={onSend}
        onSendAttachments={onSendAttachments}
        addFilesRef={addFilesRef}
      />

      {preview && (
        <FilePreviewModal
          conversationId={conversation.id}
          fileId={preview.fileId}
          fileName={preview.fileName}
          contentType={preview.contentType}
          onClose={() => setPreview(null)}
        />
      )}

      {mdViewer && (
        <ChatMarkdownViewer
          title={mdViewer.title}
          text={mdViewer.text}
          onClose={() => setMdViewer(null)}
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
