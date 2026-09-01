type ZaloJsCall = (
  jsToken: string,
  action: string,
  accessToken: string,
  data: string,
  callback: unknown,
) => unknown;

type ZaloBridge = {
  ready?: (cb: () => void) => void;
  closeWindow?: (opts?: Record<string, unknown>) => void;
  closeWebview?: (cb?: unknown) => void;
  closeWebView?: () => void;
  jsCall?: ZaloJsCall;
  H5?: { closeWebview?: (cb?: unknown) => void };
};

declare global {
  interface Window {
    zlpSdk?: ZaloBridge;
    zalo?: ZaloBridge;
    zaloJSV2?: ZaloBridge;
    ZJSBridge?: ZaloBridge;
    ZaloJavaScriptInterface?: ZaloBridge;
    onJSCall?: (serial: string) => unknown;
    onNativeMessage?: (serial: string, action: string) => unknown;
    webkit?: { messageHandlers?: Record<string, { postMessage: (msg: unknown) => void }> };
  }
}

const CLOSE_ACTION = 'action.window.close';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function readCookie(name: string): string {
  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return m?.[1] ? decodeURIComponent(m[1]) : '';
  } catch {
    return '';
  }
}

function queryParam(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name)?.trim() ?? '';
  } catch {
    return '';
  }
}

function jsToken(): string {
  return (
    queryParam('zlink3rd') ||
    readCookie('h5.zdn.vn_zlink3rd') ||
    readCookie('zlink3rd') ||
    'DEFAULT_JS_TOKEN'
  );
}

function accessToken(): string {
  return (
    queryParam('zacc_session') ||
    readCookie('h5.zdn.vn_zacc_session') ||
    readCookie('zacc_session') ||
    'DEFAULT_ACCESS_TOKEN'
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function iosCallback(serial: string, action: string): unknown {
  try {
    if (typeof window.onJSCall === 'function') return window.onJSCall(serial);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.onNativeMessage === 'function') return window.onNativeMessage(serial, action);
  } catch {
    /* ignore */
  }
  return () => undefined;
}

/** Native in-app browser: `ZaloJavaScriptInterface.jsCall(..., 'action.window.close', ...)`. */
function jsCallClose(action: string): void {
  const iface = window.ZaloJavaScriptInterface;
  if (typeof iface?.jsCall !== 'function') return;
  const serial = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const data = '{}';
  const jsTk = jsToken();
  const accTk = accessToken();
  try {
    if (isIos()) {
      iface.jsCall(jsTk, action, accTk, data, iosCallback(serial, action));
    } else {
      iface.jsCall(jsTk, action, accTk, data, `window.onJSCall && window.onJSCall('${serial}')`);
    }
  } catch {
    /* native chưa sẵn */
  }
}

function postToIosHandlers(): void {
  const handlers = window.webkit?.messageHandlers;
  if (!handlers) return;
  const payloads: unknown[] = [
    { action: CLOSE_ACTION },
    CLOSE_ACTION,
    JSON.stringify({ action: CLOSE_ACTION }),
  ];
  const names = [
    'zalo',
    'zbrowser',
    'jsCall',
    'action',
    'close',
    'closeWebview',
    'ZaloJavaScriptInterface',
  ];
  for (const name of names) {
    const handler = handlers[name];
    if (!handler?.postMessage) continue;
    for (const payload of payloads) {
      try {
        handler.postMessage(payload);
      } catch {
        /* next */
      }
    }
  }
}

function tryNativeClose(): void {
  jsCallClose(CLOSE_ACTION);
  jsCallClose('action.webview.close');
  jsCallClose('action.close.inapp');

  try {
    window.ZJSBridge?.H5?.closeWebview?.(() => undefined);
  } catch {
    /* ignore */
  }
  try {
    window.zaloJSV2?.closeWindow?.({});
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.zaloJSV2?.ready === 'function') {
      window.zaloJSV2.ready(() => {
        try {
          window.zaloJSV2?.closeWindow?.({});
        } catch {
          /* ignore */
        }
      });
    }
  } catch {
    /* ignore */
  }
  try {
    window.zlpSdk?.closeWindow?.({});
  } catch {
    /* ignore */
  }
  try {
    window.ZaloJavaScriptInterface?.closeWebview?.();
  } catch {
    /* ignore */
  }

  postToIosHandlers();

  try {
    window.close();
  } catch {
    /* ignore */
  }

  try {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = 'js://webview?action=close';
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 400);
  } catch {
    /* ignore */
  }
}

/** Đóng WebView Mini App (`openWebview`) qua JSBridge native. Không nhảy deeplink zalo.me/s. */
export async function closeZaloWebview(): Promise<void> {
  tryNativeClose();
  await sleep(120);
  tryNativeClose();
  await sleep(280);
  tryNativeClose();
  await sleep(500);
  tryNativeClose();
}
