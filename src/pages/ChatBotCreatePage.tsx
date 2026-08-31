import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  botAvatarUrl,
  chatApi,
  normalizeBotType,
  type ChatBotAuthMode,
  type ChatBotCatalogItem,
  type ChatBotSuggestedQuestion,
  type ChatBotType,
  type ChatMe,
} from '../api/chatApi';
import { IconBack, IconImage, IconPlus, IconTrash } from '../components/AppIcons';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { ChatConfirmDialog } from '../components/chat/ChatConfirmDialog';
import { navigateChat } from '../lib/chatNav';
import { clearChatBotsCache } from '../lib/chatBotsCache';
import { resizeChatAvatar } from '../lib/chatImageResize';

type ShellContext = {
  me: ChatMe | null;
  setMe?: Dispatch<SetStateAction<ChatMe | null>>;
};

const MAX_SUGGESTIONS = 5;

function emptySuggestion(): ChatBotSuggestedQuestion {
  return { text: '', target_folder_id: null, greet_and_switch: false };
}

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
  const [synonyms, setSynonyms] = useState('');
  const [greetingTitle, setGreetingTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [active, setActive] = useState(true);
  const [catalogBots, setCatalogBots] = useState<ChatBotCatalogItem[]>([]);
  const [suggestions, setSuggestions] = useState<ChatBotSuggestedQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(isEdit);
    setError(null);
    void chatApi
      .getAdminSettings()
      .then((settings) => {
        if (cancelled) return;
        setCatalogBots(settings.ai_chatbots);
        if (!isEdit) return;
        const bot = settings.ai_chatbots.find(
          (item) => item.folder_id.toLowerCase() === editingId.toLowerCase(),
        );
        if (!bot) {
          setError('Không tìm thấy Chatbots.');
          return;
        }
        setType(normalizeBotType(bot.type));
        setFolderId(bot.folder_id);
        setEmbedUrl(bot.embed_url ?? '');
        setAuthMode(bot.auth_mode === 'none' ? 'none' : 'embed_token');
        setTitle(bot.title ?? '');
        setDescription(bot.description ?? '');
        setSynonyms(bot.synonyms ?? '');
        setGreetingTitle(bot.greeting_title ?? '');
        setAvatarUrl(bot.avatar_url ?? '');
        setActive(bot.active !== false);
        setSuggestions(
          (bot.suggested_questions ?? []).map((q) => ({
            text: q.text ?? '',
            target_folder_id: q.target_folder_id || null,
            greet_and_switch: !!q.greet_and_switch,
          })),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không tải được Chatbots.');
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
  const busy = saving || loading || avatarUploading || deleting;

  const goBack = () => navigateChat(navigate, '/chat/settings');

  const confirmDelete = async () => {
    if (!isEdit || !hasCompany || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const current = await chatApi.getAdminSettings();
      const nextBots = current.ai_chatbots.filter(
        (bot) => bot.folder_id.toLowerCase() !== editingId.toLowerCase(),
      );
      if (nextBots.length === current.ai_chatbots.length) {
        setError('Không tìm thấy Chatbots.');
        setDeleteConfirmOpen(false);
        return;
      }
      const saved = await chatApi.saveAdminSettings({
        ...current,
        ai_chatbots: nextBots,
      });
      clearChatBotsCache();
      setMe?.((prev) =>
        prev
          ? {
              ...prev,
              ai_chatbot_enabled: saved.ai_chatbot_enabled,
              zalo_enabled: saved.zalo_enabled,
              chat_theme: saved.chat_theme,
            }
          : prev,
      );
      setDeleteConfirmOpen(false);
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được Chatbots.');
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

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
        setError('Không tìm thấy Chatbots.');
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

      const currentFolder = isEmbed ? (isEdit ? editingId : '') : folderId.trim();
      const nextSuggestions: ChatBotSuggestedQuestion[] = isEmbed
        ? []
        : suggestions
            .map((q) => {
              const text = q.text.trim();
              const target = (q.target_folder_id ?? '').trim();
              return {
                text,
                target_folder_id:
                  target && target.toLowerCase() !== currentFolder.toLowerCase() ? target : null,
                greet_and_switch: !!q.greet_and_switch,
              };
            })
            .filter((q) => q.text.length > 0)
            .slice(0, MAX_SUGGESTIONS);

      const nextItem: ChatBotCatalogItem = isEmbed
        ? {
            folder_id: isEdit ? editingId : '',
            type: 'embed',
            title: nextTitle,
            description: description.trim() || null,
            synonyms: synonyms.trim() || null,
            greeting_title: greetingTitle.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            embed_url: embedUrl.trim(),
            auth_mode: authMode,
            active,
            suggested_questions: [],
          }
        : {
            folder_id: folderId.trim(),
            type,
            title: nextTitle,
            description: description.trim() || null,
            synonyms: synonyms.trim() || null,
            greeting_title: greetingTitle.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            active,
            suggested_questions: nextSuggestions,
          };

      const nextBots = isEdit
        ? bots.map((bot, i) => (i === selfIndex ? nextItem : bot))
        : [...bots, nextItem];

      const saved = await chatApi.saveAdminSettings({
        ...current,
        ai_chatbots: nextBots,
      });
      clearChatBotsCache();
      setMe?.((prev) =>
        prev
          ? {
              ...prev,
              ai_chatbot_enabled: saved.ai_chatbot_enabled,
              zalo_enabled: saved.zalo_enabled,
              chat_theme: saved.chat_theme,
            }
          : prev,
      );
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được Chatbots.');
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
          <h2>{isEdit ? 'Sửa Chatbots' : 'Thêm Chatbots'}</h2>
          <p className="muted">
            {isEdit
              ? 'Sửa thông tin rồi bấm Lưu. Có thể đổi RAG / Files / FAQ; không đổi sang AI nhúng.'
              : 'Chọn loại, nhập thông tin rồi bấm Lưu. Bot mới mặc định đang bật.'}
          </p>
        </div>
        {isEdit ? (
          <button
            type="button"
            className="chat-icon-btn chat-page-card-head-action is-danger"
            title="Xóa Chatbots"
            disabled={busy}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <IconTrash size={18} />
          </button>
        ) : null}
      </header>

      <section className="chat-settings-section">
        {loading && <p className="chat-hint">Đang tải Chatbots…</p>}
        <label className="chat-settings-field">
          <span>Loại</span>
          <select
            value={type}
            disabled={busy || (isEdit && isEmbed)}
            onChange={(e) => setType(normalizeBotType(e.target.value))}
          >
            <option value="rag" disabled={isEdit && isEmbed}>
              AI RAG — hỏi qua vector trong FolderId File.Api
            </option>
            <option value="file" disabled={isEdit && isEmbed}>
              AI Files — hỏi trực tiếp nội dung file trong folder
            </option>
            <option value="faq" disabled={isEdit && isEmbed}>
              AI FAQ — hỏi qua FAQ đã sync trên File.Api
            </option>
            <option value="embed" disabled={isEdit && !isEmbed}>
              AI nhúng — iframe URL, không lưu lịch sử
            </option>
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
          <>
            <label className="chat-settings-field">
              <span>FolderId</span>
              <input
                value={folderId}
                disabled={busy || isEdit}
                placeholder="folder id scope=system"
                onChange={(e) => setFolderId(e.target.value)}
              />
            </label>
            <p className="muted">
              Folder trên File.Api cần bật AI đúng mode (RAG / Files / FAQ) thì Chatbots mới trả lời được.
            </p>
          </>
        )}

        <label className="chat-settings-field">
          <span>Tên hiển thị</span>
          <input
            value={title}
            disabled={busy}
            placeholder="Tên Chatbots"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="chat-settings-field">
          <span>Mô tả (Description)</span>
          <textarea
            rows={3}
            value={description}
            disabled={busy}
            maxLength={800}
            placeholder="Phạm vi bot này trả lời — và những gì không trả lời."
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p className="muted">
          Dùng để chọn đúng bot khi khách hỏi tự do. Nên ghi rõ phạm vi và ngoài phạm vi.
        </p>
        <label className="chat-settings-field">
          <span>Từ đồng nghĩa (Synonyms)</span>
          <input
            value={synonyms}
            disabled={busy}
            maxLength={400}
            placeholder="dashbuilder, dashboard, BI, báo cáo, …"
            onChange={(e) => setSynonyms(e.target.value)}
          />
        </label>
        <p className="muted">Tên sản phẩm, viết tắt, cách khách hay gọi. Cách nhau bằng dấu phẩy.</p>
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

        {!isEmbed ? (
          <div className="chat-settings-field chat-bot-suggest">
            <span>Câu hỏi gợi ý (Zalo / OA)</span>
            <label className="chat-settings-field">
              <span>Tiêu đề gợi ý</span>
              <textarea
                rows={2}
                value={greetingTitle}
                disabled={busy}
                maxLength={200}
                placeholder="Chào bạn, tôi là trợ lý AI của ARITO. Bạn cần tôi hỗ trợ gì?"
                onChange={(e) => setGreetingTitle(e.target.value)}
              />
            </label>
            <p className="muted">
              Hiện khi khách Alo / Hi (kèm danh sách gợi ý). Để trống thì dùng câu chào theo tên bot.
            </p>
            <p className="muted">
              Tối đa {MAX_SUGGESTIONS} câu. Để trống “AI Chatbot trả lời” = bot hiện tại; chọn bot
              khác thì conversation chuyển sang bot đó. Tick “Xin chào và đổi source” = chỉ gửi câu
              chào rồi đổi bot, không hỏi knowledge.
            </p>
            {suggestions.map((item, index) => (
              <div key={index} className="chat-bot-suggest-row">
                <input
                  value={item.text}
                  disabled={busy}
                  maxLength={100}
                  placeholder="Ví dụ: ARITO có các sản phẩm gì?"
                  onChange={(e) =>
                    setSuggestions((prev) =>
                      prev.map((q, i) => (i === index ? { ...q, text: e.target.value } : q)),
                    )
                  }
                />
                <select
                  value={item.target_folder_id ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    setSuggestions((prev) =>
                      prev.map((q, i) =>
                        i === index ? { ...q, target_folder_id: e.target.value || null } : q,
                      ),
                    )
                  }
                >
                  <option value="">Bot hiện tại</option>
                  {catalogBots
                    .filter((bot) => {
                      if (normalizeBotType(bot.type) === 'embed') return false;
                      const self = (isEdit ? editingId : folderId).trim().toLowerCase();
                      return !self || bot.folder_id.toLowerCase() !== self;
                    })
                    .map((bot) => (
                      <option key={bot.folder_id} value={bot.folder_id}>
                        {bot.title || bot.folder_id}
                        {bot.active === false ? ' (tắt)' : ''}
                      </option>
                    ))}
                </select>
                <label
                  className="chat-bot-suggest-greet"
                  title="Chỉ gửi câu xin chào rồi đổi sang bot đã chọn, không hỏi knowledge."
                >
                  <input
                    type="checkbox"
                    checked={!!item.greet_and_switch}
                    disabled={busy}
                    onChange={(e) =>
                      setSuggestions((prev) =>
                        prev.map((q, i) =>
                          i === index ? { ...q, greet_and_switch: e.target.checked } : q,
                        ),
                      )
                    }
                  />
                  <span>Xin chào và đổi source</span>
                </label>
                <button
                  type="button"
                  className="chat-icon-btn is-danger"
                  title="Xóa câu gợi ý"
                  disabled={busy}
                  onClick={() =>
                    setSuggestions((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            {suggestions.length < MAX_SUGGESTIONS ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setSuggestions((prev) => [...prev, emptySuggestion()])}
              >
                <IconPlus size={14} />
                Thêm câu gợi ý
              </button>
            ) : (
              <p className="muted">Đã đủ {MAX_SUGGESTIONS} câu gợi ý.</p>
            )}
          </div>
        ) : null}

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

      <ChatConfirmDialog
        open={deleteConfirmOpen}
        title="Xóa Chatbots?"
        message={
          title.trim()
            ? `Chatbots "${title.trim()}" sẽ bị gỡ khỏi danh sách công ty. Hội thoại cũ vẫn có thể mở; thao tác này không thể hoàn tác.`
            : 'Chatbots sẽ bị gỡ khỏi danh sách công ty. Hội thoại cũ vẫn có thể mở; thao tác này không thể hoàn tác.'
        }
        confirmLabel="Xóa"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
