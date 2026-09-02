/**
 * Helper phía app cha — nhúng iframe Knowledge editor (FAQ / form-web).
 * Protocol khớp arito-knowledge/src/lib/embedEditorProtocol.ts
 */

export const EMBED_EDITOR_PROTOCOL = 'arito-embed-editor-v1' as const;

export type EmbedEditorContentFormat = 'md' | 'json';
export type EmbedEditorMode = 'view' | 'edit';

export type EmbedEditorFileMeta = {
  id: string;
  scope: string;
  status: number;
  url: string;
  meta: {
    client_name: string;
    ext: string;
    size_kb: number;
    content_type: string;
    sizes?: number[];
  };
  app_id?: string | null;
  folder_id?: string | null;
};

export type EmbedEditorInitMessage = {
  type: 'arito-embed-editor-init';
  protocol: typeof EMBED_EDITOR_PROTOCOL;
  sessionId?: string;
  title?: string;
  content?: string;
  format?: EmbedEditorContentFormat;
  mode?: EmbedEditorMode;
};

export type EmbedEditorSubmitMessage = {
  type: 'arito-embed-editor-submit';
  protocol: typeof EMBED_EDITOR_PROTOCOL;
  sessionId?: string;
  title: string;
  content: string;
  format: EmbedEditorContentFormat;
  fileIds: string[];
  files: EmbedEditorFileMeta[];
};

type EmbedEditorMessage = {
  type: string;
  protocol?: string;
  sessionId?: string;
};

function isEmbedEditorMessage(data: unknown): data is EmbedEditorMessage {
  return typeof data === 'object' && data !== null
    && (data as EmbedEditorMessage).protocol === EMBED_EDITOR_PROTOCOL
    && typeof (data as EmbedEditorMessage).type === 'string';
}

export type EmbedEditorClientOptions = {
  knowledgeBaseUrl: string;
  folderId: string;
  mode?: EmbedEditorMode;
  format?: EmbedEditorContentFormat;
  sessionId?: string;
  parentOrigin?: string;
  iframe?: HTMLIFrameElement;
};

export type EmbedEditorOpenPayload = {
  title?: string;
  content?: string;
  format?: EmbedEditorContentFormat;
  mode?: EmbedEditorMode;
};

export type EmbedEditorSubmitResult = Omit<EmbedEditorSubmitMessage, 'type' | 'protocol'>;

export type EmbedEditorClient = {
  iframe: HTMLIFrameElement;
  open: (payload?: EmbedEditorOpenPayload) => Promise<EmbedEditorSubmitResult | null>;
  destroy: () => void;
};

export function buildEmbedEditorSrc(
  opts: EmbedEditorClientOptions & { sessionId: string; parentOrigin: string },
): string {
  const base = opts.knowledgeBaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    embed: 'editor',
    folderId: opts.folderId,
    mode: opts.mode ?? 'edit',
    format: opts.format ?? 'md',
    sessionId: opts.sessionId,
    parentOrigin: opts.parentOrigin,
  });
  return `${base}/embed/editor?${params.toString()}`;
}

export function createEmbedEditorClient(opts: EmbedEditorClientOptions): EmbedEditorClient {
  const sessionId = opts.sessionId ?? crypto.randomUUID();
  const parentOrigin = opts.parentOrigin ?? window.location.origin;
  const knowledgeOrigin = new URL(opts.knowledgeBaseUrl).origin;

  const iframe = opts.iframe ?? document.createElement('iframe');
  iframe.src = buildEmbedEditorSrc({ ...opts, sessionId, parentOrigin });
  iframe.title = 'Arito embed editor';
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  let iframeReady = false;
  let pendingOpen: {
    resolve: (v: EmbedEditorSubmitResult | null) => void;
    payload?: EmbedEditorOpenPayload;
  } | null = null;

  const sendInit = (payload?: EmbedEditorOpenPayload) => {
    if (!iframe.contentWindow) return;
    const init: EmbedEditorInitMessage = {
      type: 'arito-embed-editor-init',
      protocol: EMBED_EDITOR_PROTOCOL,
      sessionId,
      title: payload?.title ?? '',
      content: payload?.content ?? '',
      format: payload?.format ?? opts.format ?? 'md',
      mode: payload?.mode ?? opts.mode ?? 'edit',
    };
    iframe.contentWindow.postMessage(init, knowledgeOrigin);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== knowledgeOrigin) return;
    if (!isEmbedEditorMessage(event.data)) return;
    if (event.data.sessionId && event.data.sessionId !== sessionId) return;

    if (event.data.type === 'arito-embed-editor-ready') {
      iframeReady = true;
      if (pendingOpen) sendInit(pendingOpen.payload);
      return;
    }

    if (event.data.type === 'arito-embed-editor-submit') {
      const submit = event.data as EmbedEditorSubmitMessage;
      pendingOpen?.resolve({
        sessionId: submit.sessionId,
        title: submit.title,
        content: submit.content,
        format: submit.format,
        fileIds: submit.fileIds,
        files: submit.files,
      });
      pendingOpen = null;
      return;
    }

    if (event.data.type === 'arito-embed-editor-cancel') {
      pendingOpen?.resolve(null);
      pendingOpen = null;
    }
  };

  window.addEventListener('message', onMessage);

  return {
    iframe,
    open(payload) {
      return new Promise((resolve) => {
        pendingOpen = { resolve, payload };
        if (iframeReady) sendInit(payload);
      });
    },
    destroy() {
      window.removeEventListener('message', onMessage);
      pendingOpen = null;
      iframeReady = false;
    },
  };
}
