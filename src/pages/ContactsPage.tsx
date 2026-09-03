import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  activeChatPermissionItems,
  botAvatarUrl,
  botTypeLabel,
  chatApi,
  type ChatBotCatalogItem,
  type ChatMe,
  type ChatUser,
  type ContactItem,
  type Conversation,
  type FaqWorkbenchItem,
  type UnitChatPermissions,
  type UnitChatPermissionWrite,
} from '../api/chatApi';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { IconBlock, IconChat, IconClose, IconSettings, IconShield, IconUsersAdd } from '../components/AppIcons';
import { navigateChat } from '../lib/chatNav';
import { loadChatBots } from '../lib/chatBotsCache';
import { subscribeContacts } from '../lib/chatTransport';

type ShellContext = { me: ChatMe | null };

type Tab = 'company' | 'personal' | 'bots' | 'faq';

function relationLabel(item: ContactItem): string {
  if (item.is_blocked || item.relation === 'blocked') return 'Đã chặn';
  if (item.relation === 'pending_in') return 'Chờ bạn chấp nhận';
  if (item.relation === 'pending_out') return 'Đang chờ chấp nhận';
  if (item.relation === 'accepted') return 'Đã kết nối';
  return item.relation;
}

function permissionWrite(perms: UnitChatPermissions): UnitChatPermissionWrite {
  return {
    can_use_ai_chat: activeChatPermissionItems(perms.permission_items.ai_bots).some((item) => item.enabled),
    can_use_zalo_chat: perms.permission_items.zalo_accounts.some((item) => item.enabled),
    can_use_oa_chat: perms.can_use_oa_chat,
    permission_items: perms.permission_items,
  };
}

function togglePermissionItem(
  perms: UnitChatPermissions,
  group: 'ai_bots' | 'zalo_accounts',
  id: string,
  enabled: boolean,
): UnitChatPermissions {
  const permissionItems = {
    ai_bots: perms.permission_items.ai_bots.map((item) =>
      item.id === id && group === 'ai_bots' ? { ...item, enabled } : item,
    ),
    zalo_accounts: perms.permission_items.zalo_accounts.map((item) =>
      item.id === id && group === 'zalo_accounts' ? { ...item, enabled } : item,
    ),
  };
  return {
    ...perms,
    permission_items: permissionItems,
    can_use_ai_chat: activeChatPermissionItems(permissionItems.ai_bots).some((item) => item.enabled),
    can_use_zalo_chat: permissionItems.zalo_accounts.some((item) => item.enabled),
  };
}

