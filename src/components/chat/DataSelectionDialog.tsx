import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appLabel,
  fetchAuthApps,
  fetchAuthClients,
  fetchAuthUnits,
  saveSelectedApp,
  saveSelectedClient,
  unitLabel,
  type AuthApp,
  type AuthConfiguredClient,
  type AuthUnit,
  type DataSelectionSource,
  type SelectedAppResult,
  type SelectedClientResult,
} from '../../api/dataSelectionApi';
import { useAuth } from '../../auth/AuthContext';
import { clearAllRuntimeFormCache } from '../../lib/formRuntimeCache';
import { IconClose } from '../AppIcons';

type Props = {
  aritoIdEnabled?: boolean;
  onClose: () => void;
};

function applySessionAndReload(
  acceptSession: (token: string, user?: SelectedAppResult['user']) => void,
  result: { jwt?: string; user?: SelectedAppResult['user'] | SelectedClientResult['user'] },
) {
  if (result.jwt) acceptSession(result.jwt, result.user);
  clearAllRuntimeFormCache();
  window.location.reload();
}

export function DataSelectionDialog({ aritoIdEnabled = true, onClose }: Props) {
  const { acceptSession } = useAuth();
  const [units, setUnits] = useState<AuthUnit[]>([]);
  const [apps, setApps] = useState<AuthApp[]>([]);
  const [unitSearch, setUnitSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<AuthUnit | null>(null);
  const [selectedUdId, setSelectedUdId] = useState<number | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(aritoIdEnabled);
  const [loadingApps, setLoadingApps] = useState(false);
  const [busyOk, setBusyOk] = useState(false);
  const [busyClientId, setBusyClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<AuthConfiguredClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<DataSelectionSource>('client');
  const unitsReqId = useRef(0);
  const appsReqId = useRef(0);

  const loadUnits = useCallback(async (search: string) => {
    const reqId = ++unitsReqId.current;
    setLoadingUnits(true);
    try {
      const res = await fetchAuthUnits(search);
      if (reqId !== unitsReqId.current) return;
      if (!res.success) {
        setUnits([]);
        setError(res.error ?? 'Không tải được danh sách công ty.');
        return;
      }
      setError(null);
      setUnits(res.data ?? []);
    } catch (e) {
      if (reqId !== unitsReqId.current) return;
      setUnits([]);
      setError(e instanceof Error ? e.message : 'Lỗi tải công ty.');
    } finally {
      if (reqId === unitsReqId.current) setLoadingUnits(false);
    }
  }, []);

  const loadApps = useCallback(async (unitId: number) => {
    const reqId = ++appsReqId.current;
    setLoadingApps(true);
    setSelectedUdId(null);
    try {
      const res = await fetchAuthApps(unitId);
      if (reqId !== appsReqId.current) return;
      if (!res.success) {
        setApps([]);
        setError(res.error ?? 'Không tải được danh sách ứng dụng.');
        return;
      }
      setError(null);
      setApps(res.data ?? []);
    } catch (e) {
      if (reqId !== appsReqId.current) return;
      setApps([]);
      setError(e instanceof Error ? e.message : 'Lỗi tải ứng dụng.');
    } finally {
      if (reqId === appsReqId.current) setLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAuthClients();
        if (cancelled || !res.success || !res.data) return;
        setClients(res.data.clients);
        setSelectedClientId(res.data.selectedClientId ?? null);
        setSelectionSource(res.data.selectionSource ?? 'client');
      } catch {
        if (!cancelled) setClients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aritoIdEnabled) {
      setLoadingUnits(false);
      return;
    }
    const delay = unitSearch.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      void loadUnits(unitSearch);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [unitSearch, loadUnits, aritoIdEnabled]);

  useEffect(() => {
    if (!selectedUnit) {
      appsReqId.current += 1;
      setApps([]);
      setSelectedUdId(null);
      setLoadingApps(false);
      return;
    }
    void loadApps(selectedUnit.unitId);
  }, [selectedUnit, loadApps]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyOk && !busyClientId) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busyOk, busyClientId, onClose]);

  const handleSelectClient = async (clientId: string) => {
    if (!clientId || busyOk || busyClientId) return;
    setBusyClientId(clientId);
    setError(null);
    try {
      const saveRes = await saveSelectedClient(clientId);
      if (!saveRes.success || !saveRes.data) {
        setError(saveRes.error ?? 'Không lưu được lựa chọn client.');
        return;
      }
      applySessionAndReload(acceptSession, saveRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi khi chọn client.');
    } finally {
      setBusyClientId(null);
    }
  };

  const handleOk = async () => {
    if (!selectedUdId || !selectedUnit) return;
    setBusyOk(true);
    setError(null);
    try {
      const selectedApp = apps.find((a) => a.udId === selectedUdId);
      const saveRes = await saveSelectedApp(selectedUdId, {
        unitId: selectedUnit.unitId,
        dbId: selectedApp?.dbId ?? 0,
      });
      if (!saveRes.success || !saveRes.data) {
        setError(saveRes.error ?? 'Không lưu được lựa chọn ứng dụng.');
        return;
      }
      applySessionAndReload(acceptSession, saveRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi khi đồng ý.');
    } finally {
      setBusyOk(false);
    }
  };

  const selectedCompanyName = selectedUnit ? unitLabel(selectedUnit) : '';
  const busy = busyOk || !!busyClientId;

  return (
    <div
      className="chat-modal-backdrop chat-data-select-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="chat-modal chat-modal--data-select"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-data-select-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="chat-modal-head">
          <div>
            <strong id="chat-data-select-title">Thay đổi công ty và dữ liệu</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Chọn công ty rồi ứng dụng để lưu vào AritoID.
            </p>
          </div>
          <button type="button" className="chat-icon-btn" title="Đóng" disabled={busy} onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>

        <div className="chat-modal-body chat-data-select-body">
          {error && <div className="chat-error">{error}</div>}

          {clients.length > 0 ? (
            <div className="chat-data-select-section">
              <span>Client</span>
              <div className="chat-data-select-list-wrap">
                <ul className="chat-data-select-list">
                  {clients.map((c) => {
                    const active = selectionSource === 'client' && selectedClientId === c.clientId;
                    const itemBusy = busyClientId === c.clientId;
                    return (
                      <li key={c.clientId}>
                        <button
                          type="button"
                          className={`chat-data-select-item${active ? ' is-active' : ''}`}
                          disabled={busy}
                          onClick={() => void handleSelectClient(c.clientId)}
                        >
                          <strong>{c.name || c.clientId}</strong>
                          {itemBusy ? <span className="muted">Đang áp dụng…</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {aritoIdEnabled && clients.length > 0 ? (
            <p className="chat-data-select-or">Hoặc chọn từ AritoID</p>
          ) : null}

          {aritoIdEnabled ? (
            <>
              <div className="chat-data-select-section">
                <span>Công ty</span>
                <input
                  type="search"
                  value={unitSearch}
                  onChange={(e) => setUnitSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã, MST…"
                  aria-label="Tìm công ty"
                />
                <div className="chat-data-select-list-wrap">
                  {loadingUnits && <span className="chat-data-select-loading">Đang tải…</span>}
                  {units.length === 0 && !loadingUnits ? (
                    <p className="chat-hint">Không có công ty phù hợp.</p>
                  ) : units.length === 0 && loadingUnits ? (
                    <p className="chat-hint">Đang tải công ty…</p>
                  ) : (
                    <ul className={`chat-data-select-list${loadingUnits ? ' is-loading' : ''}`}>
                      {units.map((u) => {
                        const active = selectedUnit?.unitId === u.unitId;
                        return (
                          <li key={u.unitId}>
                            <button
                              type="button"
                              className={`chat-data-select-item${active ? ' is-active' : ''}`}
                              disabled={busy}
                              onClick={() => setSelectedUnit(u)}
                            >
                              <strong>{unitLabel(u)}</strong>
                              <span className="muted">
                                {[u.maUnit, u.maSoThue].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <label className="chat-data-select-section">
                <span>
                  {selectedUnit ? `Ứng dụng của "${selectedCompanyName}"` : 'Ứng dụng'}
                </span>
                <select
                  value={selectedUdId ?? ''}
                  disabled={!selectedUnit || loadingApps || busy}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSelectedUdId(Number.isFinite(v) && v > 0 ? v : null);
                  }}
                >
                  <option value="">
                    {!selectedUnit
                      ? 'Chọn công ty trước'
                      : loadingApps
                        ? 'Đang tải…'
                        : apps.length === 0
                          ? 'Không có ứng dụng'
                          : '— Chọn ứng dụng —'}
                  </option>
                  {apps.map((a) => (
                    <option key={a.udId} value={a.udId}>
                      {appLabel(a)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </div>

        <div className="chat-modal-foot">
          {aritoIdEnabled ? (
            <button
              type="button"
              disabled={!selectedUdId || busy}
              onClick={() => void handleOk()}
            >
              {busyOk ? 'Đang lưu…' : 'Lưu'}
            </button>
          ) : null}
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
