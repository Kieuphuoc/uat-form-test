import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  botAvatarUrl,
  botTypeLabel,
  chatApi,
  type ChatBotCatalogItem,
} from '../../api/chatApi';
import { IconChat } from '../AppIcons';
import { navigateChat } from '../../lib/chatNav';
import { activeChatBots, loadChatBots } from '../../lib/chatBotsCache';
import { ChatAvatar } from './ChatAvatar';

type Props = {
  /** FolderId hội thoại bot hiện tại — click trùng thì không điều hướng. */
  currentFolderId?: string | null;
  title?: string;
  /** OA/Zalo: chỉ tên, không mô tả. */
  compact?: boolean;
};

export function ChatBotCatalogSection({
  currentFolderId,
  title = 'AI Chatbots',
  compact = false,
}: Props) {
  const navigate = useNavigate();
  const [bots, setBots] = useState<ChatBotCatalogItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadChatBots()
      .then((items) => {
        if (cancelled) return;
        setBots(activeChatBots(items));
      })
      .catch(() => {
        if (!cancelled) setBots([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bots.length === 0 && !error) return null;

  const openBot = async (folderId: string) => {
    const self = (currentFolderId ?? '').trim().toLowerCase();
    if (self && folderId.toLowerCase() === self) return;
    setBusyId(folderId);
    setError(null);
    try {
      const conversation = await chatApi.openBot(folderId);
      navigateChat(navigate, `/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được Chatbots.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="chat-info-section">
      <div className="chat-info-section-head">
        <span>{title}</span>
      </div>
      {compact ? null : (
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Chatbots bạn có quyền. Bấm để mở hội thoại (tạo mới nếu chưa có).
        </p>
      )}
      {error ? <p className="chat-error">{error}</p> : null}
      <div className="chat-info-bot-list">
        {bots.map((bot) => {
          const current =
            (currentFolderId ?? '').trim().toLowerCase() === bot.folder_id.toLowerCase();
          return (
            <button
              key={bot.folder_id}
              type="button"
              className={`chat-info-bot-row${current ? ' is-current' : ''}`}
              disabled={busyId === bot.folder_id}
              onClick={() => void openBot(bot.folder_id)}
              title={current ? 'Hội thoại hiện tại' : 'Mở hội thoại'}
            >
              <ChatAvatar name={bot.title} size={compact ? 28 : 36} imageSrc={botAvatarUrl(bot.avatar_url)} />
              <span className="chat-contact-main">
                <strong>{bot.title}</strong>
                {compact ? null : (
                  <span className="muted">{botTypeLabel(bot)}</span>
                )}
              </span>
              <IconChat size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
