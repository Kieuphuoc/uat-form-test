import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { mobileKeyboardFocusHandlers, refocusComposer } from '../../lib/keyboardBridge';
import {
  botAvatarUrl,
  chatApi,
  type ChatMember,
  type ChatMessage,
  type Conversation,
  type QuickMessage,
} from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { loadChatBots } from '../../lib/chatBotsCache';
import {
  buildComposerBotPicks,
  detectComposerBotPick,
  filterComposerBotPicks,
  type ComposerBotPick,
} from '../../lib/composerBotPick';
import {
  expandQuickMessage,
  faqSlashCommands,
  type FaqBuildPhase,
  type FaqSlashCommand,
} from '../../lib/faqBuildState';
import { uiCopy } from '../../lib/uiCopy';
import {
  IconBot,
  IconCamera,
  IconCheck,
  IconClose,
  IconFile,
  IconImage,
  IconPaperclip,
  IconSave,
  IconSend,
} from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';
import { ComposerBotPickMenu } from './ComposerBotPickMenu';

type QueuedFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type SlashItem = {
  code: string;
  label: string;
  insert: string;
  description?: string;
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
  quickMessages?: QuickMessage[];
  faqBuildMode?: boolean;
  faqBuildPhase?: FaqBuildPhase;
  canReviewFaq?: boolean;
  onClearReply: () => void;
  onSend: (body: string, replyToMessageId?: number | null) => void;
  onSendAttachments: (files: File[]) => Promise<void>;
  onValidateSend?: (body: string) => boolean;
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
  quickMessages = [],
  faqBuildMode = false,
  faqBuildPhase = 'idle',
  canReviewFaq = false,
  onClearReply,
  onSend,
  onSendAttachments,
  onValidateSend,
  addFilesRef,
}: Props) {
  const { mobile } = useAuth();
  const keyboardHandlers = useMemo(() => mobileKeyboardFocusHandlers(mobile), [mobile]);
  const [draft, setDraft] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashStart, setSlashStart] = useState<number | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [botOpen, setBotOpen] = useState(false);
  const [botQuery, setBotQuery] = useState('');
  const [botStart, setBotStart] = useState<number | null>(null);
  const [botIndex, setBotIndex] = useState(0);
  const [botPicks, setBotPicks] = useState<ComposerBotPick[]>([]);
  const [botPicksLoaded, setBotPicksLoaded] = useState(false);
  const [selectedBot, setSelectedBot] = useState<ComposerBotPick | null>(null);
  const [askingBot, setAskingBot] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [imageMenuOpen, setImageMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageMenuRef = useRef<HTMLDivElement | null>(null);
  const queuedRef = useRef<QueuedFile[]>([]);
  queuedRef.current = queuedFiles;

  const faqCommands = useMemo(
    () => (faqBuildMode ? faqSlashCommands(canReviewFaq) : []),
    [faqBuildMode, canReviewFaq],
  );

  const slashCatalog = useMemo((): SlashItem[] => {
    if (faqBuildMode) {
      return faqCommands.map((item: FaqSlashCommand) => ({
        code: item.code,
        label: item.label,
        insert: item.insert,
        description: item.description,
      }));
    }
    return quickMessages.map((item) => ({
      code: item.code,
      label: item.code,
      insert: `/${item.code} `,
      description: item.body_text.length > 80 ? `${item.body_text.slice(0, 80)}…` : item.body_text,
    }));
  }, [faqBuildMode, faqCommands, quickMessages]);

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

  useEffect(() => {
    if (!botOpen || botPicksLoaded) return;
    let cancelled = false;
    void Promise.allSettled([loadChatBots(), chatApi.listFaqWorkbench()]).then((results) => {
      if (cancelled) return;
      const bots = results[0].status === 'fulfilled' ? results[0].value : [];
      const faqs = results[1].status === 'fulfilled' ? results[1].value : [];
      setBotPicks(buildComposerBotPicks(bots, faqs));
      setBotPicksLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [botOpen, botPicksLoaded]);

  useEffect(() => {
    if (!replyTo) return;
    refocusComposer(textareaRef.current);
    resizeComposer(textareaRef.current);
  }, [replyTo]);

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

  const slashMatches =
    slashOpen && slashCatalog.length > 0
      ? slashCatalog
          .filter((item) =>
            item.code.toLocaleLowerCase('vi').includes(slashQuery.toLocaleLowerCase('vi'))
            || item.label.toLocaleLowerCase('vi').includes(slashQuery.toLocaleLowerCase('vi')),
          )
          .slice(0, 8)
      : [];

  const botMatches = botOpen ? filterComposerBotPicks(botPicks, botQuery) : [];

  const updateComposerTokens = (value: string, caret: number) => {
    const botHit = detectComposerBotPick(value, caret);
    if (botHit) {
      setBotStart(botHit.start);
      setBotQuery(botHit.query);
      setBotIndex(0);
      setBotOpen(true);
      setMentionOpen(false);
      setMentionStart(null);
      setSlashOpen(false);
      setSlashStart(null);
      return;
    }

    setBotOpen(false);
    setBotStart(null);

    if (conversationKind === 'group') {
      const beforeCaret = value.slice(0, caret);
      const mentionMatch = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
      if (mentionMatch) {
        const at = beforeCaret.lastIndexOf('@');
        setMentionStart(at);
        setMentionQuery(mentionMatch[1]);
        setMentionIndex(0);
        setMentionOpen(true);
        setSlashOpen(false);
        setSlashStart(null);
        return;
      }
    }

    setMentionOpen(false);
    setMentionStart(null);

    const beforeCaret = value.slice(0, caret);
    const slashMatch = beforeCaret.match(/(?:^|\s)\/([^\s/]*)$/);
    if (slashMatch && (faqBuildMode || quickMessages.length > 0)) {
      const slashAt = beforeCaret.lastIndexOf('/');
      setSlashStart(slashAt);
      setSlashQuery(slashMatch[1]);
      setSlashIndex(0);
      setSlashOpen(true);
      return;
    }

    setSlashOpen(false);
    setSlashStart(null);
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

  const chooseSlash = (item: SlashItem) => {
    if (slashStart == null) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, slashStart)}${item.insert}${draft.slice(caret)}`;
    const nextCaret = slashStart + item.insert.length;
    setDraft(next);
    setSlashOpen(false);
    setSlashStart(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
      resizeComposer(textarea);
    });
  };

  const chooseBotPick = (item: ComposerBotPick) => {
    if (botStart == null) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, botStart)}${draft.slice(caret).replace(/^\s*/, '')}`;
    setDraft(next);
    setSelectedBot(item);
    setAskError(null);
    setBotOpen(false);
    setBotStart(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(botStart, botStart);
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
    updateComposerTokens(next, nextEnd);
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

  const quotedQuestion = (replyTo?.body ?? '').trim();
  const canAskWithQuote = !!selectedBot && !faqBuildMode && quotedQuestion.length > 0;
  const canSubmit =
    !!draft.trim() || queuedFiles.length > 0 || canAskWithQuote;

  const dispatchSend = (rawBody: string) => {
    let body = rawBody.trim();
    if (!body && canAskWithQuote) body = quotedQuestion;
    if (!body && queuedFiles.length === 0) return;
    if (body && !faqBuildMode) {
      body = expandQuickMessage(body, quickMessages);
    }
    if (body && selectedBot && !faqBuildMode) {
      void askSelectedBot(body);
      return;
    }
    if (body && onValidateSend && !onValidateSend(body)) return;
    if (body) {
      onSend(body, replyTo?.id ?? null);
      setDraft('');
      onClearReply();
    }
    window.requestAnimationFrame(() => resizeComposer(textareaRef.current));
    refocusComposer(textareaRef.current);
    if (queuedFiles.length > 0) {
      setSendingAttachments(true);
      void onSendAttachments(queuedFiles.map((item) => item.file))
        .then(() => {
          queuedFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
          setQueuedFiles([]);
          setAttachmentError(null);
        })
        .catch(() => {
          setAttachmentError('Không gửi được file. Bạn có thể thử lại.');
        })
        .finally(() => {
          setSendingAttachments(false);
          refocusComposer(textareaRef.current);
        });
    }
  };

  const askSelectedBot = async (question: string) => {
    if (!selectedBot || askingBot) return;
    setAskingBot(true);
    setAskError(null);
    try {
      const result = await chatApi.askBotDraft(selectedBot.id, question);
      const answer = (result.body ?? '').trim();
      if (!answer) {
        setAskError('Không nhận được nội dung. Bạn có thể thử lại.');
        return;
      }
      setDraft(answer);
      setSelectedBot(null);
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        resizeComposer(el);
        if (el) {
          el.focus();
          const end = answer.length;
          el.setSelectionRange(end, end);
        }
      });
    } catch (e) {
      setAskError(e instanceof Error ? e.message : 'Không hỏi được Chatbots. Hãy thử lại.');
    } finally {
      setAskingBot(false);
      refocusComposer(textareaRef.current);
    }
  };

  const submit = () => {
    if (!canSubmit || !canSend || sendingAttachments || askingBot) return;
    dispatchSend(draft);
  };

  const showDoneAction = faqBuildMode && canSend && faqBuildPhase === 'answering';
  const showSaveAction = faqBuildMode && canSend && faqBuildPhase === 'preview';

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendingAttachments && !askingBot) submit();
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
      {selectedBot ? (
        <div className="chat-reply-bar chat-bot-pick-bar">
          <ChatAvatar
            name={selectedBot.title}
            size={28}
            imageSrc={selectedBot.kind === 'bot' ? botAvatarUrl(selectedBot.avatarUrl) : undefined}
          />
          <div>
            <strong>
              {askingBot ? 'Đang hỏi' : 'Soạn nháp với'} {selectedBot.title}
            </strong>
            <span>
              {askingBot
                ? 'Đang hỏi AI Bots, vui lòng chờ…'
                : canAskWithQuote
                  ? 'Enter hỏi AI bằng tin trích dẫn — xem rồi gửi'
                  : 'Enter hỏi AI — xem rồi gửi'}
            </span>
          </div>
          <button
            type="button"
            className="chat-icon-btn"
            disabled={askingBot}
            onClick={() => {
              setSelectedBot(null);
              setAskError(null);
            }}
            aria-label="Bỏ Chatbots"
          >
            <IconClose size={14} />
          </button>
        </div>
      ) : null}
      {botOpen && (
        botPicksLoaded ? (
          <ComposerBotPickMenu
            items={botMatches}
            activeIndex={botIndex}
            onChoose={chooseBotPick}
            onHover={setBotIndex}
          />
        ) : (
          <div className="chat-mention-menu chat-bot-pick-menu" role="status">
            <span className="chat-mention-empty">Đang tải Chatbots / FAQ…</span>
          </div>
        )
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
      {slashOpen && (
        <div className="chat-mention-menu chat-slash-menu" role="listbox" aria-label="Tin nhắn nhanh">
          {slashMatches.length > 0 ? (
            slashMatches.map((item, index) => (
              <button
                key={item.code}
                type="button"
                className={index === slashIndex ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSlash(item)}
                role="option"
                aria-selected={index === slashIndex}
              >
                <span className="chat-slash-code">/{item.label}</span>
                {item.description ? <small>{item.description}</small> : null}
              </button>
            ))
          ) : (
            <span className="chat-mention-empty">Không có mục phù hợp.</span>
          )}
        </div>
      )}
      <div className="chat-composer-row">
        {canAttach && (
          <button
            type="button"
            className="chat-attach"
            disabled={!canSend || sendingAttachments || askingBot}
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
              disabled={!canSend || sendingAttachments || askingBot}
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
                  disabled={!canSend || sendingAttachments || askingBot}
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
                  disabled={!canSend || sendingAttachments || askingBot}
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
          onFocus={keyboardHandlers.onFocus}
          onBlur={keyboardHandlers.onBlur}
          onChange={(e) => {
            const el = e.currentTarget;
            setDraft(el.value);
            updateComposerTokens(el.value, el.selectionStart);
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
            if (botOpen) {
              if (e.key === 'ArrowDown' && botMatches.length > 0) {
                e.preventDefault();
                setBotIndex((index) => (index + 1) % botMatches.length);
                return;
              }
              if (e.key === 'ArrowUp' && botMatches.length > 0) {
                e.preventDefault();
                setBotIndex((index) => (index - 1 + botMatches.length) % botMatches.length);
                return;
              }
              if ((e.key === 'Enter' || e.key === 'Tab') && botMatches.length > 0) {
                e.preventDefault();
                chooseBotPick(botMatches[botIndex] ?? botMatches[0]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setBotOpen(false);
                return;
              }
            }
            if (slashOpen) {
              if (e.key === 'ArrowDown' && slashMatches.length > 0) {
                e.preventDefault();
                setSlashIndex((index) => (index + 1) % slashMatches.length);
                return;
              }
              if (e.key === 'ArrowUp' && slashMatches.length > 0) {
                e.preventDefault();
                setSlashIndex((index) => (index - 1 + slashMatches.length) % slashMatches.length);
                return;
              }
              if ((e.key === 'Enter' || e.key === 'Tab') && slashMatches.length > 0) {
                e.preventDefault();
                chooseSlash(slashMatches[slashIndex] ?? slashMatches[0]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setSlashOpen(false);
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
              if (!sendingAttachments && !askingBot) submit();
            }
          }}
          rows={1}
          placeholder={
            canSend
              ? selectedBot
                ? askingBot
                  ? `Đang hỏi ${selectedBot.title}…`
                  : canAskWithQuote
                    ? `Nhập câu hỏi, hoặc Enter dùng tin trích dẫn…`
                    : `Nhập câu hỏi cho ${selectedBot.title}…`
                : faqBuildMode
                  ? 'Dựng FAQ — gõ / để xem lệnh…'
                  : isBot
                    ? 'Hỏi Chatbots… · @@ hỏi AI khác'
                    : 'Nhập tin nhắn… · @@ hỏi AI'
              : blockReason || 'Không thể gửi tin…'
          }
          aria-label="Nội dung tin nhắn"
          disabled={!canSend || askingBot}
        />
        {showDoneAction ? (
          <button
            type="button"
            className="chat-composer-action"
            disabled={!!aiWaiting || sendingAttachments || askingBot}
            title="Xong (/Xong)"
            onClick={() => dispatchSend('/Xong')}
          >
            <IconCheck size={18} />
          </button>
        ) : null}
        {showSaveAction ? (
          <button
            type="button"
            className="chat-composer-action chat-composer-action--save"
            disabled={!!aiWaiting || sendingAttachments || askingBot}
            title="Lưu (/Lưu)"
            onClick={() => dispatchSend('/Lưu')}
          >
            <IconSave size={18} />
          </button>
        ) : null}
        <button
          type="submit"
          className="chat-send"
          disabled={
            !canSend
            || sendingAttachments
            || askingBot
            || !canSubmit
          }
          title={selectedBot ? `Hỏi ${selectedBot.title} (Enter)` : 'Gửi (Enter)'}
        >
          {selectedBot ? <IconBot size={18} /> : <IconSend size={18} />}
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
      {askError && <div className="chat-attachment-error">{askError}</div>}
      {attachmentError && <div className="chat-attachment-error">{attachmentError}</div>}
    </form>
  );
});
