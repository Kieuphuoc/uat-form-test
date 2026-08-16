import { useCallback, useEffect, useState } from 'react';
import {
  notificationApi,
  type NotificationDevice,
  type NotificationPreference,
} from '../api/notificationApi';
import { chatApi, type ChatAppSettings, type ChatMe } from '../api/chatApi';
import {
  getDesktopNotificationMode,
  setDesktopNotificationMode,
  type DesktopNotificationMode,
} from '../lib/chatTransport';
import { useAuth } from '../auth/AuthContext';
import { useOutletContext } from 'react-router-dom';

type ShellContext = { me: ChatMe | null };

export function ChatSettingsPage() {
  const { mobile } = useAuth();
  const { me } = useOutletContext<ShellContext>();
  const isAdmin = !!me?.is_admin;
  const [mode, setMode] = useState<DesktopNotificationMode>(getDesktopNotificationMode);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preference, setPreference] = useState<NotificationPreference | null>(null);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [serverLoading, setServerLoading] = useState(true);
  const [adminSettings, setAdminSettings] = useState<ChatAppSettings | null>(null);
  const [adminDraft, setAdminDraft] = useState<ChatAppSettings>({
    exempt_email_domains: '',
    message_recall_minutes: 30,
    file_recall_minutes: 10,
  });

  const loadServerSettings = useCallback(async () => {
    setServerLoading(true);
    setError(null);
    try {
      const [chatPreference, registeredDevices] = await Promise.all([
        notificationApi.getChatPreference(),
        notificationApi.listDevices(),
      ]);
      setPreference(chatPreference);
      setDevices(registeredDevices);
      if (isAdmin) {
        const settings = await chatApi.getAdminSettings();
        setAdminSettings(settings);
        setAdminDraft(settings);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được cài đặt.');
    } finally {
      setServerLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadServerSettings();
  }, [loadServerSettings]);

  const onChange = async (value: DesktopNotificationMode) => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const resolved = await setDesktopNotificationMode(value);
      setMode(resolved);
      if (value === 'chrome' && resolved !== 'chrome') {
        setMessage('Trình duyệt chưa cho phép thông báo — đã giữ Badge trên tab.');
      } else {
        setMessage('Đã lưu cài đặt.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveServerPreference = async (
    patch: Partial<Pick<NotificationPreference, 'in_app' | 'firebase'>>,
  ) => {
    if (!preference || preference.user_can_toggle !== 1) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await notificationApi.setChatPreference({
        in_app: (patch.in_app ?? preference.in_app) === 1,
        mail: preference.mail === 1,
        firebase: (patch.firebase ?? preference.firebase) === 1,
      });
      // Response PUT chỉ trả các channel, không trả user_can_toggle/name; giữ metadata
      // hiện tại để checkbox không bị khóa sau lần thay đổi đầu tiên.
      setPreference({
        ...preference,
        ...saved,
        user_can_toggle: preference.user_can_toggle,
        name: preference.name,
      });
      setMessage('Đã lưu cấu hình thông báo Chat.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  const resetServerPreference = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await notificationApi.resetChatPreference();
      await loadServerSettings();
      setMessage('Đã khôi phục cấu hình mặc định.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không khôi phục được cấu hình.');
      setSaving(false);
    }
  };

  const saveAdminSettings = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await chatApi.saveAdminSettings(adminDraft);
      setAdminSettings(saved);
      setAdminDraft(saved);
      setMessage('Đã lưu cấu hình quản trị.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được cấu hình quản trị.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="chat-page-card chat-settings">
      <header className="chat-page-card-head">
        <div>
          <h2>Cài đặt</h2>
          <p className="muted">Thông báo Chat trên trình duyệt và thiết bị của bạn.</p>
        </div>
      </header>

      {mobile ? (
        <p className="chat-hint">
          Trên app mobile, thông báo đẩy dùng FCM theo tùy chọn của thiết bị. Cài đặt bên dưới chỉ
          áp dụng khi mở Chat trên trình duyệt.
        </p>
      ) : null}

      <section className="chat-settings-section">
        <h3>Hiển thị trên trình duyệt</h3>
        <p className="muted">Lưu trên trình duyệt hiện tại.</p>
        <label className="chat-settings-field">
          <span>Thông báo desktop</span>
          <select
            value={mode}
            disabled={saving}
            onChange={(event) => void onChange(event.target.value as DesktopNotificationMode)}
          >
            <option value="badge">Badge trên tab</option>
            <option value="chrome">Thông báo hệ thống</option>
            <option value="off">Tắt thông báo PC</option>
          </select>
        </label>

        <ul className="chat-settings-help">
          <li>
            <strong>Badge trên tab</strong> — hiện số tin chưa đọc trên tiêu đề tab.
          </li>
          <li>
            <strong>Thông báo hệ thống</strong> — hiện khi tab không focus (cần cấp quyền trình
            duyệt).
          </li>
          <li>
            <strong>Tắt</strong> — không hiện badge hay thông báo desktop.
          </li>
        </ul>
      </section>

      <section className="chat-settings-section">
        <div className="chat-settings-section-head">
          <div>
            <h3>Thông báo Chat</h3>
            <p className="muted">Chọn kênh nhận thông báo tin nhắn mới.</p>
          </div>
          {preference?.has_override === 1 && (
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => void resetServerPreference()}
            >
              Dùng mặc định
            </button>
          )}
        </div>

        {serverLoading && <p className="chat-hint">Đang tải cấu hình…</p>}
        {!serverLoading && !preference && !error && (
          <p className="chat-hint">Chưa có cấu hình thông báo Chat.</p>
        )}
        {preference && (
          <div className="chat-settings-toggles">
            <label>
              <input
                type="checkbox"
                checked={preference.in_app === 1}
                disabled={saving || preference.user_can_toggle !== 1}
                onChange={(e) => void saveServerPreference({ in_app: e.target.checked ? 1 : 0 })}
              />
              <span>
                <strong>Hộp thư</strong>
                <small>Lưu thông báo Chat trong hộp thư của bạn.</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={preference.firebase === 1}
                disabled={saving || preference.user_can_toggle !== 1}
                onChange={(e) =>
                  void saveServerPreference({ firebase: e.target.checked ? 1 : 0 })
                }
              />
              <span>
                <strong>Push mobile</strong>
                <small>Gửi push tới thiết bị đã đăng ký.</small>
              </span>
            </label>
          </div>
        )}
      </section>

      <section className="chat-settings-section">
        <h3>Thiết bị</h3>
        <p className="muted">Thiết bị mobile đã đăng ký nhận push.</p>
        {!serverLoading && devices.length === 0 && (
          <p className="chat-hint">Chưa có thiết bị nào được đăng ký.</p>
        )}
        <div className="chat-settings-devices">
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
      </section>

      {isAdmin && (
        <section className="chat-settings-section">
          <h3>Cấu hình quản trị</h3>
          <p className="muted">
            Domain được khai báo sẽ chat không bị giới hạn 3 tin lần đầu. Thời hạn thu hồi tính bằng
            phút.
          </p>
          <label className="chat-settings-field">
            <span>Domain email không bị chặn</span>
            <textarea
              rows={3}
              value={adminDraft.exempt_email_domains}
              disabled={saving || serverLoading}
              placeholder="arito.vn; arito.net"
              onChange={(e) =>
                setAdminDraft((prev) => ({ ...prev, exempt_email_domains: e.target.value }))
              }
            />
          </label>
          <div className="chat-settings-admin-grid">
            <label className="chat-settings-field">
              <span>Thu hồi tin nhắn (phút)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={adminDraft.message_recall_minutes}
                disabled={saving || serverLoading}
                onChange={(e) =>
                  setAdminDraft((prev) => ({
                    ...prev,
                    message_recall_minutes: Number(e.target.value) || 30,
                  }))
                }
              />
            </label>
            <label className="chat-settings-field">
              <span>Thu hồi file (phút)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={adminDraft.file_recall_minutes}
                disabled={saving || serverLoading}
                onChange={(e) =>
                  setAdminDraft((prev) => ({
                    ...prev,
                    file_recall_minutes: Number(e.target.value) || 10,
                  }))
                }
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" disabled={saving || serverLoading} onClick={() => void saveAdminSettings()}>
              Lưu cấu hình
            </button>
            {adminSettings && (
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => setAdminDraft(adminSettings)}
              >
                Hoàn tác
              </button>
            )}
          </div>
        </section>
      )}

      {error && <div className="chat-error">{error}</div>}
      {message && <div className="chat-hint">{message}</div>}
    </div>
  );
}
