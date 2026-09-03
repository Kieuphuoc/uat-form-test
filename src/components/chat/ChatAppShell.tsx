import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { chatApi, type ChatMe } from '../../api/chatApi';
import { zaloApi } from '../../api/zaloApi';
import { useAuth } from '../../auth/AuthContext';
import { navigateChat } from '../../lib/chatNav';
import { setChatBotCacheActor, clearChatBotsCache } from '../../lib/chatBotsCache';
import {
  applyDesktopNotificationMode,
  formatHeaderBadge,
  reloadConversations,
  seedChatUnreadIds,
  seedOaUnreadIds,
  seedZaloUnreadIds,
  setChatActorUserId,
  setChatPlatform,
  setChatShellMode,
  subscribeChatSession,
  subscribeUnreadCounts,
  subscribeZaloInbox,
  watchZaloSource,
  type ChatShellArea,
  type UnreadCounts,
} from '../../lib/chatTransport';
import { resolveZaloAccount } from '../../lib/zaloAccount';
import { IconBell, IconBook, IconChat, IconDatabase, IconLogout, IconSettings, IconTag, IconZalo } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';
import { DataSelectionDialog } from './DataSelectionDialog';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'active' : undefined;
}

const JWT_STORAGE_KEY = 'arito_form_jwt';

function shellArea(key: string | null): ChatShellArea {
  if (key === 'zalo' || key === 'zalo-users') return 'zalo';
  if (key === 'oa') return 'oa';
  if (key === 'chat') return 'chat';
  return 'other';
}

function headerSelectPath(id: string): string | null {
  const key = id.trim().toLowerCase();
  if (key === 'contacts' || key === 'contact' || key === 'danhba') return '/chat/contacts';
  if (key === 'oa' || key === 'zalo-oa' || key === 'zalo-oa-chat') return '/chat/oa';
  if (key === 'zalo' || key === 'zalo-chat' || key === 'zalochat') return '/chat/zalo';
  if (key === 'zalo-users' || key === 'zalousers' || key === 'nhomzalo' || key === 'zalogroups') {
    return '/chat/zalo/users';
  }
  if (key === 'settings' || key === 'caidat' || key === 'cài đặt') return '/chat/settings';
  if (key === 'faq' || key === 'bofaq' || key === 'bộ faq') return '/chat/faq';
  if (key === 'chat' || key === 'list' || key === 'conversations') return '/chat';
  return null;
}

/**
 * Shell kiểu Dash: nền #f5f7fa, header navy #001854, nav Chat / Zalo / OA.
 * Mobile embed: ẩn header web — menu Chat/Danh bạ/Cài đặt nằm trên header native.
 * `hidden-navbar`: ẩn header/title/user, giữ layout desktop.
 */
