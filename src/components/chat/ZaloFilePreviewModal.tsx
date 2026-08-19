import { useEffect, useState } from 'react';
import { zaloDownloadHref } from '../../lib/zaloChat';
import { IconClose, IconDownload, IconOpenExternal } from '../AppIcons';

type Props = {
  fileName: string;
  openHref: string;
  isImage: boolean;
  onClose: () => void;
};

const CHROME_HEIGHT = 60;
const VIEWPORT_MARGIN = 32;
const MIN_MODAL_WIDTH = 300;

/**
 * Xem file/ảnh Zalo (URL ngoài) — khung fullscreen giống FilePreviewModal của /chat.
 */
export function ZaloFilePreviewModal({ fileName, openHref, isImage, onClose }: Props) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setImageSize(null);
    if (!isImage) return;
    const image = new Image();
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = openHref;
  }, [isImage, openHref]);

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
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={fileName}
      >
        <header className="chat-modal-head">
          <strong>{fileName}</strong>
          <div className="chat-preview-actions">
            <button
              type="button"
              className="chat-icon-btn"
              title="Tải xuống"
              onClick={() => zaloDownloadHref(openHref, fileName)}
            >
              <IconDownload size={18} />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              title="Mở tab mới"
              onClick={() => window.open(openHref, '_blank', 'noopener,noreferrer')}
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
            <img className="chat-preview-image" src={openHref} alt={fileName} />
          ) : (
            <iframe title={fileName} src={openHref} className="chat-preview-frame" />
          )}
        </div>
      </div>
    </div>
  );
}
