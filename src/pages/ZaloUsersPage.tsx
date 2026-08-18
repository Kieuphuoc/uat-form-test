import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatApiError } from '../api/chatApi';
import { zaloApi } from '../api/zaloApi';
import { ChatConfirmDialog } from '../components/chat/ChatConfirmDialog';
import { ChatAvatar } from '../components/chat/ChatAvatar';
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconEdit,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconUsers,
  IconUsersAdd,
} from '../components/AppIcons';
import type { ZaloSource, ZaloStaffUser, ZaloUserGroup } from '../lib/zaloChat';

const SOURCE_KEY = 'arito-zalo:source-id';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ChatApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Trang quản lý user / nhóm Zalo — tab riêng trong shell Chat.
 */
export function ZaloUsersPage() {
  const [sources, setSources] = useState<ZaloSource[]>([]);
  const [sourceId, setSourceId] = useState(() => window.localStorage.getItem(SOURCE_KEY) || '');
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);

  const [groups, setGroups] = useState<ZaloUserGroup[]>([]);
  const [users, setUsers] = useState<ZaloStaffUser[]>([]);
  const [members, setMembers] = useState<ZaloStaffUser[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ZaloUserGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<'internal' | 'external'>('internal');
  const [draftDesc, setDraftDesc] = useState('');
  const [deleteGroup, setDeleteGroup] = useState<ZaloUserGroup | null>(null);
  const [toast, setToast] = useState('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const sourceName = sources.find((s) => s.id === sourceId)?.name || sourceId;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const formOpen = creating || !!editing;

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    const list = q
      ? users.filter((u) => `${u.display_name} ${u.zalo_uid}`.toLowerCase().includes(q))
      : users;
    return list.slice(0, 80);
  }, [users, userQuery]);

  const onToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, []);

  const copyUid = async (uid: string) => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      onToast('Đã copy UID');
      window.setTimeout(() => setCopiedUid((cur) => (cur === uid ? null : cur)), 1500);
    } catch {
      onToast('Không copy được');
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!sourceMenuRef.current?.contains(event.target as Node)) setSourceMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [sourceMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    void zaloApi
      .listSources()
      .then((items) => {
        if (cancelled) return;
        setSources(items);
        const saved = window.localStorage.getItem(SOURCE_KEY) || '';
        const next = items.some((s) => s.id === saved) ? saved : items[0]?.id || '';
        setSourceId(next);
        if (next) window.localStorage.setItem(SOURCE_KEY, next);
        if (items.length === 0) setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoading(false);
          onToast(errorMessage(e, 'Không tải được danh sách nguồn Zalo.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onToast]);

  const loadGroups = useCallback(async (id: string) => {
    const items = await zaloApi.listUserGroups(id);
    setGroups(items);
    return items;
  }, []);

  const loadMembers = useCallback(async (id: string, groupId: string) => {
    const items = await zaloApi.listUserGroupMembers(id, groupId);
    setMembers(items);
  }, []);

  useEffect(() => {
    if (!sourceId) return;
    window.localStorage.setItem(SOURCE_KEY, sourceId);
    let cancelled = false;
    setLoading(true);
    setActiveGroupId(null);
    setMembers([]);
    Promise.all([loadGroups(sourceId), zaloApi.listUsers(sourceId)])
      .then(([groupItems, userItems]) => {
        if (cancelled) return;
        setUsers(userItems);
        if (groupItems[0]) setActiveGroupId(groupItems[0].id);
      })
      .catch((e) => {
        if (!cancelled) onToast(errorMessage(e, 'Không tải được nhóm / user.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadGroups, onToast, sourceId]);

  useEffect(() => {
    if (!sourceId || !activeGroupId) {
      setMembers([]);
      return;
    }
    void loadMembers(sourceId, activeGroupId).catch((e) =>
      onToast(errorMessage(e, 'Không tải được thành viên nhóm.')),
    );
  }, [activeGroupId, loadMembers, onToast, sourceId]);

  useEffect(() => {
    if (!sourceId) return;
    const timer = window.setTimeout(() => {
      void zaloApi
        .listUsers(sourceId, userQuery.trim())
        .then(setUsers)
        .catch(() => undefined);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [sourceId, userQuery]);

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const beginCreate = () => {
    setCreating(true);
    setEditing(null);
    setDraftName('');
    setDraftType('internal');
    setDraftDesc('');
  };

  const beginEdit = (group: ZaloUserGroup) => {
    setCreating(false);
    setEditing(group);
    setDraftName(group.name);
    setDraftType(group.group_type);
    setDraftDesc(group.description || '');
  };

  const saveGroup = async () => {
    const name = draftName.trim();
    if (!name || busy || !sourceId) return;
    setBusy(true);
    try {
      const body = { name, groupType: draftType, description: draftDesc.trim() || undefined };
      if (editing) {
        const saved = await zaloApi.updateUserGroup(sourceId, editing.id, body);
        setGroups((prev) => prev.map((g) => (g.id === saved.id ? { ...g, ...saved } : g)));
        onToast('Đã cập nhật nhóm');
      } else {
        const saved = await zaloApi.createUserGroup(sourceId, body);
        setGroups((prev) => [...prev, saved]);
        setActiveGroupId(saved.id);
        onToast('Đã tạo nhóm');
      }
      closeForm();
    } catch (e) {
      onToast(errorMessage(e, 'Không lưu được nhóm.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteGroup || busy || !sourceId) return;
    setBusy(true);
    try {
      await zaloApi.deleteUserGroup(sourceId, deleteGroup.id);
      setGroups((prev) => prev.filter((g) => g.id !== deleteGroup.id));
      if (activeGroupId === deleteGroup.id) setActiveGroupId(null);
      onToast('Đã xóa nhóm');
      setDeleteGroup(null);
    } catch (e) {
      onToast(errorMessage(e, 'Không xóa được nhóm.'));
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (user: ZaloStaffUser) => {
    if (!sourceId || !activeGroupId || memberIds.has(user.id) || busy) return;
    setBusy(true);
    try {
      await zaloApi.addUserGroupMember(sourceId, activeGroupId, user.id);
      setMembers((prev) => [...prev, user]);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === activeGroupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g,
        ),
      );
    } catch (e) {
      onToast(errorMessage(e, 'Không thêm được thành viên.'));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (user: ZaloStaffUser) => {
    if (!sourceId || !activeGroupId || busy) return;
    setBusy(true);
    try {
      await zaloApi.removeUserGroupMember(sourceId, activeGroupId, user.id);
      setMembers((prev) => prev.filter((m) => m.id !== user.id));
      setGroups((prev) =>
        prev.map((g) =>
          g.id === activeGroupId
            ? { ...g, member_count: Math.max(0, (g.member_count || 1) - 1) }
            : g,
        ),
      );
    } catch (e) {
      onToast(errorMessage(e, 'Không gỡ được thành viên.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page-card zalo-users-page">
      <header className="chat-page-card-head">
        <div>
          <h2>Nhóm người dùng Zalo</h2>
          <p className="muted">Phân loại internal / external — ảnh hưởng unread hộp thư.</p>
        </div>
        <div className="zalo-source-pick chat-page-card-head-action" ref={sourceMenuRef}>
          <span className="zalo-source-name" title={sourceName}>
            {sources.length === 0 ? 'Chưa có nguồn' : sourceName}
          </span>
          <button
            type="button"
            className="chat-icon-btn"
            title="Đổi nguồn Zalo"
            aria-expanded={sourceMenuOpen}
            disabled={sources.length === 0}
            onClick={() => setSourceMenuOpen((open) => !open)}
          >
            <IconSettings size={16} />
          </button>
          {sourceMenuOpen && sources.length > 0 && (
            <div className="zalo-source-menu" role="listbox" aria-label="Nguồn Zalo">
              {sources.map((source) => (
                <button
                  type="button"
                  key={source.id}
                  role="option"
                  aria-selected={sourceId === source.id}
                  className={sourceId === source.id ? 'is-active' : undefined}
                  onClick={() => {
                    setSourceId(source.id);
                    setSourceMenuOpen(false);
                  }}
                >
                  {source.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="zalo-groups-body">
        <aside className="zalo-groups-list">
          <div className="zalo-groups-list-head">
            <strong>Nhóm</strong>
            <button
              type="button"
              className="chat-icon-btn"
              title="Thêm nhóm"
              disabled={!sourceId}
              onClick={beginCreate}
            >
              <IconPlus size={16} />
            </button>
          </div>
          {loading && <p className="chat-hint">Đang tải...</p>}
          {!loading && groups.length === 0 && <p className="chat-hint">Chưa có nhóm.</p>}
          {groups.map((group) => (
            <div
              key={group.id}
              className={`zalo-groups-item${group.id === activeGroupId ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="zalo-groups-item-main"
                onClick={() => setActiveGroupId(group.id)}
              >
                <strong>{group.name}</strong>
                <small>
                  {group.group_type === 'internal' ? 'Internal' : 'External'}
                  {typeof group.member_count === 'number' ? ` · ${group.member_count}` : ''}
                </small>
              </button>
              <span className="zalo-groups-item-actions">
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Sửa"
                  onClick={() => beginEdit(group)}
                >
                  <IconEdit size={16} />
                </button>
                <button
                  type="button"
                  className="chat-icon-btn is-danger"
                  title="Xóa"
                  onClick={() => setDeleteGroup(group)}
                >
                  <IconTrash size={16} />
                </button>
              </span>
            </div>
          ))}
        </aside>
        <section className="zalo-groups-main">
          {activeGroup ? (
            <>
              <div className="zalo-groups-main-head">
                <IconUsers size={16} />
                <strong>{activeGroup.name}</strong>
                <small>{members.length} thành viên</small>
              </div>
              <ul className="chat-member-list">
                {members.map((m) => (
                  <li key={m.id}>
                    <ChatAvatar name={m.display_name} imageSrc={m.avatar_url} size={32} />
                    <span className="chat-member-main">
                      <span className="chat-member-name">{m.display_name}</span>
                    </span>
                    <span className="chat-member-actions">
                      <button
                        type="button"
                        className="chat-icon-btn"
                        title="Copy UID"
                        onClick={() => void copyUid(m.zalo_uid)}
                      >
                        {copiedUid === m.zalo_uid ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </button>
                      <button
                        type="button"
                        className="chat-icon-btn is-danger"
                        title="Gỡ khỏi nhóm"
                        onClick={() => void removeMember(m)}
                      >
                        <IconClose size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="zalo-groups-search">
                <label className="chat-search">
                  <IconSearch size={16} />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Tìm user để thêm vào nhóm..."
                  />
                </label>
              </div>
              <ul className="chat-member-list zalo-groups-users">
                {filteredUsers.map((u) => {
                  const inGroup = memberIds.has(u.id);
                  return (
                    <li key={u.id}>
                      <ChatAvatar name={u.display_name} imageSrc={u.avatar_url} size={32} />
                      <span className="chat-member-main">
                        <span className="chat-member-name">{u.display_name}</span>
                      </span>
                      <span className="chat-member-actions">
                        <button
                          type="button"
                          className="chat-icon-btn"
                          title="Copy UID"
                          onClick={() => void copyUid(u.zalo_uid)}
                        >
                          {copiedUid === u.zalo_uid ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </button>
                        <button
                          type="button"
                          className="chat-icon-btn"
                          title={inGroup ? 'Đã có trong nhóm' : 'Thêm vào nhóm'}
                          disabled={inGroup || busy}
                          onClick={() => void addMember(u)}
                        >
                          <IconUsersAdd size={16} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="chat-hint">Chọn hoặc tạo nhóm để quản lý thành viên.</p>
          )}
        </section>
      </div>

      {formOpen && (
        <div
          className="zalo-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="zalo-modal zalo-group-form-dialog" role="dialog" aria-modal="true">
            <header>
              <div>
                <h2>{editing ? 'Sửa nhóm' : 'Thêm nhóm'}</h2>
                <p>Nhập thông tin rồi bấm OK để lưu.</p>
              </div>
              <button type="button" className="chat-icon-btn" onClick={closeForm} title="Đóng">
                <IconClose size={18} />
              </button>
            </header>
            <div className="zalo-modal-body zalo-groups-form">
              <label>
                Tên nhóm
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Loại
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as 'internal' | 'external')}
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </label>
              <label>
                Mô tả
                <textarea
                  rows={3}
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                />
              </label>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={closeForm}>
                Hủy
              </button>
              <button type="button" disabled={busy || !draftName.trim()} onClick={() => void saveGroup()}>
                OK
              </button>
            </footer>
          </div>
        </div>
      )}

      <ChatConfirmDialog
        open={!!deleteGroup}
        title="Xóa nhóm?"
        message={deleteGroup ? `Xóa nhóm “${deleteGroup.name}”? Thành viên sẽ bị gỡ khỏi nhóm này.` : ''}
        confirmLabel="Xóa"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteGroup(null)}
      />

      {toast && <div className="zalo-toast">{toast}</div>}
    </div>
  );
}
