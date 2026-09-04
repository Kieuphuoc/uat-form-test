import type { ClientFormDto } from '../types/form';
import type { LangCode } from './localizedText';
import { hrmComingSoonFeature, isHrmAttendanceForm, isHrmComingSoonForm } from './hrmAttendance';

export const CREATE_RE =
  /chọn\s*loại\s*đơn|chon\s*loai\s*don|loại\s*đơn\s*từ|loai\s*don\s*tu|tạo\s*đơn|tao\s*don|thêm\s*đơn|them\s*don|\bthêm\b|\bthem\b|\bcreate\b|request[\s_-]*type/i;

function formHaystack(form: ClientFormDto): string {
  const title =
    typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  const listIds = (form.lists ?? []).map((l) => l.id).join(' ');
  return `${form.id} ${title} ${listIds}`;
}

export function isHrmCreateForm(
  _slug: string,
  form: ClientFormDto,
  values: Record<string, unknown> = {},
  lan: LangCode = 'v',
): boolean {
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  if (isHrmAttendanceForm(_slug, form)) return false;
  if (CREATE_RE.test(formHaystack(form))) return true;
  if (isHrmComingSoonForm(_slug, form)) {
    const feat = hrmComingSoonFeature(form, values, lan);
    return feat ? CREATE_RE.test(feat) : false;
  }
  return false;
}

export type FormCategoryKey =
  | 'hr'
  | 'finance'
  | 'contract'
  | 'hr_docs'
  | 'work'
  | 'equipment';

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'date'
  | 'daterange'
  | 'time'
  | 'number'
  | 'file';

export type FormFieldDef = {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
};

export type RequestFormTemplate = {
  id: string;
  title: string;
  category: FormCategoryKey;
  desc: string;
  icon: string;
  badge?: string;
  isPopular?: boolean;
  suggestedApprover: string;
  fields: FormFieldDef[];
};

export type FormCategoryGroup = {
  key: FormCategoryKey;
  title: string;
  desc: string;
  icon: string;
  badgeTone: 'yellow' | 'blue' | 'green' | 'purple';
  templates: RequestFormTemplate[];
};

// Helper tạo fields mẫu đa dạng, nghiệp vụ thực tế cho từng loại đơn
function makeLeaveFields(title: string): FormFieldDef[] {
  return [
    {
      id: 'dateRange',
      label: 'Thời gian nghỉ',
      type: 'daterange',
      required: true,
      placeholder: 'Chọn từ ngày đến ngày',
    },
    {
      id: 'durationUnit',
      label: 'Thời lượng',
      type: 'select',
      required: true,
      options: [
        { value: 'full', label: 'Cả ngày' },
        { value: 'morning', label: 'Buổi sáng' },
        { value: 'afternoon', label: 'Buổi chiều' },
      ],
    },
    {
      id: 'handoverTo',
      label: 'Người nhận bàn giao công việc',
      type: 'text',
      placeholder: 'Nhập tên hoặc email đồng nghiệp hỗ trợ...',
    },
    {
      id: 'reason',
      label: 'Lý do xin nghỉ',
      type: 'textarea',
      required: true,
      placeholder: `Mô tả cụ thể lý do cho ${title.toLowerCase()}...`,
    },
    {
      id: 'attachment',
      label: 'Tài liệu / Minh chứng kèm theo',
      type: 'file',
    },
  ];
}

function makeWorkFields(title: string): FormFieldDef[] {
  return [
    {
      id: 'project',
      label: 'Dự án / Khách hàng liên quan',
      type: 'text',
      required: true,
      placeholder: 'Nhập tên dự án hoặc đối tác...',
    },
    {
      id: 'targetDate',
      label: 'Ngày / Thời hạn thực hiện',
      type: 'date',
      required: true,
    },
    {
      id: 'details',
      label: 'Nội dung chi tiết',
      type: 'textarea',
      required: true,
      placeholder: `Nhập nội dung đề xuất cho ${title.toLowerCase()}...`,
    },
    {
      id: 'attachment',
      label: 'Tài liệu / Bản nháp đính kèm',
      type: 'file',
    },
  ];
}

function makeFinanceFields(title: string): FormFieldDef[] {
  return [
    {
      id: 'amount',
      label: 'Số tiền đề xuất (VNĐ)',
      type: 'text',
      required: true,
      placeholder: 'Ví dụ: 5.000.000 đ',
    },
    {
      id: 'project',
      label: 'Dự án / Chi phí bộ phận',
      type: 'text',
      required: true,
      placeholder: 'Ghi rõ phòng ban hoặc mã dự án...',
    },
    {
      id: 'beneficiary',
      label: 'Thông tin tài khoản / Người thụ hưởng',
      type: 'text',
      required: true,
      placeholder: 'Số tài khoản, ngân hàng, tên người nhận...',
    },
    {
      id: 'reason',
      label: 'Mục đích & Diễn giải',
      type: 'textarea',
      required: true,
      placeholder: `Diễn giải chi tiết cho ${title.toLowerCase()}...`,
    },
    {
      id: 'attachment',
      label: 'Hóa đơn / Chứng từ gốc',
      type: 'file',
    },
  ];
}

