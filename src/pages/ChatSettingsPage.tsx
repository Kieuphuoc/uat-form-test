import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import { notificationApi, type NotificationDevice } from '../api/notificationApi';
import { botAvatarUrl, botTypeLabel, chatApi, isEmbedBot, normalizeBotType, type ChatAppSettings, type ChatMe, type DesktopNotificationMode } from '../api/chatApi';
import { applyDesktopNotificationMode } from '../lib/chatTransport';
import { navigateChat } from '../lib/chatNav';
import { CHAT_THEMES, normalizeChatTheme } from '../lib/chatThemes';
import { IconDatabase, IconInfo, IconZalo } from '../components/AppIcons';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { DataSelectionDialog } from '../components/chat/DataSelectionDialog';

type ShellContext = {
  me: ChatMe | null;
  setMe?: Dispatch<SetStateAction<ChatMe | null>>;
};

const DESKTOP_HELP =
  'Badge trên tab — hiện số tin chưa đọc trên tiêu đề tab.\nThông báo hệ thống — hiện khi tab không focus (cần cấp quyền trình duyệt).\nTắt — không hiện badge hay thông báo desktop.';

const emptySettings = (unitId = 0): ChatAppSettings => ({
  unit_id: unitId,
  exempt_email_domains: '',
  message_recall_minutes: 30,
  file_recall_minutes: 10,
  desktop_notification: 'badge',
  device_push_enabled: true,
  ai_chatbot_enabled: false,
  ai_chatbots: [],
  zalo_enabled: false,
  zalo_accounts: [],
  chat_theme: 'default',
});

function snapshot(settings: ChatAppSettings): string {
  return JSON.stringify({
    unit_id: settings.unit_id,
    exempt_email_domains: settings.exempt_email_domains,
    message_recall_minutes: settings.message_recall_minutes,
    file_recall_minutes: settings.file_recall_minutes,
    desktop_notification: settings.desktop_notification,
    device_push_enabled: settings.device_push_enabled,
    ai_chatbot_enabled: settings.ai_chatbot_enabled,
    ai_chatbots: settings.ai_chatbots ?? [],
    zalo_enabled: !!settings.zalo_enabled,
    zalo_accounts: settings.zalo_accounts ?? [],
    chat_theme: settings.chat_theme,
  });
}

