import { useEffect, useRef, useState } from 'react';
import {
  botAvatarUrl,
  botTypeLabel,
  chatApi,
  chatFolderUrl,
  isEmbedBot,
  normalizeNotifyMode,
  notifyModeLabel,
  type ChatAttachmentItem,
  type ChatAttachmentList,
  type ChatMember,
  type ContactRelation,
  type Conversation,
} from '../../api/chatApi';
import {
  IconBell,
  IconBellMention,
  IconBellOff,
  IconBlock,
  IconClose,
  IconDatabase,
  IconEdit,
  IconImage,
  IconPlus,
  IconTrash,
} from '../AppIcons';
import { ChatAvatar, useChatFileUrl } from './ChatAvatar';
import { ChatBotCatalogSection } from './ChatBotCatalogSection';
import { ChatConfirmDialog } from './ChatConfirmDialog';
import { ChatFileSection, ChatFileTile } from './ChatFileGrid';
import { FilePreviewModal } from './FilePreviewModal';

const FILES_PREVIEW_LIMIT = 10;

type Props = {
  conversation: Conversation | null;
  members: ChatMember[];
  relation?: ContactRelation | null;
  seedAttachments?: ChatAttachmentList | null;
  attachmentsPending?: boolean;
  busy: boolean;
  onClose: () => void;
  onRename: (title: string) => void;
  onSetAvatar: (file: File) => Promise<void>;
  onAddMembers: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onToggleNotify?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  onAccept?: () => void;
  embedCompany?: {
    label: string;
    title?: string;
    onClick: () => void;
  } | null;
};

function EmbedCompanyFooter({
  embedCompany,
}: {
  embedCompany?: Props['embedCompany'];
}) {
  if (!embedCompany) return null;
  return (
    <div className="chat-info-embed-company">
      <span className="chat-info-embed-company-label">Tin nhắn nội bộ</span>
      <span className="chat-info-embed-company-sep" aria-hidden="true">
        ⇒
      </span>
      <button
        type="button"
        className="chat-info-embed-company-btn"
        title={embedCompany.title ?? 'Thay đổi công ty và dữ liệu'}
        onClick={embedCompany.onClick}
      >
        <IconDatabase size={14} />
        <span>{embedCompany.label}</span>
      </button>
    </div>
  );
}

function FileTile({
  conversationId,
  item,
  onOpen,
}: {
  conversationId: number;
  item: ChatAttachmentItem;
  onOpen: () => void;
}) {
  const imageUrl = useChatFileUrl(conversationId, item.is_image ? item.file_id : null, 256);
  return (
    <ChatFileTile
      fileName={item.file_name}
      isImage={item.is_image}
      imageUrl={imageUrl}
      onOpen={onOpen}
    />
  );
}