function makeEquipFields(title: string): FormFieldDef[] {
  return [
    {
      id: 'targetSystem',
      label: 'Đối tượng / Thiết bị / Ứng dụng',
      type: 'text',
      required: true,
      placeholder: 'Tên thiết bị, tài khoản hoặc hệ thống...',
    },
    {
      id: 'urgency',
      label: 'Mức độ ưu tiên',
      type: 'select',
      required: true,
      options: [
        { value: 'normal', label: 'Bình thường (1 - 2 ngày làm việc)' },
        { value: 'urgent', label: 'Khẩn cấp (Trong ngày)' },
      ],
    },
    {
      id: 'reason',
      label: 'Lý do & Nhu cầu sử dụng',
      type: 'textarea',
      required: true,
      placeholder: `Mô tả lý do và phạm vi cho ${title.toLowerCase()}...`,
    },
  ];
}

export const REQUEST_TEMPLATES: RequestFormTemplate[] = [
  // =========================================================================
  // 1. NHÂN SỰ (15 mẫu đơn)
  // =========================================================================
  {
    id: 'hr-timekeep-adjust',
    title: 'Đơn giải trình chấm công',
    category: 'hr',
    desc: 'Giải trình quên chấm công, bổ sung giờ vào/tan ca thực tế',
    icon: 'clock',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'targetDate',
        label: 'Ngày cần giải trình',
        type: 'date',
        required: true,
      },
      {
        id: 'punchType',
        label: 'Lượt chấm công cần bổ sung',
        type: 'select',
        required: true,
        options: [
          { value: 'in', label: 'Vào ca sáng' },
          { value: 'out', label: 'Tan ca chiều' },
          { value: 'both', label: 'Cả hai lượt (Vào & Ra)' },
        ],
      },
      {
        id: 'actualTime',
        label: 'Giờ thực tế có mặt / rời đi',
        type: 'time',
        required: true,
      },
      {
        id: 'reason',
        label: 'Lý do giải trình',
        type: 'textarea',
        required: true,
        placeholder: 'Quên chấm công, lỗi máy vân tay, đi gặp khách hàng sớm...',
      },
    ],
  },
  {
    id: 'hr-business-trip',
    title: 'Đơn công tác',
    category: 'hr',
    desc: 'Đăng ký lịch trình, địa điểm và chi phí đi công tác các tỉnh',
    icon: 'briefcase',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: [
      {
        id: 'destination',
        label: 'Địa điểm công tác',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: Chi nhánh Đà Nẵng, Khách hàng Hà Nội...',
      },
      {
        id: 'tripDates',
        label: 'Thời gian công tác',
        type: 'daterange',
        required: true,
      },
      {
        id: 'purpose',
        label: 'Mục đích & Nhiệm vụ chuyến đi',
        type: 'textarea',
        required: true,
        placeholder: 'Triển khai hệ thống, họp đối tác, nghiệm thu dự án...',
      },
    ],
  },
  {
    id: 'hr-outside-work',
    title: 'Đơn làm việc bên ngoài (đi khách hàng, đi học, ...)',
    category: 'hr',
    desc: 'Làm việc bên ngoài văn phòng: gặp khách hàng, dự hội thảo, đào tạo',
    icon: 'map-pin',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'date',
        label: 'Ngày làm việc bên ngoài',
        type: 'date',
        required: true,
      },
      {
        id: 'location',
        label: 'Địa điểm cụ thể',
        type: 'text',
        required: true,
        placeholder: 'Văn phòng khách hàng, địa điểm đào tạo...',
      },
      {
        id: 'reason',
        label: 'Nội dung công việc',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-wfh-online',
    title: 'Đơn làm việc online',
    category: 'hr',
    desc: 'Đăng ký làm việc trực tuyến từ xa theo quy chế công ty',
    icon: 'home',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: [
      {
        id: 'wfhDate',
        label: 'Ngày làm việc online',
        type: 'date',
        required: true,
      },
      {
        id: 'tasks',
        label: 'Kế hoạch công việc trong ngày',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-offboarding',
    title: 'Đơn Nhân viên Nghỉ việc (Employee Offboarding)',
    category: 'hr',
    desc: 'Quy trình bàn giao công việc, tài sản và thủ tục thôi việc',
    icon: 'user',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'lastWorkingDay',
        label: 'Ngày làm việc cuối cùng dự kiến',
        type: 'date',
        required: true,
      },
      {
        id: 'handoverPerson',
        label: 'Người tiếp nhận bàn giao chính',
        type: 'text',
        required: true,
      },
      {
        id: 'reason',
        label: 'Lý do xin thôi việc',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-recruitment',
    title: 'Đơn Yêu cầu Tuyển dụng',
    category: 'hr',
    desc: 'Đề xuất tuyển dụng nhân sự mới bổ sung cho phòng ban',
    icon: 'users',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'jobTitle',
        label: 'Vị trí cần tuyển',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: Senior Frontend Engineer, Kế toán viên...',
      },
      {
        id: 'quantity',
        label: 'Số lượng nhân sự cần tuyển',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: 2 người',
      },
      {
        id: 'reason',
        label: 'Lý do tuyển dụng & Yêu cầu cơ bản',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-grab-business',
    title: 'Yêu cầu sử dụng Grab Business',
    category: 'hr',
    desc: 'Đăng ký tài khoản hoặc chuyến xe Grab phục vụ công việc',
    icon: 'car',
    suggestedApprover: 'Đỗ Minh Tuấn (Trưởng phòng Hành chính)',
    fields: [
      {
        id: 'dateRange',
        label: 'Ngày / Thời gian sử dụng',
        type: 'date',
        required: true,
      },
      {
        id: 'route',
        label: 'Lộ trình di chuyển (Điểm đi - Điểm đến)',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: Văn phòng Cty -> Tòa nhà Bitexco...',
      },
      {
        id: 'reason',
        label: 'Mục đích chuyến đi',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-onboarding',
    title: 'Đơn Nhân viên Nhận việc (Employee Onboarding)',
    category: 'hr',
    desc: 'Quy trình tiếp nhận nhân sự mới, cấp phát tài khoản & trang bị',
    icon: 'user-check',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'employeeName',
        label: 'Họ và tên nhân viên mới',
        type: 'text',
        required: true,
      },
      {
        id: 'startDate',
        label: 'Ngày nhận việc chính thức',
        type: 'date',
        required: true,
      },
      {
        id: 'department',
        label: 'Phòng ban / Bộ phận',
        type: 'text',
        required: true,
      },
    ],
  },
  {
    id: 'hr-training',
    title: 'Đơn Yêu cầu Đào tạo',
    category: 'hr',
    desc: 'Đề xuất tham gia khóa học nâng cao nghiệp vụ hoặc tổ chức đào tạo',
    icon: 'file-text',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'courseName',
        label: 'Tên khóa học / Chương trình đào tạo',
        type: 'text',
        required: true,
      },
      {
        id: 'cost',
        label: 'Kinh phí dự kiến (nếu có)',
        type: 'text',
        placeholder: 'Ví dụ: 3.500.000 đ',
      },
      {
        id: 'purpose',
        label: 'Mục tiêu & Lợi ích sau đào tạo',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-overtime',
    title: 'Đơn đăng ký tăng ca',
    category: 'hr',
    desc: 'Đăng ký làm thêm giờ (OT) ngày thường, cuối tuần hoặc ngày lễ',
    icon: 'clock',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: [
      {
        id: 'otDate',
        label: 'Ngày làm thêm giờ',
        type: 'date',
        required: true,
      },
      {
        id: 'otHours',
        label: 'Khung giờ đăng ký (Từ - Đến)',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: 18:00 - 21:30 (3.5 giờ)',
      },
      {
        id: 'project',
        label: 'Dự án / Nhiệm vụ thực hiện',
        type: 'text',
        required: true,
      },
      {
        id: 'reason',
        label: 'Mục tiêu cần hoàn thành trong ca OT',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'hr-leave-annual',
    title: 'Đơn nghỉ phép',
    category: 'hr',
    desc: 'Nghỉ phép năm, việc riêng có hưởng lương theo chế độ',
    icon: 'calendar',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: makeLeaveFields('Đơn nghỉ phép'),
  },
  {
    id: 'hr-leave-unpaid',
    title: 'Nghỉ không lương',
    category: 'hr',
    desc: 'Đăng ký nghỉ việc riêng không hưởng lương khi hết phép năm',
    icon: 'calendar',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: makeLeaveFields('Nghỉ không lương'),
  },
  {
    id: 'hr-leave-periodic',
    title: 'Đơn nghỉ định kỳ',
    category: 'hr',
    desc: 'Đăng ký nghỉ bù định kỳ theo kế hoạch của bộ phận',
    icon: 'calendar-check',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: makeLeaveFields('Đơn nghỉ định kỳ'),
  },
  {
    id: 'hr-leave-regime',
    title: 'Đơn nghỉ chế độ (hiếu, hỉ, ốm,..)',
    category: 'hr',
    desc: 'Nghỉ hưởng chế độ bảo hiểm, thai sản, ốm đau hoặc hiếu hỉ',
    icon: 'calendar',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: makeLeaveFields('Đơn nghỉ chế độ'),
  },
  {
    id: 'hr-leave-sat-morning',
    title: 'Đơn nghỉ phép (sáng thứ 7)',
    category: 'hr',
    desc: 'Đăng ký nghỉ làm việc buổi sáng thứ 7 theo lịch luân phiên',
    icon: 'calendar',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'satDate',
        label: 'Ngày thứ 7 xin nghỉ',
        type: 'date',
        required: true,
      },
      {
        id: 'handover',
        label: 'Người trực hỗ trợ thay thế',
        type: 'text',
        placeholder: 'Tên đồng nghiệp trực thay...',
      },
      {
        id: 'reason',
        label: 'Lý do xin nghỉ',
        type: 'textarea',
        required: true,
      },
    ],
  },

  // =========================================================================
  // 2. TÀI CHÍNH (4 mẫu đơn)
  // =========================================================================
  {
    id: 'fin-expense-req',
    title: 'AC/AE - Yêu cầu Chi tiêu',
    category: 'finance',
    desc: 'Đề xuất chi tiêu ngân sách cho hoạt động dự án hoặc chiến dịch',
    icon: 'wallet',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Lê Minh Khang (Giám đốc Tài chính)',
    fields: makeFinanceFields('AC/AE - Yêu cầu Chi tiêu'),
  },
  {
    id: 'fin-tax-cert',
    title: 'Đề xuất cấp chứng từ khấu trừ thuế CTV',
    category: 'finance',
    desc: 'Cấp chứng từ khấu trừ thuế TNCN cho cộng tác viên và đối tác',
    icon: 'file-text',
    suggestedApprover: 'Lê Minh Khang (Giám đốc Tài chính)',
    fields: [
      {
        id: 'ctvName',
        label: 'Họ tên CTV / Mã số thuế',
        type: 'text',
        required: true,
      },
      {
        id: 'taxYear',
        label: 'Năm tính thuế / Kỳ thanh toán',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: Năm 2025 hoặc Quý 4/2025',
      },
      {
        id: 'reason',
        label: 'Mục đích đề xuất',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    id: 'fin-refund-req',
    title: 'AC/AE - Yêu cầu hoàn tiền cho khách hàng',
    category: 'finance',
    desc: 'Thủ tục hoàn tiền cọc, hoàn tiền hủy dịch vụ cho khách hàng',
    icon: 'refresh-cw',
    suggestedApprover: 'Lê Minh Khang (Giám đốc Tài chính)',
    fields: makeFinanceFields('AC/AE - Yêu cầu hoàn tiền cho khách hàng'),
  },
  {
    id: 'fin-salary-advance',
    title: 'Đơn tạm ứng lương',
    category: 'finance',
    desc: 'Đề xuất tạm ứng lương trong kỳ làm việc theo quy chế',
    icon: 'banknote',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Lê Minh Khang (Giám đốc Tài chính)',
    fields: [
      {
        id: 'amount',
        label: 'Số tiền muốn tạm ứng (VNĐ)',
        type: 'text',
        required: true,
        placeholder: 'Ví dụ: 3.000.000 đ',
      },
      {
        id: 'bankInfo',
        label: 'Số tài khoản nhận lương',
        type: 'text',
        required: true,
      },
      {
        id: 'reason',
        label: 'Lý do xin tạm ứng',
        type: 'textarea',
        required: true,
      },
    ],
  },

  // =========================================================================
  // 3. HỢP ĐỒNG (2 mẫu đơn)
  // =========================================================================
  {
    id: 'contract-payment-req',
    title: 'AC/AE - Đề nghị Thanh toán',
    category: 'contract',
    desc: 'Yêu cầu thanh toán theo các mốc nghiệm thu hợp đồng đối tác',
    icon: 'wallet',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Lê Minh Khang (Giám đốc Tài chính)',
    fields: makeFinanceFields('AC/AE - Đề nghị Thanh toán'),
  },
  {
    id: 'contract-agent-wet-ink',
    title: 'AC/ AE - Hợp đồng Đại lý, CTV (Ký tươi)',
    category: 'contract',
    desc: 'Trình duyệt và in ký hợp đồng đại lý, cộng tác viên bản ký tươi',
    icon: 'pen-line',
    suggestedApprover: 'Vũ Quốc Huy (Giám đốc Kinh doanh)',
    fields: [
      {
        id: 'agentName',
        label: 'Tên Đại lý / Cộng tác viên',
        type: 'text',
        required: true,
      },
      {
        id: 'effectiveDate',
        label: 'Ngày bắt đầu hiệu lực',
        type: 'date',
        required: true,
      },
      {
        id: 'summary',
        label: 'Tóm tắt điều khoản & Chính sách hoa hồng',
        type: 'textarea',
        required: true,
      },
      {
        id: 'attachment',
        label: 'File hợp đồng dự thảo',
        type: 'file',
      },
    ],
  },

  // =========================================================================
  // 4. TÀI LIỆU NHÂN SỰ (5 mẫu tài liệu)
  // =========================================================================
  {
    id: 'hrdoc-labor-contract',
    title: 'HR - Hợp đồng lao động',
    category: 'hr_docs',
    desc: 'Ký kết hợp đồng lao động chính thức có thời hạn hoặc vô thời hạn',
    icon: 'file-check',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'employeeName',
        label: 'Họ tên nhân viên ký hợp đồng',
        type: 'text',
        required: true,
      },
      {
        id: 'contractTerm',
        label: 'Thời hạn hợp đồng',
        type: 'select',
        required: true,
        options: [
          { value: '1year', label: 'Xác định thời hạn 12 tháng' },
          { value: '3years', label: 'Xác định thời hạn 36 tháng' },
          { value: 'indefinite', label: 'Không xác định thời hạn' },
        ],
      },
      {
        id: 'salary',
        label: 'Mức lương thỏa thuận',
        type: 'text',
        required: true,
      },
      {
        id: 'attachment',
        label: 'Bản mềm HĐLĐ đính kèm',
        type: 'file',
      },
    ],
  },
  {
    id: 'hrdoc-probation-contract',
    title: 'HR - Hợp đồng thử việc',
    category: 'hr_docs',
    desc: 'Ký kết hợp đồng thử việc theo thời hạn luật định',
    icon: 'file-text',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'employeeName',
        label: 'Họ tên nhân sự thử việc',
        type: 'text',
        required: true,
      },
      {
        id: 'duration',
        label: 'Thời gian thử việc (30 ngày / 60 ngày)',
        type: 'text',
        required: true,
      },
      {
        id: 'attachment',
        label: 'Bản mềm hợp đồng thử việc',
        type: 'file',
      },
    ],
  },
  {
    id: 'hrdoc-security-appendix',
    title: 'Phụ lục Bảo mật Hợp đồng lao động',
    category: 'hr_docs',
    desc: 'Phụ lục cam kết bảo vệ dữ liệu và bảo mật thông tin nhân sự',
    icon: 'lock',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'employeeName',
        label: 'Họ tên nhân sự',
        type: 'text',
        required: true,
      },
      {
        id: 'attachment',
        label: 'File phụ lục bảo mật',
        type: 'file',
      },
    ],
  },
  {
    id: 'hrdoc-intern-contract',
    title: 'HRTTS - Hợp đồng Thực tập sinh',
    category: 'hr_docs',
    desc: 'Ký kết hợp đồng thực tập sinh và đào tạo nghề thực tế',
    icon: 'file-text',
    suggestedApprover: 'Trần Thị Mai (Trưởng phòng Nhân sự)',
    fields: [
      {
        id: 'internName',
        label: 'Họ tên thực tập sinh',
        type: 'text',
        required: true,
      },
      {
        id: 'internPeriod',
        label: 'Thời gian thực tập',
        type: 'daterange',
        required: true,
      },
      {
        id: 'stipend',
        label: 'Trợ cấp thực tập (nếu có)',
        type: 'text',
      },
    ],
  },
  {
    id: 'hrdoc-nda-agreement',
    title: 'HR - Thỏa thuận bảo mật thông tin (NDA)',
    category: 'hr_docs',
    desc: 'Thỏa thuận bảo mật thông tin nội bộ công nghệ và dự án trọng điểm',
    icon: 'lock',
    suggestedApprover: 'Vũ Quốc Huy (Giám đốc Kinh doanh)',
    fields: [
      {
        id: 'party',
        label: 'Đối tác / Nhân viên ký cam kết NDA',
        type: 'text',
        required: true,
      },
      {
        id: 'scope',
        label: 'Phạm vi thông tin mật cần bảo vệ',
        type: 'textarea',
        required: true,
      },
      {
        id: 'attachment',
        label: 'Văn bản thỏa thuận NDA',
        type: 'file',
      },
    ],
  },

  // =========================================================================
  // 5. CÔNG VIỆC (7 mẫu đơn)
  // =========================================================================
  {
    id: 'work-deploy-req',
    title: 'AE/AC_BD_Đề nghị triển khai (Dự án, Phụ lục, Vụ việc)',
    category: 'work',
    desc: 'Đề nghị kích hoạt và triển khai dự án, phụ lục hợp đồng mới',
    icon: 'briefcase',
    suggestedApprover: 'Vũ Quốc Huy (Giám đốc Kinh doanh)',
    fields: makeWorkFields('AE/AC_BD_Đề nghị triển khai'),
  },
  {
    id: 'work-proposal-approve',
    title: 'AE/AC_BD_Phê duyệt Proposal (Giải pháp - Báo giá)',
    category: 'work',
    desc: 'Trình duyệt đề xuất giải pháp kỹ thuật và báo giá cho khách hàng',
    icon: 'check-square',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Vũ Quốc Huy (Giám đốc Kinh doanh)',
    fields: makeWorkFields('Phê duyệt Proposal'),
  },
  {
    id: 'work-proposal-req',
    title: 'BD_Yêu cầu Proposal (Giải pháp - Ngày công - Timeline)',
    category: 'work',
    desc: 'Yêu cầu phòng kỹ thuật lập phương án giải pháp, ngày công và timeline',
    icon: 'clock',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeWorkFields('Yêu cầu Proposal'),
  },
  {
    id: 'work-manday-quote-req',
    title: 'PRJ/CS_Yêu cầu Đề nghị báo ngày công/báo giá',
    category: 'work',
    desc: 'Đề nghị ước lượng số ngày công (man-day) hoặc báo giá tính năng',
    icon: 'tag',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeWorkFields('Đề nghị báo ngày công / báo giá'),
  },
  {
    id: 'work-contract-draft-approve',
    title: 'AE/AC_BD_Phê duyệt Bản nháp Hợp đồng',
    category: 'work',
    desc: 'Trình phê duyệt nội dung bản nháp hợp đồng trước khi gửi khách',
    icon: 'file-check',
    suggestedApprover: 'Vũ Quốc Huy (Giám đốc Kinh doanh)',
    fields: makeWorkFields('Phê duyệt Bản nháp Hợp đồng'),
  },
  {
    id: 'work-tech-support-req',
    title: 'AE/AC_BD_Đề xuất Kỹ thuật hỗ trợ (Demo/Tư vấn) Kinh doanh',
    category: 'work',
    desc: 'Đề xuất cử kỹ sư tham gia demo giải pháp và tư vấn cùng kinh doanh',
    icon: 'sparkles',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeWorkFields('Kỹ thuật hỗ trợ Kinh doanh'),
  },
  {
    id: 'work-hardware-quote-req',
    title: 'PRJ/CS/BD_Yêu cầu Đề Nghị báo giá Thiết bị phần cứng',
    category: 'work',
    desc: 'Yêu cầu khảo sát và báo giá máy chủ, thiết bị mạng phần cứng',
    icon: 'package',
    suggestedApprover: 'Đỗ Minh Tuấn (Trưởng phòng Hành chính)',
    fields: makeWorkFields('Báo giá Thiết bị phần cứng'),
  },

  // =========================================================================
  // 6. CẤP PHÁT (6 mẫu đơn)
  // =========================================================================
  {
    id: 'equip-tools-alloc',
    title: 'Cấp phát CCDC',
    category: 'equipment',
    desc: 'Đề xuất cấp công cụ dụng cụ, trang thiết bị phục vụ công việc',
    icon: 'package',
    badge: 'Phổ biến',
    isPopular: true,
    suggestedApprover: 'Đỗ Minh Tuấn (Trưởng phòng Hành chính)',
    fields: makeEquipFields('Cấp phát CCDC'),
  },
  {
    id: 'equip-access-rights',
    title: 'Cấp quyền truy cập khác (Arinas, Tool, Platform,...)',
    category: 'equipment',
    desc: 'Yêu cầu mở quyền tài khoản hệ thống, công cụ và platform nội bộ',
    icon: 'key',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeEquipFields('Cấp quyền truy cập hệ thống'),
  },
  {
    id: 'equip-usb-perm',
    title: 'IT - Cấp quyền sử dụng USB',
    category: 'equipment',
    desc: 'Đăng ký mở quyền cắm USB hoặc thiết bị lưu trữ ngoài trên máy tính',
    icon: 'lock',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeEquipFields('Cấp quyền sử dụng USB'),
  },
  {
    id: 'equip-server-data-purge',
    title: 'IT - Đơn yêu cầu xóa dữ liệu lưu trữ trên server',
    category: 'equipment',
    desc: 'Yêu cầu tiêu hủy hoặc xóa an toàn dữ liệu lưu trữ trên máy chủ',
    icon: 'trash',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeEquipFields('Xóa dữ liệu lưu trữ trên server'),
  },
  {
    id: 'equip-stationery-req',
    title: 'HR - Đề xuất mua văn phòng phẩm',
    category: 'equipment',
    desc: 'Yêu cầu mua sắm dụng cụ, văn phòng phẩm định kỳ cho bộ phận',
    icon: 'file-text',
    suggestedApprover: 'Đỗ Minh Tuấn (Trưởng phòng Hành chính)',
    fields: makeEquipFields('Đề xuất mua văn phòng phẩm'),
  },
  {
    id: 'equip-aritoid-app-req',
    title: 'SA - Đơn yêu cầu xử lý ứng dụng trên ARITOID',
    category: 'equipment',
    desc: 'Đề nghị hỗ trợ cấu hình, sửa lỗi hoặc xử lý nghiệp vụ trên ARITOID',
    icon: 'smartphone',
    suggestedApprover: 'Nguyễn Văn An (Giám đốc Kỹ thuật)',
    fields: makeEquipFields('Xử lý ứng dụng trên ARITOID'),
  },
];

