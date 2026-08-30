import type { ReactNode } from 'react';
import { IconFile, IconImage } from '../AppIcons';

export function ChatFileTile({
  fileName,
  isImage,
  imageUrl,
  onOpen,
}: {
  fileName: string;
  isImage: boolean;
  imageUrl: string | null;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="chat-file-tile" onClick={onOpen} title={fileName}>
      {isImage && imageUrl ? (
        <img src={imageUrl} alt={fileName} />
      ) : (
        <span className="chat-file-tile-doc">
          {isImage ? <IconImage size={22} /> : <IconFile size={22} />}
        </span>
      )}
      <span className="chat-file-tile-name">{fileName}</span>
    </button>
  );
}

export function ChatFileSection({
  total,
  folderUrl,
  children,
}: {
  total: number;
  folderUrl: string | null;
  children: ReactNode;
}) {
  return (
    <div className="chat-info-section">
      <div className="chat-info-section-head">
        <span>Files{total > 0 ? ` (${total})` : ''}</span>
        {folderUrl ? (
          <a className="chat-info-link" href={folderUrl} target="_blank" rel="noopener noreferrer">
            Tất cả
          </a>
        ) : null}
      </div>
      {children}
    </div>
  );
}