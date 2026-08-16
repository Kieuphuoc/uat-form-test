import { useEffect, useState } from 'react';
import { chatApi, chatAvatarUrl } from '../../api/chatApi';

type Props = {
  name?: string | null;
  avatarId?: string | null;
  size?: number;
  group?: boolean;
  /** Ảnh nhóm nằm trong folder hội thoại → tải qua Chat.Api (cần quyền thành viên). */
  conversationId?: number | null;
  fileId?: string | null;
};

function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const blobUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/**
 * Blob URL của file chat, cache theo `${conversationId}:${fileId}` để list, header và panel
 * thông tin dùng chung một lần tải; đổi ảnh sinh file_id mới nên cache tự hết hiệu lực.
 */
export function useChatFileUrl(
  conversationId?: number | null,
  fileId?: string | null,
): string | null {
  const key = conversationId && fileId ? `${conversationId}:${fileId}` : null;
  const [url, setUrl] = useState<string | null>(() => (key ? blobUrls.get(key) ?? null : null));

  useEffect(() => {
    if (!key || !conversationId || !fileId) {
      setUrl(null);
      return;
    }
    const cached = blobUrls.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }

    let disposed = false;
    let request = inflight.get(key);
    if (!request) {
      request = chatApi
        .attachmentBlob(conversationId, fileId)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          blobUrls.set(key, objectUrl);
          return objectUrl;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, request);
    }
    void request.then(
      (value) => {
        if (!disposed) setUrl(value);
      },
      () => {
        if (!disposed) setUrl(null);
      },
    );

    return () => {
      disposed = true;
    };
  }, [key, conversationId, fileId]);

  return url;
}

/** Avatar File.Api; lỗi tải hoặc không có avatar_id → chữ cái đầu. */
export function ChatAvatar({
  name,
  avatarId,
  size = 44,
  group = false,
  conversationId,
  fileId,
}: Props) {
  // Nhớ đúng src đã hỏng (không phải cờ boolean) để src mới vẫn được thử lại
  // mà src cũ không rơi vào vòng lặp render ↔ onError.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const chatFileUrl = useChatFileUrl(conversationId, fileId);
  const source = chatFileUrl ?? chatAvatarUrl(avatarId);
  const url = source && source !== brokenSrc ? source : null;

  return (
    <span
      className={`chat-avatar${group ? ' chat-avatar--group' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size / 2.8)) }}
      title={name ?? undefined}
    >
      {url ? (
        <img src={url} alt="" onError={() => setBrokenSrc(url)} />
      ) : (
        <span aria-hidden>{group ? 'N' : initials(name)}</span>
      )}
    </span>
  );
}
