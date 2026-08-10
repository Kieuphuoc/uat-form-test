/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Base File.Api, khớp Form:Files:BaseUrl */
  readonly VITE_FILES_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
