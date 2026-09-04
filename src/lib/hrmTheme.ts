/**
 * Vai trò màu cho `/runtime/hrm`.
 * Nguồn sự thật: CSS variables `--hrm-*` trên `:root` trong `styles.css`.
 * `[data-runtime-slug='hrm']` alias sang `--primary`, `--secondary`, …
 *
 * | Token        | Vai trò                          | Dùng cho                          |
 * |--------------|----------------------------------|-----------------------------------|
 * | primary      | Thương hiệu (indigo đậm)         | Header dashboard; navbar          |
 * | secondary    | Nhấn phụ indigo                  | Chip lịch, banner, thẻ vị trí     |
 * | accent       | CTA khẳng định (dùng bản soft)   | Chấm công xong, nút Đóng nhạt     |
 * | bg           | Nền trang                        | Body form stack                   |
 * | surface      | Bề mặt nổi                       | Ô nhập, thẻ, popup                |
 * | text / muted | Nội dung / nhãn                  | Giá trị field / label             |
 * | line         | Viền phân tách                   | Border, divider                   |
 * | danger       | Cảnh báo / xóa                   | Destructive actions               |
 */
export type HrmTileTheme = 'yellow' | 'red' | 'blue' | 'grey' | 'green' | 'purple';

/** Màu khung icon dashboard — cùng token với màn Chấm công. */
export function hrmIconButtonTheme(label: string): HrmTileTheme {
  const t = label.trim().toLowerCase();
  if (/chấm\s*công|cham.?cong|attendance|check.?in|điểm danh/.test(t)) return 'yellow';
  if (/^thêm$|^add$|\+|tạo mới/.test(t)) return 'grey';
  if (/chờ duyệt|cho duyet|pending|phê duyệt/.test(t)) return 'red';
  if (/chat|nội bộ|noi bo/.test(t)) return 'green';
  if (/booking|đặt phòng|lich|lịch/.test(t) && !/tài liệu|tai lieu/.test(t)) return 'grey';
  if (/zalo/.test(t)) return 'blue';
  return 'blue';
}

/** Mirror `--hrm-*` trên `:root` — dùng khi cần giá trị hex trong TS (canvas, v.v.). */
export const HRM_COLOR = {
  primary: '#001854',
  primaryHover: '#0b1f5c',
  secondary: '#1d4ed8',
  secondarySoft: '#e8eef8',
  accent: '#0b6e4f',
  accentHover: '#095c42',
  accentSoft: '#e7f5ef',
  bg: '#f4f5fa',
  surface: '#ffffff',
  text: '#1a2332',
  muted: '#6b7280',
  line: '#e2e8f0',
  danger: '#dc2626',
  onPrimary: '#ffffff',
  onAccent: '#ffffff',
} as const;

/** Tên CSS custom property tương ứng — ưu tiên dùng trong style inline / theme hook. */
export const HRM_CSS_VAR = {
  primary: '--hrm-primary',
  primaryHover: '--hrm-primary-hover',
  secondary: '--hrm-secondary',
  secondarySoft: '--hrm-secondary-soft',
  accent: '--hrm-accent',
  accentHover: '--hrm-accent-hover',
  accentSoft: '--hrm-accent-soft',
  bg: '--hrm-bg',
  surface: '--hrm-surface',
  text: '--hrm-text',
  muted: '--hrm-muted',
  line: '--hrm-line',
  danger: '--hrm-danger',
  onPrimary: '--hrm-on-primary',
  onAccent: '--hrm-on-accent',
} as const;
