import type { ClientFormDto } from '../types/form';
import { resolveLocalizedText, type LangCode } from './localizedText';
import { hrmComingSoonFeature, isHrmAttendanceForm, isHrmComingSoonForm } from './hrmAttendance';

export const PENDING_RE = /chờ\s*duyệt|cho\s*duyet|pending|to[\s_-]*approve|cần\s*duyệt|can\s*duyet|\binbox\b/i;

function formHaystack(form: ClientFormDto): string {
  const title =
    typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  const listIds = (form.lists ?? []).map((l) => l.id).join(' ');
  return `${form.id} ${title} ${listIds}`;
}

/** Inbox phiếu chờ duyệt trên `/runtime/hrm` (list thật hoặc placeholder Sắp ra mắt). */
export function isHrmPendingForm(
  slug: string,
  form: ClientFormDto,
  values: Record<string, unknown> = {},
  lan: LangCode = 'v',
): boolean {
  if (slug !== 'hrm') return false;
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  if (isHrmAttendanceForm(slug, form)) return false;
  if (PENDING_RE.test(formHaystack(form))) return true;
  if (!isHrmComingSoonForm(slug, form)) return false;
  const feat = hrmComingSoonFeature(form, values, lan);
  return feat ? PENDING_RE.test(feat) : false;
}

export function hrmPendingChromeTitle(
  form: ClientFormDto,
  values: Record<string, unknown>,
  lan: LangCode,
): string {
  const t = resolveLocalizedText(form.title, lan).trim();
  if (PENDING_RE.test(t)) return t;
  const feat = hrmComingSoonFeature(form, values, lan);
  if (feat && PENDING_RE.test(feat)) return feat.trim();
  return t || 'Chờ duyệt';
}

export function pendingStatusKind(text: string): 'wait' | 'ok' | 'no' | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const lower = t.toLowerCase();
  if (/từ chối|tu choi|reject|denied|hủy/.test(lower)) return 'no';
  if (/đã duyệt|da duyet|approved|completed|xong/.test(lower)) return 'ok';
  if (/chờ|pending|wait|mới|\bnew\b/.test(lower)) return 'wait';
  return undefined;
}

export type PendingTabId = 'all' | 'wait' | 'ok' | 'no';

export const PENDING_TABS: { id: PendingTabId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'wait', label: 'Chờ duyệt' },
  { id: 'ok', label: 'Đã duyệt' },
  { id: 'no', label: 'Từ chối' },
];

export function pendingRowStatus(row: Record<string, unknown>, metaField?: string): string {
  if (metaField) {
    const m = String(row[metaField] ?? '').trim();
    if (m) return m;
  }
  for (const [k, v] of Object.entries(row)) {
    if (!/trang.?thai|status|state/i.test(k)) continue;
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

export function pendingRowKind(
  row: Record<string, unknown>,
  metaField?: string,
): 'wait' | 'ok' | 'no' {
  return pendingStatusKind(pendingRowStatus(row, metaField)) ?? 'wait';
}

export function pendingRowMatchesQuery(row: Record<string, unknown>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q));
}

export function countPendingRows(
  rows: Record<string, unknown>[],
  metaField?: string,
): Record<PendingTabId, number> {
  const counts: Record<PendingTabId, number> = { all: rows.length, wait: 0, ok: 0, no: 0 };
  for (const row of rows) {
    counts[pendingRowKind(row, metaField)] += 1;
  }
  return counts;
}

const SENDER_RE = /nguoi.?gui|requester|ho.?ten|ten.?nv|user.?name|^name$|^ten$|created.?by|sender|employee|staff/i;
const TYPE_RE = /loai.?don|loai|type|title|ten.?don|feature|chuc.?nang|subject/i;
const TIME_RE = /thoi.?gian|ngay|date|time|created|updated|han/i;
const NOTE_RE = /ghi.?chu|note|remark|ly.?do|reason|comment|noidung|noi.?dung/i;
const SKIP_RE = /^(id|_id|key|stt)$/i;

