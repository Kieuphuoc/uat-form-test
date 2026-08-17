/**
 * Kiểu dữ liệu hội thoại Zalo — khớp mockup / tài liệu API sẽ gửi sau.
 * Trang /chat/zalo hiện chỉ dùng mock; không gọi Chat.Api hay SignalR.
 */

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

export type ZaloMention = { pos: number; len: number };

export type ZaloQuote = { from: string; msg: string };

export type ZaloMessage = {
  id: string;
  sender_type: ZaloSenderType;
  sender_display_name?: string;
  content: string;
  mentions?: ZaloMention[];
  quote?: ZaloQuote | null;
  files?: string[];
  zalo_created_at: string;
};

export type ZaloMember = {
  id: string;
  zalo_uid: string;
  display_name: string;
};

export type ZaloConversation = {
  id: string;
  zalo_thread_id: string;
  name: string;
  is_group: boolean;
  ai_enabled: boolean;
  unread_count: number;
  has_external_unread?: boolean;
  last_message_at: string;
  zalo_labels: ZaloLabel[];
};

export type ZaloInboxData = {
  folderMap: Record<string, ZaloFolderConfig>;
  labels: ZaloLabel[];
  conversations: ZaloConversation[];
  members: Record<string, ZaloMember[]>;
  messages: Record<string, ZaloMessage[]>;
  older: Record<string, ZaloMessage[]>;
};

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

export function zaloUid(prefix = 'm'): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function zaloNowIso(): string {
  return new Date().toISOString();
}

export function createZaloMockData(): ZaloInboxData {
  return structuredClone(ZALO_MOCK_SEED);
}

/** Dữ liệu mẫu — thay bằng API khi có tài liệu. */
const ZALO_MOCK_SEED: ZaloInboxData = {
  folderMap: {
    '6759761246345926212': {
      ragFolderId: '588eaec654224a17a19f93a0d321c2ee',
      faqFolderId: '6ab1fd74c284477eb9416567ba23e486',
      label: 'PTSP test',
    },
  },
  labels: [
    { id: 'l1', name: 'VIP', color: '#FF3656', emoji: '' },
    { id: 'l2', name: 'Đang xử lý', color: '#FFB020', emoji: '' },
    { id: 'l3', name: 'Đã xong', color: '#28C76F', emoji: '' },
  ],
  conversations: [
    {
      id: 'c1',
      zalo_thread_id: '6759761246345926212',
      name: 'PTSP test',
      is_group: true,
      ai_enabled: true,
      unread_count: 2,
      has_external_unread: true,
      last_message_at: '2026-08-17T06:18:00.000Z',
      zalo_labels: [{ id: 'l1', name: 'VIP', color: '#FF3656' }],
    },
    {
      id: 'c2',
      zalo_thread_id: '7453815299673592570',
      name: 'CSKH miền Nam',
      is_group: true,
      ai_enabled: true,
      unread_count: 0,
      last_message_at: '2026-08-17T04:02:00.000Z',
      zalo_labels: [{ id: 'l2', name: 'Đang xử lý', color: '#FFB020' }],
    },
    {
      id: 'c3',
      zalo_thread_id: '3613312928662407048',
      name: 'Nhóm nội bộ Arito',
      is_group: true,
      ai_enabled: false,
      unread_count: 0,
      last_message_at: '2026-08-16T10:40:00.000Z',
      zalo_labels: [],
    },
    {
      id: 'c4',
      zalo_thread_id: '620136081189487414',
      name: 'Minh — chat cá nhân',
      is_group: false,
      ai_enabled: true,
      unread_count: 1,
      last_message_at: '2026-08-17T01:08:00.000Z',
      zalo_labels: [],
    },
  ],
  members: {
    c1: [
      { id: 'u1', zalo_uid: '111', display_name: 'Hoa' },
      { id: 'u2', zalo_uid: '222', display_name: 'Minh' },
      { id: 'u3', zalo_uid: '333', display_name: 'Lan' },
    ],
    c2: [
      { id: 'u4', zalo_uid: '444', display_name: 'Phúc' },
      { id: 'u5', zalo_uid: '555', display_name: 'Trang' },
    ],
    c3: [
      { id: 'u6', zalo_uid: '666', display_name: 'Bảo' },
      { id: 'u7', zalo_uid: '777', display_name: 'An' },
    ],
    c4: [{ id: 'u2', zalo_uid: '222', display_name: 'Minh' }],
  },
  messages: {
    c1: [
      {
        id: 'old1',
        sender_type: 'user',
        sender_display_name: 'Hoa',
        content: 'Shop ơi đơn hôm qua giao chưa ạ?',
        zalo_created_at: '2026-08-16T08:10:00.000Z',
      },
      {
        id: 's1',
        sender_type: 'system',
        content: '✓ AI đã bật cho hội thoại này',
        zalo_created_at: '2026-08-17T05:00:00.000Z',
      },
      {
        id: 'm1',
        sender_type: 'user',
        sender_display_name: 'Hoa',
        content: 'Shop ơi, đơn hôm nay giao lúc mấy giờ ạ?',
        zalo_created_at: '2026-08-17T06:10:00.000Z',
      },
      {
        id: 'm2',
        sender_type: 'bot',
        content: 'Đơn của bạn dự kiến giao trong khung 14:00–16:00 hôm nay ạ.',
        zalo_created_at: '2026-08-17T06:11:00.000Z',
      },
      {
        id: 'm3',
        sender_type: 'user',
        sender_display_name: 'Lan',
        content: '@Minh kiểm tra giúp đơn #A102 nhé',
        mentions: [{ pos: 0, len: 5 }],
        zalo_created_at: '2026-08-17T06:15:00.000Z',
      },
      {
        id: 'm4',
        sender_type: 'operator',
        sender_display_name: 'Bạn (Thủ công)',
        content: 'Mình đã kiểm tra, tài xế đang trên đường.',
        zalo_created_at: '2026-08-17T06:18:00.000Z',
      },
    ],
    c2: [
      {
        id: 'n1',
        sender_type: 'user',
        sender_display_name: 'Phúc',
        content: 'Khách hỏi chính sách đổi trả 7 ngày còn áp dụng không?',
        zalo_created_at: '2026-08-17T03:50:00.000Z',
      },
      {
        id: 'n2',
        sender_type: 'bot',
        content: 'Chính sách đổi trả 7 ngày vẫn áp dụng với sản phẩm còn tem, chưa qua sử dụng.',
        zalo_created_at: '2026-08-17T03:51:00.000Z',
      },
    ],
    c3: [
      {
        id: 'o1',
        sender_type: 'user',
        sender_display_name: 'Bảo',
        content: 'Nhóm này tạm tắt AI, mình trả lời tay.',
        zalo_created_at: '2026-08-16T10:40:00.000Z',
      },
      {
        id: 'o2',
        sender_type: 'system',
        content: 'AI đã tắt cho hội thoại này',
        zalo_created_at: '2026-08-16T10:40:10.000Z',
      },
    ],
    c4: [
      {
        id: 'p1',
        sender_type: 'user',
        sender_display_name: 'Minh',
        content: 'Cho mình xin báo giá gói PTSP tháng 8.',
        zalo_created_at: '2026-08-17T01:08:00.000Z',
      },
    ],
  },
  older: {
    c1: [
      {
        id: 'older1',
        sender_type: 'user',
        sender_display_name: 'Minh',
        content: 'Mình gửi ảnh bill đây.',
        zalo_created_at: '2026-08-15T09:00:00.000Z',
      },
    ],
  },
};