export function ContactsPage() {
  const { me } = useOutletContext<ShellContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const unitId = me?.unit_id ?? 0;
  const companyName =
    me?.unit?.unit_name || me?.unit?.unit_code || (unitId > 0 ? `Công ty #${unitId}` : null);
  const showBots = !!me?.ai_chatbot_enabled && me?.can_use_ai_chat !== false;
  const canManagePermissions = !!me?.can_manage_chat_permissions;
  const requested = (params.get('tab') as Tab | null) ?? null;
  const tab: Tab =
    requested === 'bots' && showBots
      ? 'bots'
      : requested === 'faq' && unitId > 0
        ? 'faq'
        : requested === 'company' && unitId > 0
          ? 'company'
          : requested === 'personal'
            ? 'personal'
            : unitId > 0
              ? 'company'
              : 'personal';

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyItems, setCompanyItems] = useState<ChatUser[]>([]);
  const [personalItems, setPersonalItems] = useState<ContactItem[]>([]);
  const [botItems, setBotItems] = useState<ChatBotCatalogItem[]>([]);
  const [faqItems, setFaqItems] = useState<FaqWorkbenchItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busyFolderId, setBusyFolderId] = useState<string | null>(null);
  const [addToGroupUser, setAddToGroupUser] = useState<ChatUser | ContactItem | null>(null);
  const [groups, setGroups] = useState<Conversation[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [permUser, setPermUser] = useState<ChatUser | null>(null);
  const [permDraft, setPermDraft] = useState<UnitChatPermissions | null>(null);
  const [permBusy, setPermBusy] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const visibleAiBots = activeChatPermissionItems(permDraft?.permission_items.ai_bots);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  useEffect(() => {
    if (unitId <= 0 && params.get('tab') === 'company') {
      setParams({ tab: 'personal' }, { replace: true });
    }
    if (!showBots && params.get('tab') === 'bots') {
      setParams({ tab: unitId > 0 ? 'company' : 'personal' }, { replace: true });
    }
  }, [unitId, showBots, params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'company') {
        const result = await chatApi.companyDirectory(search, page, pageSize);
        setCompanyItems(result.items);
        setTotal(result.total_record);
      } else if (tab === 'bots') {
        const items = await loadChatBots();
        const q = search.toLowerCase();
        const filtered = items.filter((bot) => {
          if (!q) return true;
          return (
            bot.title.toLowerCase().includes(q) ||
            (bot.description ?? '').toLowerCase().includes(q) ||
            bot.folder_id.toLowerCase().includes(q) ||
            (bot.embed_url ?? '').toLowerCase().includes(q)
          );
        });
        setBotItems(filtered);
        setTotal(filtered.length);
      } else if (tab === 'faq') {
        const items = await chatApi.listFaqWorkbench();
        const q = search.toLowerCase();
        const filtered = items.filter((item) => {
          if (!q) return true;
          return (
            item.title.toLowerCase().includes(q) ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q)
          );
        });
        setFaqItems(filtered);
        setTotal(filtered.length);
      } else {
        const result = await chatApi.listContacts(search, page, pageSize, 'all');
        setPersonalItems(result.items);
        setTotal(result.total_record);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh bạ.');
    } finally {
      setLoading(false);
    }
  }, [tab, search, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const sub = subscribeContacts(() => {
      void load();
    });
    return () => sub.stop();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setTab = (next: Tab) => {
    setParams({ tab: next });
  };

  const openBot = async (folderId: string) => {
    setBusyFolderId(folderId);
    setError(null);
    try {
      const conversation = await chatApi.openBot(folderId);
      navigateChat(navigate, `/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được Chatbots.');
    } finally {
      setBusyFolderId(null);
    }
  };

  const openChat = async (userId: number, lookup?: string) => {
    setBusyId(userId);
    setError(null);
    try {
      const conversation = await chatApi.createDirect(userId, lookup);
      navigateChat(navigate, `/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được chat.');
    } finally {
      setBusyId(null);
    }
  };

  const openAddToGroup = async (user: ChatUser | ContactItem) => {
    setAddToGroupUser(user);
    setNewGroupTitle('');
    setError(null);
    try {
      const items = await chatApi.listConversations('', 1, 100);
      setGroups(items.items.filter((c) => c.kind === 'group'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách nhóm.');
    }
  };

  const addToExistingGroup = async (groupId: number) => {
    if (!addToGroupUser) return;
    setGroupBusy(true);
    setError(null);
    try {
      await chatApi.addMembers(groupId, [addToGroupUser.user_id]);
      setAddToGroupUser(null);
      navigateChat(navigate, `/chat/${groupId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thêm được vào nhóm.');
    } finally {
      setGroupBusy(false);
    }
  };

  const createGroupWithUser = async () => {
    if (!addToGroupUser) return;
    const title = newGroupTitle.trim() || `Nhóm với ${addToGroupUser.nickname || addToGroupUser.email || addToGroupUser.user_id}`;
    setGroupBusy(true);
    setError(null);
    try {
      const conversation = await chatApi.createGroup(title, [addToGroupUser.user_id]);
      setAddToGroupUser(null);
      navigateChat(navigate, `/chat/${conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được nhóm.');
    } finally {
      setGroupBusy(false);
    }
  };

  const runContactAction = async (
    peerUserId: number,
    action: 'accept' | 'block' | 'unblock',
  ) => {
    setBusyId(peerUserId);
    setError(null);
    try {
      if (action === 'accept') await chatApi.acceptContact(peerUserId);
      else if (action === 'block') await chatApi.blockContact(peerUserId);
      else await chatApi.unblockContact(peerUserId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được.');
    } finally {
      setBusyId(null);
    }
  };

  const openPermissions = async (user: ChatUser) => {
    setPermUser(user);
    setPermDraft(null);
    setPermError(null);
    setPermBusy(true);
    try {
      setPermDraft(await chatApi.getUnitChatPermissions(user.user_id));
    } catch (e) {
      setPermError(e instanceof Error ? e.message : 'Không tải được quyền.');
    } finally {
      setPermBusy(false);
    }
  };

  const savePermissions = async () => {
    if (!permUser || !permDraft) return;
    setPermBusy(true);
    setPermError(null);
    try {
      const saved = await chatApi.saveUnitChatPermissions(permUser.user_id, permissionWrite(permDraft));
      setPermDraft(saved);
      setPermUser(null);
    } catch (e) {
      setPermError(e instanceof Error ? e.message : 'Không lưu được quyền.');
    } finally {
      setPermBusy(false);
    }
  };

  const resetPermissions = async () => {
    if (!permUser) return;
    setPermBusy(true);
    setPermError(null);
    try {
      setPermDraft(await chatApi.resetUnitChatPermissions(permUser.user_id));
    } catch (e) {
      setPermError(e instanceof Error ? e.message : 'Không xóa được quyền riêng.');
    } finally {
      setPermBusy(false);
    }
  };

  const placeholder = useMemo(
    () =>
      tab === 'company'
        ? 'Tìm theo tên, email, điện thoại…'
        : tab === 'bots'
          ? 'Tìm Chatbots…'
          : tab === 'faq'
            ? 'Tìm bộ FAQ…'
            : 'Tìm trong danh bạ của bạn…',
    [tab],
  );

  const renderActionButtons = (
    user: ChatUser | ContactItem,
    showChat: boolean,
    showPermissions = false,
  ) => (
    <div className="chat-contact-actions">
      {showChat && (
        <button
          type="button"
          className="chat-icon-btn"
          disabled={busyId === user.user_id}
          onClick={() => void openChat(user.user_id)}
          title="Chat"
        >
          <IconChat size={18} />
        </button>
      )}
      {showPermissions && canManagePermissions && (
        <button
          type="button"
          className="chat-icon-btn"
          disabled={permBusy || !!user.is_admin_unit}
          onClick={() => void openPermissions(user)}
          title={
            user.is_admin_unit
              ? 'Quản trị viên công ty dùng quyền mặc định công ty'
              : 'Phân quyền Chatbots'
          }
        >
          <IconShield size={18} />
        </button>
      )}
      <button
        type="button"
        className="chat-icon-btn"
        disabled={busyId === user.user_id || groupBusy}
        onClick={() => void openAddToGroup(user)}
        title="Thêm vào nhóm"
      >
        <IconUsersAdd size={18} />
      </button>
    </div>
  );

  return (
    <div className="chat-page-card">
      <header className="chat-page-card-head">
        <div>
          <h2>Danh bạ</h2>
          <p className="muted">
            {tab === 'company'
              ? companyName || 'Danh bạ công ty'
              : tab === 'bots'
                ? 'Chatbots AI của công ty'
                : 'Liên hệ đã kết nối, yêu cầu chờ duyệt và đã chặn.'}
          </p>
        </div>
        {me?.is_admin ? (
          <button
            type="button"
            className="chat-icon-btn chat-page-card-head-action"
            title="Cài đặt"
            onClick={() => navigateChat(navigate, '/chat/settings')}
          >
            <IconSettings size={18} />
          </button>
        ) : null}
      </header>

      <div className="chat-tabs" role="tablist">
        {unitId > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'company'}
            className={tab === 'company' ? 'active' : undefined}
            onClick={() => setTab('company')}
          >
            Danh bạ công ty
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'personal'}
          className={tab === 'personal' ? 'active' : undefined}
          onClick={() => setTab('personal')}
        >
          Danh bạ của bạn
        </button>
        {showBots && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bots'}
            className={tab === 'bots' ? 'active' : undefined}
            onClick={() => setTab('bots')}
          >
            AI Chatbots
          </button>
        )}
        {unitId > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'faq'}
            className={tab === 'faq' ? 'active' : undefined}
            onClick={() => setTab('faq')}
          >
            Bộ FAQ
          </button>
        )}
      </div>

      <div className="chat-page-toolbar chat-page-toolbar--contacts">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label="Tìm danh bạ"
        />
        <span className="chat-contacts-total">Tổng: {total}</span>
      </div>

      {error && <div className="chat-error">{error}</div>}

      <div className="chat-contacts-list">
        {loading && <p className="chat-hint">Đang tải…</p>}
        {!loading && tab === 'company' && companyItems.length === 0 && (
          <p className="chat-hint">Không có kết quả.</p>
        )}
        {!loading && tab === 'personal' && personalItems.length === 0 && (
          <p className="chat-hint">Chưa có liên hệ trong danh bạ của bạn.</p>
        )}
        {!loading && tab === 'bots' && botItems.length === 0 && (
          <p className="chat-hint">Chưa có Chatbots nào được khai báo.</p>
        )}
        {!loading && tab === 'faq' && faqItems.length === 0 && (
          <p className="chat-hint">Chưa có bộ FAQ cho công ty này.</p>
        )}

        {tab === 'company' &&
          companyItems.map((u) => (
            <div key={u.user_id} className="chat-contact-row">
              <ChatAvatar name={u.nickname || u.email} avatarId={u.avatar_id} size={40} />
              <div className="chat-contact-main">
                <strong className="chat-contact-name">
                  {u.nickname || u.email || u.username || `Người dùng ${u.user_id}`}
                  {u.is_admin_unit ? (
                    <span className="chat-admin-unit-badge" title="Quản trị viên công ty">
                      <IconShield size={14} />
                    </span>
                  ) : null}
                </strong>
                <span className="muted">
                  {[u.email, u.phone].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              {renderActionButtons(u, true, true)}
            </div>
          ))}

        {tab === 'personal' &&
          personalItems.map((item) => (
            <div key={`${item.relation}-${item.user_id}`} className="chat-contact-row">
              <ChatAvatar
                name={item.nickname || item.email}
                avatarId={item.avatar_id}
                size={40}
              />
              <div className="chat-contact-main">
                <strong>
                  {item.nickname || item.email || item.username || `Người dùng ${item.user_id}`}
                </strong>
                <span className="muted">
                  {[item.email, item.phone].filter(Boolean).join(' · ') || '—'}
                </span>
                <span className={`chat-contact-badge chat-contact-badge--${item.relation}`}>
                  {relationLabel(item)}
                </span>
              </div>
              <div className="chat-contact-actions">
                {item.relation === 'pending_in' && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === item.user_id}
                      onClick={() => void runContactAction(item.user_id, 'accept')}
                    >
                      Chấp nhận
                    </button>
                    <button
                      type="button"
                      className="chat-icon-btn is-danger"
                      title="Chặn"
                      disabled={busyId === item.user_id}
                      onClick={() => void runContactAction(item.user_id, 'block')}
                    >
                      <IconBlock size={18} />
                    </button>
                  </>
                )}
                {(item.relation === 'accepted' || item.relation === 'pending_out') && (
                  <>
                    {renderActionButtons(item, true)}
                    <button
                      type="button"
                      className="chat-icon-btn is-danger"
                      title="Chặn"
                      disabled={busyId === item.user_id}
                      onClick={() => void runContactAction(item.user_id, 'block')}
                    >
                      <IconBlock size={18} />
                    </button>
                  </>
                )}
                {(item.is_blocked || item.relation === 'blocked') && (
                  <button
                    type="button"
                    className="chat-icon-btn"
                    title="Bỏ chặn"
                    disabled={busyId === item.user_id}
                    onClick={() => void runContactAction(item.user_id, 'unblock')}
                  >
                    <IconBlock size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}

        {tab === 'faq' &&
          faqItems.map((item) => (
            <div key={item.workbench_id} className="chat-contact-row">
              <ChatAvatar name={item.title} size={40} />
              <div className="chat-contact-main">
                <strong>{item.title}</strong>
                <span className="muted">
                  {item.role === 'build' ? 'Dựng FAQ' : 'Hỏi FAQ'} · {item.name}
                </span>
              </div>
              <div className="chat-contact-actions">
                <button
                  type="button"
                  className="chat-icon-btn"
                  disabled={busyFolderId === item.workbench_id}
                  onClick={() => void openBot(item.workbench_id)}
                  title="Chat"
                >
                  <IconChat size={18} />
                </button>
              </div>
            </div>
          ))}

        {tab === 'bots' &&
          botItems.map((bot) => (
            <div key={bot.folder_id} className="chat-contact-row">
              <ChatAvatar name={bot.title} size={40} imageSrc={botAvatarUrl(bot.avatar_url)} />
              <div className="chat-contact-main">
                <strong>{bot.title}</strong>
                <span className="muted">{botTypeLabel(bot)}</span>
              </div>
              <div className="chat-contact-actions">
                <button
                  type="button"
                  className="chat-icon-btn"
                  disabled={busyFolderId === bot.folder_id}
                  onClick={() => void openBot(bot.folder_id)}
                  title="Chat"
                >
                  <IconChat size={18} />
                </button>
              </div>
            </div>
          ))}
      </div>

      {tab !== 'bots' && tab !== 'faq' && totalPages > 1 && (
        <div className="chat-modal-pagination">
          <button
            type="button"
            className="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </button>
          <span>
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </button>
        </div>
      )}

      {addToGroupUser && (
        <div className="chat-modal-backdrop" role="presentation" onClick={() => setAddToGroupUser(null)}>
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Thêm vào nhóm"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="chat-modal-head">
              <strong>
                Thêm {addToGroupUser.nickname || addToGroupUser.email || addToGroupUser.user_id} vào
                nhóm
              </strong>
              <button type="button" className="chat-icon-btn" onClick={() => setAddToGroupUser(null)}>
                <IconClose size={18} />
              </button>
            </header>
            <div className="chat-modal-body">
              <p className="muted">Chọn nhóm của bạn hoặc tạo nhóm mới.</p>
              <div className="chat-group-pick-list">
                {groups.length === 0 && <p className="chat-hint">Bạn chưa có nhóm nào.</p>}
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="chat-group-pick-item"
                    disabled={groupBusy}
                    onClick={() => void addToExistingGroup(g.id)}
                  >
                    <strong>{g.title}</strong>
                    <span className="muted">{g.member_count} thành viên</span>
                  </button>
                ))}
              </div>
              <div className="chat-settings-field">
                <span>Tạo nhóm mới</span>
                <input
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                  placeholder="Tên nhóm"
                />
              </div>
              <button type="button" disabled={groupBusy} onClick={() => void createGroupWithUser()}>
                Tạo nhóm và thêm
              </button>
            </div>
          </div>
        </div>
      )}
      {permUser && (
        <div className="chat-modal-backdrop" role="presentation" onClick={() => !permBusy && setPermUser(null)}>
          <div
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Phân quyền Chatbots"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="chat-modal-head">
              <strong>
                Quyền Chatbots — {permUser.nickname || permUser.email || permUser.user_id}
              </strong>
              <button
                type="button"
                className="chat-icon-btn"
                disabled={permBusy}
                onClick={() => setPermUser(null)}
              >
                <IconClose size={18} />
              </button>
            </header>
            <div className="chat-modal-body">
              {permBusy && !permDraft && <p className="chat-hint">Đang tải quyền…</p>}
              {permError && <div className="chat-error">{permError}</div>}
              {permDraft && (
                <>
                  <p className="muted">
                    {permDraft.source === 'user'
                      ? 'Đang dùng quyền riêng của người dùng.'
                      : permDraft.source === 'default'
                        ? 'Đang theo mặc định công ty — lưu sẽ tạo quyền riêng.'
                        : 'Chưa khai báo — đang bật hết. Lưu sẽ tạo quyền riêng.'}
                  </p>
                  <div className="chat-permission-list">
                    <strong>AI Chatbots</strong>
                    {visibleAiBots.length === 0 && (
                      <p className="chat-hint">
                        {permDraft.permission_items.ai_bots.length === 0
                          ? 'Chưa có AI Chatbots trong cấu hình công ty.'
                          : 'Không có AI Chatbots đang bật.'}
                      </p>
                    )}
                    {visibleAiBots.map((item) => (
                      <label key={item.id} className="chat-settings-toggle">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          disabled={permBusy}
                          onChange={(e) =>
                            setPermDraft(
                              togglePermissionItem(permDraft, 'ai_bots', item.id, e.target.checked),
                            )
                          }
                        />
                        <span>
                          <strong>{item.name || item.id}</strong>
                          <small>{item.id}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="chat-permission-list">
                    <strong>Tài khoản Zalo</strong>
                    {permDraft.permission_items.zalo_accounts.length === 0 && (
                      <p className="chat-hint">Chưa có tài khoản Zalo trong cấu hình công ty.</p>
                    )}
                    {permDraft.permission_items.zalo_accounts.map((item) => (
                      <label key={item.id} className="chat-settings-toggle">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          disabled={permBusy || item.active === false}
                          onChange={(e) =>
                            setPermDraft(
                              togglePermissionItem(
                                permDraft,
                                'zalo_accounts',
                                item.id,
                                e.target.checked,
                              ),
                            )
                          }
                        />
                        <span>
                          <strong>{item.name || item.id}</strong>
                          <small>{item.id}{item.active === false ? ' · Đã tắt trong cấu hình' : ''}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <label className="chat-settings-toggle">
                    <input
                      type="checkbox"
                      checked={permDraft.can_use_oa_chat}
                      disabled={permBusy}
                      onChange={(e) =>
                        setPermDraft({ ...permDraft, can_use_oa_chat: e.target.checked })
                      }
                    />
                    <span>
                      <strong>OA Chatbots</strong>
                      <small>Hiện /chat/oa. Tắt thì ẩn menu OA.</small>
                    </span>
                  </label>
                  <div className="chat-modal-actions">
                    {permDraft.is_explicit && permDraft.source === 'user' && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={permBusy}
                        onClick={() => void resetPermissions()}
                      >
                        Dùng mặc định công ty
                      </button>
                    )}
                    <button type="button" disabled={permBusy} onClick={() => void savePermissions()}>
                      Lưu quyền
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
