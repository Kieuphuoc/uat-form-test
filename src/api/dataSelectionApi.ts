import { mapAuthUser, type AuthUser } from './authApi';
import { apiFetch, setJwt, type ApiResult } from './client';

export type AuthUnit = {
  unitId: number;
  tenUnit: string;
  maUnit: string;
  diaChi?: string | null;
  maSoThue?: string | null;
};

export type AuthApp = {
  udId: number;
  tenUd: string;
  udName: string;
  unitId: number;
  dbId: number;
  dbName?: string | null;
  svrName?: string | null;
};

export type AuthConfiguredClient = {
  clientId: string;
  name: string;
};

export type DataSelectionSource = 'aritoId' | 'client';

export type AuthClientsState = {
  clients: AuthConfiguredClient[];
  selectedClientId?: string | null;
  selectionSource?: DataSelectionSource;
};

export type SelectedAppResult = {
  unitId: number;
  udId: number;
  dbId: number;
  jwt?: string;
  user?: AuthUser;
};

export type SelectedClientResult = {
  clientId: string;
  name: string;
  jwt?: string;
  user?: AuthUser;
};

function persistSelectionSession(data: { jwt?: string; user?: unknown } | null | undefined) {
  const jwt = data?.jwt?.trim();
  if (!jwt) return;
  setJwt(jwt, true);
}

function mapUnit(raw: Record<string, unknown>): AuthUnit {
  return {
    unitId: Number(raw.unitId ?? raw.UnitId ?? 0),
    tenUnit: String(raw.tenUnit ?? raw.TenUnit ?? ''),
    maUnit: String(raw.maUnit ?? raw.MaUnit ?? ''),
    diaChi: (raw.diaChi ?? raw.DiaChi) as string | null | undefined,
    maSoThue: (raw.maSoThue ?? raw.MaSoThue) as string | null | undefined,
  };
}

function mapApp(raw: Record<string, unknown>): AuthApp {
  return {
    udId: Number(raw.udId ?? raw.UdId ?? 0),
    tenUd: String(raw.tenUd ?? raw.TenUd ?? ''),
    udName: String(raw.udName ?? raw.UdName ?? ''),
    unitId: Number(raw.unitId ?? raw.UnitId ?? 0),
    dbId: Number(raw.dbId ?? raw.DbId ?? 0),
    dbName: (raw.dbName ?? raw.DbName) as string | null | undefined,
    svrName: (raw.svrName ?? raw.SvrName) as string | null | undefined,
  };
}

function mapUser(raw: unknown): AuthUser | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const user = mapAuthUser(raw as Record<string, unknown>);
  return user.userId > 0 ? user : undefined;
}

export function unitLabel(u: AuthUnit): string {
  return u.tenUnit || u.maUnit || `Unit #${u.unitId}`;
}

export function appLabel(a: AuthApp): string {
  return a.udName || a.tenUd || `App #${a.udId}`;
}

export async function fetchAuthUnits(search = ''): Promise<ApiResult<AuthUnit[]>> {
  const qs = new URLSearchParams({ pageSize: '50' });
  if (search.trim()) qs.set('search', search.trim());
  const res = await apiFetch<unknown>(`/auth/units?${qs}`);
  if (!res.success || res.data == null) {
    return { success: false, error: res.error ?? 'Không lấy được danh sách công ty.' };
  }
  const list = Array.isArray(res.data) ? res.data : [];
  return {
    success: true,
    data: list.map((row) => mapUnit(row as Record<string, unknown>)),
    meta: res.meta,
  };
}

export async function fetchAuthApps(unitId: number, search = ''): Promise<ApiResult<AuthApp[]>> {
  const qs = new URLSearchParams({ unitId: String(unitId), pageSize: '50' });
  if (search.trim()) qs.set('search', search.trim());
  const res = await apiFetch<unknown>(`/auth/apps?${qs}`);
  if (!res.success || res.data == null) {
    return { success: false, error: res.error ?? 'Không lấy được danh sách ứng dụng.' };
  }
  const list = Array.isArray(res.data) ? res.data : [];
  return {
    success: true,
    data: list.map((row) => mapApp(row as Record<string, unknown>)),
    meta: res.meta,
  };
}

export async function saveSelectedApp(
  udId: number,
  opts?: { unitId?: number; dbId?: number },
): Promise<ApiResult<SelectedAppResult>> {
  const res = await apiFetch<{
    unitId: number;
    udId: number;
    dbId: number;
    jwt?: string;
    user?: unknown;
  }>('/auth/selected-app', {
    method: 'POST',
    body: JSON.stringify({
      udId,
      unitId: opts?.unitId ?? 0,
      dbId: opts?.dbId ?? 0,
    }),
  });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? 'Không lưu được lựa chọn ứng dụng.' };
  }
  persistSelectionSession(res.data);
  return {
    success: true,
    data: {
      unitId: res.data.unitId,
      udId: res.data.udId,
      dbId: res.data.dbId,
      jwt: res.data.jwt,
      user: mapUser(res.data.user),
    },
  };
}

export async function fetchAuthClients(): Promise<ApiResult<AuthClientsState>> {
  const res = await apiFetch<{
    clients?: AuthConfiguredClient[];
    selectedClientId?: string | null;
    selectionSource?: DataSelectionSource;
  }>('/auth/clients');
  if (!res.success || res.data == null) {
    return { success: false, error: res.error ?? 'Không lấy được danh sách client.' };
  }
  const raw = res.data;
  const clients = Array.isArray(raw.clients)
    ? raw.clients
        .map((c) => ({
          clientId: String(c.clientId ?? ''),
          name: String(c.name ?? ''),
        }))
        .filter((c) => c.clientId)
    : [];
  return {
    success: true,
    data: {
      clients,
      selectedClientId: raw.selectedClientId ?? null,
      selectionSource: raw.selectionSource === 'aritoId' ? 'aritoId' : 'client',
    },
    meta: res.meta,
  };
}

export async function saveSelectedClient(clientId: string): Promise<ApiResult<SelectedClientResult>> {
  const res = await apiFetch<{
    clientId: string;
    name: string;
    jwt?: string;
    user?: unknown;
  }>('/auth/selected-client', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? 'Không lưu được lựa chọn client.' };
  }
  persistSelectionSession(res.data);
  return {
    success: true,
    data: {
      clientId: res.data.clientId,
      name: res.data.name,
      jwt: res.data.jwt,
      user: mapUser(res.data.user),
    },
  };
}
