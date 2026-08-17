export type ChatThemeId =
  | 'default'
  | 'navy'
  | 'ocean'
  | 'sky'
  | 'forest'
  | 'sunset'
  | 'grape'
  | 'rose'
  | 'slate'
  | 'midnight';

export type ChatThemePreset = {
  id: ChatThemeId;
  name: string;
  hint: string;
  threadBg: string;
  mineBg: string;
  mineFg: string;
  theirsBg: string;
  theirsFg: string;
  accent: string;
};

/** 10 mẫu giao diện tin nhắn — lưu theo unit_id. */
export const CHAT_THEMES: ChatThemePreset[] = [
  {
    id: 'default',
    name: 'Arito xanh',
    hint: 'Mặc định',
    threadBg: '#f4f6f8',
    mineBg: '#0b6e4f',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#1a2332',
    accent: '#0b6e4f',
  },
  {
    id: 'navy',
    name: 'Xanh than',
    hint: 'Arito navy',
    threadBg: '#eef2f7',
    mineBg: '#001854',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#0f172a',
    accent: '#1b4a8d',
  },
  {
    id: 'ocean',
    name: 'Biển',
    hint: 'Xanh dương',
    threadBg: '#e8f3fb',
    mineBg: '#0369a1',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#0c4a6e',
    accent: '#0284c7',
  },
  {
    id: 'sky',
    name: 'Trời',
    hint: 'Xanh nhạt',
    threadBg: '#f0f9ff',
    mineBg: '#38bdf8',
    mineFg: '#0f172a',
    theirsBg: '#ffffff',
    theirsFg: '#0f172a',
    accent: '#0ea5e9',
  },
  {
    id: 'forest',
    name: 'Rừng',
    hint: 'Xanh đậm',
    threadBg: '#eef6ee',
    mineBg: '#166534',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#14532d',
    accent: '#15803d',
  },
  {
    id: 'sunset',
    name: 'Hoàng hôn',
    hint: 'Cam ấm',
    threadBg: '#fff7ed',
    mineBg: '#ea580c',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#7c2d12',
    accent: '#f97316',
  },
  {
    id: 'grape',
    name: 'Nho',
    hint: 'Tím',
    threadBg: '#f5f3ff',
    mineBg: '#6d28d9',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#4c1d95',
    accent: '#7c3aed',
  },
  {
    id: 'rose',
    name: 'Hồng',
    hint: 'Hồng san hô',
    threadBg: '#fff1f2',
    mineBg: '#e11d48',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#881337',
    accent: '#f43f5e',
  },
  {
    id: 'slate',
    name: 'Xám',
    hint: 'Trung tính',
    threadBg: '#f1f5f9',
    mineBg: '#334155',
    mineFg: '#ffffff',
    theirsBg: '#ffffff',
    theirsFg: '#0f172a',
    accent: '#475569',
  },
  {
    id: 'midnight',
    name: 'Đêm',
    hint: 'Nền tối',
    threadBg: '#0f172a',
    mineBg: '#22c55e',
    mineFg: '#052e16',
    theirsBg: '#1e293b',
    theirsFg: '#e2e8f0',
    accent: '#22c55e',
  },
];

export function normalizeChatTheme(raw?: string | null): ChatThemeId {
  const id = (raw ?? '').trim().toLowerCase();
  return CHAT_THEMES.some((theme) => theme.id === id) ? (id as ChatThemeId) : 'default';
}
