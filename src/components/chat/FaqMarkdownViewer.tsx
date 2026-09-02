import { useCallback, useEffect, useMemo } from 'react';
import { chatApi, type FaqItem } from '../../api/chatApi';
import { IconClose, IconEdit, IconFile } from '../AppIcons';
import { useFileBlobUrl } from './ChatAvatar';
import { ChatMarkdown, type ChatMarkdownMedia } from './ChatMarkdown';

function parseFaqFileId(src: string, setId?: number): { setId: number; fileId: string } | null {
  const value = src.trim();
  if (value.toLowerCase().startsWith('faq-file:')) {
    const id = value.slice('faq-file:'.length).trim();
    if (!id || !setId) return null;
    return { setId, fileId: id };
  }
  const api = /\/api\/faq\/sets\/(\d+)\/files\/([^/?#]+)\/content/i.exec(value);
  if (api) {
    const parsedSet = Number(api[1]);
    const fileId = decodeURIComponent(api[2]);
    if (parsedSet > 0 && fileId) return { setId: parsedSet, fileId };
  }
  return null;
}

function isImageName(name: string) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(name);
}

function FaqMediaImage({
  setId,
  fileId,
  alt,
}: {
  setId: number;
  fileId: string;
  alt: string;
}) {
  const url = useFileBlobUrl(
    `faq:${setId}:${fileId}`,
    () => chatApi.faqFileBlob(setId, fileId),
  );
  if (!url) return <span className="muted">{alt || 'Đang tải ảnh…'}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="faq-md-img-link">
      <img src={url} alt={alt} className="faq-md-img" />
    </a>
  );
}

function FaqMediaFile({
  setId,
  fileId,
  label,
}: {
  setId: number;
  fileId: string;
  label: string;
}) {
  const url = useFileBlobUrl(
    `faq:${setId}:${fileId}`,
    () => chatApi.faqFileBlob(setId, fileId),
  );
  const name = label || fileId;
  if (!url) return <span className="muted">{name}</span>;
  if (isImageName(name)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="faq-md-img-link">
        <img src={url} alt={name} className="faq-md-img" />
      </a>
    );
  }
  return (
    <a className="faq-md-file" href={url} download={name} target="_blank" rel="noopener noreferrer">
      <IconFile size={14} />
      {name}
    </a>
  );
}

export function useFaqMarkdownMedia(setId: number | null): ChatMarkdownMedia | undefined {
  return useMemo(() => {
    if (!setId) return undefined;
    return {
      renderImage: (src, alt) => {
        const parsed = parseFaqFileId(src, setId);
        if (parsed) return <FaqMediaImage setId={parsed.setId} fileId={parsed.fileId} alt={alt} />;
        if (src.startsWith('https://') || src.startsWith('http://') || src.startsWith('/')) {
          return <img src={src} alt={alt} className="faq-md-img" />;
        }
        return alt || src;
      },
      renderLink: (href, label) => {
        const parsed = parseFaqFileId(href, setId);
        if (!parsed) return null;
        return <FaqMediaFile setId={parsed.setId} fileId={parsed.fileId} label={label} />;
      },
    };
  }, [setId]);
}

export function FaqChatMarkdown({ setId, text }: { setId: number; text: string }) {
  const media = useFaqMarkdownMedia(setId);
  return <ChatMarkdown text={text} media={media} />;
}

export function FaqMarkdownViewer({
  setId,
  item,
  canEdit,
  onClose,
  onEdit,
}: {
  setId: number;
  item: FaqItem;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div
      className="chat-modal-backdrop chat-md-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="chat-modal chat-md-viewer faq-md-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="faq-md-question"
      >
        <header className="chat-modal-head faq-md-head">
          <strong id="faq-md-question" className="faq-md-question">
            {item.question}
          </strong>
          <div className="faq-md-head-actions">
            {canEdit ? (
              <button type="button" className="chat-icon-btn" title="Sửa" onClick={onEdit}>
                <IconEdit size={18} />
              </button>
            ) : null}
            <button type="button" className="chat-icon-btn" title="Đóng" onClick={onClose}>
              <IconClose size={18} />
            </button>
          </div>
        </header>
        <div className="chat-md-viewer-body">
          {item.answer_md.trim() ? (
            <FaqChatMarkdown setId={setId} text={item.answer_md} />
          ) : (
            <p className="muted">Chưa có câu trả lời.</p>
          )}
        </div>
      </div>
    </div>
  );
}
