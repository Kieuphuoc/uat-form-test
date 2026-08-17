import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  botAvatarUrl,
  chatApi,
  isEmbedBot,
  type ChatBotAuthMode,
  type ChatBotCatalogItem,
  type ChatBotType,
  type ChatMe,
} from '../api/chatApi';
import { IconBack, IconImage } from '../components/AppIcons';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { navigateChat } from '../lib/chatNav';
import { resizeChatAvatar } from '../lib/chatImageResize';

type ShellContext = {
  me: ChatMe | null;
  setMe?: Dispatch<SetStateAction<ChatMe | null>>;
};

export function ChatBotCreatePage() {
  const { folderId: folderIdParam } = useParams();
  const editingId = folderIdParam ? decodeURIComponent(folderIdParam) : '';
  const isEdit = editingId.length > 0;

  const { me, setMe } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const isAdmin = !!me?.is_admin;
  const hasCompany = (me?.unit_id ?? 0) > 0;

  const [loading, setLoading] = useState(isEdit);
  const [type, setType] = useState<ChatBotType>('rag');
  const [folderId, setFolderId] = useState(editingId);
  const [embedUrl, setEmbedUrl] = useState('');
  const [authMode, setAuthMode] = useState<ChatBotAuthMode>('embed_token');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void chatApi
      .getAdminSettings()
      .then((settings) => {
        if (cancelled) return;
        const bot = settings.ai_chatbots.find(
          (item) => item.folder_id.toLowerCase() === editingId.toLowerCase(),
        );
        if (!bot) {
          setError('Không tìm thấy chatbot.');
          return;
        }
        setType(isEmbedBot(bot) ? 'embed' : 'rag');
        setFolderId(bot.folder_id);
        setEmbedUrl(bot.embed_url ?? '');
        setAuthMode(bot.auth_mode === 'none' ? 'none' : 'embed_token');
        setTitle(bot.title ?? '');
        setDescription(bot.description ?? '');
        setAvatarUrl(bot.avatar_url ?? '');
        setActive(bot.active !== false);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không tải được chatbot.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, editingId]);

  if (!me) {
    return (
      <div className="chat-page-card chat-settings">
        <p className="chat-hint">Đang tải cấu hình…</p>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/chat" replace />;

  const isEmbed = type === 'embed';
  const busy = saving || loading || avatarUploading;

  const goBack = () => navigateChat(navigate, '/chat/settings');

  const onPickAvatar = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      setError('Chọn file ảnh (JPEG, PNG hoặc WebP).');
      return;
    }
    setAvatarUploading(true);
    setError(null);
    try {
      const resized = await resizeChatAvatar(file, 256);
      const uploaded = await chatApi.uploadBotAvatar(resized);
      setAvatarUrl(uploaded.avatar_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const submit = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('Nhập tên hiển thị.');
      return;
    }
    if (!hasCompany) {
      setError('Chưa chọn công ty.');
      return;
    }

    if (isEmbed) {
      const nextUrl = embedUrl.trim();
      if (!nextUrl) {
        setError('Nhập link nhúng.');
        return;
      }
      try {
        const parsed = new URL(nextUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError('Link nhúng phải là http hoặc https.');
          return;
        }
      } catch {
        setError('Link nhúng không hợp lệ.');
        return;
      }
    } else {
      const nextFolder = folderId.trim();
      if (nextFolder.length < 8 || nextFolder.length > 64) {
        setError('FolderId phải từ 8 đến 64 ký tự.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const current = await chatApi.getAdminSettings();
      const bots = current.ai_chatbots;
      const selfIndex = isEdit
        ? bots.findIndex((bot) => bot.folder_id.toLowerCase() === editingId.toLowerCase())
        : -1;
      if (isEdit && selfIndex < 0) {
        setError('Không tìm thấy chatbot.');
        setSaving(false);
        return;
      }

      if (!isEmbed) {
        const nextFolder = folderId.trim();
        const clash = bots.some(
          (bot, i) =>
            i !== selfIndex && bot.folder_id.toLowerCase() === nextFolder.toLowerCase(),
        );
        if (clash) {
          setError('FolderId này đã có trong danh sách.');
          setSaving(false);
          return;
        }
      } else {
        const nextUrl = embedUrl.trim().toLowerCase();
        const clash = bots.some(
          (bot, i) =>
            i !== selfIndex && (bot.embed_url ?? '').trim().toLowerCase() === nextUrl,
        );
        if (clash) {
          setError('Link nhúng này đã có trong danh sách.');
          setSaving(false);
          return;
        }
      }

      const nextItem: ChatBotCatalogItem = isEmbed
        ? {
            folder_id: isEdit ? editingId : '',
            type: 'embed',
            title: nextTitle,
            description: description.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            embed_url: embedUrl.trim(),
            auth_mode: authMode,
            active,
          }
        : {
            folder_id: folderId.trim(),
            type: 'rag',
            title: nextTitle,
            description: description.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            active,
          };

      const nextBots = isEdit
        ? bots.map((bot, i) => (i === selfIndex ? nextItem : bot))
        : [...bots, nextItem];

      const saved = await chatApi.saveAdminSettings({
        ...current,
        ai_chatbots: nextBots,
      });
      setMe?.((prev) =>
        prev
          ? {
              ...prev,
              ai_chatbot_enabled: saved.ai_chatbot_enabled,
              chat_theme: saved.chat_theme,
            }
          : prev,
      );
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được chatbot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="chat-page-card chat-settings">
      <header className="chat-page-card-head">
        <button type="button" className="chat-icon-btn" title="Quay lại" onClick={goBack}>
          <IconBack size={18} />
        </button>
        <div>
          <h2>{isEdit ? 'Sửa chatbot' : 'Thêm chatbot'}</h2>
          <p className="muted">
            {isEdit
              ? 'Sửa thông tin rồi bấm Lưu. Loại bot giữ nguyên.'
              : 'Chọn loại, nhập thông tin rồi bấm Lưu. Bot mới mặc định đang bật.'}
          </p>
        </div>
      </header>

      <section className="chat-settings-section">
        {loading && <p className="chat-hint">Đang tải chatbot…</p>}
        <label className="chat-settings-field">
          <span>Loại</span>
          <select
            value={type}
            disabled={busy || isEdit}
            onChange={(e) => setType(e.target.value === 'embed' ? 'embed' : 'rag')}
          >
            <option value="rag">AI thư mục — FolderId File.Api</option>
            <option value="embed">AI nhúng — iframe URL, không lưu lịch sử</option>
          </select>
        </label>

        {isEmbed ? (
          <>
            <label className="chat-settings-field">
              <span>Link nhúng</span>
              <input
                value={embedUrl}
                disabled={busy}
                placeholder="https://dash.arito.net/vn/chart-chat?hidden_login=true&sourceId=3"
                onChange={(e) => setEmbedUrl(e.target.value)}
              />
            </label>
            <label className="chat-settings-field">
              <span>Xác thực iframe</span>
              <select
                value={authMode}
                disabled={busy}
                onChange={(e) =>
                  setAuthMode(e.target.value === 'none' ? 'none' : 'embed_token')
                }
              >
                <option value="embed_token">embed_token — gắn JWT hiện tại vào URL</option>
                <option value="none">none — dùng URL nguyên (cookie / hidden_login)</option>
              </select>
            </label>
          </>
        ) : (
          <label className="chat-settings-field">
            <span>FolderId</span>
            <input
              value={folderId}
              disabled={busy || isEdit}
              placeholder="folder id scope=system"
              onChange={(e) => setFolderId(e.target.value)}
            />
          </label>
        )}

        <label className="chat-settings-field">
          <span>Tên hiển thị</span>
          <input
            value={title}
            disabled={busy}
            placeholder="Tên chatbot"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="chat-settings-field">
          <span>Mô tả ngắn</span>
          <input
            value={description}
            disabled={busy}
            placeholder="Mô tả"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="chat-bot-create-preview">
          <button
            type="button"
            className="chat-bot-avatar-pick"
            disabled={busy}
            title="Tải ảnh avatar"
            onClick={() => avatarInputRef.current?.click()}
          >
            <ChatAvatar name={title || 'AI'} imageSrc={botAvatarUrl(avatarUrl)} size={56} />
            <span className="chat-bot-avatar-pick-badge" aria-hidden>
              <IconImage size={14} />
            </span>
          </button>
          <span>
            <strong>{title.trim() || 'Tên hiển thị'}</strong>
            <small>
              {avatarUploading
                ? 'Đang cắt 256px và tải lên…'
                : avatarUrl
                  ? 'Bấm ảnh để đổi avatar'
                  : 'Bấm ảnh để tải avatar (cắt 256px). Trống = mascot.'}
            </small>
          </span>
          {avatarUrl ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setAvatarUrl('')}
            >
              Dùng mascot
            </button>
          ) : null}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void onPickAvatar(file);
            }}
          />
        </div>
        {error && <div className="chat-error">{error}</div>}
        <div className="chat-bot-create-actions">
          <button type="button" className="secondary" disabled={saving} onClick={goBack}>
            Hủy
          </button>
          <button type="button" disabled={busy} onClick={() => void submit()}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </section>
    </div>
  );
}
