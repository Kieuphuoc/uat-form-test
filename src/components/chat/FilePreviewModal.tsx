import { useEffect, useRef, useState } from 'react';
import { chatApi, chatFileFullViewUrl, chatFilePreviewUrl } from '../../api/chatApi';
import { IconClose, IconDownload, IconOpenExternal } from '../AppIcons';

type Props = {
  conversationId: number;
  fileId: string;
  fileName: string;
  contentType?: string | null;
  /** Mặc định tải qua /chat; OA truyền oaApi.attachmentBlob. */
  getBlob?: (fileId: string) => Promise<Blob>;
  onClose: () => void;
};

/** Padding (10*2) + gap (8) + header (32) của .chat-preview-modal. */
const CHROME_HEIGHT = 60;
/** Chừa lề quanh modal trên desktop để thấy được backdrop. */
const VIEWPORT_MARGIN = 32;
/** Đủ chỗ cho tên file + 3 nút trên header. */
const MIN_MODAL_WIDTH = 300;

export async function downloadFileBlob(
  getBlob: (fileId: string) => Promise<Blob>,
  fileId: string,
  fileName: string,
) {
  const blob = await getBlob(fileId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadChatFile(conversationId: number, fileId: string, fileName: string) {
  await downloadFileBlob((id) => chatApi.attachmentBlob(conversationId, id), fileId, fileName);
}

function isImageFile(contentType: string | null | undefined, fileName: string): boolean {
  if (contentType?.toLowerCase().startsWith('image/')) return true;
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(fileName);
}

/**
 * Xem file: ảnh tải bản đầy đủ từ server và khung vừa khít ảnh (không vượt màn hình,
 * mobile phủ 100% theo CSS); tài liệu preview bằng iframe files-web.
 */
export function FilePreviewModal({
  conversationId,
  fileId,
  fileName,
  contentType,
  getBlob,
  onClose,
}: Props) {
  const isImage = isImageFile(contentType, fileName);
  const loadBlobRef = useRef<(id: string) => Promise<Blob>>((id) =>
    chatApi.attachmentBlob(conversationId, id),
  );
  loadBlobRef.current = (id) =>
    getBlob ? getBlob(id) : chatApi.attachmentBlob(conversationId, id);
  const [documentSrc, setDocumentSrc] = useState<string | null>(() =>
    isImage ? null : chatFilePreviewUrl(fileId),
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    setImageUrl(null);
    setImageSize(null);
    setDocumentSrc(isImage ? null : chatFilePreviewUrl(fileId));

    let disposed = false;
    let objectUrl: string | null = null;
    void loadBlobRef.current(fileId).then(
      (blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        if (isImage) {
          setImageUrl(objectUrl);
          const image = new Image();
          image.onload = () => {
            if (!disposed) setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
          };
          image.src = objectUrl;
        } else {
          setDocumentSrc((current) => current ?? objectUrl);
        }
      },
      () => {
        // files-web vẫn có thể preview dù endpoint blob tạm thời lỗi.
      },
    );
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, fileId, isImage]);

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  let imageModalStyle: { width: string; height: string } | undefined;
  if (isImage && imageSize) {
    const maxWidth = Math.max(MIN_MODAL_WIDTH, viewport.width - VIEWPORT_MARGIN);
    const maxHeight = Math.max(200, viewport.height - VIEWPORT_MARGIN - CHROME_HEIGHT);
    const scale = Math.min(1, maxWidth / imageSize.width, maxHeight / imageSize.height);
    imageModalStyle = {
      width: `${Math.max(MIN_MODAL_WIDTH, Math.round(imageSize.width * scale))}px`,
      height: `${Math.round(imageSize.height * scale) + CHROME_HEIGHT}px`,
    };
  }

  return (
    <div
      className={`chat-modal-backdrop ${
        isImage ? 'chat-preview-backdrop--image' : 'chat-preview-backdrop--document'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`chat-modal chat-preview-modal ${
          isImage ? 'chat-preview-modal--image' : 'chat-preview-modal--document'
        }`}
        style={imageModalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <header className="chat-modal-head">
          <strong>{fileName}</strong>
          <div className="chat-preview-actions">
            <button
              type="button"
              className="chat-icon-btn"
              title="Tải xuống"
              onClick={() => void downloadFileBlob((id) => loadBlobRef.current(id), fileId, fileName)}
            >
              <IconDownload size={18} />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              title="Mở toàn màn hình"
              onClick={() => {
                const url = chatFileFullViewUrl(fileId);
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
              }}
            >
              <IconOpenExternal size={18} />
            </button>
            <button type="button" className="chat-icon-btn" title="Đóng" onClick={onClose}>
              <IconClose size={18} />
            </button>
          </div>
        </header>
        <div className="chat-preview-frame-wrap">
          {isImage ? (
            imageUrl ? (
              <img className="chat-preview-image" src={imageUrl} alt={fileName} />
            ) : (
              <p className="chat-hint">Đang tải ảnh…</p>
            )
          ) : documentSrc ? (
            <iframe title={fileName} src={documentSrc} className="chat-preview-frame" />
          ) : (
            <p className="chat-hint">Đang tải file…</p>
          )}
        </div>
      </div>
    </div>
  );
}
