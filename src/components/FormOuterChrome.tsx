import { useEffect, useState, type ReactNode } from 'react';
import { FormModeTitleIcon } from './formModeTitleIcon';
import {
  FORM_CHROME_MSG,
  FORM_OPEN_SHELL_MSG,
  postFormBack,
  postFormHeaderAction,
  type FormChromeAction,
  type FormChromeState,
} from '../lib/formShell';

type Chrome = {
  title: string;
  canBack: boolean;
  headerActions: FormChromeAction[];
  formMode?: string;
};

function readChrome(raw: unknown): Chrome | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== FORM_CHROME_MSG) return null;
  const title = typeof o.title === 'string' ? o.title : '';
  const canBack = o.canBack === true;
  const headerActions: FormChromeAction[] = [];
  if (Array.isArray(o.headerActions)) {
    for (const item of o.headerActions) {
      if (!item || typeof item !== 'object') continue;
      const a = item as Record<string, unknown>;
      const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : '';
      if (!id) continue;
      headerActions.push({
        id,
        label: typeof a.label === 'string' && a.label.trim() ? a.label.trim() : id,
      });
    }
  }
  const formMode =
    o.formMode === 'view' || o.formMode === 'edit' || o.formMode === 'new' ? o.formMode : undefined;
  return { title, canBack, headerActions, formMode };
}

type Props = {
  fallbackTitle?: string;
  children: ReactNode;
};

/** Header runtime khi không embed mobile — Back + title, ẩn modal-header trong form. */
export function FormOuterChrome({ fallbackTitle = 'Arito Form', children }: Props) {
  const [chrome, setChrome] = useState<Chrome>({
    title: fallbackTitle,
    canBack: false,
    headerActions: [],
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const apply = (raw: unknown) => {
      const next = readChrome(raw);
      if (next) setChrome(next);
    };
    const onMsg = (e: MessageEvent) => apply(e.data);
    const onEvt = (e: Event) => apply((e as CustomEvent<FormChromeState>).detail);
    const onOpen = () => {
      setToast('Chart / AI Agent / Chat / Files chỉ mở đầy đủ trên ứng dụng mobile.');
      window.setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener('message', onMsg);
    window.addEventListener(FORM_CHROME_MSG, onEvt);
    window.addEventListener(FORM_OPEN_SHELL_MSG, onOpen);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener(FORM_CHROME_MSG, onEvt);
      window.removeEventListener(FORM_OPEN_SHELL_MSG, onOpen);
    };
  }, []);

  const title = chrome.title.trim() || fallbackTitle;

  return (
    <div className="form-outer-chrome">
      <header className="form-outer-chrome__bar">
        <div className="form-outer-chrome__left">
          {chrome.canBack ? (
            <button
              type="button"
              className="form-outer-chrome__back"
              onClick={() => postFormBack()}
              aria-label="Quay lại"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <span className="form-outer-chrome__mark" aria-hidden />
          )}
          <h1 className="form-outer-chrome__title">
            <span className="form-title-with-mode">
              <span className="form-title-with-mode__text">{title}</span>
              {chrome.formMode ? <FormModeTitleIcon mode={chrome.formMode} /> : null}
            </span>
          </h1>
        </div>
        {chrome.headerActions.length > 0 ? (
          <div className="form-outer-chrome__actions">
            {chrome.headerActions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="form-outer-chrome__link"
                onClick={() => postFormHeaderAction(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className="form-outer-chrome__body">{children}</div>
      {toast ? <div className="toast toast-tr info">{toast}</div> : null}
    </div>
  );
}
