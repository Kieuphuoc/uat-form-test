import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { chatApi, type ChatMe } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { navigateChat } from '../../lib/chatNav';
import {
  applyDesktopNotificationMode,
  setChatActorUserId,
  setChatPlatform,
  subscribeChatSession,
} from '../../lib/chatTransport';
import { IconChat, IconDatabase, IconLogout, IconSettings, IconUsers, IconZalo } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';
import { DataSelectionDialog } from './DataSelectionDialog';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'active' : undefined;
}

function headerSelectPath(id: string): string | null {
  const key = id.trim().toLowerCase();
  if (key === 'contacts' || key === 'contact' || key === 'danhba') return '/chat/contacts';
  if (key === 'zalo' || key === 'zalo-chat' || key === 'zalochat') return '/chat/zalo';
  if (key === 'settings' || key === 'caidat' || key === 'cài đặt') return '/chat/settings';
  if (key === 'chat' || key === 'list' || key === 'conversations') return '/chat';
  return null;
}

/**
 * Shell kiểu Dash: nền #f5f7fa, header navy #001854, nav Chat / Danh bạ / Zalo.
 * Mobile embed: ẩn header web — menu Chat/Danh bạ/Cài đặt nằm trên header native.
 */
export function ChatAppShell() {
  const { mobile, user, logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<ChatMe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataSelectOpen, setDataSelectOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChatPlatform(mobile ? 'mobile' : 'web');
  }, [mobile]);

  useEffect(() => {
    const sub = subscribeChatSession();
    return () => sub.stop();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void chatApi
      .me()
      .then((value) => {
        if (cancelled) return;
        setMe(value);
        setChatActorUserId(value.user_id);
        void applyDesktopNotificationMode(value.desktop_notification);
      })
      .catch(() => {
        /* JWT vẫn dùng được; thiếu snapshot không chặn shell */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      const raw = event.data as { type?: string; id?: unknown } | null;
      if (!raw || typeof raw !== 'object' || raw.type !== 'arito-header-select') return;
      const path = headerSelectPath(typeof raw.id === 'string' ? raw.id : '');
      if (!path) return;
      if (path === '/chat/settings' && !me?.is_admin) return;
      navigateChat(navigate, path);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [navigate, me?.is_admin]);

  const displayName =
    me?.nickname || user?.nickname || me?.email || user?.email || 'Bạn';
  const avatarId = me?.avatar_id ?? null;

  return (
    <div className={`chat-shell${mobile ? ' chat-shell--mobile' : ''}`} data-chat-theme={me?.chat_theme || 'default'}>
      {!mobile && (
        <header className="chat-shell-header">
          <Link to="/chat" className="chat-shell-brand" title="Arito Chat">
            <img src="/favicon.ico" alt="" />
            <h1>Arito Chat</h1>
          </Link>

          <nav className="chat-shell-nav" aria-label="Chat">
            <NavLink to="/chat" end className={navClass}>
              <IconChat size={17} />
              <span>Chat</span>
            </NavLink>
            <NavLink to="/chat/contacts" className={navClass}>
              <IconUsers size={17} />
              <span>Danh bạ</span>
            </NavLink>
            <NavLink to="/chat/zalo" className={navClass}>
              <IconZalo size={17} />
              <span>Zalo</span>
            </NavLink>
          </nav>

          <div className="chat-shell-user" ref={menuRef}>
            <button
              type="button"
              className="chat-shell-user-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <ChatAvatar name={displayName} avatarId={avatarId} size={26} />
              <span className="chat-shell-user-name">{displayName}</span>
            </button>
            {menuOpen && (
              <div className="chat-shell-menu" role="menu">
                <div className="chat-shell-menu-head">
                  <ChatAvatar name={displayName} avatarId={avatarId} size={36} />
                  <div>
                    <strong>{displayName}</strong>
                    {(me?.email || user?.email) && (
                      <span className="muted">{me?.email || user?.email}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDataSelectOpen(true);
                  }}
                >
                  <IconDatabase size={16} />
                  Thay đổi công ty và dữ liệu
                </button>
                {me?.is_admin ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateChat(navigate, '/chat/settings');
                    }}
                  >
                    <IconSettings size={16} />
                    Cài đặt
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="chat-shell-menu-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <IconLogout size={16} />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      <div className="chat-shell-body">
        <Outlet context={{ me, setMe }} />
      </div>

      {dataSelectOpen && <DataSelectionDialog onClose={() => setDataSelectOpen(false)} />}
    </div>
  );
}
