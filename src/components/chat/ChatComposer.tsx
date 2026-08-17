import { memo, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { type ChatMember, type ChatMessage, type Conversation } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { uiCopy } from '../../lib/uiCopy';
import {
  IconCamera,
  IconClose,
  IconFile,
  IconImage,
  IconPaperclip,
  IconSend,
} from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

const COMPOSER_MAX_LINES = 8;
const LINE_HEIGHT_FALLBACK = 20;

function resizeComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  const styles = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight) || LINE_HEIGHT_FALLBACK;
  const pad =
    (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const max = lineHeight * COMPOSER_MAX_LINES + pad;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

type Props = {
  conversationKind: Conversation['kind'];
  canSend: boolean;
  canAttach: boolean;
  isBot: boolean;
  aiWaiting: boolean;
  blockReason: string | null;
  replyTo: ChatMessage | null;
  members: ChatMember[];
  onClearReply: () => void;
  onSend: (body: string, replyToMessageId?: number | null) => void;
  onSendAttachments: (files: File[]) => Promise<void>;
  addFilesRef: MutableRefObject<((files: File[]) => void) | null>;
};

/**
 * Ô nhập tách khỏi danh sách tin: mỗi lần gõ chỉ re-render composer,
 * không parse markdown / không đụng DOM bubble.
 */
export const ChatComposer = memo(function ChatComposer({
  conversationKind,
  canSend,
  canAttach,
  isBot,
  aiWaiting,
  blockReason,
  replyTo,
  members,
  onClearReply,
  onSend,
  onSendAttachments,
  addFilesRef,
}: Props) {
  const { mobile } = useAuth();
  const [draft, setDraft] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);
  const queuedRef = useRef<QueuedFile[]>([]);
  queuedRef.current = queuedFiles;

  useEffect(() => {
    return () => {
      queuedRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (!imageMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!imageMenuRef.current?.contains(event.target as Node)) setImageMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [imageMenuOpen]);

  const addFiles = (files: File[]) => {
    if (!canAttach || files.length === 0) return;
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
  addFilesRef.current = addFiles;

  const groupMembers = conversationKind === 'group' ? members : [];
  const mentionMatches =
    mentionOpen && groupMembers.length > 0
      ? groupMembers
          .filter((member) => {
            const label = (member.nickname || member.email || '').trim();
            return (
              label.length > 0 &&
              label.toLocaleLowerCase('vi').includes(mentionQuery.toLocaleLowerCase('vi'))
            );
          })
          .slice(0, 8)
      : [];

  const updateMention = (value: string, caret: number) => {
    if (conversationKind !== 'group') return;
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      setMentionOpen((open) => (open ? false : open));
      setMentionStart((start) => (start == null ? start : null));
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
      resizeComposer(textarea);
    });
  };

  const wrapComposerSelection = (marker: string) => {
    const textarea = textareaRef.current;
    if (!textarea || textarea.disabled) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.slice(start, end);
    const next = `${draft.slice(0, start)}${marker}${selected}${marker}${draft.slice(end)}`;
    const nextStart = start + marker.length;
    const nextEnd = nextStart + selected.length;
    setDraft(next);
    updateMention(next, nextEnd);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
      resizeComposer(textarea);
    });
  };

  const removeQueuedFile = (id: string) => {
    setQueuedFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && queuedFiles.length === 0) || !canSend || sendingAttachments || aiWaiting) return;
    if (body) {
      onSend(body, replyTo?.id ?? null);
      setDraft('');
      onClearReply();
      window.requestAnimationFrame(() => resizeComposer(textareaRef.current));
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());
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
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  };

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendingAttachments) void submit();
      }}
    >
      {replyTo && (
        <div className="chat-reply-bar">
          <div>
            <strong>Trả lời {replyTo.sender_name || ''}</strong>
            <span>{replyTo.file_name || replyTo.body || '[Đính kèm]'}</span>
          </div>
          <button type="button" className="chat-icon-btn" onClick={onClearReply}>
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
        {canAttach && (
          <button
            type="button"
            className="chat-attach"
            disabled={!canSend || sendingAttachments}
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm file"
          >
            <IconPaperclip size={20} />
          </button>
        )}
        {canAttach && mobile ? (
          <div className="chat-image-attach" ref={imageMenuRef}>
            <button
              type="button"
              className="chat-attach"
              disabled={!canSend || sendingAttachments}
              onClick={() => setImageMenuOpen((open) => !open)}
              title="Đính kèm ảnh"
              aria-expanded={imageMenuOpen}
              aria-haspopup="menu"
            >
              <IconImage size={20} />
            </button>
            {imageMenuOpen ? (
              <div className="chat-image-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canSend || sendingAttachments}
                  onClick={() => {
                    setImageMenuOpen(false);
                    cameraInputRef.current?.click();
                  }}
                >
                  <IconCamera size={18} />
                  {uiCopy('v', 'takePhoto')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canSend || sendingAttachments}
                  onClick={() => {
                    setImageMenuOpen(false);
                    imageInputRef.current?.click();
                  }}
                >
                  <IconImage size={18} />
                  {uiCopy('v', 'chooseImage')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
        {mobile ? (
          <>
            <input
              ref={imageInputRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              hidden
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </>
        ) : null}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            const el = e.currentTarget;
            setDraft(el.value);
            updateMention(el.value, el.selectionStart);
            resizeComposer(el);
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
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
              const key = e.key.toLowerCase();
              if (key === 'b') {
                e.preventDefault();
                wrapComposerSelection('**');
                return;
              }
              if (key === 'i') {
                e.preventDefault();
                wrapComposerSelection('*');
                return;
              }
            }
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
              if (!sendingAttachments) void submit();
            }
          }}
          rows={1}
          placeholder={
            aiWaiting
              ? 'Đang chờ AI trả lời…'
              : canSend
                ? isBot
                  ? 'Hỏi chatbot…'
                  : 'Nhập tin nhắn…'
                : blockReason || 'Không thể gửi tin…'
          }
          aria-label="Nội dung tin nhắn"
          disabled={!canSend || aiWaiting}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={
            !canSend || aiWaiting || sendingAttachments || (!draft.trim() && queuedFiles.length === 0)
          }
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
              {!item.previewUrl && (
                <span className="chat-queued-file-name">{item.file.name}</span>
              )}
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
  );
});
