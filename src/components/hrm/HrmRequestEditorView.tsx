import { useState, useEffect } from 'react';
import { FormIcon } from '../form/FormIcon';
import { getTemplateIconTheme, type RequestFormTemplate } from '../../lib/hrmCreate';
import { HrmSelect, type SelectOption } from './HrmSelect';

const EMPLOYEE_OPTIONS: SelectOption[] = [
  {
    value: 'Nguyễn Kiều Phước',
    label: 'Nguyễn Kiều Phước',
    sub: 'Mã NV: AT-7700 • Phòng Kỹ thuật ARITO',
    avatar: 'KP',
  },
  {
    value: 'Trần Thị Mai',
    label: 'Trần Thị Mai',
    sub: 'Mã NV: AT-7705 • Phòng Nhân sự ARITO',
    avatar: 'TM',
  },
  {
    value: 'Lê Văn Hùng',
    label: 'Lê Văn Hùng',
    sub: 'Mã NV: AT-7712 • Phòng Kinh doanh ARITO',
    avatar: 'LH',
  },
  {
    value: 'Phan Quốc Bảo',
    label: 'Phan Quốc Bảo',
    sub: 'Mã NV: AT-7720 • Phòng Kỹ thuật ARITO',
    avatar: 'PB',
  },
];

const SHIFT_OPTIONS = [
  '(HC1) Hành chính',
  '(HC2) Hành chính thứ 7',
  '(HC3) Hành chính 3',
  '(HC4) Hành chính thứ 7',
  '(HC5) Hành chính (áp dụng nuôi con nhỏ dưới 1 tuổi)',
];

const UNIT_OPTIONS = [
  'Công ty CP GPCN ARITO',
  'Chi nhánh Hà Nội',
  'Chi nhánh Đà Nẵng',
];

const TAG_OPTIONS = [
  'Nghỉ phép',
  'Tăng ca',
  'Chấm công',
  'Khẩn cấp',
  'Ưu tiên',
  'Dự án',
];

const APPROVER_DEFAULT_ROLES: Record<string, string> = {
  'nghiatq@arito.vn': 'Line Manager',
  'tamnh@arito.vn': 'Head of Department',
  'annv@arito.vn': 'Director Approval',
  'maitt@arito.vn': 'HR Manager',
  'hunglv@arito.vn': 'Sales Director',
  'baopq@arito.vn': 'CTO / Tech Lead',
  'phuocnk@arito.vn': 'Kỹ sư phần mềm ARITO',
};

const APPROVER_OPTIONS: SelectOption[] = [
  {
    value: 'nghiatq@arito.vn',
    label: 'Nghia (Alden) Tran',
    sub: 'nghiatq@arito.vn',
    avatar: 'NT',
  },
  {
    value: 'tamnh@arito.vn',
    label: 'Nguyễn Hữu Tâm',
    sub: 'tamnh@arito.vn',
    avatar: 'HT',
  },
  {
    value: 'annv@arito.vn',
    label: 'Nguyễn Văn An',
    sub: 'annv@arito.vn',
    avatar: 'NA',
  },
  {
    value: 'maitt@arito.vn',
    label: 'Trần Thị Mai',
    sub: 'maitt@arito.vn',
    avatar: 'TM',
  },
  {
    value: 'hunglv@arito.vn',
    label: 'Lê Văn Hùng',
    sub: 'hunglv@arito.vn',
    avatar: 'LH',
  },
  {
    value: 'baopq@arito.vn',
    label: 'Phan Quốc Bảo',
    sub: 'baopq@arito.vn',
    avatar: 'PB',
  },
  {
    value: 'phuocnk@arito.vn',
    label: 'Nguyễn Kiều Phước',
    sub: 'phuocnk@arito.vn',
    avatar: 'KP',
  },
];

type ApprovalStep = {
  id: string;
  order: number;
  method: string;
  roleName: string;
  sendEmail: boolean;
  signType: string;
  approvers: { name: string; email: string }[];
  viewer: string;
};

type HistoryLog = {
  id: string;
  userCode: string;
  userName: string;
  action: string;
  time: string;
  statusTag?: 'draft' | 'submit' | 'approved' | 'rejected';
};

type Props = {
  template: RequestFormTemplate;
  onBack: () => void;
  onSaved: (msg: string) => void;
};

