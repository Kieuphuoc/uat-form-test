import { FormIcon } from '../form/FormIcon';
import type { PendingDetailModel } from '../../lib/hrmPending';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="hrm-pend-detail__row">
      <span className="hrm-pend-detail__label">{label}</span>
      <span className="hrm-pend-detail__value">{value}</span>
    </div>
  );
}

export function HrmPendingDetail({
  model,
  onBack,
  onOpen,
}: {
  model: PendingDetailModel;
  onBack: () => void;
  onOpen?: () => void;
}) {
  const statusLabel =
    model.status ||
    (model.statusKind === 'ok' ? 'Đã duyệt' : model.statusKind === 'no' ? 'Từ chối' : 'Chờ duyệt');
  return (
    <div className="hrm-pend-detail" role="dialog" aria-label="Chi tiết phiếu">
      <button type="button" className="hrm-pend-detail__back" onClick={onBack}>
        <FormIcon name="chevron-left" size={18} />
        Quay lại
      </button>
      <div className="hrm-pend-detail__hero">
        <span className="hrm-pend-detail__icon" aria-hidden>
          <FormIcon name="inbox" size={22} />
        </span>
        <div>
          <p className="hrm-pend-detail__type">{model.type || 'Phiếu duyệt'}</p>
          {model.sender ? <p className="hrm-pend-detail__sender">{model.sender}</p> : null}
        </div>
        {model.statusKind ? (
          <em className={`hrm-pend__status hrm-pend__status--${model.statusKind}`}>{statusLabel}</em>
        ) : null}
      </div>
      <div className="hrm-pend-detail__card">
        <Row label="Người gửi" value={model.sender} />
        <Row label="Loại đơn" value={model.type} />
        <Row label="Thời gian" value={model.time} />
        <Row label="Ghi chú" value={model.note} />
        {model.extras.map((x) => (
          <Row key={x.label} label={x.label} value={x.value} />
        ))}
      </div>
      {onOpen ? (
        <button type="button" className="hrm-pend-detail__open" onClick={onOpen}>
          Mở phiếu
        </button>
      ) : null}
    </div>
  );
}
