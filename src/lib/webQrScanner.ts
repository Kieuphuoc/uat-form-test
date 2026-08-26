import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export type WebScanQrResult =
  | { ok: true; raw: string }
  | {
      ok: false;
      reason: 'cancelled' | 'denied' | 'unavailable' | 'error';
      message?: string;
    };

const OVERLAY_ID = 'arito-web-qr-overlay';
const READER_ID = 'arito-web-qr-reader';

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function buildOverlay(): { root: HTMLDivElement; cancelBtn: HTMLButtonElement } {
  removeOverlay();
  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Quét mã QR');
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'system-ui, sans-serif',
  } as CSSStyleDeclaration);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    gap: '12px',
    flexShrink: '0',
  } as CSSStyleDeclaration);

  const title = document.createElement('div');
  title.textContent = 'Quét mã QR';
  Object.assign(title.style, { fontSize: '16px', fontWeight: '600' } as CSSStyleDeclaration);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Đóng';
  Object.assign(cancelBtn.style, {
    border: '1px solid #64748b',
    background: 'transparent',
    color: '#f8fafc',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '14px',
    cursor: 'pointer',
  } as CSSStyleDeclaration);

  header.append(title, cancelBtn);

  const hint = document.createElement('div');
  hint.textContent = 'Đưa mã QR vào khung hình';
  Object.assign(hint.style, {
    padding: '0 16px 8px',
    fontSize: '13px',
    color: '#94a3b8',
    flexShrink: '0',
  } as CSSStyleDeclaration);

  const reader = document.createElement('div');
  reader.id = READER_ID;
  Object.assign(reader.style, {
    flex: '1',
    minHeight: '0',
    width: '100%',
    overflow: 'hidden',
  } as CSSStyleDeclaration);

  root.append(header, hint, reader);
  document.body.appendChild(root);
  return { root, cancelBtn };
}

/** Xin quyền camera + overlay quét QR trên browser. */
export async function scanQrCodeWithCamera(): Promise<WebScanQrResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Trình duyệt không hỗ trợ camera để quét QR.',
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        ok: false,
        reason: 'denied',
        message: 'Chưa cấp quyền camera để quét QR.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Không tìm thấy camera trên thiết bị.',
      };
    }
    return {
      ok: false,
      reason: 'error',
      message: e instanceof Error ? e.message : 'Không mở được camera.',
    };
  }

  const { cancelBtn } = buildOverlay();
  const scanner = new Html5Qrcode(READER_ID, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  });

  return new Promise<WebScanQrResult>((resolve) => {
    let settled = false;

    const finish = async (result: WebScanQrResult) => {
      if (settled) return;
      settled = true;
      cancelBtn.onclick = null;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* ignore */
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
      removeOverlay();
      resolve(result);
    };

    cancelBtn.onclick = () => {
      void finish({ ok: false, reason: 'cancelled' });
    };

    void scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 8,
          qrbox: (viewW, viewH) => {
            const edge = Math.floor(Math.min(viewW, viewH) * 0.7);
            return { width: edge, height: edge };
          },
          aspectRatio: 1,
        },
        (decoded) => {
          const raw = decoded?.trim();
          if (!raw) return;
          void finish({ ok: true, raw });
        },
        () => {
          /* ignore frame errors */
        },
      )
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        if (/permission|notallowed|denied/i.test(message)) {
          void finish({
            ok: false,
            reason: 'denied',
            message: 'Chưa cấp quyền camera để quét QR.',
          });
          return;
        }
        void finish({ ok: false, reason: 'error', message });
      });
  });
}
