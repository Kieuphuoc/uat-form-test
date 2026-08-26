import { scanQrCodeWithCamera } from './webQrScanner';

/** Cầu form-web → AppShell: quét QR rồi mở form kết quả trên shell. */
export const FORM_SCAN_QR_MSG = 'arito-form-scan-qr' as const;

export type ScanQrResult =
  | { ok: true; raw: string }
  | {
      ok: false;
      reason: 'cancelled' | 'denied' | 'unavailable' | 'error';
      message?: string;
    };

function tryParseWebLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const candidate = /^https?:\/\//i.test(t)
    ? t
    : /^www\./i.test(t)
      ? `https://${t}`
      : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Mở /runtime/qrscan với prefill nội dung QR (top-level browser). */
export function openQrResultRuntime(raw: string): void {
  const content = raw?.trim();
  if (!content) return;
  const qs = new URLSearchParams({
    formMode: 'view',
    'v.qrContent': content,
  });
  const webLink = tryParseWebLink(content);
  if (webLink) {
    qs.set('v.hint', 'Đây là link web — bấm bên dưới để mở.');
    qs.set('v.linkUrl', webLink);
  } else {
    qs.set('v.hint', 'Nội dung QR (không phải link web).');
  }
  window.location.assign(`/runtime/qrscan?${qs.toString()}`);
}

/**
 * Trong iframe AppShell → postMessage để shell quét + mở kết quả.
 * Top-level → camera web rồi điều hướng /runtime/qrscan.
 */
export async function requestScanQr(): Promise<ScanQrResult> {
  if (typeof window !== 'undefined' && window.parent !== window) {
    try {
      window.parent.postMessage({ type: FORM_SCAN_QR_MSG }, '*');
      // Shell tự mở overlay kết quả — không chờ raw về iframe.
      return { ok: true, raw: '' };
    } catch {
      /* fallback camera */
    }
  }

  const result = await scanQrCodeWithCamera();
  if (!result.ok) return result;
  openQrResultRuntime(result.raw);
  return result;
}
