import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  chatApi,
  type ChatMe,
  type ChatUser,
  type ContactItem,
  type Conversation,
} from '../api/chatApi';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import { IconChat, IconClose, IconUsersAdd } from '../components/AppIcons';
import { useAuth } from '../auth/AuthContext';
import { navigateChat } from '../lib/chatNav';

type ShellContext = { me: ChatMe | null };

type Tab = 'company' | 'personal';

function relationLabel(item: ContactItem): string {
  if (item.is_blocked || item.relation === 'blocked') return 'Đã chặn';
  if (item.relation === 'pending_in') return 'Chờ bạn chấp nhận';
  if (item.relation === 'pending_out') return 'Đang chờ chấp nhận';
  if (item.relation === 'accepted') return 'Đã kết nối';
  return item.relation;
}

export function ContactsPage() {
  const { me } = useOutletContext<ShellContext>();
  const { mobile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const unitId = me?.unit_id ?? 0;
  const companyName =
    me?.unit?.unit_name || me?.unit?.unit_code || (unitId > 0 ? `Công ty #${unitId}` : null);
  const requested = (params.get('tab') as Tab | null) ?? null;
  const tab: Tab =
    requested === 'company' && unitId > 0
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [addToGroupUser, setAddToGroupUser] = useState<ChatUser | ContactItem | null>(null);
  const [groups, setGroups] = useState<Conversation[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');

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
  }, [unitId, params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'company') {
        const result = await chatApi.companyDirectory(search, page, pageSize);
        setCompanyItems(result.items);
        setTotal(result.total_record);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setTab = (next: Tab) => {
    setParams(next === 'company' ? { tab: 'company' } : { tab: 'personal' });
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
      const items = await chatApi.listConversations();
      setGroups(items.filter((c) => c.kind === 'group'));
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

  const placeholder = useMemo(
    () =>
      tab === 'company'
        ? 'Tìm theo tên, email, điện thoại…'
        : 'Tìm trong danh bạ của bạn…',
    [tab],
  );

  const renderActionButtons = (user: ChatUser | ContactItem, showChat: boolean) => (
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
              ? mobile
                ? 'Đồng nghiệp trong đơn vị của bạn.'
                : companyName || 'Danh bạ công ty'
              : 'Liên hệ đã kết nối, yêu cầu chờ duyệt và đã chặn.'}
          </p>
        </div>
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

        {tab === 'company' &&
          companyItems.map((u) => (
            <div key={u.user_id} className="chat-contact-row">
              <ChatAvatar name={u.nickname || u.email} avatarId={u.avatar_id} size={40} />
              <div className="chat-contact-main">
                <strong>{u.nickname || u.email || u.username || `User ${u.user_id}`}</strong>
                <span className="muted">
                  {[u.email, u.phone].filter(Boolean).join(' · ') || '—'}
                </span>
              </div>
              {renderActionButtons(u, true)}
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
                  {item.nickname || item.email || item.username || `User ${item.user_id}`}
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
                      className="secondary"
                      disabled={busyId === item.user_id}
                      onClick={() => void runContactAction(item.user_id, 'block')}
                    >
                      Chặn
                    </button>
                  </>
                )}
                {(item.relation === 'accepted' || item.relation === 'pending_out') && (
                  <>
                    {renderActionButtons(item, true)}
                    <button
                      type="button"
                      className="secondary"
                      disabled={busyId === item.user_id}
                      onClick={() => void runContactAction(item.user_id, 'block')}
                    >
                      Chặn
                    </button>
                  </>
                )}
                {(item.is_blocked || item.relation === 'blocked') && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === item.user_id}
                    onClick={() => void runContactAction(item.user_id, 'unblock')}
                  >
                    Bỏ chặn
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>

      {totalPages > 1 && (
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
    </div>
  );
}