export function ChatAppShell() {
  const { mobile, hiddenNavbar, user, logout, jwt } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isolatedBox = hiddenNavbar && !mobile;
  const [me, setMe] = useState<ChatMe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataSelectOpen, setDataSelectOpen] = useState(false);
  const [unread, setUnread] = useState<UnreadCounts>({ chat: 0, zalo: 0, oa: 0 });
  const [zaloToast, setZaloToast] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const zaloToastTimer = useRef<number | null>(null);
  const unitIdRef = useRef<number | null>(null);
  const zaloChatEnabled = !!me?.zalo_enabled && me?.can_use_zalo_chat !== false;
  const oaChatEnabled = !!me && me.can_use_oa_chat !== false;
  const faqEnabled = !!me?.can_review_faq || !!me?.can_manage_faq_sets;
  const bellCount = unread.chat + unread.zalo + unread.oa;
  const chatAreaKey = useMemo(() => {
    const path = location.pathname;
    if (!path.startsWith('/chat')) return null;
    if (path.startsWith('/chat/contacts')) return 'contacts';
    if (path.startsWith('/chat/settings')) return 'settings';
    if (path.startsWith('/chat/faq')) return 'faq';
    if (path.startsWith('/chat/zalo/users')) return 'zalo-users';
    if (path.startsWith('/chat/zalo')) return 'zalo';
    if (path.startsWith('/chat/oa')) return 'oa';
    return 'chat';
  }, [location.pathname]);

  const refreshChatMe = useCallback(async () => {
    try {
      const value = await chatApi.me();
      const prevUnitId = unitIdRef.current;
      unitIdRef.current = value.unit_id ?? 0;
      setMe(value);
      setChatActorUserId(value.user_id);
      setChatBotCacheActor(value.user_id, value.unit_id ?? 0);
      void applyDesktopNotificationMode(value.desktop_notification);
      if (prevUnitId != null && prevUnitId !== (value.unit_id ?? 0)) {
        clearChatBotsCache();
        void reloadConversations();
        if (/\/chat\/\d+/.test(location.pathname)) {
          navigateChat(navigate, '/chat', { replace: true });
        }
      }
    } catch {
      /* JWT vẫn dùng được; thiếu snapshot không chặn shell */
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    setChatPlatform(mobile ? 'mobile' : 'web');
  }, [mobile]);

  useEffect(() => {
    setChatShellMode(isolatedBox, shellArea(chatAreaKey));
  }, [isolatedBox, chatAreaKey]);

  useEffect(() => {
    const sub = subscribeChatSession();
    return () => sub.stop();
  }, []);

  useEffect(() => {
    if (isolatedBox) {
      setUnread({ chat: 0, zalo: 0, oa: 0 });
      return;
    }
    const sub = subscribeUnreadCounts(setUnread);
    return () => sub.stop();
  }, [isolatedBox]);

  useEffect(() => {
    if (isolatedBox) return;
    let cancelled = false;
    void chatApi
      .unreadSummary()
      .then((summary) => {
        if (cancelled) return;
        seedChatUnreadIds(summary.chat_ids);
        seedOaUnreadIds(oaChatEnabled ? summary.oa_ids : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isolatedBox, jwt, me?.unit_id, oaChatEnabled]);

  useEffect(() => {
    if (isolatedBox || !zaloChatEnabled) {
      setZaloToast('');
      if (!zaloChatEnabled) seedZaloUnreadIds('', []);
      return;
    }
    let cancelled = false;
    const inboxSub = subscribeZaloInbox((event) => {
      if (!event.notify) return;
      if (window.location.pathname.startsWith('/chat/zalo') || window.location.pathname.startsWith('/chat/oa')) return;
      const text = `${event.conversation_name || event.source_name || 'Zalo'}: ${event.preview || 'Tin nhắn mới'}`;
      setZaloToast(text);
      if (zaloToastTimer.current) window.clearTimeout(zaloToastTimer.current);
      zaloToastTimer.current = window.setTimeout(() => setZaloToast(''), 2400);
    });
    void zaloApi
      .listSources()
      .then(async (response) => {
        const items = response.items ?? [];
        if (cancelled || items.length === 0) return;
        const resolved = resolveZaloAccount(items);
        if (!resolved.accountId || !response.infra_source_id) return;
        watchZaloSource(resolved.accountId);
        const ids = await zaloApi.listUnreadIds(response.infra_source_id, resolved.accountId);
        if (!cancelled) seedZaloUnreadIds(resolved.accountId, ids);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      inboxSub.stop();
      if (zaloToastTimer.current) window.clearTimeout(zaloToastTimer.current);
    };
  }, [isolatedBox, zaloChatEnabled]);

  useEffect(() => {
    if (!chatAreaKey) return;
    void refreshChatMe();
  }, [jwt, chatAreaKey, refreshChatMe]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === JWT_STORAGE_KEY) void refreshChatMe();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshChatMe]);

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
      if (path === '/chat/faq' && !me?.can_review_faq && !me?.can_manage_faq_sets) return;
      if ((path === '/chat/zalo' || path === '/chat/zalo/users') && !zaloChatEnabled) return;
      if (path === '/chat/oa' && !oaChatEnabled) return;
      navigateChat(navigate, path);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [navigate, me?.is_admin, me?.can_review_faq, me?.can_manage_faq_sets, zaloChatEnabled, oaChatEnabled]);

  useEffect(() => {
    if (!me) return;
    if (location.pathname.startsWith('/chat/zalo') && !zaloChatEnabled) {
      navigateChat(navigate, '/chat', { replace: true });
      return;
    }
    if (location.pathname.startsWith('/chat/oa') && !oaChatEnabled) {
      navigateChat(navigate, '/chat', { replace: true });
      return;
    }
    if (location.pathname.startsWith('/chat/faq') && !faqEnabled) {
      navigateChat(navigate, '/chat', { replace: true });
    }
  }, [me, zaloChatEnabled, oaChatEnabled, faqEnabled, location.pathname, navigate]);

  const displayName =
    me?.nickname || user?.nickname || me?.email || user?.email || 'Bạn';
  const avatarId = me?.avatar_id ?? null;
  const companyCode = me?.unit?.unit_code?.trim() || null;
  const companyName =
    me?.unit_id && me.unit_id > 0
      ? me.unit?.unit_name || me.unit?.unit_code || `Công ty #${me.unit_id}`
      : null;
  const companyTitle = me?.unit?.address || companyName || undefined;
  const openDataSelect = isolatedBox ? () => setDataSelectOpen(true) : undefined;

  return (
    <div className={`chat-shell${mobile ? ' chat-shell--mobile' : ''}`} data-chat-theme={me?.chat_theme || 'default'}>
      {!mobile && !hiddenNavbar && (
        <header className="chat-shell-header">
          <Link to="/chat" className="chat-shell-brand" title="Arito Chat">
            <img src="/favicon.ico" alt="" />
            <h1>Arito Chat</h1>
          </Link>

          <nav className="chat-shell-nav" aria-label="Chat">
            <NavLink to="/chat" className={() => navClass({ isActive: chatAreaKey === 'chat' })}>
              <IconChat size={17} />
              <span>Chat</span>
              {unread.chat > 0 && (
                <span className="chat-shell-nav-badge">{formatHeaderBadge(unread.chat)}</span>
              )}
            </NavLink>
            {zaloChatEnabled ? (
              <NavLink to="/chat/zalo" className={() => navClass({ isActive: chatAreaKey === 'zalo' })}>
                <IconZalo size={17} />
                <span>Zalo</span>
                {unread.zalo > 0 && (
                  <span className="chat-shell-nav-badge">{formatHeaderBadge(unread.zalo)}</span>
                )}
              </NavLink>
            ) : null}
            {oaChatEnabled ? (
              <NavLink to="/chat/oa" className={() => navClass({ isActive: chatAreaKey === 'oa' })}>
                <IconZalo size={17} />
                <span>OA</span>
                {unread.oa > 0 && (
                  <span className="chat-shell-nav-badge">{formatHeaderBadge(unread.oa)}</span>
                )}
              </NavLink>
            ) : null}
          </nav>

          <div className="chat-shell-header-right">
            {companyName ? (
              <>
                <div className="chat-shell-company" title={companyTitle}>
                  {companyCode && companyCode !== companyName ? (
                    <span className="chat-shell-company-code">{companyCode}</span>
                  ) : null}
                  <span className="chat-shell-company-name">{companyName}</span>
                </div>
                <span className="chat-shell-header-sep" aria-hidden="true">
                  |
                </span>
              </>
            ) : null}

            <div
              className="chat-shell-bell"
              aria-label={bellCount > 0 ? `${bellCount} hội thoại chưa đọc` : 'Không có tin chưa đọc'}
            >
              <IconBell size={18} />
              {bellCount > 0 && (
                <span className="chat-shell-bell-badge">
                  {formatHeaderBadge(bellCount)}
                </span>
              )}
            </div>

            <span className="chat-shell-header-sep" aria-hidden="true">
              |
            </span>

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
                {faqEnabled ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateChat(navigate, '/chat/faq');
                    }}
                  >
                    <IconBook size={16} />
                    Bộ FAQ
                  </button>
                ) : null}
                {me?.is_admin ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateChat(navigate, '/chat/quick-messages');
                    }}
                  >
                    <IconTag size={16} />
                    Tin nhắn nhanh
                  </button>
                ) : null}
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
          </div>
        </header>
      )}

      <div className="chat-shell-body">
        <Outlet context={{ me, setMe, onOpenDataSelect: openDataSelect }} />
      </div>

      {dataSelectOpen && <DataSelectionDialog onClose={() => setDataSelectOpen(false)} />}
      {zaloChatEnabled && !isolatedBox && zaloToast && !location.pathname.startsWith('/chat/zalo') && !location.pathname.startsWith('/chat/oa') && (
        <div className="zalo-toast">{zaloToast}</div>
      )}
    </div>
  );
}