export const FORM_CATEGORY_GROUPS: FormCategoryGroup[] = [
  {
    key: 'hr',
    title: 'Nhân sự',
    desc: 'Giải trình chấm công, công tác, nghỉ phép, tăng ca, tuyển dụng & đào tạo',
    icon: 'users',
    badgeTone: 'blue',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'hr'),
  },
  {
    key: 'finance',
    title: 'Tài chính',
    desc: 'Yêu cầu chi tiêu, hoàn tiền khách hàng, chứng từ thuế & tạm ứng lương',
    icon: 'wallet',
    badgeTone: 'green',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'finance'),
  },
  {
    key: 'contract',
    title: 'Hợp đồng',
    desc: 'Đề nghị thanh toán & Hợp đồng Đại lý, CTV (Ký tươi)',
    icon: 'file-check',
    badgeTone: 'purple',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'contract'),
  },
  {
    key: 'hr_docs',
    title: 'Tài liệu nhân sự',
    desc: 'Hợp đồng lao động, thử việc, thực tập sinh, phụ lục & NDA bảo mật',
    icon: 'folder',
    badgeTone: 'blue',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'hr_docs'),
  },
  {
    key: 'work',
    title: 'Công việc',
    desc: 'Đề nghị triển khai, Proposal báo giá, ngày công, hợp đồng & hỗ trợ kỹ thuật',
    icon: 'briefcase',
    badgeTone: 'yellow',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'work'),
  },
  {
    key: 'equipment',
    title: 'Cấp phát',
    desc: 'Cấp phát CCDC, quyền truy cập hệ thống, USB, xóa dữ liệu & ARITOID',
    icon: 'package',
    badgeTone: 'green',
    templates: REQUEST_TEMPLATES.filter((t) => t.category === 'equipment'),
  },
];

