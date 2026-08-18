export type ZaloSenderType = 'user' | 'bot' | 'operator' | 'system';

export type ZaloLabel = {
  id: string;
  name: string;
  color: string;
  emoji?: string;
};

export type ZaloFolderConfig = {
  ragFolderId?: string;
  faqFolderId?: string;
  label?: string;
};

export type ZaloMention = { uid?: string; pos: number; len: number; type?: string };

export type ZaloAttachment = {
  kind?: string;
  href?: string;
  thumb?: string;
  title?: string;
  fileName?: string;
};

export type ZaloQuote = {
  from: string;
  msg: string;
  attach?: ZaloAttachment | null;
  globalMsgId?: string;
};

export type ZaloMessage = {
  id: string;
  zalo_msg_id?: string;
  sender_type: ZaloSenderType;
  sender_display_name?: string;
  operator_display_name?: string;
  sender_avatar_url?: string;
  sender_zalo_uid?: string;
  content: string;
  msg_type?: string;
  mentions?: ZaloMention[];
  quote?: ZaloQuote | null;
  files?: ZaloAttachment[];
  zalo_created_at: string;
};

export type ZaloStaffUser = {
  id: string;
  zalo_uid: string;
  display_name: string;
  avatar_url?: string;
  is_bot_account?: boolean;
  user_group_ids?: string[];
};

export type ZaloUserGroup = {
  id: string;
  name: string;
  group_type: 'internal' | 'external';
  description?: string;
  member_count?: number;
};

export type ZaloMember = {
  id: string;
  zalo_uid: string;
  display_name: string;
  avatar_url?: string;
};

export type ZaloConversation = {
  id: string;
  zalo_thread_id: string;
  name: string;
  avatar_url?: string;
  is_group: boolean;
  ai_enabled: boolean;
  unread_count: number;
  has_external_unread?: boolean;
  notify_grace_minutes?: number;
  last_message_at: string;
  last_preview?: string;
  zalo_labels: ZaloLabel[];
};

export type ZaloSource = {
  id: string;
  name: string;
};

export type ZaloInboxData = {
  folderMap: Record<string, ZaloFolderConfig>;
  labels: ZaloLabel[];
  conversations: ZaloConversation[];
  members: Record<string, ZaloMember[]>;
  messages: Record<string, ZaloMessage[]>;
};

export function emptyZaloInbox(): ZaloInboxData {
  return { folderMap: {}, labels: [], conversations: [], members: {}, messages: {} };
}

export function zaloLabelName(label: Pick<ZaloLabel, 'name' | 'emoji'>): string {
  const emoji = (label.emoji || '').trim();
  const name = (label.name || '').trim();
  return emoji && name && !name.startsWith(emoji) ? `${emoji} ${name}` : name || emoji;
}

export function zaloHasFolder(map: Record<string, ZaloFolderConfig>, threadId: string): boolean {
  const cfg = map[String(threadId)];
  return !!(cfg && (cfg.ragFolderId || cfg.faqFolderId));
}

export function zaloFolderText(
  map: Record<string, ZaloFolderConfig>,
  threadId: string,
): string | null {
  const cfg = map[String(threadId)];
  if (!cfg) return null;
  return cfg.label || cfg.ragFolderId || cfg.faqFolderId || null;
}

