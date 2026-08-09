/**
 * Cache JSON runtime form (app / form) trên client — localStorage.
 * Prefix: arito_form_rt:{fc}:…
 */

const PREFIX = 'arito_form_rt:';
const LAST_FC_KEY = 'arito_form_rt_last_fc';

function cacheFc(): string {
  try {
    return new URLSearchParams(window.location.search).get('fc')?.trim() || '0';
  } catch {
    return '0';
  }
}

/** Khi mobile bump fc (logout / Reload), xóa cache scope cũ. */
export function syncFormCacheScopeFromUrl(): void {
  try {
    const fc = cacheFc();
    const last = localStorage.getItem(LAST_FC_KEY);
    if (last != null && last !== fc) {
      clearAllRuntimeFormCache();
    }
    localStorage.setItem(LAST_FC_KEY, fc);
  } catch {
    /* ignore */
  }
}

function key(parts: string[]): string {
  return `${PREFIX}${cacheFc()}:${parts.join(':')}`;
}

export function getRuntimeCache<T>(parts: string[]): T | null {
  try {
    const raw = localStorage.getItem(key(parts));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setRuntimeCache(parts: string[], value: unknown): void {
  try {
    localStorage.setItem(key(parts), JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/** Xóa toàn bộ cache runtime form trên origin form-web. */
export function clearAllRuntimeFormCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

const CLEAR_MSG = 'arito-clear-form-cache';

/** Lắng nghe mobile shell / parent clear cache. */
export function installFormCacheClearListener(): () => void {
  syncFormCacheScopeFromUrl();
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data;
    if (!data || typeof data !== 'object') return;
    if ((data as { type?: string }).type !== CLEAR_MSG) return;
    clearAllRuntimeFormCache();
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

export { CLEAR_MSG as FORM_CACHE_CLEAR_MESSAGE };
