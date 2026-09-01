type ZaloBridge = {
  ready?: (cb: () => void) => void;
  closeWindow?: (opts?: Record<string, unknown>) => void;
  closeWebview?: () => void;
  closeWebView?: () => void;
};

declare global {
  interface Window {
    zlpSdk?: ZaloBridge;
    zalo?: ZaloBridge;
    zaloJSV2?: ZaloBridge;
    ZaloJavaScriptInterface?: ZaloBridge;
    webkit?: { messageHandlers?: { zalo?: { postMessage: (msg: unknown) => void } } };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function tryNativeClose(): void {
  const calls: Array<() => void> = [
    () => window.zlpSdk?.closeWindow?.({}),
    () => window.zlpSdk?.closeWebview?.(),
    () => window.zaloJSV2?.closeWindow?.({}),
    () => window.zaloJSV2?.closeWebview?.(),
    () => window.zaloJSV2?.closeWebView?.(),
    () => window.zalo?.closeWindow?.({}),
    () => window.zalo?.closeWebview?.(),
    () => window.zalo?.closeWebView?.(),
    () => window.ZaloJavaScriptInterface?.closeWebview?.(),
    () => window.ZaloJavaScriptInterface?.closeWindow?.({}),
    () => window.webkit?.messageHandlers?.zalo?.postMessage({ action: 'close' }),
    () => window.webkit?.messageHandlers?.zalo?.postMessage(JSON.stringify({ action: 'close' })),
    () => window.close(),
  ];
  for (const run of calls) {
    try {
      run();
    } catch {
      /* next */
    }
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
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = 'js://webview?action=close';
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 500);
  } catch {
    /* ignore */
  }
}

function loadZaloJsSdk(): Promise<void> {
  if (window.zaloJSV2 || window.zlpSdk) return Promise.resolve();
  const existing = document.querySelector('script[data-arito-zalo-sdk]');
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      window.setTimeout(() => resolve(), 800);
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://sp.zalo.me/plugins/sdk.js';
    script.async = true;
    script.dataset.aritoZaloSdk = '1';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    window.setTimeout(() => resolve(), 1200);
  });
}

/** Đóng WebView Mini App. Thử ngay, rồi lại sau 1s và 2s. */
export async function closeZaloWebview(): Promise<void> {
  await loadZaloJsSdk();
  tryNativeClose();
  await sleep(1000);
  tryNativeClose();
  await sleep(1000);
  tryNativeClose();
}
