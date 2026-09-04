import type { ClientFormDto } from '../types/form';
import type { LangCode } from './localizedText';
import { hrmComingSoonFeature, isHrmAttendanceForm, isHrmComingSoonForm } from './hrmAttendance';

export const PROCESSED_RE =
  /đã\s*xử\s*lý|da\s*xu\s*ly|lịch\s*sử\s*duyệt|lich\s*su\s*duyet|processed|lịch\s*sử\s*đơn|lich\s*su\s*don|đã\s*duyệt|da\s*duyet/i;

function formHaystack(form: ClientFormDto): string {
  const title =
    typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  const listIds = (form.lists ?? []).map((l) => l.id).join(' ');
  return `${form.id} ${title} ${listIds}`;
}

/** Nhận diện form HRM tab "Đã xử lý" trên `/runtime/hrm` */
export function isHrmProcessedForm(
  slug: string,
  form: ClientFormDto,
  values: Record<string, unknown> = {},
  lan: LangCode = 'v',
): boolean {
  if (slug !== 'hrm') return false;
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  if (isHrmAttendanceForm(slug, form)) return false;
  if (PROCESSED_RE.test(formHaystack(form))) return true;
  if (isHrmComingSoonForm(slug, form)) {
    const feat = hrmComingSoonFeature(form, values, lan);
    if (feat && PROCESSED_RE.test(feat)) return true;
  }
  return false;
}

export type ProcessedTabId = 'all' | 'ok' | 'no';

export const PROCESSED_TABS: { id: ProcessedTabId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'ok', label: 'Đã duyệt' },
  { id: 'no', label: 'Từ chối' },
];

export type ProcessedItemModel = {
  id: string;
  type: string;
  sender: string;
  senderAvatar?: string;
  department?: string;
  requestDate: string;
  processedDate: string;
  processedBy: string;
  status: 'ok' | 'no';
  statusLabel: string;
  reason?: string;
  note?: string;
  extras?: { label: string; value: string }[];
};

