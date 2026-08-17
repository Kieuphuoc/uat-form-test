/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Base File.Api, khớp Form:Files:BaseUrl */
  readonly VITE_FILES_BASE_URL?: string;
  /** Base files-web cho preview iframe. */
  readonly VITE_FILES_WEB_URL?: string;
  /** Base Arito.Chat.Api */
  readonly VITE_CHAT_API_URL?: string;
  /** Base Arito.Notification.Api cho preference CHAT / Firebase. */
  readonly VITE_NOTI_API_URL?: string;
  /** Cạnh dài tối đa (px) khi resize ảnh chat ở client trước khi upload. */
  readonly VITE_CHAT_IMAGE_MAX_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
