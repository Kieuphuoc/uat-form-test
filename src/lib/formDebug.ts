/** Đọc ?debug=1 từ URL runtime form-web. */
export function isFormDebugEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('debug');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Chống trùng StrictMode / remount kép trong cửa sổ ngắn. */
const recentEmit = new Map<string, number>();
const DEDUPE_MS = 1200;

export function emitFormDebugLog(message: string, detail?: unknown): void {
  if (!isFormDebugEnabled()) return;

  const now = Date.now();
  const prev = recentEmit.get(message);
  if (prev != null && now - prev < DEDUPE_MS) return;
  recentEmit.set(message, now);
  if (recentEmit.size > 80) {
    for (const [k, t] of recentEmit) {
      if (now - t > DEDUPE_MS) recentEmit.delete(k);
    }
  }

  const detailStr =
    detail == null
      ? undefined
      : typeof detail === 'string'
        ? detail
        : JSON.stringify(detail, null, 2);

  try {
    window.parent?.postMessage(
      {
        type: 'arito-form-debug-log',
        kind: 'form',
        message,
        detail: detailStr,
      },
      '*',
    );
  } catch {
    /* ignore */
  }

  try {
    console.info('[form-debug]', message, detail ?? '');
  } catch {
    /* ignore */
  }
}
