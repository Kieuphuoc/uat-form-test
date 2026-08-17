import { useEffect } from 'react';
import { botAvatarUrl, buildBotEmbedSrc, type Conversation } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { IconBack, IconInfo } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

type Props = {
  conversation: Conversation;
  error?: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
};

const CLOSE_ACTION = 'CloseAITool';

export function BotEmbedThread({ conversation, error, onBack, onOpenInfo }: Props) {
  const { mobile } = useAuth();
  const disabled = conversation.bot_active === false;
  const src =
    !disabled && conversation.bot_embed_url
      ? buildBotEmbedSrc(conversation.bot_embed_url, conversation.bot_auth_mode, mobile)
      : null;

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { action?: string }).action === CLOSE_ACTION) onBack();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onBack]);

  return (
    <div className="chat-thread chat-bot-embed">
      <header className="chat-thread-head">
        <button type="button" className="chat-icon-btn chat-only-narrow" onClick={onBack} title="Danh sách">
          <IconBack size={18} />
        </button>
        <ChatAvatar
          name={conversation.title}
          imageSrc={botAvatarUrl(conversation.bot_avatar_url)}
          size={36}
        />
        <button type="button" className="chat-thread-title" onClick={onOpenInfo}>
          <span className="chat-thread-name">{conversation.title}</span>
          <span className="chat-thread-sub">
            {disabled
              ? 'Chatbot đã tắt'
              : conversation.bot_description || 'AI nhúng — không lưu lịch sử'}
          </span>
        </button>
        <button type="button" className="chat-icon-btn" onClick={onOpenInfo} title="Thông tin">
          <IconInfo size={18} />
        </button>
      </header>
      {error && <div className="chat-error">{error}</div>}
      {src ? (
        <iframe
          key={src}
          className="chat-bot-embed-frame"
          title={conversation.title}
          src={src}
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="chat-bot-embed-empty">
          {disabled
            ? 'Chatbot đã tắt. Bật lại trong Cài đặt để dùng.'
            : 'Chưa có link nhúng cho chatbot này.'}
        </div>
      )}
    </div>
  );
}
