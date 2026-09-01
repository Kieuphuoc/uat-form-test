type ZaloBridge = {
  closeWindow?: (opts?: Record<string, unknown>) => void;
  closeWebview?: () => void;
};

declare global {
  interface Window {
    zlpSdk?: ZaloBridge;
    zaloJSV2?: ZaloBridge;
    ZaloJavaScriptInterface?: ZaloBridge;
    webkit?: { messageHandlers?: { zalo?: { postMessage: (msg: unknown) => void } } };
  }
}

function inZaloWebview(): boolean {
  if (typeof window.zlpSdk?.closeWindow === 'function') return true;
  if (typeof window.zlpSdk?.closeWebview === 'function') return true;
  if (typeof window.zaloJSV2?.closeWindow === 'function') return true;
  if (typeof window.ZaloJavaScriptInterface?.closeWebview === 'function') return true;
  if (window.webkit?.messageHandlers?.zalo) return true;
  return /Zalo/i.test(navigator.userAgent || '');
}

/** Đóng WebView Mini App (`openWebview`). Không nhảy deeplink zalo.me/s. */
export function closeZaloWebview(): boolean {
  if (!inZaloWebview()) return false;

  try {
    if (typeof window.zlpSdk?.closeWindow === 'function') {
      window.zlpSdk.closeWindow({});
      return true;
    }
  } catch {
    /* next */
  }
  try {
    if (typeof window.zlpSdk?.closeWebview === 'function') {
      window.zlpSdk.closeWebview();
      return true;
    }
  } catch {
    /* next */
  }
  try {
    if (typeof window.zaloJSV2?.closeWindow === 'function') {
      window.zaloJSV2.closeWindow({});
      return true;
    }
  } catch {
    /* next */
  }
  try {
    if (typeof window.ZaloJavaScriptInterface?.closeWebview === 'function') {
      window.ZaloJavaScriptInterface.closeWebview();
      return true;
    }
  } catch {
    /* next */
  }
  try {
    const handler = window.webkit?.messageHandlers?.zalo;
    if (handler) {
      handler.postMessage({ action: 'close' });
      return true;
    }
  } catch {
    /* next */
  }

  window.location.href = 'js://webview?action=close';
  return true;
}
