import { useCallback, useEffect, useRef, useState } from 'react';

export type ApprovalToastLevel = 'info' | 'success' | 'error';

export type ApprovalToastState = {
  text: string;
  level: ApprovalToastLevel;
} | null;

/** Toast góc trên phải — tái dùng class `.toast.toast-tr` của form-web. */
export function useApprovalToast(durationMs = 2800) {
  const [toast, setToast] = useState<ApprovalToastState>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const showToast = useCallback(
    (text: string, level: ApprovalToastLevel = 'info') => {
      clearTimer();
      setToast({ text, level });
      timerRef.current = window.setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  const toastNode = toast ? (
    <div className={`toast toast-tr ${toast.level}`} role="status">
      {toast.text}
    </div>
  ) : null;

  return { toast, showToast, toastNode };
}