export function ConversationInfo({
  conversation,
  members,
  relation,
  seedAttachments,
  attachmentsPending = false,
  busy,
  onClose,
  onRename,
  onSetAvatar,
  onAddMembers,
  onLeave,
  onDelete,
  onToggleNotify,
  onBlock,
  onUnblock,
  onAccept,
  embedCompany,
}: Props) {
  const isGroup = conversation?.kind === 'group';
  const isBot = conversation?.kind === 'bot';
  const [title, setTitle] = useState(conversation?.title ?? '');
  const [renaming, setRenaming] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const me = members.find((m) => m.is_me);
  const isOwner = me?.role === 'owner' || conversation?.owner_user_id === me?.user_id;

  const [files, setFiles] = useState<ChatAttachmentItem[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChatAttachmentItem | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [stickyExpired, setStickyExpired] = useState(false);
  const canBlock = !isGroup && !isBot && !!relation;

  useEffect(() => {
    setTitle(conversation?.title ?? '');
    setRenaming(false);
    setLeaveConfirmOpen(false);
    setDeleteConfirmOpen(false);
  }, [conversation?.id, conversation?.title]);

  const conversationId = conversation?.id ?? null;
  const lastMessageId = conversation?.last_message_id ?? 0;
  const isBotConversation = conversation?.kind === 'bot';
  const stickyUntil = conversation?.active_bot_until ?? null;

  useEffect(() => {
    setStickyExpired(false);
    if (!stickyUntil) return;
    const ms = Date.parse(stickyUntil) - Date.now();
    if (Number.isNaN(ms) || ms <= 0) {
      setStickyExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setStickyExpired(true), ms);
    return () => window.clearTimeout(timer);
  }, [stickyUntil, conversation?.id, conversation?.active_bot_folder_id]);
  const appliedSeedRef = useRef<{ id: number; lastMsg: number } | null>(null);

  useEffect(() => {
    if (!conversationId || isBotConversation) {
      appliedSeedRef.current = null;
      setFiles([]);
      setFilesTotal(0);
      setFolderUrl(null);
      setPreview(null);
      return;
    }
    if (appliedSeedRef.current?.id !== conversationId) {
      appliedSeedRef.current = null;
      setFiles([]);
      setFilesTotal(0);
      setFolderUrl(null);
      setPreview(null);
    }
    if (attachmentsPending) {
      appliedSeedRef.current = null;
      return;
    }

    const already =
      appliedSeedRef.current?.id === conversationId
      && appliedSeedRef.current.lastMsg === lastMessageId;
    if (already) return;

    const firstOpen = appliedSeedRef.current == null;
    if (firstOpen && seedAttachments) {
      appliedSeedRef.current = { id: conversationId, lastMsg: lastMessageId };
      setFiles(seedAttachments.items ?? []);
      setFilesTotal(seedAttachments.total ?? seedAttachments.items?.length ?? 0);
      setFolderUrl(chatFolderUrl(seedAttachments.folder_id, seedAttachments.folder_name));
      return;
    }

    let disposed = false;
    void chatApi.listAttachments(conversationId, FILES_PREVIEW_LIMIT).then(
      (result) => {
        if (disposed) return;
        appliedSeedRef.current = { id: conversationId, lastMsg: lastMessageId };
        setFiles(result.items ?? []);
        setFilesTotal(result.total ?? 0);
        setFolderUrl(chatFolderUrl(result.folder_id, result.folder_name));
      },
      () => {
        if (!disposed) {
          appliedSeedRef.current = { id: conversationId, lastMsg: lastMessageId };
          setFiles([]);
          setFilesTotal(0);
          setFolderUrl(null);
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [conversationId, lastMessageId, isBotConversation, seedAttachments, attachmentsPending]);

  if (!conversation) {
    return (
      <div className="chat-info">
        <p className="chat-hint" style={{ flex: 1 }}>Chưa chọn hội thoại.</p>
        <EmbedCompanyFooter embedCompany={embedCompany} />
      </div>
    );
  }

  return (
    <div className="chat-info">
      <header className="chat-info-head">
        <strong>Thông tin</strong>
        <div className="chat-info-head-actions">
          {onToggleNotify && (
            <button
              type="button"
              className={`chat-icon-btn${normalizeNotifyMode(conversation.notify_mode) === 'mute' ? ' is-muted' : ''}`}
              title={notifyModeLabel(conversation.notify_mode)}
              disabled={busy}
              onClick={onToggleNotify}
            >
              {normalizeNotifyMode(conversation.notify_mode) === 'mute' ? (
                <IconBellOff size={18} />
              ) : normalizeNotifyMode(conversation.notify_mode) === 'mention' ? (
                <IconBellMention size={18} />
              ) : (
                <IconBell size={18} />
              )}
            </button>
          )}
          {canBlock && relation && (
            <button
              type="button"
              className={`chat-icon-btn${relation.relation === 'blocked' ? ' is-danger' : ''}`}
              title={relation.relation === 'blocked' && relation.i_blocked_peer ? 'Bỏ chặn tin nhắn' : 'Chặn tin nhắn'}
              disabled={busy || (relation.relation === 'blocked' && !relation.i_blocked_peer)}
              onClick={
                relation.relation === 'blocked' && relation.i_blocked_peer ? onUnblock : onBlock
              }
            >
              <IconBlock size={18} />
            </button>
          )}
          <button
            type="button"
            className="chat-icon-btn is-danger"
            title="Xóa hội thoại"
            disabled={busy}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <IconTrash size={18} />
          </button>
          <button type="button" className="chat-icon-btn" onClick={onClose} title="Đóng">
            <IconClose size={18} />
          </button>
        </div>
      </header>

      <div className="chat-info-body">
        <div className="chat-info-hero">
          <div className="chat-info-avatar-wrap">
            <ChatAvatar
              name={conversation.title}
              avatarId={isGroup || isBot ? null : conversation.peer_avatar_id}
              group={isGroup}
              conversationId={conversation.id}
              fileId={isGroup ? conversation.avatar_file_id : null}
              imageSrc={isBot ? botAvatarUrl(conversation.bot_avatar_url) : null}
              size={64}
            />
            {isGroup && (
              <>
                <button
                  type="button"
                  className="chat-icon-btn chat-info-avatar-btn"
                  title="Đổi ảnh nhóm"
                  disabled={busy}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <IconImage size={16} />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void onSetAvatar(file);
                  }}
                />
              </>
            )}
          </div>
          {renaming ? (
            <div className="chat-info-rename">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Tên nhóm"
                autoFocus
              />
              <div className="row">
                <button
                  type="button"
                  disabled={busy || !title.trim()}
                  onClick={() => onRename(title.trim())}
                >
                  Lưu
                </button>
                <button type="button" className="secondary" onClick={() => setRenaming(false)}>
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-info-name-row">
                <strong className="chat-info-name">{conversation.title}</strong>
                {isGroup && (
                  <button
                    type="button"
                    className="chat-icon-btn"
                    title="Đổi tên nhóm"
                    onClick={() => setRenaming(true)}
                  >
                    <IconEdit size={16} />
                  </button>
                )}
              </div>
              <span className="muted">
                {isGroup
                  ? `Nhóm · ${conversation.member_count} thành viên`
                  : isBot
                    ? isEmbedBot(conversation)
                      ? 'AI nhúng — không lưu lịch sử'
                      : botTypeLabel(conversation)
                    : 'Tin nhắn riêng'}
              </span>
            </>
          )}
        </div>

        {isBot && conversation.bot_description?.trim() ? (
          <div className="chat-info-section">
            <div className="chat-info-section-head">
              <span>Diễn giải</span>
            </div>
            <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {conversation.bot_description.trim()}
            </p>
          </div>
        ) : null}

        {isBot && !isEmbedBot(conversation) ? (
          <div className="chat-info-section">
            <div className="chat-info-section-head">
              <span>Bot đang hỗ trợ</span>
            </div>
            {(() => {
              const homeId = (conversation.bot_folder_id ?? '').trim().toLowerCase();
              const stickyId = (conversation.active_bot_folder_id ?? '').trim().toLowerCase();
              const switched =
                !stickyExpired &&
                stickyId.length > 0 &&
                homeId.length > 0 &&
                stickyId !== homeId;
              const name = switched
                ? conversation.active_bot_title || conversation.title
                : conversation.title;
              const avatar = switched
                ? conversation.active_bot_avatar_url
                : conversation.bot_avatar_url;
              return (
                <div className="chat-info-active-bot">
                  <ChatAvatar name={name} size={40} imageSrc={botAvatarUrl(avatar)} />
                  <span className="chat-contact-main">
                    <strong>{name}</strong>
                    <span className="muted">
                      {switched
                        ? conversation.active_bot_until
                          ? `Đổi từ gợi ý · đến ${new Date(conversation.active_bot_until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Đổi từ gợi ý'
                        : 'Bot của hội thoại này'}
                    </span>
                  </span>
                </div>
              );
            })()}
          </div>
        ) : null}

        {isBot ? (
          <ChatBotCatalogSection currentFolderId={conversation.bot_folder_id} compact />
        ) : null}

        {!isGroup && relation && relation.relation !== 'accepted' && (
          <div className="chat-info-section">
            <div className="chat-info-section-head">
              <span>Liên hệ</span>
            </div>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              {relation.relation === 'pending_out' &&
                `Đang chờ chấp nhận · còn ${relation.remaining_messages}/3 tin.`}
              {relation.relation === 'pending_in' && 'Yêu cầu chat đang chờ bạn xử lý.'}
              {relation.relation === 'blocked' &&
                (relation.send_block_reason || 'Đã chặn chat trực tiếp.')}
              {relation.relation === 'none' && 'Chưa có quan hệ contact.'}
            </p>
            <div className="chat-contact-actions" style={{ justifyContent: 'flex-start' }}>
              {relation.relation === 'pending_in' && (
                <button type="button" disabled={busy} onClick={onAccept}>
                  Chấp nhận
                </button>
              )}
            </div>
          </div>
        )}

        {isGroup && (
          <div className="chat-info-section">
            <div className="chat-info-section-head">
              <span>Thành viên ({members.length})</span>
              <button type="button" className="chat-icon-btn" onClick={onAddMembers} title="Thêm thành viên">
                <IconPlus size={16} />
              </button>
            </div>
            <ul className="chat-member-list">
              {members.map((m) => (
                <li key={m.user_id}>
                  <ChatAvatar name={m.nickname} avatarId={m.avatar_id} size={32} />
                  <span className="chat-member-main">
                    <span className="chat-member-name">
                      {m.nickname}
                      {m.is_me ? ' (bạn)' : ''}
                    </span>
                    {m.email && <span className="chat-member-sub">{m.email}</span>}
                  </span>
                  {m.role === 'owner' && <span className="chat-tag">Chủ nhóm</span>}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="chat-danger chat-info-leave-btn"
              disabled={busy}
              onClick={() => setLeaveConfirmOpen(true)}
            >
              {isOwner ? 'Giải tán nhóm' : 'Rời nhóm'}
            </button>
          </div>
        )}

        {!isBot && (
          <ChatFileSection total={filesTotal} folderUrl={folderUrl}>
            {files.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Chưa có file nào.
              </p>
            ) : (
              <div className="chat-file-grid">
                {files.map((item) => (
                  <FileTile
                    key={item.file_id}
                    conversationId={conversation.id}
                    item={item}
                    onOpen={() => setPreview(item)}
                  />
                ))}
              </div>
            )}
          </ChatFileSection>
        )}
      </div>

      <EmbedCompanyFooter embedCompany={embedCompany} />

      {preview && (
        <FilePreviewModal
          conversationId={conversation.id}
          fileId={preview.file_id}
          fileName={preview.file_name}
          contentType={preview.content_type}
          onClose={() => setPreview(null)}
        />
      )}
      <ChatConfirmDialog
        open={deleteConfirmOpen}
        title="Xóa hội thoại?"
        message="Hội thoại sẽ biến khỏi danh sách của bạn. Tin nhắn không bị xóa; hội thoại hiện lại khi có tin mới hoặc khi bạn mở lại từ danh bạ."
        confirmLabel="Xóa hội thoại"
        busy={busy}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDelete();
        }}
      />
      <ChatConfirmDialog
        open={leaveConfirmOpen}
        title={isOwner ? 'Giải tán nhóm?' : 'Rời khỏi nhóm?'}
        message={
          isOwner
            ? 'Nhóm sẽ bị giải tán ngay. Tất cả thành viên bị rời nhóm và toàn bộ tin nhắn, file sẽ bị xóa. Thao tác này không thể hoàn tác.'
            : 'Bạn sẽ không thể xem hoặc gửi thêm tin nhắn trong nhóm sau khi rời khỏi.'
        }
        confirmLabel={isOwner ? 'Giải tán nhóm' : 'Rời nhóm'}
        busy={busy}
        onCancel={() => setLeaveConfirmOpen(false)}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          onLeave();
        }}
      />
    </div>
  );
}
