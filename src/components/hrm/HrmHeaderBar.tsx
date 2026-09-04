import type { ReactNode } from 'react';
import { FormIcon } from '../form/FormIcon';

export type HrmHeaderAction = {
  id: string;
  label: string;
  onClick?: () => void;
};

export type HrmHeaderBarProps = {
  title?: string;
  titleNode?: ReactNode;
  canBack?: boolean;
  onBack?: () => void;
  onHome?: () => void;
  actions?: HrmHeaderAction[];
  rightContent?: ReactNode;
};

/**
 * HrmHeaderBar - Header chuẩn phong cách Midnight Sapphire
 * Sử dụng gradient xanh đêm sâu cao cấp, cụm nút điều hướng viên thuốc kính mờ (glassmorphism),
 * đường viền ánh sáng tinh tế và tiêu đề trắng sắc nét. Tái sử dụng đồng bộ cho tất cả các tab.
 */
export function HrmHeaderBar({
  title,
  titleNode,
  canBack = false,
  onBack,
  onHome,
  actions = [],
  rightContent,
}: HrmHeaderBarProps) {
  return (
    <header className="form-outer-chrome__bar hrm-header-bar">
      <div className="form-outer-chrome__left">
        {canBack ? (
          <div className="form-outer-chrome__nav-group">
            {onBack ? (
              <button
                type="button"
                className="form-outer-chrome__back"
                onClick={onBack}
                aria-label="Quay lại"
                title="Quay lại"
              >
                <FormIcon name="chevron-left" size={18} strokeWidth={2.2} />
              </button>
            ) : null}
            {onHome ? (
              <button
                type="button"
                className="form-outer-chrome__home"
                onClick={onHome}
                aria-label="Về màn hình chính HRM"
                title="Về màn hình chính HRM"
              >
                <FormIcon name="home" size={16} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : (
          <span className="form-outer-chrome__brand" aria-hidden>
            <FormIcon name="building-2" size={16} strokeWidth={2} />
          </span>
        )}
        <h1 className="form-outer-chrome__title">{titleNode || title}</h1>
      </div>

      {rightContent ? (
        <div className="form-outer-chrome__actions">{rightContent}</div>
      ) : actions.length > 0 ? (
        <div className="form-outer-chrome__actions">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="form-outer-chrome__link"
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}
