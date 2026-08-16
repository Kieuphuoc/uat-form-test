import { useEffect, useRef } from 'react';
import { IconClose, IconTrash } from '../AppIcons';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Hộp xác nhận thống nhất cho các thao tác nguy hiểm trong Chat. */
export function ChatConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Hủy',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="chat-modal-backdrop chat-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="chat-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="chat-confirm-title"
        aria-describedby="chat-confirm-message"
      >
        <button
          type="button"
          className="chat-icon-btn chat-confirm-close"
          title="Đóng"
          disabled={busy}
          onClick={onCancel}
        >
          <IconClose size={17} />
        </button>
        <div className="chat-confirm-icon" aria-hidden>
          <IconTrash size={24} />
        </div>
        <div className="chat-confirm-content">
          <strong id="chat-confirm-title">{title}</strong>
          <p id="chat-confirm-message">{message}</p>
        </div>
        <div className="chat-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className="chat-confirm-danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
