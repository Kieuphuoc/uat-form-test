import React from 'react';
import { createPortal } from 'react-dom';
import { FormIcon } from '../form/FormIcon';

export type HrmStatItem = {
  id: string;
  label: string;
  count: number;
  icon: string;
  tone: 'urgent' | 'today' | 'total' | 'ok' | 'no';
  selected?: boolean;
  onClick?: () => void;
};

export type HrmFilterTabItem = {
  id: string;
  label: string;
  count: number;
};

/**
 * 1. HrmStatGrid: Bộ 3 thẻ thống kê với họa tiết chấm bi ma trận radial-gradient
 */
export function HrmStatGrid({ items }: { items: HrmStatItem[] }) {
  return (
    <div className="hrm-pend-v2__stats">
      {items.map((it) => (
        <div
          key={it.id}
          className={`hrm-pend-v2__stat${it.selected ? ' is-selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={it.onClick}
        >
          <span className={`hrm-pend-v2__stat-icon hrm-pend-v2__stat-icon--${it.tone}`}>
            <FormIcon name={it.icon} size={18} />
          </span>
          <strong>{it.count}</strong>
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 2. HrmSearchToolbar: Thanh tìm kiếm + Nút Chọn nhiều + Tabs phân loại + Hàng Chọn tất cả
 */
export function HrmSearchToolbar({
  query,
  onQueryChange,
  placeholder = 'Tìm kiếm…',
  batchMode = false,
  onToggleBatchMode,
  tabs,
  activeTab,
  onTabChange,
  totalItemsCount = 0,
  selectedCount = 0,
  onSelectAllVisible,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  batchMode?: boolean;
  onToggleBatchMode?: () => void;
  tabs: HrmFilterTabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  totalItemsCount?: number;
  selectedCount?: number;
  onSelectAllVisible?: () => void;
}) {
  return (
    <div className="hrm-pend-v2__toolbar">
      <div className="hrm-pend-v2__search-row">
        <label className="hrm-pend-v2__search">
          <span className="hrm-pend-v2__search-icon" aria-hidden>
            <FormIcon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            placeholder={placeholder}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="hrm-pend-v2__search-clear"
              onClick={() => onQueryChange('')}
              aria-label="Xóa tìm kiếm"
            >
              <FormIcon name="x" size={14} />
            </button>
          ) : null}
        </label>
        {onToggleBatchMode ? (
          <button
            type="button"
            className={`hrm-pend-v2__batch-toggle${batchMode ? ' is-active' : ''}`}
            onClick={onToggleBatchMode}
            title={batchMode ? 'Hủy chọn' : 'Chọn nhiều'}
          >
            <FormIcon name="check-square" size={14} />
            <span>{batchMode ? 'Hủy' : 'Chọn nhiều'}</span>
          </button>
        ) : null}
      </div>

      <div className="hrm-pend-v2__tabs" role="tablist" aria-label="Bộ lọc">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`hrm-pend-v2__tab${activeTab === t.id ? ' is-active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <span>{t.label}</span>
            <em>{t.count}</em>
          </button>
        ))}
      </div>

      {batchMode && totalItemsCount > 0 ? (
        <div className="hrm-pend-v2__batch-header">
          <label className="hrm-pend-v2__select-all-label">
            <input
              type="checkbox"
              checked={selectedCount === totalItemsCount && totalItemsCount > 0}
              onChange={onSelectAllVisible}
            />
            <span>Chọn tất cả ({totalItemsCount})</span>
          </label>
          <span className="hrm-pend-v2__selected-count">
            Đã chọn: <strong>{selectedCount}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 3. HrmApprovalCard: Thẻ hiển thị đơn từ HRM dùng chung cho cả Chờ duyệt & Đã xử lý
 * Đảm bảo 100% đồng nhất vị trí icon, tiêu đề, người gửi, lý do, chân thẻ và hành vi.
 */
export type HrmApprovalCardProps = {
  id: string;
  title: string;
  iconName: string;
  sender: string;
  department?: string;
  reason?: string;
  date: string;
  footerRightText: string;
  badge: React.ReactNode;
  actions?: React.ReactNode;
  isSelected?: boolean;
  batchMode?: boolean;
  onToggleSelect?: () => void;
  onClick?: () => void;
};

export function HrmApprovalCard({
  title,
  iconName,
  sender,
  department,
  reason,
  date,
  footerRightText,
  badge,
  actions,
  isSelected = false,
  batchMode = false,
  onToggleSelect,
  onClick,
}: HrmApprovalCardProps) {
  return (
    <div className={`hrm-pend-v2__card${isSelected ? ' is-selected' : ''}`}>
      <div
        className="hrm-pend-v2__card-body"
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {batchMode ? (
          <div
            className="hrm-pend-v2__checkbox-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
            />
          </div>
        ) : null}

        <span className="hrm-pend-v2__card-icon" aria-hidden>
          <FormIcon name={iconName} size={20} />
        </span>

        <div className="hrm-pend-v2__card-content">
          <div className="hrm-pend-v2__card-top">
            <h3 className="hrm-pend-v2__card-title">{title}</h3>
            {badge}
          </div>

          <div className="hrm-pend-v2__card-sender">
            <span>{sender}</span>
            {department ? (
              <span className="hrm-pend-v2__card-dept"> · {department}</span>
            ) : null}
          </div>

          {reason ? (
            <p className="hrm-pend-v2__card-reason">{reason}</p>
          ) : null}

          <div className="hrm-pend-v2__card-footer">
            <span className="hrm-pend-v2__card-time">
              <FormIcon name="clock" size={12} />
              {date}
            </span>
            <span className="hrm-pend-v2__card-id">{footerRightText}</span>
          </div>
        </div>
      </div>

      {actions}
    </div>
  );
}

/**
 * 4. HrmFloatingBatchBar: Thanh tác vụ nổi ở đáy màn hình khi chọn nhiều
 */
export function HrmFloatingBatchBar({
  selectedCount,
  onClear,
  onSubmit,
  submitLabel,
  submitIcon = 'check-check',
}: {
  selectedCount: number;
  onClear: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon?: string;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="hrm-pend-v2__floating-bar" role="toolbar">
      <div className="hrm-pend-v2__floating-text">
        Đã chọn <strong>{selectedCount}</strong> phiếu
      </div>
      <div className="hrm-pend-v2__floating-actions">
        <button
          type="button"
          className="hrm-pend-v2__floating-cancel"
          onClick={onClear}
        >
          Bỏ chọn
        </button>
        <button
          type="button"
          className="hrm-pend-v2__floating-submit"
          onClick={onSubmit}
        >
          <FormIcon name={submitIcon} size={16} />
          <span>{submitLabel}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * 5. HrmWorkflowTimeline: Sơ đồ tiến trình duyệt trong modal
 */
export function HrmWorkflowTimeline({
  sender,
  requestDate,
  approver,
  processDate,
  statusLabel,
  isRejected = false,
}: {
  sender: string;
  requestDate: string;
  approver?: string;
  processDate?: string;
  statusLabel?: string;
  isRejected?: boolean;
}) {
  return (
    <div className="hrm-pend-v2__timeline-card">
      <span className="hrm-pend-v2__timeline-title">Tiến trình phê duyệt</span>
      <div className="hrm-pend-v2__timeline-list">
        <div className="hrm-pend-v2__timeline-step is-done">
          <span className="hrm-pend-v2__timeline-dot" />
          <div className="hrm-pend-v2__timeline-info">
            <strong>Tạo đơn</strong>
            <span>{sender} ({requestDate})</span>
          </div>
        </div>
        {approver ? (
          <div className={`hrm-pend-v2__timeline-step ${isRejected ? 'is-reject' : 'is-done'}`}>
            <span className="hrm-pend-v2__timeline-dot" />
            <div className="hrm-pend-v2__timeline-info">
              <strong>{statusLabel || 'Phê duyệt'}</strong>
              <span>{approver} ({processDate || ''})</span>
            </div>
          </div>
        ) : (
          <div className="hrm-pend-v2__timeline-step is-current">
            <span className="hrm-pend-v2__timeline-dot" />
            <div className="hrm-pend-v2__timeline-info">
              <strong>Chờ phê duyệt</strong>
              <span>Cấp quản lý trực tiếp / Trưởng bộ phận</span>
            </div>
          </div>
        )}
        <div className={`hrm-pend-v2__timeline-step ${approver && !isRejected ? 'is-done' : ''}`}>
          <span className="hrm-pend-v2__timeline-dot" />
          <div className="hrm-pend-v2__timeline-info">
            <strong>Lưu trữ hồ sơ nhân sự</strong>
            <span>Hệ thống Arito HRM {approver ? '(Hoàn tất)' : '(Chờ duyệt xong)'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 6. HrmDetailHeaderNav: Thanh điều hướng quay lại danh sách bên trong chi tiết phiếu
 * Phân định rõ:
 * - Nút trên Header của màn hình: Quay lại Màn hình chính HRM (< Màn hình chính)
 * - Nút này trong trang: Quay lại Danh sách phiếu (← Quay lại danh sách)
 */
export function HrmDetailHeaderNav({
  onBack,
  backLabel = 'Danh sách',
  crumbTitle,
}: {
  onBack: () => void;
  backLabel?: string;
  crumbTitle?: string;
}) {
  return (
    <div className="hrm-detail-nav">
      <button
        type="button"
        className="hrm-detail-nav__back"
        onClick={onBack}
        title={backLabel}
      >
        <FormIcon name="arrow-left" size={14} />
        <span>{backLabel}</span>
      </button>
      {crumbTitle ? (
        <span className="hrm-detail-nav__title">{crumbTitle}</span>
      ) : null}
    </div>
  );
}

/**
 * 7. HrmCardActionButtons: Cụm 2 nút Duyệt nhanh & Từ chối trên thẻ đơn
 */
export function HrmCardActionButtons({
  onReject,
  onApprove,
  rejectLabel = 'Từ chối',
  approveLabel = 'Duyệt',
}: {
  onReject: (e: React.MouseEvent) => void;
  onApprove: (e: React.MouseEvent) => void;
  rejectLabel?: string;
  approveLabel?: string;
}) {
  return (
    <div className="hrm-pend-v2__action-row">
      <button
        type="button"
        className="hrm-pend-v2__btn-reject"
        onClick={onReject}
      >
        <FormIcon name="x" size={14} />
        <span>{rejectLabel}</span>
      </button>
      <button
        type="button"
        className="hrm-pend-v2__btn-approve"
        onClick={onApprove}
      >
        <FormIcon name="check" size={14} />
        <span>{approveLabel}</span>
      </button>
    </div>
  );
}

/**
 * 8. HrmFooterButton: Nút hành động viên thuốc lớn ở chân trang
 */
export function HrmFooterButton({
  icon = 'check-check',
  label,
  onClick,
  disabled = false,
}: {
  icon?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="hrm-pend-v2__footer-btn"
      disabled={disabled}
      onClick={onClick}
    >
      <FormIcon name={icon} size={16} />
      <span>{label}</span>
    </button>
  );
}

/**
 * 9. HrmActionModal: Modal xác nhận Duyệt / Từ chối kèm nhập lý do
 */
export function HrmActionModal({
  isOpen,
  title,
  itemName,
  senderInfo,
  actionType,
  comment,
  onCommentChange,
  onClose,
  onConfirm,
  confirmLabel,
  placeholder,
}: {
  isOpen: boolean;
  title: string;
  itemName: string;
  senderInfo: string;
  actionType: 'approve' | 'reject';
  comment: string;
  onCommentChange: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  placeholder?: string;
}) {
  if (!isOpen) return null;
  const isReject = actionType === 'reject';
  const modalContent = (
    <div
      className="hrm-pend-v2__modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hrm-pend-v2__modal">
        <div className="hrm-pend-v2__modal-head">
          <h3 className="hrm-pend-v2__modal-title">{title}</h3>
          <button
            type="button"
            className="hrm-pend-v2__modal-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <FormIcon name="x" size={16} />
          </button>
        </div>
        <div className="hrm-pend-v2__modal-body">
          <div className="hrm-pend-v2__modal-summary">
            <strong>{itemName}</strong>
            <span>{senderInfo}</span>
          </div>
          <label className="hrm-pend-v2__modal-label">
            {isReject ? 'Lý do từ chối (bắt buộc):' : 'Ý kiến phê duyệt (không bắt buộc):'}
          </label>
          <textarea
            className="hrm-pend-v2__modal-textarea"
            rows={3}
            value={comment}
            placeholder={
              placeholder ||
              (isReject
                ? 'Nhập lý do không chấp thuận để nhân viên nắm rõ...'
                : 'Ví dụ: Đã xem xét và chấp thuận...')
            }
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </div>
        <div className="hrm-pend-v2__modal-foot">
          <button
            type="button"
            className="hrm-pend-v2__modal-btn-cancel"
            onClick={onClose}
          >
            Đóng
          </button>
          <button
            type="button"
            className={`hrm-pend-v2__modal-btn-confirm${isReject ? ' is-reject' : ' is-approve'}`}
            disabled={isReject && !comment.trim()}
            onClick={onConfirm}
          >
            {confirmLabel || (isReject ? 'Xác nhận từ chối' : 'Xác nhận duyệt')}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
