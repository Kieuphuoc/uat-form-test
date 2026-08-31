/** iframe form-web → mobile shell: báo bàn phím ảo mở/đóng. */
export const KEYBOARD_MSG = 'arito-keyboard' as const;

export function isMobileEmbed(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.classList.contains('mobile-embed');
}

export function emitMobileKeyboard(open: boolean): void {
  if (!isMobileEmbed()) return;
  try {
    window.parent?.postMessage({ type: KEYBOARD_MSG, open }, '*');
  } catch {
    /* ignore */
  }
}

/** Focus lại ô nhập sau Enter — không chờ API / AI. */
export function refocusComposer(el: HTMLTextAreaElement | null) {
  if (!el || el.disabled) return;
  const focus = () => {
    if (el.disabled) return;
    el.focus({ preventScroll: true });
  };
  focus();
  window.requestAnimationFrame(focus);
  window.setTimeout(focus, 0);
}

/** Handlers gắn vào textarea chat khi nhúng mobile. */
export function mobileKeyboardFocusHandlers(enabled: boolean): {
  onFocus: () => void;
  onBlur: () => void;
} {
  const onFocus = () => {
    if (enabled) emitMobileKeyboard(true);
  };
  const onBlur = () => {
    if (!enabled) return;
    window.setTimeout(() => {
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
      emitMobileKeyboard(false);
    }, 160);
  };
  return { onFocus, onBlur };
}
