import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { chatApi, type ChatMe } from '../../api/chatApi';
import { useAuth } from '../../auth/AuthContext';
import { IconChat, IconUsers } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'active' : undefined;
}

/**
 * Shell kiểu Dash: nền #f5f7fa, header navy #001854, nav Chat / Danh bạ.
 * Mobile embed vẫn hiện nav gọn để truy cập đủ 3 trang.
 */
export function ChatAppShell() {
  const { mobile, user, logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<ChatMe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void chatApi
      .me()
      .then((value) => {
        if (!cancelled) setMe(value);
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

  const displayName =
    me?.nickname || user?.nickname || me?.email || user?.email || 'Bạn';
  const avatarId = me?.avatar_id ?? null;

  return (
    <div className={`chat-shell${mobile ? ' chat-shell--mobile' : ''}`}>
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
            {!mobile && <span className="chat-shell-user-name">{displayName}</span>}
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
                  navigate('/chat/settings');
                }}
              >
                Cài đặt
              </button>
              <button
                type="button"
                role="menuitem"
                className="chat-shell-menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="chat-shell-body">
        <Outlet context={{ me, setMe }} />
      </div>
    </div>
  );
}