export function zaloFmtTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function zaloListTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return zaloFmtTime(value);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) return date.toLocaleDateString('vi-VN', { weekday: 'short' });
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function zaloDayLabel(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Hôm nay';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

export function mergeZaloMessages(current: ZaloMessage[], incoming: ZaloMessage[]): ZaloMessage[] {
  const map = new Map<string, ZaloMessage>();
  for (const msg of current) map.set(msg.id, msg);
  for (const msg of incoming) {
    const prev = map.get(msg.id);
    if (prev && !(msg.files && msg.files.length) && prev.files?.length) {
      map.set(msg.id, { ...msg, files: prev.files });
    } else {
      map.set(msg.id, msg);
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.zalo_created_at).getTime() - new Date(b.zalo_created_at).getTime(),
  );
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|jfif)(\?|#|$)/i;

export function zaloIsImageUrl(url?: string | null): boolean {
  if (!url || !/^https?:\/\//i.test(url.trim())) return false;
  const href = url.trim();
  if (IMAGE_EXT.test(href)) return true;
  if (/zdn\.vn/i.test(href) && /\/(jpg|jpeg|png|gif|webp|photo)/i.test(href)) return true;
  return false;
}

export function zaloIsImageAttachment(file: ZaloAttachment): boolean {
  const kind = (file.kind || '').toLowerCase();
  if (kind.includes('photo') || kind.includes('image') || kind === 'img') return true;
  return zaloIsImageUrl(file.thumb || file.href);
}

export function zaloAttachmentName(file: ZaloAttachment): string {
  const named = (file.fileName || file.title || '').trim();
  if (named) return named.split(/[\\/]/).pop() || named;
  const href = (file.href || '').trim();
  if (/^https?:\/\//i.test(href)) {
    try {
      const base = decodeURIComponent(new URL(href).pathname.split('/').pop() || '');
      if (base && !/^[a-f0-9]{12,}$/i.test(base)) return base;
    } catch {
      /* ignore */
    }
  }
  return 'Tệp đính kèm';
}

export function zaloMessageAttachments(msg: ZaloMessage): ZaloAttachment[] {
  const listed = [...(msg.files || [])];
  const text = (msg.content || '').trim();
  if (listed.length === 0 && (text.startsWith('{') || text.startsWith('['))) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const href = String(rec.href ?? rec.url ?? rec.oriUrl ?? rec.thumb ?? '');
        const fileName = String(rec.fileName ?? rec.file_name ?? rec.name ?? rec.title ?? '');
        if (href || fileName) {
          listed.push({
            href: href || undefined,
            fileName: fileName || undefined,
            thumb: String(rec.thumb ?? rec.thumbnail ?? '') || undefined,
            kind: String(rec.kind ?? rec.type ?? rec.fileExt ?? '') || undefined,
          });
        }
      }
    } catch {
      /* not json */
    }
  }
  if (listed.length === 0 && /^https?:\/\//i.test(text)) {
    listed.push({
      href: text,
      kind: zaloIsImageUrl(text) ? 'photo' : 'file',
      fileName: text.split('/').pop() || text,
    });
  }
  const type = (msg.msg_type || '').toLowerCase();
  if (type.includes('photo') || type.includes('image')) {
    return listed.map((file) => ({ ...file, kind: file.kind || 'photo' }));
  }
  if ((type.includes('file') || type.includes('attach')) && listed.length === 0 && text && !/^https?:/i.test(text)) {
    listed.push({ fileName: text, kind: 'file' });
  }
  return listed;
}

export function zaloContentIsAttachmentOnly(msg: ZaloMessage): boolean {
  const text = (msg.content || '').trim();
  if (!text) return true;
  const files = zaloMessageAttachments(msg);
  if (!files.length) return false;
  if (text.startsWith('{') || text.startsWith('[')) return true;
  if (!/^https?:\/\//i.test(text)) return false;
  return files.some((file) => file.href === text || file.thumb === text);
}

export function zaloDownloadHref(url: string, fileName: string) {
  void (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName || 'download';
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  })();
}

export function zaloQuotePreview(msg: ZaloMessage): string {
  const text = (msg.content || '').replace(/\n/g, ' ').trim();
  if (text && !zaloContentIsAttachmentOnly(msg)) return text;
  const files = zaloMessageAttachments(msg);
  if (files.some(zaloIsImageAttachment)) return '[Hình ảnh]';
  if (files.length) return files[0].fileName || files[0].title || '[Tệp đính kèm]';
  return 'Tin nhắn';
}

export function zaloQuoteHasContent(quote?: ZaloQuote | null): boolean {
  if (!quote) return false;
  return !!(quote.from || quote.msg.trim() || quote.attach?.href);
}

export function zaloQuoteText(quote: ZaloQuote): string {
  const msg = (quote.msg || '').replace(/\n/g, ' ').trim();
  if (msg && !zaloIsImageUrl(msg)) return msg;
  if (quote.attach && zaloIsImageAttachment(quote.attach)) return '[Hình ảnh]';
  if (quote.attach) return quote.attach.fileName || quote.attach.title || '[Tệp đính kèm]';
  if (msg) return '[Hình ảnh]';
  return 'Tin nhắn';
}

export function zaloQuoteThumb(quote: ZaloQuote): string | null {
  if (quote.attach && zaloIsImageAttachment(quote.attach)) {
    return quote.attach.thumb || quote.attach.href || null;
  }
  if (quote.msg && zaloIsImageUrl(quote.msg)) return quote.msg;
  return null;
}
