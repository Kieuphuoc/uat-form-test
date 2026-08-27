/** Cầu form-web ↔ AppShell / RuntimePage chrome. */

export const FORM_CHROME_MSG = 'arito-form-chrome' as const;
export const FORM_BACK_MSG = 'arito-form-back' as const;
export const FORM_OPEN_SHELL_MSG = 'arito-form-open-shell' as const;
export const FORM_HEADER_ACTION_MSG = 'arito-form-header-action' as const;
export const FORM_CHROME_REQUEST_MSG = 'arito-form-chrome-request' as const;

export type OpenShellTarget =
  | 'chart'
  | 'agent'
  | 'chat'
  | 'files'
  | 'docs'
  | 'monitor'
  | 'settings'
  | 'logs';

export type FormChromeAction = {
  id: string;
  label: string;
};

export type FormChromeState = {
  type: typeof FORM_CHROME_MSG;
  title: string;
  canBack: boolean;
  headerActions?: FormChromeAction[];
  /** view | edit | new — icon nhỏ sát phải title. */
  formMode?: string;
};

export function normalizeOpenShellTarget(raw: string): OpenShellTarget | null {
  const v = raw.trim().toLowerCase();
  if (v === 'chart' || v === 'dash' || v === 'canvas') return 'chart';
  if (v === 'agent' || v === 'ai' || v === 'chart-chat' || v === 'chartchat') return 'agent';
  if (v === 'chat') return 'chat';
  if (v === 'files' || v === 'file') return 'files';
  if (v === 'docs' || v === 'portal' || v === 'document') return 'docs';
  if (v === 'monitor') return 'monitor';
  if (v === 'settings' || v === 'config' || v === 'cauhinh') return 'settings';
  if (v === 'logs' || v === 'log' || v === 'debug') return 'logs';
  return null;
}

export function emitFormChrome(state: Omit<FormChromeState, 'type'>): void {
  const msg: FormChromeState = { type: FORM_CHROME_MSG, ...state };
  try {
    window.parent?.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(FORM_CHROME_MSG, { detail: msg }));
  } catch {
    /* ignore */
  }
}

export function requestOpenShell(target: string): OpenShellTarget | null {
  const normalized = normalizeOpenShellTarget(target);
  if (!normalized) return null;
  const msg = { type: FORM_OPEN_SHELL_MSG, target: normalized };
  try {
    if (window.parent !== window) {
      window.parent.postMessage(msg, '*');
    } else {
      window.dispatchEvent(new CustomEvent(FORM_OPEN_SHELL_MSG, { detail: msg }));
    }
  } catch {
    /* ignore */
  }
  return normalized;
}

export function postFormBack(): void {
  const msg = { type: FORM_BACK_MSG };
  try {
    window.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
  document.querySelectorAll('iframe').forEach((el) => {
    try {
      el.contentWindow?.postMessage(msg, '*');
    } catch {
      /* ignore */
    }
  });
}

export function postFormHeaderAction(controlId: string): void {
  const msg = { type: FORM_HEADER_ACTION_MSG, controlId };
  try {
    window.postMessage(msg, '*');
  } catch {
    /* ignore */
  }
  document.querySelectorAll('iframe').forEach((el) => {
    try {
      el.contentWindow?.postMessage(msg, '*');
    } catch {
      /* ignore */
    }
  });
}
