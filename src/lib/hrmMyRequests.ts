import type { ClientFormDto } from '../types/form';
import type { LangCode } from './localizedText';

export const MY_REQUESTS_RE =
  /đơn\s*của\s*bạn|don\s*cua\s*ban|my[\s_-]*requests|đơn\s*của\s*tôi|don\s*cua\s*toi|đơn\s*cá\s*nhân|don\s*ca\s*nhan/i;

function formHaystack(form: ClientFormDto): string {
  const title =
    typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  const listIds = (form.lists ?? []).map((l) => l.id).join(' ');
  return `${form.id} ${title} ${listIds}`;
}

export function isHrmMyRequestsForm(
  _slug: string,
  form: ClientFormDto,
  _values: Record<string, unknown> = {},
  _lan: LangCode = 'v',
): boolean {
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  if (MY_REQUESTS_RE.test(formHaystack(form))) return true;
  return false;
}

export type MyRequestCategory = 'all' | 'leave' | 'ot' | 'attendance' | 'trip' | 'equipment' | 'other';
export type MyRequestStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'draft';

export type MyRequestItemModel = {
  id: string;
  title: string;
  category: 'leave' | 'ot' | 'attendance' | 'trip' | 'equipment' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  statusLabel: string;
  createdAt: string;
  appliedTime: string;
  reason: string;
  approver: string;
  department?: string;
  approvedAt?: string;
  rejectedReason?: string;
  details?: { label: string; value: string }[];
  attachments?: { name: string; size: string }[];
};

export const MY_REQUEST_CATEGORY_TABS: { id: MyRequestCategory; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'leave', label: 'Nghỉ phép' },
  { id: 'ot', label: 'Làm thêm (OT)' },
  { id: 'attendance', label: 'Bù công / Quên chấm' },
  { id: 'trip', label: 'Công tác' },
  { id: 'equipment', label: 'Thiết bị & Khác' },
];

export const MY_REQUEST_STATUS_TABS: { id: MyRequestStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'rejected', label: 'Từ chối' },
  { id: 'draft', label: 'Bản nháp' },
];