export function ChatSettingsPage() {
  const { me, setMe } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const isAdmin = !!me?.is_admin;
  const unitId = me?.unit_id ?? 0;
  const hasCompany = unitId > 0;
  const companyName =
    me?.unit?.unit_name || me?.unit?.unit_code || (unitId > 0 ? `Công ty #${unitId}` : '');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [draft, setDraft] = useState<ChatAppSettings>(() => emptySettings());
  const [dataSelectOpen, setDataSelectOpen] = useState(false);
  const lastSaved = useRef('');
  const lastSavedSettings = useRef<ChatAppSettings | null>(null);

  const persist = useCallback(
    async (next: ChatAppSettings) => {
      if (!hasCompany) return;
      const key = snapshot(next);
      if (key === lastSaved.current) return;
      const previousKey = lastSaved.current;
      const previous = lastSavedSettings.current;
      lastSaved.current = key;
      setSaving(true);
      setMessage(null);
      setError(null);
      try {
        const saved = await chatApi.saveAdminSettings({ ...next, unit_id: unitId });
        lastSaved.current = snapshot(saved);
        lastSavedSettings.current = saved;
        setDraft(saved);
        const effective = await applyDesktopNotificationMode(saved.desktop_notification);
        setMe?.((prev) =>
          prev
            ? {
                ...prev,
                desktop_notification: saved.desktop_notification,
                ai_chatbot_enabled: saved.ai_chatbot_enabled,
                zalo_enabled: saved.zalo_enabled,
                chat_theme: saved.chat_theme,
              }
            : prev,
        );
        if (saved.desktop_notification === 'chrome' && effective !== 'chrome') {
          setMessage('Đã lưu. Trình duyệt chưa cho phép thông báo — tab này dùng badge.');
        } else {
          setMessage('Đã lưu cài đặt.');
        }
      } catch (e) {
        lastSaved.current = previousKey;
        lastSavedSettings.current = previous;
        if (previous) setDraft(previous);
        setError(e instanceof Error ? e.message : 'Không lưu được cấu hình.');
      } finally {
        setSaving(false);
      }
    },
    [hasCompany, setMe, unitId],
  );

  const loadServerSettings = useCallback(async () => {
    setServerLoading(true);
    setError(null);
    setDraft(emptySettings(unitId));
    try {
      const [settings, registeredDevices] = await Promise.all([
        chatApi.getAdminSettings(),
        notificationApi.listDevices().catch(() => [] as NotificationDevice[]),
      ]);
      if (settings.unit_id > 0 && settings.unit_id !== unitId) {
        setError(
          `Cấu hình trả về công ty #${settings.unit_id} khác công ty đang chọn (#${unitId}). Hãy đổi lại công ty rồi tải lại trang.`,
        );
      }
      lastSaved.current = snapshot(settings);
      lastSavedSettings.current = {
        ...settings,
        ai_chatbots: settings.ai_chatbots ?? [],
        zalo_accounts: settings.zalo_accounts ?? [],
        zalo_enabled: !!settings.zalo_enabled,
      };
      setDraft(lastSavedSettings.current);
      setDevices(registeredDevices);
      await applyDesktopNotificationMode(settings.desktop_notification);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được cài đặt.');
    } finally {
      setServerLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadServerSettings();
  }, [isAdmin, loadServerSettings, unitId]);

  const saveNow = (next: ChatAppSettings) => {
    setDraft(next);
    void persist(next);
  };

  const commitMinutes = (field: 'message_recall_minutes' | 'file_recall_minutes', fallback: number) => {
    const raw = draft[field];
    const valid = Number.isInteger(raw) && raw >= 1 && raw <= 1440;
    if (!valid) {
      const restored = lastSavedSettings.current?.[field] ?? fallback;
      setDraft((prev) => ({ ...prev, [field]: restored }));
      return;
    }
    void persist({ ...draft, [field]: raw });
  };

  const toggleBotActive = (index: number, active: boolean) => {
    const nextBots = draft.ai_chatbots.map((bot, i) => (i === index ? { ...bot, active } : bot));
    saveNow({
      ...draft,
      ai_chatbots: nextBots,
      ai_chatbot_enabled: nextBots.some((bot) => bot.active !== false),
    });
  };

  const toggleZaloActive = (index: number, active: boolean) => {
    const nextAccounts = draft.zalo_accounts.map((item, i) =>
      i === index ? { ...item, active } : item,
    );
    saveNow({
      ...draft,
      zalo_accounts: nextAccounts,
      zalo_enabled: nextAccounts.some((item) => item.active),
    });
  };

  if (!me) {
    return (
      <div className="chat-page-card chat-settings">
        <p className="chat-hint">Đang tải cấu hình…</p>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/chat" replace />;

  const disabled = saving || serverLoading || !hasCompany;

  return (
    <div className="chat-page-card chat-settings">
      <header className="chat-page-card-head">
        <div>
          <h2>Cài đặt</h2>
          <p className="muted">
            {hasCompany ? `Thông báo của: ${companyName}` : '(Chưa chọn công ty)'}
          </p>
        </div>
        <button
          type="button"
          className="chat-icon-btn chat-page-card-head-action"
          title="Thay đổi công ty và dữ liệu"
          onClick={() => setDataSelectOpen(true)}
        >
          <IconDatabase size={18} />
        </button>
      </header>

      {!hasCompany && (
        <p className="chat-hint">Bấm icon bên phải tiêu đề để đổi công ty rồi cấu hình Chat.</p>
      )}

      <section className="chat-settings-section">
        <h3>Thông báo Chat</h3>
        {serverLoading && <p className="chat-hint">Đang tải cấu hình…</p>}
        <label className="chat-settings-field">
          <span className="chat-settings-label-row">
            Thông báo desktop
            <span className="chat-settings-info" tabIndex={0} aria-label="Giải thích thông báo desktop">
              <IconInfo size={16} />
              <span className="chat-settings-info-tip">{DESKTOP_HELP}</span>
            </span>
          </span>
          <select
            value={draft.desktop_notification}
            disabled={disabled}
            onChange={(event) =>
              saveNow({
                ...draft,
                desktop_notification: event.target.value as DesktopNotificationMode,
              })
            }
          >
            <option value="badge">Badge trên tab</option>
            <option value="chrome">Thông báo hệ thống</option>
            <option value="off">Tắt thông báo PC</option>
          </select>
        </label>

        <label className="chat-settings-toggle">
          <input
            type="checkbox"
            checked={draft.device_push_enabled}
            disabled={disabled}
            onChange={(e) => saveNow({ ...draft, device_push_enabled: e.target.checked })}
          />
          <span>
            <strong>Thông báo trên thiết bị</strong>
            <small>Gửi push tới thiết bị đã đăng ký.</small>
          </span>
        </label>

        {draft.device_push_enabled && (
          <div className="chat-settings-devices">
            {!serverLoading && devices.length === 0 && (
              <p className="chat-hint">Chưa có thiết bị nào được đăng ký.</p>
            )}
            {devices.map((device) => (
              <div key={device.id}>
                <span>
                  <strong>{device.platform || 'Thiết bị'}</strong>
                  <small>{device.device_id}</small>
                </span>
                <span
                  className={`chat-device-state${
                    device.enabled === 1 && device.status === 1 ? ' is-active' : ''
                  }`}
                >
                  {device.enabled === 1 && device.status === 1 ? 'Đang nhận' : 'Đã tắt'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="chat-settings-section">
        <h3>Cấu hình quản trị</h3>
        <p className="muted">
          Domain được khai báo sẽ chat không bị giới hạn 3 tin lần đầu. Thời hạn thu hồi tính bằng phút.
        </p>
        <label className="chat-settings-field">
          <span>Domain email không bị chặn</span>
          <textarea
            rows={3}
            value={draft.exempt_email_domains}
            disabled={disabled}
            placeholder="arito.vn; arito.net"
            onChange={(e) => setDraft({ ...draft, exempt_email_domains: e.target.value })}
            onBlur={() => void persist({ ...draft, exempt_email_domains: draft.exempt_email_domains })}
          />
        </label>
        <div className="chat-settings-admin-grid">
          <label className="chat-settings-field">
            <span>Thu hồi tin nhắn (phút)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={Number.isFinite(draft.message_recall_minutes) ? draft.message_recall_minutes : ''}
              disabled={disabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  message_recall_minutes: e.target.value === '' ? Number.NaN : Number(e.target.value),
                })
              }
              onBlur={() => commitMinutes('message_recall_minutes', 30)}
            />
          </label>
          <label className="chat-settings-field">
            <span>Thu hồi file (phút)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={Number.isFinite(draft.file_recall_minutes) ? draft.file_recall_minutes : ''}
              disabled={disabled}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  file_recall_minutes: e.target.value === '' ? Number.NaN : Number(e.target.value),
                })
              }
              onBlur={() => commitMinutes('file_recall_minutes', 10)}
            />
          </label>
        </div>
      </section>

      <section className="chat-settings-section">
        <h3>AI Chatbot</h3>
        <p className="muted">
          Bấm bot để sửa tên, link, mô tả. Chỉ checkbox mới bật/tắt. Bot tắt ẩn khỏi Danh bạ; hội
          thoại cũ vẫn mở được. AI RAG / Files / FAQ hỏi qua FolderId trên File.Api. AI nhúng chỉ
          iframe, không lưu tin.
        </p>

        {draft.ai_chatbots.length === 0 && (
          <p className="chat-hint">Chưa có chatbot. Bấm Thêm chatbot để khai báo RAG, Files, FAQ hoặc AI nhúng.</p>
        )}

        <div className="chat-bot-list">
          {draft.ai_chatbots.map((bot, index) => {
            const active = bot.active !== false;
            const embed = isEmbedBot(bot);
            const id = bot.folder_id || String(index);
            return (
              <div key={id} className="chat-bot-row">
                <button
                  type="button"
                  className="chat-bot-row-main"
                  disabled={disabled}
                  onClick={() => navigateChat(navigate, `/chat/settings/bots/${encodeURIComponent(id)}`)}
                  title="Sửa chatbot"
                >
                  <ChatAvatar
                    name={bot.title || 'AI'}
                    imageSrc={botAvatarUrl(bot.avatar_url)}
                    size={36}
                  />
                  <span className="chat-bot-row-meta">
                    <strong>
                      {bot.title || bot.folder_id || 'Chatbot'}
                      <span className={`chat-bot-type-tag chat-bot-type-tag--${normalizeBotType(bot.type)}`}>
                        {botTypeLabel(bot)}
                      </span>
                    </strong>
                    <small>
                      {embed
                        ? bot.embed_url || bot.description || 'Chưa có link'
                        : bot.description || bot.folder_id}
                    </small>
                  </span>
                </button>
                <label className="chat-bot-row-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={disabled}
                    onChange={(e) => toggleBotActive(index, e.target.checked)}
                    aria-label={active ? 'Đang bật' : 'Đã tắt'}
                  />
                  <span>{active ? 'Bật' : 'Tắt'}</span>
                </label>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => navigateChat(navigate, '/chat/settings/bots/new')}
        >
          Thêm chatbot
        </button>
      </section>

      <section className="chat-settings-section">
        <h3>Tài khoản Zalo</h3>
        <p className="muted">
          Danh sách lấy từ Zalo Admin API (/api/accounts). Bật theo từng công ty thì hiện trang Zalo trên header.
          Công ty chưa khai báo mặc định tắt.
        </p>

        {draft.zalo_accounts.length === 0 && (
          <p className="chat-hint">Chưa có tài khoản Zalo trên Node hoặc không kết nối được Zalo Admin API.</p>
        )}

        <div className="chat-bot-list">
          {draft.zalo_accounts.map((account, index) => {
            const active = !!account.active;
            return (
              <div key={account.id} className="chat-bot-row">
                <div className="chat-bot-row-main chat-bot-row-main--static">
                  <span className="chat-zalo-account-icon" aria-hidden>
                    <IconZalo size={20} />
                  </span>
                  <span className="chat-bot-row-meta">
                    <strong>{account.name || account.id}</strong>
                    <small>{account.id}</small>
                  </span>
                </div>
                <label className="chat-bot-row-check">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={disabled}
                    onChange={(e) => toggleZaloActive(index, e.target.checked)}
                    aria-label={active ? 'Đang bật' : 'Đã tắt'}
                  />
                  <span>{active ? 'Bật' : 'Tắt'}</span>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="chat-settings-section">
        <h3>Giao diện tin nhắn</h3>
        <p className="muted">
          Áp dụng cho cả công ty: màu tin của bạn, tin người khác, nền khung chat.
        </p>
        <div className="chat-theme-grid">
          {CHAT_THEMES.map((theme) => {
            const selected = normalizeChatTheme(draft.chat_theme) === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`chat-theme-card${selected ? ' is-selected' : ''}`}
                disabled={disabled}
                onClick={() => saveNow({ ...draft, chat_theme: theme.id })}
              >
                <span className="chat-theme-preview" style={{ background: theme.threadBg }}>
                  <span style={{ background: theme.theirsBg, color: theme.theirsFg }}>Xin chào</span>
                  <span style={{ background: theme.mineBg, color: theme.mineFg }}>Ok nhé</span>
                </span>
                <strong>{theme.name}</strong>
                <small>{theme.hint}</small>
              </button>
            );
          })}
        </div>
      </section>

      {error && <div className="chat-error">{error}</div>}
      {message && <div className="chat-hint">{message}</div>}
      {dataSelectOpen && <DataSelectionDialog onClose={() => setDataSelectOpen(false)} />}
    </div>
  );
}