function takeField(row: Record<string, unknown>, used: Set<string>, re: RegExp): string | undefined {
  for (const [k, v] of Object.entries(row)) {
    if (used.has(k) || SKIP_RE.test(k) || !re.test(k)) continue;
    const s = String(v ?? '').trim();
    if (!s) continue;
    used.add(k);
    return s;
  }
  return undefined;
}

export type PendingDetailModel = {
  sender?: string;
  type?: string;
  time?: string;
  note?: string;
  status?: string;
  statusKind?: 'wait' | 'ok' | 'no';
  extras: { label: string; value: string }[];
};

export function pendingDetailModel(
  row: Record<string, unknown>,
  metaField?: string,
): PendingDetailModel {
  const used = new Set<string>();
  const sender = takeField(row, used, SENDER_RE);
  const type = takeField(row, used, TYPE_RE);
  const time = takeField(row, used, TIME_RE);
  const note = takeField(row, used, NOTE_RE);
  const status = pendingRowStatus(row, metaField);
  if (metaField) used.add(metaField);
  for (const k of Object.keys(row)) {
    if (/trang.?thai|status|state/i.test(k)) used.add(k);
  }
  const extras: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (used.has(k) || SKIP_RE.test(k)) continue;
    const s = String(v ?? '').trim();
    if (!s) continue;
    extras.push({ label: k.replace(/_/g, ' '), value: s });
  }
  return {
    sender,
    type,
    time,
    note,
    status: status || undefined,
    statusKind: pendingStatusKind(status) ?? (status ? undefined : 'wait'),
    extras,
  };
}

export type PendingCategoryTab = 'all' | 'urgent' | 'leave' | 'ot' | 'trip' | 'attendance';

export const PENDING_CATEGORY_TABS: { id: PendingCategoryTab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'urgent', label: 'Khẩn cấp' },
  { id: 'leave', label: 'Nghỉ phép' },
  { id: 'ot', label: 'Làm thêm (OT)' },
  { id: 'trip', label: 'Công tác & Chi phí' },
  { id: 'attendance', label: 'Giải trình công' },
];

export type PendingItemModel = {
  id: string;
  type: string;
  category: PendingCategoryTab;
  sender: string;
  department: string;
  avatar?: string;
  requestDate: string;
  priority: 'urgent' | 'normal';
  dueLabel?: string;
  isOverdue?: boolean;
  reason: string;
  note?: string;
  extras?: { label: string; value: string }[];
  steps?: { name: string; status: 'done' | 'current' | 'wait'; user: string }[];
};

