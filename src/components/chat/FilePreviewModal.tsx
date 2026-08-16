import { useEffect, useState } from 'react';
import { chatApi, chatFileFullViewUrl, chatFilePreviewUrl } from '../../api/chatApi';
import { IconClose, IconDownload, IconOpenExternal } from '../AppIcons';

type Props = {
  conversationId: number;
  fileId: string;
  fileName: string;
  contentType?: string | null;
  onClose: () => void;
};

export async function downloadChatFile(conversationId: number, fileId: string, fileName: string) {
  const blob = await chatApi.attachmentBlob(conversationId, fileId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  anchor.click();
  URL.revokeObjectURL(url);
}

function isImageFile(contentType: string | null | undefined, fileName: string): boolean {
  if (contentType?.toLowerCase().startsWith('image/')) return true;
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(fileName);
}

/** Xem file trong iframe; ảnh dùng kích thước tự nhiên, tài liệu chiếm gần toàn màn hình. */
export function FilePreviewModal({
  conversationId,
  fileId,
  fileName,
  contentType,
  onClose,
}: Props) {
  const [src, setSrc] = useState<string | null>(() => chatFilePreviewUrl(fileId));
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const isImage = isImageFile(contentType, fileName);

  useEffect(() => {
    const filesWeb = chatFilePreviewUrl(fileId);
    setSrc(filesWeb);
    setImageSize(null);
    let disposed = false;
    let objectUrl: string | null = null;
    void chatApi.attachmentBlob(conversationId, fileId).then(
      (blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        if (!filesWeb) setSrc(objectUrl);
        if (isImage) {
          const image = new Image();
          image.onload = () => {
            if (!disposed) setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
          };
          image.src = objectUrl;
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

  const imageModalStyle = imageSize
    ? {
        width: `${Math.min(window.innerWidth * 0.9, Math.max(280, imageSize.width))}px`,
        height: `${Math.min(window.innerHeight * 0.9, Math.max(240, imageSize.height + 52))}px`,
      }
    : undefined;

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
              onClick={() => void downloadChatFile(conversationId, fileId, fileName)}
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
          {src ? (
            <iframe title={fileName} src={src} className="chat-preview-frame" />
          ) : (
            <p className="chat-hint">Đang tải file…</p>
          )}
        </div>
      </div>
    </div>
  );
}
