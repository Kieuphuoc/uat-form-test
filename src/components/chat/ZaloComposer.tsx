import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { isMobileEmbed, mobileKeyboardFocusHandlers } from '../../lib/keyboardBridge';
import { IconClose, IconFile, IconPaperclip, IconSend } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';
import type { ZaloMember, ZaloMessage } from '../../lib/zaloChat';
import { zaloQuotePreview } from '../../lib/zaloChat';

export type ZaloSendPayload = {
  text: string;
  files: File[];
  quoteMessageId?: string;
  mentions: { uid?: string; pos: number; len: number; type?: string }[];
};

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type Props = {
  members: ZaloMember[];
  pendingQuote: ZaloMessage | null;
  sending: boolean;
  onClearQuote: () => void;
  onSend: (payload: ZaloSendPayload) => Promise<void> | void;
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

function senderLabel(msg: ZaloMessage): string {
  if (msg.sender_type === 'bot') return 'Bot AI · Tự động';
  if (msg.sender_type === 'operator') return msg.operator_display_name || msg.sender_display_name || 'Bạn';
  return msg.sender_display_name || 'Người dùng';
}

/**
 * Ô nhập tách khỏi danh sách tin — mỗi lần gõ chỉ re-render composer.
 * Enter gửi; Shift+Enter / Alt+Enter xuống dòng, tối đa 8 dòng như /chat.
 */
export const ZaloComposer = memo(function ZaloComposer({
  members,
  pendingQuote,
  sending,
  onClearQuote,
  onSend,
}: Props) {
  const mobileEmbed = isMobileEmbed();
  const keyboardHandlers = useMemo(() => mobileKeyboardFocusHandlers(mobileEmbed), [mobileEmbed]);
  const [draft, setDraft] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queuedRef = useRef<QueuedFile[]>([]);
  queuedRef.current = queuedFiles;

  useEffect(() => {
    return () => {
      queuedRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (pendingQuote) {
      composerRef.current?.focus();
      resizeComposer(composerRef.current);
    }
  }, [pendingQuote]);

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => `${m.display_name} ${m.zalo_uid}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [mentionOpen, mentionQuery, members]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionOpen]);

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setQueuedFiles((current) => {
      const remaining = Math.max(0, 8 - current.length);
      const accepted = files.slice(0, remaining);
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

  const removeFile = (id: string) => {
    setQueuedFiles((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const onComposerChange = (el: HTMLTextAreaElement) => {
    const value = el.value;
    setDraft(value);
    resizeComposer(el);
    const caret = el.selectionStart || 0;
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
    const next = `${prefix}@${name} ${after}`;
    setDraft(next);
    setMentionOpen(false);
    window.requestAnimationFrame(() => {
      if (!composerRef.current) return;
      composerRef.current.focus();
      resizeComposer(composerRef.current);
    });
  };

  const submit = async () => {
    const text = draft;
    if (sending || (!text.trim() && queuedFiles.length === 0)) return;
    const mentions: ZaloSendPayload['mentions'] = [];
    members.forEach((m) => {
      const token = `@${m.display_name}`;
      let from = 0;
      while (from < text.length) {
        const p = text.indexOf(token, from);
        if (p < 0) break;
        mentions.push({ uid: m.zalo_uid, pos: p, len: token.length, type: 'uid' });
        from = p + token.length;
      }
    });
    try {
      await onSend({
        text,
        files: queuedFiles.map((item) => item.file),
        quoteMessageId: pendingQuote?.id || pendingQuote?.zalo_msg_id || undefined,
        mentions,
      });
    } catch {
      return;
    }
    queuedFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setDraft('');
    setQueuedFiles([]);
    setMentionOpen(false);
    window.requestAnimationFrame(() => resizeComposer(composerRef.current));
  };

  return (
    <div className="chat-composer">
      {pendingQuote && (
        <div className="chat-reply-bar">
          <div>
            <strong>Trả lời {senderLabel(pendingQuote)}</strong>
            <span>{zaloQuotePreview(pendingQuote)}</span>
          </div>
          <button type="button" className="chat-icon-btn" onClick={onClearQuote}>
            <IconClose size={16} />
          </button>
        </div>
      )}
      {queuedFiles.length > 0 && (
        <div className="chat-attachment-tray">
          {queuedFiles.map((item) => (
            <span
              key={item.id}
              className={`chat-queued-file${item.previewUrl ? ' chat-queued-file--image' : ''}`}
            >
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.file.name} />
              ) : (
                <span className="chat-queued-file-doc">
                  <IconFile size={16} />
                </span>
              )}
              <span className="chat-queued-file-name">{item.file.name}</span>
              <button type="button" onClick={() => removeFile(item.id)}>
                <IconClose size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {mentionOpen && mentionMatches.length > 0 && (
        <div className="chat-mention-menu" role="listbox" aria-label="Nhắc thành viên">
          {mentionMatches.map((m, index) => (
            <button
              type="button"
              key={m.id}
              className={index === mentionIndex ? 'is-active' : undefined}
              role="option"
              aria-selected={index === mentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setMentionIndex(index)}
              onClick={() => insertMention(m.display_name)}
            >
              <ChatAvatar name={m.display_name} imageSrc={m.avatar_url} size={24} />
              <span>{m.display_name}</span>
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
            addFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <textarea
          ref={composerRef}
          rows={1}
          value={draft}
          placeholder="Nhập tin nhắn để trả lời thủ công..."
          onFocus={keyboardHandlers.onFocus}
          onBlur={keyboardHandlers.onBlur}
          onChange={(e) => onComposerChange(e.currentTarget)}
          onKeyDown={(e) => {
            if (mentionOpen && mentionMatches.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((index) => (index + 1) % mentionMatches.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const picked = mentionMatches[mentionIndex] ?? mentionMatches[0];
                if (picked) insertMention(picked.display_name);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionOpen(false);
                return;
              }
            }
            if (e.key === 'Enter' && (e.altKey || e.shiftKey)) {
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          className="chat-send"
          disabled={sending || (!draft.trim() && queuedFiles.length === 0)}
          onClick={() => void submit()}
          title="Gửi"
        >
          <IconSend size={18} />
        </button>
      </div>
    </div>
  );
});
