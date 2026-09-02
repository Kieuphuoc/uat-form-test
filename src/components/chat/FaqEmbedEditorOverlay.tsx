import { useEffect, useRef } from 'react';
import { IconClose } from '../AppIcons';
import { createEmbedEditorClient, type EmbedEditorClient } from '../../lib/embedEditorClient';
import { getKnowledgeWebUrl } from '../../lib/knowledgeWeb';
import {
  normalizeFileApiUrlsToFaqFile,
  rewriteFaqFileUrlsForFileApi,
} from '../../lib/faqMarkdownFiles';

function getFilesApiBase(): string {
  const v = (import.meta.env.VITE_FILES_BASE_URL as string | undefined)?.trim();
  return (v && v.length > 0 ? v : 'https://apifile.arito.net').replace(/\/+$/, '');
}

type FaqEmbedEditorOverlayProps = {
  open: boolean;
  folderId: string;
  title: string;
  content: string;
  onApply: (markdown: string) => void;
  onClose: () => void;
};

export function FaqEmbedEditorOverlay({
  open,
  folderId,
  title,
  content,
  onApply,
  onClose,
}: FaqEmbedEditorOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<EmbedEditorClient | null>(null);
  const payloadRef = useRef({ title, content });
  const onApplyRef = useRef(onApply);
  const onCloseRef = useRef(onClose);
  onApplyRef.current = onApply;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) payloadRef.current = { title, content };
  }, [open, title, content]);

  useEffect(() => {
    if (!open || !folderId) return;

    const host = hostRef.current;
    if (!host) return;

    let closed = false;
    const client = createEmbedEditorClient({
      knowledgeBaseUrl: getKnowledgeWebUrl(),
      folderId,
      format: 'md',
      mode: 'edit',
      parentOrigin: window.location.origin,
    });
    clientRef.current = client;
    client.iframe.className = 'faq-embed-editor-frame';
    host.replaceChildren(client.iframe);

    const { title: initTitle, content: initContent } = payloadRef.current;
    const viewContent = rewriteFaqFileUrlsForFileApi(initContent, getFilesApiBase());
    void client
      .open({ title: initTitle, content: viewContent, format: 'md', mode: 'edit' })
      .then((result) => {
        if (closed) return;
        if (result?.content != null) {
          onApplyRef.current(normalizeFileApiUrlsToFaqFile(result.content));
        }
        onCloseRef.current();
      });

    return () => {
      closed = true;
      client.destroy();
      clientRef.current = null;
      host.replaceChildren();
    };
  }, [open, folderId]);

  if (!open) return null;

  return (
    <div
      className="faq-embed-editor-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="faq-embed-editor-panel" role="dialog" aria-modal="true" aria-label="Soạn câu trả lời">
        <header className="faq-embed-editor-head">
          <strong>Soạn câu trả lời (BlockNote)</strong>
          <button type="button" className="chat-icon-btn" title="Đóng" onClick={onClose}>
            <IconClose size={17} />
          </button>
        </header>
        <div ref={hostRef} className="faq-embed-editor-host" />
      </div>
    </div>
  );
}
