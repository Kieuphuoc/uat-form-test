import type { CSSProperties } from 'react';
import { FormIcon } from './FormIcon';
import type { HrmTileTheme } from '../../lib/hrmTheme';

type Props = {
  icon?: string | null;
  label: string;
  color?: string;
  disabled?: boolean;
  style?: CSSProperties;
  tileTheme?: HrmTileTheme;
  badge?: string | number;
  onClick?: () => void;
};

/** Ô icon + nhãn — Appdrawer / iconButton. */
export function FormIconButton({
  icon,
  label,
  color,
  disabled,
  style,
  tileTheme,
  badge,
  onClick,
}: Props) {
  const bg = color?.trim() || '#2f6fed';
  const themed = Boolean(tileTheme);
  return (
    <button
      type="button"
      className={`form-icon-btn${tileTheme ? ` form-icon-btn--theme-${tileTheme}` : ''}`}
      disabled={disabled}
      style={style}
      onClick={onClick}
    >
      <span className="form-icon-btn__icon-wrap">
        <span className="form-icon-btn__tile" style={themed ? undefined : { background: bg }}>
          <FormIcon name={icon ?? undefined} hint={label} size={24} />
        </span>
        {badge !== undefined && badge !== null && badge !== '' ? (
          <span className="form-icon-btn__badge">{badge}</span>
        ) : null}
      </span>
      <span className="form-icon-btn__label">{label}</span>
    </button>
  );
}