export const POPULAR_TEMPLATES = REQUEST_TEMPLATES.filter((t) => t.isPopular);

export type TemplateIconTheme = {
  bg: string;
  color: string;
  border: string;
};

const TEMPLATE_THEMES: Record<string, TemplateIconTheme> = {
  // 1. NHÂN SỰ
  'hr-timekeep-adjust': { bg: '#e0f2fe', color: '#0284c7', border: 'rgba(2, 132, 199, 0.25)' }, // Sky Blue
  'hr-business-trip': { bg: '#e0e7ff', color: '#4338ca', border: 'rgba(67, 56, 202, 0.25)' }, // Indigo
  'hr-outside-work': { bg: '#d1fae5', color: '#059669', border: 'rgba(5, 150, 105, 0.25)' }, // Emerald
  'hr-wfh-online': { bg: '#f3e8ff', color: '#7e22ce', border: 'rgba(126, 34, 206, 0.25)' }, // Purple
  'hr-offboarding': { bg: '#fee2e2', color: '#dc2626', border: 'rgba(220, 38, 38, 0.25)' }, // Rose Red
  'hr-recruitment': { bg: '#ede9fe', color: '#6d28d9', border: 'rgba(109, 40, 217, 0.25)' }, // Violet
  'hr-grab-business': { bg: '#dcfce7', color: '#16a34a', border: 'rgba(22, 163, 74, 0.25)' }, // Vibrant Green
  'hr-onboarding': { bg: '#ccfbf1', color: '#0d9488', border: 'rgba(13, 148, 136, 0.25)' }, // Teal
  'hr-training': { bg: '#fef3c7', color: '#d97706', border: 'rgba(217, 119, 6, 0.25)' }, // Amber
  'hr-overtime': { bg: '#ffedd5', color: '#ea580c', border: 'rgba(234, 88, 12, 0.25)' }, // Sunset Orange
  'hr-leave-annual': { bg: '#e0f2fe', color: '#0284c7', border: 'rgba(2, 132, 199, 0.25)' }, // Sky Blue
  'hr-leave-unpaid': { bg: '#fee2e2', color: '#dc2626', border: 'rgba(220, 38, 38, 0.25)' }, // Coral Red
  'hr-leave-periodic': { bg: '#cffafe', color: '#0891b2', border: 'rgba(8, 145, 178, 0.25)' }, // Cyan
  'hr-leave-regime': { bg: '#fce7f3', color: '#db2777', border: 'rgba(219, 39, 119, 0.25)' }, // Pink
  'hr-leave-sat-morning': { bg: '#dbeafe', color: '#2563eb', border: 'rgba(37, 99, 235, 0.25)' }, // Blue

  // 2. TÀI CHÍNH
  'fin-expense-req': { bg: '#dcfce7', color: '#15803d', border: 'rgba(21, 128, 61, 0.25)' }, // Green
  'fin-tax-cert': { bg: '#fef3c7', color: '#b45309', border: 'rgba(180, 83, 9, 0.25)' }, // Amber Gold
  'fin-refund-req': { bg: '#dbeafe', color: '#1d4ed8', border: 'rgba(29, 78, 216, 0.25)' }, // Blue
  'fin-salary-advance': { bg: '#d1fae5', color: '#059669', border: 'rgba(5, 150, 105, 0.25)' }, // Mint Emerald

  // 3. HỢP ĐỒNG
  'contract-payment-req': { bg: '#ecfdf5', color: '#047857', border: 'rgba(4, 120, 87, 0.25)' }, // Emerald
  'contract-agent-wet-ink': { bg: '#f3e8ff', color: '#7c3aed', border: 'rgba(124, 58, 237, 0.25)' }, // Purple

  // 4. TÀI LIỆU NHÂN SỰ
  'hrdoc-labor-contract': { bg: '#e0e7ff', color: '#4338ca', border: 'rgba(67, 56, 202, 0.25)' }, // Indigo
  'hrdoc-probation-contract': { bg: '#dbeafe', color: '#1d4ed8', border: 'rgba(29, 78, 216, 0.25)' }, // Blue
  'hrdoc-security-appendix': { bg: '#f1f5f9', color: '#475569', border: 'rgba(71, 85, 105, 0.25)' }, // Slate
  'hrdoc-intern-contract': { bg: '#ffe4e6', color: '#e11d48', border: 'rgba(225, 29, 72, 0.25)' }, // Rose
  'hrdoc-nda-agreement': { bg: '#fef3c7', color: '#b45309', border: 'rgba(180, 83, 9, 0.25)' }, // Amber

  // 5. CÔNG VIỆC
  'work-deploy-req': { bg: '#dbeafe', color: '#1d4ed8', border: 'rgba(29, 78, 216, 0.25)' }, // Blue
  'work-proposal-approve': { bg: '#ffedd5', color: '#ea580c', border: 'rgba(234, 88, 12, 0.25)' }, // Orange
  'work-proposal-req': { bg: '#f3e8ff', color: '#7e22ce', border: 'rgba(126, 34, 206, 0.25)' }, // Purple
  'work-manday-quote-req': { bg: '#fef9c3', color: '#a16207', border: 'rgba(161, 98, 7, 0.25)' }, // Gold
  'work-contract-draft-approve': { bg: '#e0e7ff', color: '#4338ca', border: 'rgba(67, 56, 202, 0.25)' }, // Indigo
  'work-tech-support-req': { bg: '#e0f2fe', color: '#0284c7', border: 'rgba(2, 132, 199, 0.25)' }, // Sky
  'work-hardware-quote-req': { bg: '#f1f5f9', color: '#334155', border: 'rgba(51, 65, 85, 0.25)' }, // Slate

  // 6. CẤP PHÁT
  'equip-tools-alloc': { bg: '#ffedd5', color: '#ea580c', border: 'rgba(234, 88, 12, 0.25)' }, // Orange
  'equip-access-rights': { bg: '#dbeafe', color: '#2563eb', border: 'rgba(37, 99, 235, 0.25)' }, // Blue
  'equip-usb-perm': { bg: '#e0e7ff', color: '#4338ca', border: 'rgba(67, 56, 202, 0.25)' }, // Indigo
  'equip-server-data-purge': { bg: '#fee2e2', color: '#dc2626', border: 'rgba(220, 38, 38, 0.25)' }, // Red
  'equip-stationery-req': { bg: '#dcfce7', color: '#16a34a', border: 'rgba(22, 163, 74, 0.25)' }, // Green
  'equip-aritoid-app-req': { bg: '#ede9fe', color: '#7c3aed', border: 'rgba(124, 58, 237, 0.25)' }, // Violet
};

