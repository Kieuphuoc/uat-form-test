import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchDesignHelpEmbed, type DesignHelpKind } from '../../api/designHelpApi';

type Props = {
  open: boolean;
  kind: DesignHelpKind;
  /** Câu hỏi gợi ý (hiển thị để copy / nhắc khi mở từ ?). */
  suggestedPrompt?: string | null;
  onClose: () => void;
};

/** Panel chatbot RAG — Design Form hoặc Event/SQL theo tab hiện tại. */
export function DesignHelpChatPanel({ open, kind, suggestedPrompt, onClose }: Props) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmbedUrl(null);
    const res = await fetchDesignHelpEmbed(kind);
    setLoading(false);
    if (!res.success || !res.data?.embedUrl) {
      setError(res.error || 'Không mở được chatbot trợ giúp.');
      return;
    }
    setEmbedUrl(res.data.embedUrl);
  }, [kind]);

  useEffect(() => {
    if (!open) {
      setEmbedUrl(null);
      setError(null);
      setCopied(false);
      return;
    }
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onMsg = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const t = (data as { type?: string }).type;
      if (t === 'arito-help-chat-close') onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMsg);
    };
  }, [open, onClose]);

  if (!open) return null;

  const title =
    kind === 'actions' ? 'Hỗ trợ Event / SQL' : 'Hỗ trợ Design Form / List';

  return createPortal(
    <div className="design-help-dock" role="dialog" aria-label={title}>
      <div className="design-help-dock__body">
        {suggestedPrompt ? (
          <div className="design-help-prompt">
            <span className="muted">Gợi ý hỏi (dán vào chat):</span>
            <p>{suggestedPrompt}</p>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(suggestedPrompt);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* ignore */
                }
              }}
            >
              {copied ? 'Đã copy' : 'Copy câu hỏi'}
            </button>
          </div>
        ) : null}
        {loading && <p className="muted">Đang mở chatbot…</p>}
        {error && (
          <div className="banner">
            {error}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="secondary" onClick={() => void load()}>
                Thử lại
              </button>
            </div>
          </div>
        )}
        {embedUrl && !loading && (
          <iframe title={title} src={embedUrl} className="design-help-dock__frame" allow="clipboard-write" />
        )}
      </div>
    </div>,
    document.body,
  );
}