/** Mock data mẫu chuẩn nghiệp vụ HRM cho tab Đã xử lý */
export const DEFAULT_PROCESSED_ITEMS: ProcessedItemModel[] = [
  {
    id: 'REQ-2026-001',
    type: 'Đơn xin nghỉ phép năm',
    sender: 'Nguyễn Văn An',
    department: 'Phòng Kỹ Thuật',
    requestDate: '01/09/2026 09:15',
    processedDate: '02/09/2026 14:20',
    processedBy: 'Trần Thị Bích (Trưởng phòng)',
    status: 'ok',
    statusLabel: 'Đã duyệt',
    reason: 'Nghỉ giải quyết việc gia đình',
    note: 'Đã bàn giao công việc cho bạn Dũng',
    extras: [
      { label: 'Số ngày nghỉ', value: '1.5 ngày' },
      { label: 'Thời gian', value: '03/09/2026 - 04/09/2026' },
      { label: 'Người duyệt', value: 'Trần Thị Bích' },
    ],
  },
  {
    id: 'REQ-2026-002',
    type: 'Đăng ký làm thêm giờ (OT)',
    sender: 'Lê Hoàng Nam',
    department: 'Phòng Phát Triển Sản Phẩm',
    requestDate: '31/08/2026 17:30',
    processedDate: '01/09/2026 08:45',
    processedBy: 'Phạm Minh Tuấn (Giám đốc dự án)',
    status: 'ok',
    statusLabel: 'Đã duyệt',
    reason: 'Triển khai bản vá cập nhật hệ thống Arito HRM',
    note: 'Hỗ trợ release hệ thống phiên bản v2.4',
    extras: [
      { label: 'Số giờ OT', value: '3.5 giờ' },
      { label: 'Thời gian OT', value: '18:00 - 21:30 (31/08/2026)' },
      { label: 'Dự án', value: 'Arito Form Web v2' },
    ],
  },
  {
    id: 'REQ-2026-003',
    type: 'Đơn giải trình chấm công',
    sender: 'Võ Quốc Huy',
    department: 'Phòng Kinh Doanh',
    requestDate: '30/08/2026 11:20',
    processedDate: '31/08/2026 16:10',
    processedBy: 'Ngô Thanh Trúc (HR Manager)',
    status: 'no',
    statusLabel: 'Từ chối',
    reason: 'Quên chấm công vào ca sáng',
    note: 'Không có xác nhận có mặt từ quản lý trực tiếp tại điểm danh',
    extras: [
      { label: 'Ngày cần giải trình', value: '29/08/2026' },
      { label: 'Ca làm việc', value: 'Ca sáng (08:00 - 12:00)' },
      { label: 'Lý do từ chối', value: 'Thiếu xác nhận quản lý' },
    ],
  },
  {
    id: 'REQ-2026-004',
    type: 'Yêu cầu tạm ứng công tác phí',
    sender: 'Đặng Thanh Mai',
    department: 'Phòng Chăm Sóc Khách Hàng',
    requestDate: '28/08/2026 14:00',
    processedDate: '29/08/2026 10:30',
    processedBy: 'Nguyễn Văn Bình (Kế toán trưởng)',
    status: 'ok',
    statusLabel: 'Đã duyệt',
    reason: 'Đi công tác chi nhánh Cần Thơ đào tạo khách hàng mới',
    note: 'Đã chuyển khoản theo số tài khoản công ty đăng ký',
    extras: [
      { label: 'Số tiền tạm ứng', value: '5,000,000 VND' },
      { label: 'Thời gian công tác', value: '05/09/2026 - 07/09/2026' },
      { label: 'Phương thức', value: 'Chuyển khoản' },
    ],
  },
  {
    id: 'REQ-2026-005',
    type: 'Đơn làm việc tại nhà (WFH)',
    sender: 'Trương Mỹ Linh',
    department: 'Phòng Marketing',
    requestDate: '27/08/2026 16:45',
    processedDate: '28/08/2026 09:00',
    processedBy: 'Trần Thị Bích (Trưởng phòng)',
    status: 'ok',
    statusLabel: 'Đã duyệt',
    reason: 'Thời tiết xấu và giải quyết công việc từ xa',
    note: 'Đảm bảo trực chat và online họp đúng giờ',
    extras: [
      { label: 'Thời gian WFH', value: '28/08/2026 (Cả ngày)' },
      { label: 'Thiết bị làm việc', value: 'Laptop công ty' },
    ],
  },
  {
    id: 'REQ-2026-006',
    type: 'Đề xuất mua sắm thiết bị',
    sender: 'Hoàng Văn Khiêm',
    department: 'Phòng Kỹ Thuật',
    requestDate: '25/08/2026 10:15',
    processedDate: '26/08/2026 15:40',
    processedBy: 'Phạm Minh Tuấn (Giám đốc)',
    status: 'no',
    statusLabel: 'Từ chối',
    reason: 'Thay mới bàn phím cơ và màn hình 4K',
    note: 'Vượt ngân sách quý 3, tạm dời sang đợt cấp phát quý 4',
    extras: [
      { label: 'Dự toán', value: '12,500,000 VND' },
      { label: 'Lý do từ chối', value: 'Vượt ngân sách quý' },
    ],
  },
];

export function countProcessedStats(items: ProcessedItemModel[]): Record<ProcessedTabId, number> {
  const counts: Record<ProcessedTabId, number> = {
    all: items.length,
    ok: 0,
    no: 0,
  };
  for (const item of items) {
    if (item.status === 'ok') counts.ok += 1;
    else if (item.status === 'no') counts.no += 1;
  }
  return counts;
}

export function filterProcessedItems(
  items: ProcessedItemModel[],
  tab: ProcessedTabId,
  query: string,
): ProcessedItemModel[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tab !== 'all' && item.status !== tab) return false;
    if (q) {
      const match =
        item.type.toLowerCase().includes(q) ||
        item.sender.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.reason && item.reason.toLowerCase().includes(q)) ||
        (item.processedBy && item.processedBy.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}