export function HrmRequestEditorView({ template, onBack, onSaved }: Props) {
  const isTimekeep =
    template.id.includes('timekeep') ||
    template.title.toLowerCase().includes('chấm công') ||
    template.title.toLowerCase().includes('giải trình');

  const isOvertime =
    template.id.includes('overtime') ||
    template.title.toLowerCase().includes('tăng ca');

  const isLeave =
    template.id.includes('leave') ||
    template.title.toLowerCase().includes('nghỉ phép') ||
    template.title.toLowerCase().includes('nghỉ không lương') ||
    template.title.toLowerCase().includes('nghỉ ốm');

  const [employee, setEmployee] = useState('Nguyễn Kiều Phước');

  // Fields cho Giải trình chấm công
  const [targetDate, setTargetDate] = useState('2026-09-04');
  const [reason, setReason] = useState('');
  const [shift, setShift] = useState('(HC1) Hành chính');
  const [explainType, setExplainType] = useState<'both' | 'in' | 'out'>('both');
  const [timeIn, setTimeIn] = useState('08:00');
  const [timeOut, setTimeOut] = useState('17:30');
  const [hours, setHours] = useState('8.00');

  // Fields cho Đơn đăng ký tăng ca (Kế thừa và khớp hình gửi)
  const [fromDate, setFromDate] = useState('2026-09-04');
  const [toDate, setToDate] = useState('2026-09-04');
  const [explanation, setExplanation] = useState('');
  const [otTimeFrom, setOtTimeFrom] = useState('00:00');
  const [otTimeTo, setOtTimeTo] = useState('00:00');
  const [otHours, setOtHours] = useState('8.00');
  const [quickDatePreset, setQuickDatePreset] = useState<'today' | 'tomorrow' | 'nextWeek' | null>('today');

  // Fields cho Đơn nghỉ phép (Kế thừa và khớp hình gửi)
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveTimeFrom, setLeaveTimeFrom] = useState('00:00');
  const [leaveTimeTo, setLeaveTimeTo] = useState('00:00');
  const [leaveHours, setLeaveHours] = useState('8.00');

  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  // 2. Thông tin phân loại bên phải
  const [unit, setUnit] = useState('Công ty CP GPCN ARITO');
  const [docNumber] = useState('7700');
  const [createDate] = useState('04/09/2026');
  const [tag, setTag] = useState(isLeave ? 'Nghỉ phép' : isOvertime ? 'Tăng ca' : 'Chấm công');
  const [status] = useState('Nháp');

  const handleSetQuickDate = (type: 'today' | 'tomorrow' | 'nextWeek') => {
    setQuickDatePreset(type);
    if (type === 'today') {
      setFromDate('2026-09-04');
      setToDate('2026-09-04');
    } else if (type === 'tomorrow') {
      setFromDate('2026-09-05');
      setToDate('2026-09-05');
    } else if (type === 'nextWeek') {
      setFromDate('2026-09-07');
      setToDate('2026-09-11');
    }
  };

  // 3. Tabs dưới
  const [activeTab, setActiveTab] = useState<'approval' | 'files' | 'history'>('approval');

  // 4. Danh sách cấp duyệt (Tab Thông tin duyệt)
  const [steps, setSteps] = useState<ApprovalStep[]>([
    {
      id: 'step-1',
      order: 1,
      method: 'Duyệt trên hệ thống',
      roleName: 'Line Manager',
      sendEmail: true,
      signType: 'Ký duyệt lần lượt',
      approvers: [{ name: 'Nghia (Alden) Tran', email: 'nghiatq@arito.vn' }],
      viewer: '',
    },
    {
      id: 'step-2',
      order: 2,
      method: 'Duyệt trên hệ thống',
      roleName: 'Head of Department',
      sendEmail: true,
      signType: 'Ký duyệt lần lượt',
      approvers: [{ name: 'Nguyễn Hữu Tâm', email: 'tamnh@arito.vn' }],
      viewer: '',
    },
  ]);

  // 5. Files đính kèm
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; size: string }[]>([]);

  // 6. Lịch sử duyệt/hủy
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([
    {
      id: 'h-1',
      userCode: 'AT-7700',
      userName: employee,
      action: 'Tạo mới đơn từ (Bản nháp)',
      time: '04/09/2026 08:00',
      statusTag: 'draft',
    },
  ]);

  // Thao tác cấp duyệt
  const handleRoleNameChange = (stepId: string, newRole: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, roleName: newRole } : s))
    );
  };

  const handleApproverChange = (stepId: string, email: string) => {
    const found = APPROVER_OPTIONS.find((opt) => opt.value === email);
    if (!found) return;
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              roleName:
                s.roleName && !s.roleName.startsWith('Cấp duyệt')
                  ? s.roleName
                  : (APPROVER_DEFAULT_ROLES[email] || s.roleName),
              approvers: [{ name: found.label, email: found.value }],
            }
          : s,
      ),
    );
  };

  const handleToggleEmail = (stepId: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, sendEmail: !s.sendEmail } : s))
    );
  };

  const handleAddStep = () => {
    const nextOrder = steps.length + 1;
    const usedEmails = new Set(steps.map((s) => s.approvers[0]?.email));
    const nextApprover =
      APPROVER_OPTIONS.find((opt) => !usedEmails.has(opt.value)) ||
      APPROVER_OPTIONS[(nextOrder - 1) % APPROVER_OPTIONS.length];

    const defaultRole = APPROVER_DEFAULT_ROLES[nextApprover.value] || `Cấp duyệt ${nextOrder}`;

    const newStep: ApprovalStep = {
      id: `step-${Date.now()}`,
      order: nextOrder,
      method: 'Duyệt trên hệ thống',
      roleName: defaultRole,
      sendEmail: true,
      signType: 'Ký duyệt lần lượt',
      approvers: [{ name: nextApprover.label, email: nextApprover.value }],
      viewer: '',
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const handleDeleteStep = (stepId: string) => {
    if (steps.length <= 1) {
      alert('Đơn từ cần tối thiểu 1 cấp phê duyệt.');
      return;
    }
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== stepId)
        .map((s, idx) => ({ ...s, order: idx + 1 })),
    );
  };

  const [draggedStepIdx, setDraggedStepIdx] = useState<number | null>(null);
  const [dragOverStepIdx, setDragOverStepIdx] = useState<number | null>(null);
  const [moveMenuStepId, setMoveMenuStepId] = useState<string | null>(null);

  useEffect(() => {
    if (!moveMenuStepId) return;
    const handleDocClick = () => setMoveMenuStepId(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [moveMenuStepId]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedStepIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedStepIdx !== null && draggedStepIdx !== index) {
      if (dragOverStepIdx !== index) {
        setDragOverStepIdx(index);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedStepIdx(null);
    setDragOverStepIdx(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    let sourceIdx = draggedStepIdx;
    if (sourceIdx === null) {
      try {
        const data = e.dataTransfer.getData('text/plain');
        if (data !== '') sourceIdx = parseInt(data, 10);
      } catch {}
    }
    if (sourceIdx === null || isNaN(sourceIdx) || sourceIdx === targetIndex) {
      setDraggedStepIdx(null);
      setDragOverStepIdx(null);
      return;
    }
    const newSteps = [...steps];
    const [movedItem] = newSteps.splice(sourceIdx, 1);
    newSteps.splice(targetIndex, 0, movedItem);
    setSteps(newSteps.map((s, idx) => ({ ...s, order: idx + 1 })));
    setDraggedStepIdx(null);
    setDragOverStepIdx(null);
    setMoveMenuStepId(null);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIdx];
    newSteps[targetIdx] = temp;
    setSteps(newSteps.map((s, idx) => ({ ...s, order: idx + 1 })));
    setMoveMenuStepId(null);
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newItems = Array.from(files).map((f) => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
    }));
    setAttachedFiles((prev) => [...prev, ...newItems]);
  };

  const handleSave = (isDraft: boolean) => {
    const action = isDraft ? 'Lưu bản nháp' : 'Gửi phê duyệt';
    setHistoryLogs((prev) => [
      {
        id: `h-${Date.now()}`,
        userCode: 'AT-7700',
        userName: employee,
        action: isDraft ? 'Lưu bản nháp' : 'Gửi đơn chờ phê duyệt',
        time: '04/09/2026 08:30',
        statusTag: isDraft ? 'draft' : 'submit',
      },
      ...prev,
    ]);
    onSaved(`Đã ${action} thành công: "${template.title}" (Mã: #${docNumber})!`);
  };

  const iconTheme = getTemplateIconTheme(template.category, template.id);

  return (
    <div className="hrm-editor-v3">
      {/* 1. TOP NAV: NÚT QUAY LẠI & BADGE TRẠNG THÁI */}
      <div className="hrm-editor-v3__top-nav">
        <button
          type="button"
          className="hrm-editor-v3__back-btn"
          onClick={onBack}
          title="Quay lại danh mục"
        >
          <FormIcon name="arrow-left" size={16} />
          <span>Danh mục đơn từ</span>
        </button>
        <div className="hrm-editor-v3__status-tag">
          <span className="hrm-editor-v3__status-dot" />
          <span>{status}</span>
          <span className="hrm-editor-v3__status-id">#{docNumber}</span>
        </div>
      </div>

      {/* 2. HERO BANNER: BIỂU TƯỢNG VÀ TIÊU ĐỀ ĐƠN (KHÔNG BỊ BÓ HẸP CHIỀU NGANG) */}
      <div className="hrm-editor-v3__hero-card">
        <div
          className="hrm-editor-v3__hero-icon"
          style={{
            backgroundColor: iconTheme.bg,
            color: iconTheme.color,
            borderColor: iconTheme.border,
          }}
        >
          <FormIcon name={template.icon} size={22} />
        </div>
        <div className="hrm-editor-v3__hero-info">
          <h1 className="hrm-editor-v3__title">{template.title}</h1>
          <p className="hrm-editor-v3__desc">{template.desc || 'Điền đầy đủ thông tin bên dưới để gửi phê duyệt'}</p>
        </div>
      </div>

      {/* 3. CARD 1: THÔNG TIN CHUNG */}
      <div className="hrm-editor-v3__card">
        <div className="hrm-editor-v3__card-title">
          <FormIcon name="file-text" size={16} />
          <span>Thông tin chung</span>
        </div>

        <div className="hrm-editor-v3__form-body">
          {/* Người làm đơn */}
          <div className="hrm-editor-v3__field-item">
            <label className="hrm-editor-v3__field-label">Nhân viên</label>
            <HrmSelect
              variant="user"
              value={employee}
              options={EMPLOYEE_OPTIONS}
              onChange={setEmployee}
            />
          </div>

          {/* Form theo nghiệp vụ giải trình chấm công */}
          {isTimekeep ? (
            <>
              {/* Ngày cần giải trình */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Ngày cần giải trình <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__input-wrap">
                  <input
                    type="date"
                    className="hrm-editor-v3__input"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                  <span className="hrm-editor-v3__input-icon">
                    <FormIcon name="calendar" size={16} />
                  </span>
                </div>
              </div>

              {/* Ca đăng ký */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Ca đăng ký</label>
                <HrmSelect
                  value={shift}
                  options={SHIFT_OPTIONS}
                  onChange={setShift}
                />
              </div>

              {/* Lượt chấm công giải trình (Segmented Controls) */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Lượt chấm công giải trình <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__segment-grid">
                  <button
                    type="button"
                    className={`hrm-editor-v3__segment-btn ${explainType === 'both' ? 'is-active' : ''}`}
                    onClick={() => setExplainType('both')}
                  >
                    Cả vào & ra
                  </button>
                  <button
                    type="button"
                    className={`hrm-editor-v3__segment-btn ${explainType === 'in' ? 'is-active' : ''}`}
                    onClick={() => setExplainType('in')}
                  >
                    Giờ vào
                  </button>
                  <button
                    type="button"
                    className={`hrm-editor-v3__segment-btn ${explainType === 'out' ? 'is-active' : ''}`}
                    onClick={() => setExplainType('out')}
                  >
                    Giờ ra
                  </button>
                </div>
              </div>

              {/* Thời gian ghi nhận (Cho người dùng nhập trực tiếp) */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Thời gian ghi nhận <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__time-type-row">
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ vào</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={timeIn}
                      onChange={(e) => setTimeIn(e.target.value)}
                      placeholder="08:00"
                    />
                  </div>
                  <span className="hrm-editor-v3__time-sep">➔</span>
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ ra</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={timeOut}
                      onChange={(e) => setTimeOut(e.target.value)}
                      placeholder="17:30"
                    />
                  </div>
                </div>
              </div>

              {/* Số giờ */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Số giờ</label>
                <div className="hrm-editor-v3__input-wrap">
                  <input
                    type="text"
                    className="hrm-editor-v3__input"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="8.00"
                  />
                </div>
              </div>

              {/* Lý do giải trình */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Lý do giải trình <span className="hrm-editor-v3__req">*</span>
                </label>
                <textarea
                  className="hrm-editor-v3__textarea"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ghi rõ lý do (ví dụ: quên bấm vân tay khi đến văn phòng, đi gặp khách hàng từ đầu giờ sáng, sự cố máy quét...)"
                />
              </div>
            </>
          ) : isOvertime ? (
            <>
              {/* 1. Ngày từ/đến (có phím tắt Hôm nay, Ngày mai, Tuần tiếp theo) */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Ngày từ/đến <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__date-range-wrap">
                  <div className="hrm-editor-v3__date-inputs-row">
                    <div className="hrm-editor-v3__date-input-wrap">
                      <input
                        type="date"
                        className="hrm-editor-v3__input"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setQuickDatePreset(null);
                        }}
                      />
                    </div>
                    <span className="hrm-editor-v3__date-sep">➔</span>
                    <div className="hrm-editor-v3__date-input-wrap">
                      <input
                        type="date"
                        className="hrm-editor-v3__input"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setQuickDatePreset(null);
                        }}
                      />
                    </div>
                  </div>
                  <div className="hrm-editor-v3__quick-dates-row">
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'today' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('today')}
                    >
                      <FormIcon name="calendar" size={13} />
                      <span>Hôm nay</span>
                    </button>
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'tomorrow' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('tomorrow')}
                    >
                      <span>Ngày mai</span>
                    </button>
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'nextWeek' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('nextWeek')}
                    >
                      <span>Tuần tiếp theo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Diễn giải */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Diễn giải <span className="hrm-editor-v3__req">*</span>
                </label>
                <textarea
                  className="hrm-editor-v3__textarea"
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Ghi rõ nội dung, lý do tăng ca (ví dụ: Triển khai dự án ERP cho khách hàng, xử lý sự cố server...)"
                />
              </div>

              {/* 3. Ca đăng ký */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Ca đăng ký</label>
                <HrmSelect
                  value={shift}
                  options={SHIFT_OPTIONS}
                  onChange={setShift}
                />
              </div>

              {/* 4. Giờ từ/đến */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Giờ từ/đến <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__time-type-row">
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ từ</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={otTimeFrom}
                      onChange={(e) => setOtTimeFrom(e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                  <span className="hrm-editor-v3__time-sep">➔</span>
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ đến</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={otTimeTo}
                      onChange={(e) => setOtTimeTo(e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Số giờ */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Số giờ</label>
                <div className="hrm-editor-v3__input-wrap">
                  <input
                    type="text"
                    className="hrm-editor-v3__input"
                    value={otHours}
                    onChange={(e) => setOtHours(e.target.value)}
                    placeholder="8.00"
                  />
                </div>
              </div>
            </>
          ) : isLeave ? (
            <>
              {/* 1. Ngày từ/đến (có phím tắt Hôm nay, Ngày mai, Tuần tiếp theo) */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Ngày từ/đến <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__date-range-wrap">
                  <div className="hrm-editor-v3__date-inputs-row">
                    <div className="hrm-editor-v3__date-input-wrap">
                      <input
                        type="date"
                        className="hrm-editor-v3__input"
                        value={fromDate}
                        onChange={(e) => {
                          setFromDate(e.target.value);
                          setQuickDatePreset(null);
                        }}
                      />
                    </div>
                    <span className="hrm-editor-v3__date-sep">➔</span>
                    <div className="hrm-editor-v3__date-input-wrap">
                      <input
                        type="date"
                        className="hrm-editor-v3__input"
                        value={toDate}
                        onChange={(e) => {
                          setToDate(e.target.value);
                          setQuickDatePreset(null);
                        }}
                      />
                    </div>
                  </div>
                  <div className="hrm-editor-v3__quick-dates-row">
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'today' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('today')}
                    >
                      <FormIcon name="calendar" size={13} />
                      <span>Hôm nay</span>
                    </button>
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'tomorrow' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('tomorrow')}
                    >
                      <span>Ngày mai</span>
                    </button>
                    <button
                      type="button"
                      className={`hrm-editor-v3__quick-btn ${quickDatePreset === 'nextWeek' ? 'is-active' : ''}`}
                      onClick={() => handleSetQuickDate('nextWeek')}
                    >
                      <span>Tuần tiếp theo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. Lý do */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Lý do <span className="hrm-editor-v3__req">*</span>
                </label>
                <textarea
                  className="hrm-editor-v3__textarea"
                  rows={2}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Ghi rõ lý do nghỉ phép (ví dụ: việc gia đình, khám sức khỏe, giải quyết việc cá nhân...)"
                />
              </div>

              {/* 3. Ca đăng ký */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Ca đăng ký</label>
                <HrmSelect
                  value={shift}
                  options={SHIFT_OPTIONS}
                  onChange={setShift}
                />
              </div>

              {/* 4. Giờ từ/đến */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">
                  Giờ từ/đến <span className="hrm-editor-v3__req">*</span>
                </label>
                <div className="hrm-editor-v3__time-type-row">
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ từ</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={leaveTimeFrom}
                      onChange={(e) => setLeaveTimeFrom(e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                  <span className="hrm-editor-v3__time-sep">➔</span>
                  <div className="hrm-editor-v3__time-input-wrap">
                    <span className="hrm-editor-v3__time-sublabel">Giờ đến</span>
                    <input
                      type="text"
                      className="hrm-editor-v3__input hrm-editor-v3__input--time-text"
                      value={leaveTimeTo}
                      onChange={(e) => setLeaveTimeTo(e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Số giờ kèm thông tin ngày phép tồn */}
              <div className="hrm-editor-v3__field-item">
                <label className="hrm-editor-v3__field-label">Số giờ</label>
                <div className="hrm-editor-v3__hours-with-quota">
                  <input
                    type="text"
                    className="hrm-editor-v3__input hrm-editor-v3__input--hours-short"
                    value={leaveHours}
                    onChange={(e) => setLeaveHours(e.target.value)}
                    placeholder="8.00"
                  />
                  <span className="hrm-editor-v3__quota-text">
                    (Ngày phép đã dùng <strong>14.06</strong> của <strong>14</strong> ngày phép, còn lại: <strong>-0.06 ngày</strong>)
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Dynamic fields cho 38 loại đơn khác */
            template.fields
              .filter((f) => f.id !== 'reason' && f.id !== 'attachment')
              .map((field) => (
                <div key={field.id} className="hrm-editor-v3__field-item">
                  <label className="hrm-editor-v3__field-label">
                    {field.label} {field.required ? <span className="hrm-editor-v3__req">*</span> : null}
                  </label>
                  {field.type === 'select' ? (
                    <HrmSelect
                      value={customFields[field.id] || ''}
                      placeholder={`-- Chọn ${field.label.toLowerCase()} --`}
                      options={field.options?.map((opt) => ({ value: opt.value, label: opt.label })) || []}
                      onChange={(val) =>
                        setCustomFields({ ...customFields, [field.id]: val })
                      }
                    />
                  ) : (
                    <input
                      type={field.type === 'date' ? 'date' : 'text'}
                      className="hrm-editor-v3__input"
                      placeholder={field.placeholder || `Nhập ${field.label.toLowerCase()}...`}
                      value={customFields[field.id] || ''}
                      onChange={(e) =>
                        setCustomFields({ ...customFields, [field.id]: e.target.value })
                      }
                    />
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {/* 4. CARD 2: THÔNG TIN PHÂN LOẠI (ĐÃ BỎ QUY TRÌNH DUYỆT VÀ NGƯỜI THEO DÕI) */}
      <div className="hrm-editor-v3__card">
        <div className="hrm-editor-v3__card-title">
          <FormIcon name="tag" size={16} />
          <span>Thông tin phân loại</span>
        </div>

        <div className="hrm-editor-v3__form-body">
          {/* Đơn vị */}
          <div className="hrm-editor-v3__field-item">
            <label className="hrm-editor-v3__field-label">Đơn vị</label>
            <HrmSelect
              value={unit}
              options={UNIT_OPTIONS}
              onChange={setUnit}
            />
          </div>

          <div className="hrm-editor-v3__grid-2">
            <div className="hrm-editor-v3__field-item">
              <label className="hrm-editor-v3__field-label">Gắn thẻ</label>
              <HrmSelect
                value={tag}
                options={TAG_OPTIONS}
                onChange={setTag}
              />
            </div>

            <div className="hrm-editor-v3__field-item">
              <label className="hrm-editor-v3__field-label">Số đơn / Ngày lập</label>
              <div className="hrm-editor-v3__meta-row-2">
                <input
                  type="text"
                  className="hrm-editor-v3__input"
                  value={`#${docNumber}`}
                  readOnly
                  title="Mã số đơn"
                />
                <input
                  type="text"
                  className="hrm-editor-v3__input"
                  value={createDate}
                  readOnly
                  title="Ngày lập"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. CARD 3: QUY TRÌNH DUYỆT & TẬP TIN ĐÍNH KÈM */}
      <div className="hrm-editor-v3__card">
        <div className="hrm-editor-v3__tab-bar">
          <button
            type="button"
            className={`hrm-editor-v3__tab-btn ${activeTab === 'approval' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('approval')}
          >
            <FormIcon name="users" size={15} />
            <span>Người duyệt ({steps.length})</span>
          </button>
          <button
            type="button"
            className={`hrm-editor-v3__tab-btn ${activeTab === 'files' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <FormIcon name="paperclip" size={15} />
            <span>Đính kèm {attachedFiles.length > 0 ? `(${attachedFiles.length})` : ''}</span>
          </button>
          <button
            type="button"
            className={`hrm-editor-v3__tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FormIcon name="clock" size={15} />
            <span>Lịch sử</span>
          </button>
        </div>

        <div className="hrm-editor-v3__tab-body">
          {activeTab === 'approval' ? (
            <div className="hrm-editor-v3__steps-flow">
              {steps.map((st, idx) => (
                <div
                  key={st.id}
                  className={`hrm-editor-v3__step-item ${draggedStepIdx === idx ? 'is-dragging' : ''} ${dragOverStepIdx === idx ? 'is-drag-over' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, idx)}
                >
                  <div className="hrm-editor-v3__step-top">
                    <div className="hrm-editor-v3__step-header-left">
                      <span className="hrm-editor-v3__step-badge">{st.order}</span>
                      <div className="hrm-editor-v3__step-role-edit-wrap">
                        <input
                          type="text"
                          className="hrm-editor-v3__step-role-input"
                          value={st.roleName}
                          onChange={(e) => handleRoleNameChange(st.id, e.target.value)}
                          placeholder="Chức vụ phê duyệt..."
                          draggable={false}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="Bấm để chỉnh sửa tên chức vụ"
                        />
                        <span className="hrm-editor-v3__step-role-edit-icon" title="Chỉnh sửa tên chức vụ">
                          <FormIcon name="edit" size={11} />
                        </span>
                      </div>
                    </div>
                    <div className="hrm-editor-v3__step-tools">
                      <button
                        type="button"
                        className={`hrm-editor-v3__btn-email-toggle ${st.sendEmail ? 'is-active' : ''}`}
                        onClick={() => handleToggleEmail(st.id)}
                        title={st.sendEmail ? 'Nhận thông báo qua email: Đang bật' : 'Nhận thông báo qua email: Đang tắt'}
                      >
                        <FormIcon name="mail" size={12} />
                        <span>Email</span>
                      </button>

                      {/* Nút kéo thả di chuyển vị trí (chỉ icon) */}
                      <div className="hrm-editor-v3__drag-handle-wrap">
                        <div
                          role="button"
                          tabIndex={0}
                          className="hrm-editor-v3__btn-drag-handle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveMenuStepId(moveMenuStepId === st.id ? null : st.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setMoveMenuStepId(moveMenuStepId === st.id ? null : st.id);
                            }
                          }}
                          title="Kéo thả để đổi thứ tự duyệt hoặc bấm để di chuyển"
                        >
                          <FormIcon name="grip-vertical" size={14} />
                        </div>

                        {moveMenuStepId === st.id ? (
                          <div className="hrm-editor-v3__quick-move-popover">
                            <button
                              type="button"
                              className="hrm-editor-v3__quick-move-btn"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveStep(idx, 'up');
                              }}
                            >
                              <FormIcon name="arrow-up" size={13} />
                              <span>Di chuyển lên</span>
                            </button>
                            <button
                              type="button"
                              className="hrm-editor-v3__quick-move-btn"
                              disabled={idx === steps.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveStep(idx, 'down');
                              }}
                            >
                              <FormIcon name="arrow-down" size={13} />
                              <span>Di chuyển xuống</span>
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="hrm-editor-v3__mini-btn is-danger"
                        onClick={() => handleDeleteStep(st.id)}
                        title="Xóa cấp duyệt"
                      >
                        <FormIcon name="trash" size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Combo box chọn người duyệt */}
                  <div
                    className="hrm-editor-v3__step-approver-wrap"
                    draggable={false}
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <HrmSelect
                      variant="user"
                      value={st.approvers[0]?.email || ''}
                      options={
                        APPROVER_OPTIONS.some((o) => o.value === st.approvers[0]?.email)
                          ? APPROVER_OPTIONS
                          : [
                              {
                                value: st.approvers[0]?.email || '',
                                label: st.approvers[0]?.name || '',
                                sub: st.approvers[0]?.email || '',
                                avatar: (st.approvers[0]?.name || 'NV').charAt(0),
                              },
                              ...APPROVER_OPTIONS,
                            ]
                      }
                      onChange={(newEmail) => handleApproverChange(st.id, newEmail)}
                      placeholder="-- Chọn người duyệt --"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="hrm-editor-v3__btn-add-step"
                onClick={handleAddStep}
              >
                <FormIcon name="plus" size={15} />
                <span>Thêm cấp phê duyệt</span>
              </button>
            </div>
          ) : activeTab === 'files' ? (
            <div className="hrm-editor-v3__files-pane">
              <label className="hrm-editor-v3__dropzone">
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <div className="hrm-editor-v3__dropzone-icon">
                  <FormIcon name="upload-cloud" size={24} />
                </div>
                <span className="hrm-editor-v3__dropzone-title">Bấm để tải tệp minh chứng</span>
                <span className="hrm-editor-v3__dropzone-sub">
                  Ảnh chụp màn hình, PDF, Word, Excel (Tối đa 10MB)
                </span>
              </label>

              {attachedFiles.length > 0 ? (
                <div className="hrm-editor-v3__file-list">
                  {attachedFiles.map((file, i) => (
                    <div key={i} className="hrm-editor-v3__file-row">
                      <FormIcon name="file-text" size={15} />
                      <span className="hrm-editor-v3__file-name">{file.name}</span>
                      <span className="hrm-editor-v3__file-size">{file.size}</span>
                      <button
                        type="button"
                        className="hrm-editor-v3__file-del"
                        onClick={() =>
                          setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      >
                        <FormIcon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hrm-editor-v3__history-wrap">
              <div className="hrm-editor-v3__history-table-container">
                <table className="hrm-editor-v3__history-table">
                  <thead>
                    <tr>
                      <th>Người thực hiện</th>
                      <th>Tên người thực hiện</th>
                      <th>Hành động</th>
                      <th>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <span className="hrm-editor-v3__hist-code">{log.userCode}</span>
                        </td>
                        <td>
                          <div className="hrm-editor-v3__hist-user">
                            <span className="hrm-editor-v3__hist-avatar">
                              {log.userName.charAt(0)}
                            </span>
                            <span className="hrm-editor-v3__hist-name">{log.userName}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`hrm-editor-v3__hist-action is-${log.statusTag || 'draft'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <span className="hrm-editor-v3__hist-time">{log.time}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. STICKY BOTTOM ACTION BAR: CỐ ĐỊNH PHÍA DƯỚI DỄ BẤM TRÊN ĐIỆN THOẠI & WEB */}
      <div className="hrm-editor-v3__bottom-bar">
        <div className="hrm-editor-v3__bottom-bar-inner">
          <button
            type="button"
            className="hrm-editor-v3__btn-cancel"
            onClick={onBack}
            title="Đóng / Quay lại"
          >
            <FormIcon name="x" size={14} />
            <span>Đóng</span>
          </button>
          <button
            type="button"
            className="hrm-editor-v3__btn-draft"
            onClick={() => handleSave(true)}
            title="Lưu bản nháp"
          >
            <FormIcon name="save" size={14} />
            <span>Lưu</span>
          </button>
          <button
            type="button"
            className="hrm-editor-v3__btn-submit"
            onClick={() => handleSave(false)}
            title="Gửi phê duyệt"
          >
            <FormIcon name="send" size={14} />
            <span>Gửi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
