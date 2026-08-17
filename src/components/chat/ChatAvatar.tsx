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
  /** URL tĩnh (chatbot) — ưu tiên hơn avatar AritoID. */
  imageSrc?: string | null;
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
 * Blob URL của file chat, cache theo `${conversationId}:${fileId}:${size}` để list, header và panel
 * thông tin dùng chung một lần tải; đổi ảnh sinh file_id mới nên cache tự hết hiệu lực.
 * `size` > 0 lấy bản resize sẵn của File.Api (Cache-Control của Chat.Api giữ tiếp ở disk cache).
 */
export function useChatFileUrl(
  conversationId?: number | null,
  fileId?: string | null,
  size = 0,
): string | null {
  const key = conversationId && fileId ? `${conversationId}:${fileId}:${size}` : null;
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
        .attachmentBlob(conversationId, fileId, size)
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
  }, [key, conversationId, fileId, size]);

  return url;
}

/** Cạnh dài bản thumbnail dùng cho avatar (File.Api sinh sẵn khi upload). */
const AVATAR_THUMB_SIZE = 64;

/** Avatar File.Api; lỗi tải hoặc không có avatar_id → chữ cái đầu. */
export function ChatAvatar({
  name,
  avatarId,
  size = 44,
  group = false,
  conversationId,
  fileId,
  imageSrc,
}: Props) {
  // Nhớ đúng src đã hỏng (không phải cờ boolean) để src mới vẫn được thử lại
  // mà src cũ không rơi vào vòng lặp render ↔ onError.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const chatFileUrl = useChatFileUrl(conversationId, fileId, AVATAR_THUMB_SIZE);
  const source = imageSrc || chatFileUrl || chatAvatarUrl(avatarId);
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
