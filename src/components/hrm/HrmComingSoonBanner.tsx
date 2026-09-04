import { FormIcon } from '../form/FormIcon';

export function HrmComingSoonBanner({ feature }: { feature?: string }) {
  return (
    <div className="hrm-soon" role="status">
      <span className="hrm-soon__icon" aria-hidden>
        <FormIcon name="sparkles" size={28} />
      </span>
      <p className="hrm-soon__kicker">Đang phát triển</p>
      <p className="hrm-soon__text">
        {feature
          ? `${feature} sẽ được bổ sung trong phiên bản tới.`
          : 'Chức năng này đang được hoàn thiện và sẽ cập nhật sau.'}
      </p>
    </div>
  );
}