const CATEGORY_DEFAULT_THEMES: Record<string, TemplateIconTheme> = {
  hr: { bg: '#e0f2fe', color: '#0284c7', border: 'rgba(2, 132, 199, 0.25)' },
  finance: { bg: '#dcfce7', color: '#16a34a', border: 'rgba(22, 163, 74, 0.25)' },
  contract: { bg: '#f3e8ff', color: '#7c3aed', border: 'rgba(124, 58, 237, 0.25)' },
  hr_docs: { bg: '#e0e7ff', color: '#4338ca', border: 'rgba(67, 56, 202, 0.25)' },
  work: { bg: '#ffedd5', color: '#ea580c', border: 'rgba(234, 88, 12, 0.25)' },
  equipment: { bg: '#ccfbf1', color: '#0d9488', border: 'rgba(13, 148, 136, 0.25)' },
};

export function getTemplateIconTheme(category: string, id: string): TemplateIconTheme {
  if (TEMPLATE_THEMES[id]) {
    return TEMPLATE_THEMES[id];
  }
  if (CATEGORY_DEFAULT_THEMES[category]) {
    return CATEGORY_DEFAULT_THEMES[category];
  }
  return {
    bg: '#e0f2fe',
    color: '#0284c7',
    border: 'rgba(2, 132, 199, 0.25)',
  };
}