export const DEFAULT_MY_REQUESTS: MyRequestItemModel[] = [
  {
    id: 'MY-2026-088',
    title: 'Đơn xin nghỉ phép năm',
    category: 'leave',
    status: 'pending',
    statusLabel: 'Chờ duyệt',
    createdAt: '03/09/2026 09:15',
    appliedTime: '08/09/2026 - 09/09/2026 (2 ngày)',
    reason: 'Về quê giải quyết việc gia đình cá nhân',
    approver: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    department: 'Phát Triển Sản Phẩm',
    details: [
      { label: 'Loại phép', value: 'Phép năm (còn 8 ngày)' },
      { label: 'Khoảng thời gian', value: 'Từ 08/09/2026 đến 09/09/2026' },
      { label: 'Hình thức', value: 'Cả ngày (2 ngày công)' },
      { label: 'Bàn giao cho', value: 'Lê Hoàng Long (levanlong@arito.vn)' },
      { label: 'Số điện thoại khẩn cấp', value: '0988 123 456' },
    ],
    attachments: [{ name: 'Ban_giao_cong_viec_t9.pdf', size: '240 KB' }],
  },
  {
    id: 'MY-2026-085',
    title: 'Đăng ký làm thêm giờ (OT Dự án)',
    category: 'ot',
    status: 'pending',
    statusLabel: 'Chờ duyệt',
    createdAt: '02/09/2026 16:40',
    appliedTime: '04/09/2026 · 18:00 - 21:30 (3.5 giờ)',
    reason: 'Triển khai và kiểm thử tính năng Zalo Mini App cho khách hàng VIP',
    approver: 'Trần Thị Mai (Trưởng nhóm Dự án)',
    department: 'Phát Triển Sản Phẩm',
    details: [
      { label: 'Dự án', value: 'Hệ thống Arito Form Web & Mobile' },
      { label: 'Khung giờ OT', value: '18:00 đến 21:30 (Thứ 6, 04/09/2026)' },
      { label: 'Hệ số tính công', value: 'OT Ngày thường (150%)' },
      { label: 'Địa điểm làm việc', value: 'Văn phòng trụ sở chính' },
    ],
  },
  {
    id: 'MY-2026-079',
    title: 'Giải trình quên chấm công chiều',
    category: 'attendance',
    status: 'approved',
    statusLabel: 'Đã duyệt',
    createdAt: '28/08/2026 17:35',
    appliedTime: '28/08/2026 · 17:30 (Giờ tan ca)',
    reason: 'Họp khẩn với đối tác tại phòng họp Trường Sa nên quên bấm vân tay ra về',
    approver: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    department: 'Phát Triển Sản Phẩm',
    approvedAt: '29/08/2026 08:30',
    details: [
      { label: 'Ca làm việc', value: 'Hành chính (08:00 - 17:30)' },
      { label: 'Thời gian bổ sung', value: 'Tan ca: 17:35 ngày 28/08/2026' },
      { label: 'Người xác nhận đi cùng', value: 'Phạm Đức Trọng (Phòng Kinh Doanh)' },
    ],
  },
  {
    id: 'MY-2026-072',
    title: 'Đơn đăng ký đi công tác Hà Nội',
    category: 'trip',
    status: 'approved',
    statusLabel: 'Đã duyệt',
    createdAt: '20/08/2026 10:15',
    appliedTime: '24/08/2026 - 26/08/2026 (3 ngày)',
    reason: 'Tham dự hội thảo công nghệ phần mềm quản trị doanh nghiệp và ký MOU đối tác',
    approver: 'Phạm Quốc Hùng (Tổng Giám Đốc)',
    department: 'Ban Giám Đốc',
    approvedAt: '21/08/2026 14:20',
    details: [
      { label: 'Địa điểm công tác', value: 'Khách sạn Daewoo, Hà Nội' },
      { label: 'Phương tiện', value: 'Máy bay Vietnam Airlines' },
      { label: 'Tạm ứng chi phí', value: '8.500.000 VNĐ' },
    ],
  },
  {
    id: 'MY-2026-068',
    title: 'Đề xuất cấp thêm màn hình 27 inch 4K',
    category: 'equipment',
    status: 'rejected',
    statusLabel: 'Từ chối',
    createdAt: '15/08/2026 14:00',
    appliedTime: 'Yêu cầu trong tháng 08/2026',
    reason: 'Cần mở rộng không gian lập trình đa màn hình cho dự án giao diện di động',
    approver: 'Đỗ Minh Tuấn (Trưởng phòng Hành chính)',
    department: 'Hành Chính Nhân Sự',
    rejectedReason: 'Kho phòng IT hiện đã hết loại màn hình 27 inch 4K, công ty đang chuẩn bị kế hoạch đấu thầu đợt mới vào Quý 4. Vui lòng gửi lại đơn vào đầu tháng 10.',
    details: [
      { label: 'Loại tài sản', value: 'Màn hình Dell UltraSharp 27" 4K' },
      { label: 'Vị trí làm việc', value: 'Bàn Kỹ thuật viên Tầng 3' },
    ],
  },
  {
    id: 'MY-2026-060',
    title: 'Đơn xin làm việc tại nhà (WFH 1 ngày)',
    category: 'leave',
    status: 'draft',
    statusLabel: 'Bản nháp',
    createdAt: '10/08/2026 11:20',
    appliedTime: 'Dự kiến: Thứ 4 tuần sau',
    reason: 'Cần ở nhà nhận bàn giao thiết bị internet và hỗ trợ kỹ thuật viên kiểm tra dây cáp',
    approver: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    details: [
      { label: 'Chế độ WFH', value: 'Làm việc trực tuyến qua Chat & Meet' },
      { label: 'Mục tiêu hoàn thành', value: 'Hoàn thiện luồng kiểm thử tạo đơn mới' },
    ],
  },
];

export function countMyRequestsStats(items: MyRequestItemModel[]) {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let draft = 0;

  const categories: Record<string, number> = {
    all: items.length,
    leave: 0,
    ot: 0,
    attendance: 0,
    trip: 0,
    equipment: 0,
    other: 0,
  };

  for (const item of items) {
    if (item.status === 'pending') pending++;
    else if (item.status === 'approved') approved++;
    else if (item.status === 'rejected') rejected++;
    else if (item.status === 'draft') draft++;

    if (categories[item.category] !== undefined) {
      categories[item.category]++;
    } else {
      categories.other = (categories.other || 0) + 1;
    }
  }

  return {
    pending,
    approved,
    rejected,
    draft,
    total: items.length,
    categories,
  };
}

export function filterMyRequests(
  items: MyRequestItemModel[],
  statusTab: MyRequestStatus,
  categoryTab: MyRequestCategory,
  query: string,
): MyRequestItemModel[] {
  const q = query.trim().toLowerCase();

  return items.filter((item) => {
    // Lọc theo Status
    if (statusTab !== 'all' && item.status !== statusTab) {
      return false;
    }

    // Lọc theo Category
    if (categoryTab !== 'all' && item.category !== categoryTab) {
      return false;
    }

    // Lọc theo Từ khóa tìm kiếm
    if (q) {
      const matchId = item.id.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchReason = item.reason.toLowerCase().includes(q);
      const matchApprover = item.approver.toLowerCase().includes(q);
      const matchTime = item.appliedTime.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchReason && !matchApprover && !matchTime) {
        return false;
      }
    }

    return true;
  });
}