export const DEFAULT_PENDING_ITEMS: PendingItemModel[] = [
  {
    id: 'REQ-2026-101',
    type: 'Đơn xin nghỉ phép đột xuất',
    category: 'leave',
    sender: 'Đặng Tuấn Anh',
    department: 'Phòng Phát Triển Sản Phẩm',
    requestDate: 'Hôm nay, 08:15',
    priority: 'urgent',
    dueLabel: 'Còn 1h',
    reason: 'Gia đình có việc khẩn cấp tại quê cần về gấp',
    note: 'Đã bàn giao task sprint cho bạn Hoàng Anh phụ trách',
    extras: [
      { label: 'Loại nghỉ', value: 'Nghỉ phép năm (1 ngày)' },
      { label: 'Thời gian', value: '03/09/2026 (Hôm nay)' },
      { label: 'Người nhận bàn giao', value: 'Hoàng Anh' },
    ],
    steps: [
      { name: 'Tạo đơn', status: 'done', user: 'Đặng Tuấn Anh' },
      { name: 'Quản lý duyệt', status: 'current', user: 'Bạn' },
      { name: 'Nhân sự ghi nhận', status: 'wait', user: 'HR Team' },
    ],
  },
  {
    id: 'REQ-2026-102',
    type: 'Đăng ký làm thêm giờ (OT khẩn)',
    category: 'ot',
    sender: 'Phan Quốc Bảo',
    department: 'Đội Hạ Tầng & DevOps',
    requestDate: 'Hôm nay, 09:30',
    priority: 'urgent',
    dueLabel: 'Hạn trước 12:00',
    reason: 'Trực deploy bản nâng cấp database server cụm production',
    note: 'Yêu cầu hỗ trợ hạ tầng từ phía đối tác Cloud lúc 20:00',
    extras: [
      { label: 'Số giờ dự kiến', value: '4.0 giờ' },
      { label: 'Thời gian OT', value: '18:30 - 22:30 (03/09/2026)' },
      { label: 'Hệ số lương', value: '150% (Ca đêm ngày thường)' },
    ],
    steps: [
      { name: 'Tạo đơn', status: 'done', user: 'Phan Quốc Bảo' },
      { name: 'Lead duyệt', status: 'current', user: 'Bạn' },
      { name: 'Giám đốc phê duyệt', status: 'wait', user: 'Phạm Minh Tuấn' },
    ],
  },
  {
    id: 'REQ-2026-103',
    type: 'Đơn xin nghỉ phép năm',
    category: 'leave',
    sender: 'Trần Thu Hương',
    department: 'Phòng Kế Toán',
    requestDate: 'Hôm qua, 15:40',
    priority: 'normal',
    dueLabel: 'Còn 24h',
    reason: 'Nghỉ du lịch định kỳ cùng gia đình',
    note: 'Công việc sổ sách tháng 8 đã chốt và chuyển đối soát xong',
    extras: [
      { label: 'Số ngày', value: '2.0 ngày' },
      { label: 'Thời gian', value: '08/09/2026 - 09/09/2026' },
      { label: 'Phép tồn', value: '7.5 ngày' },
    ],
    steps: [
      { name: 'Tạo đơn', status: 'done', user: 'Trần Thu Hương' },
      { name: 'Kế toán trưởng duyệt', status: 'current', user: 'Bạn' },
    ],
  },
  {
    id: 'REQ-2026-104',
    type: 'Tạm ứng công tác phí Hà Nội',
    category: 'trip',
    sender: 'Vũ Đức Thịnh',
    department: 'Phòng Kinh Doanh Dự Án',
    requestDate: 'Hôm qua, 11:20',
    priority: 'normal',
    dueLabel: 'Còn 18h',
    reason: 'Gặp gỡ khách hàng ký kết hợp đồng triển khai giải pháp HRM',
    note: 'Bao gồm vé máy bay khứ hồi và khách sạn 2 đêm',
    extras: [
      { label: 'Số tiền tạm ứng', value: '8,500,000 VND' },
      { label: 'Thời gian công tác', value: '06/09/2026 - 08/09/2026' },
      { label: 'Địa điểm', value: 'Hà Nội' },
    ],
    steps: [
      { name: 'Tạo đề xuất', status: 'done', user: 'Vũ Đức Thịnh' },
      { name: 'Trưởng bộ phận duyệt', status: 'current', user: 'Bạn' },
      { name: 'Kế toán chi tiền', status: 'wait', user: 'Nguyễn Văn Bình' },
    ],
  },
  {
    id: 'REQ-2026-105',
    type: 'Đơn giải trình quên chấm công',
    category: 'attendance',
    sender: 'Lâm Khánh Chi',
    department: 'Phòng Thiết Kế UI/UX',
    requestDate: '02/09/2026, 17:05',
    priority: 'normal',
    dueLabel: 'Hạn cuối tuần',
    reason: 'Điện thoại hết pin lúc vào ca sáng, đã xác nhận với bảo vệ tòa nhà',
    note: 'Camera lối vào tầng 5 có ghi nhận lúc 08:25',
    extras: [
      { label: 'Ngày giải trình', value: '02/09/2026' },
      { label: 'Ca làm', value: 'Ca sáng (08:30)' },
      { label: 'Minh chứng', value: 'Xác nhận lễ tân tòa nhà' },
    ],
    steps: [
      { name: 'Gửi giải trình', status: 'done', user: 'Lâm Khánh Chi' },
      { name: 'Trưởng phòng duyệt', status: 'current', user: 'Bạn' },
      { name: 'HR hiệu chỉnh công', status: 'wait', user: 'HR System' },
    ],
  },
  {
    id: 'REQ-2026-106',
    type: 'Đăng ký làm thêm giờ (OT cuối tuần)',
    category: 'ot',
    sender: 'Ngô Thanh Sơn',
    department: 'Phòng Kỹ Thuật Lập Trình',
    requestDate: '02/09/2026, 14:15',
    priority: 'normal',
    dueLabel: 'Còn 2 ngày',
    reason: 'Fix lỗi phát sinh từ kết quả User Acceptance Testing',
    note: 'Làm việc theo yêu cầu của Product Owner',
    extras: [
      { label: 'Số giờ', value: '6.0 giờ' },
      { label: 'Thời gian', value: '08:30 - 15:30 (Thứ 7, 05/09/2026)' },
      { label: 'Hệ số lương', value: '200% (Ngày nghỉ tuần)' },
    ],
    steps: [
      { name: 'Tạo đơn', status: 'done', user: 'Ngô Thanh Sơn' },
      { name: 'Quản lý duyệt', status: 'current', user: 'Bạn' },
    ],
  },
  {
    id: 'REQ-2026-107',
    type: 'Đơn nghỉ chế độ ốm đau',
    category: 'leave',
    sender: 'Bùi Phương Thảo',
    department: 'Phòng CSKH & Vận Hành',
    requestDate: '01/09/2026, 16:30',
    priority: 'normal',
    dueLabel: 'Còn 3 ngày',
    reason: 'Khám và điều trị tại bệnh viện theo chỉ định của bác sĩ',
    note: 'Đã đính kèm giấy nghỉ hưởng BHXH của bệnh viện',
    extras: [
      { label: 'Số ngày nghỉ', value: '3.0 ngày' },
      { label: 'Thời gian', value: '02/09/2026 - 04/09/2026' },
      { label: 'Chế độ', value: 'Hưởng BHXH 75%' },
    ],
    steps: [
      { name: 'Nộp giấy khám', status: 'done', user: 'Bùi Phương Thảo' },
      { name: 'Quản lý xác nhận', status: 'current', user: 'Bạn' },
      { name: 'HR duyệt hồ sơ BHXH', status: 'wait', user: 'HR Team' },
    ],
  },
  {
    id: 'REQ-2026-108',
    type: 'Thanh toán chi phí tiếp khách đối tác',
    category: 'trip',
    sender: 'Lê Công Vinh',
    department: 'Phòng Kinh Doanh B2B',
    requestDate: '01/09/2026, 10:10',
    priority: 'normal',
    dueLabel: 'Hết hạn hôm nay',
    isOverdue: true,
    reason: 'Tiếp đoàn chuyên gia đối tác giải pháp chấm công',
    note: 'Có hóa đơn đỏ VAT đầy đủ',
    extras: [
      { label: 'Số tiền thanh toán', value: '3,250,000 VND' },
      { label: 'Hình thức', value: 'Hoàn ứng cá nhân' },
      { label: 'Mã hóa đơn', value: 'HD-83921' },
    ],
    steps: [
      { name: 'Tạo yêu cầu', status: 'done', user: 'Lê Công Vinh' },
      { name: 'Giám đốc kinh doanh duyệt', status: 'current', user: 'Bạn' },
      { name: 'Kế toán thanh toán', status: 'wait', user: 'Kế toán' },
    ],
  },
];

export function countPendingStats(items: PendingItemModel[]) {
  const urgent = items.filter((i) => i.priority === 'urgent').length;
  const today = items.filter((i) => i.requestDate.toLowerCase().includes('hôm nay')).length;
  const total = items.length;
  const categories: Record<PendingCategoryTab, number> = {
    all: items.length,
    urgent,
    leave: items.filter((i) => i.category === 'leave').length,
    ot: items.filter((i) => i.category === 'ot').length,
    trip: items.filter((i) => i.category === 'trip').length,
    attendance: items.filter((i) => i.category === 'attendance').length,
  };
  return { urgent, today, total, categories };
}

export function filterPendingItems(
  items: PendingItemModel[],
  tab: PendingCategoryTab,
  query: string,
): PendingItemModel[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tab === 'urgent' && item.priority !== 'urgent') return false;
    if (tab !== 'all' && tab !== 'urgent' && item.category !== tab) return false;
    if (q) {
      const match =
        item.type.toLowerCase().includes(q) ||
        item.sender.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });
}

