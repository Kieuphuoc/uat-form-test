import { useState, useRef, useEffect } from 'react';
import { FormIcon } from '../form/FormIcon';

export type SelectOption = {
  value: string;
  label: string;
  sub?: string;
  avatar?: string;
};

type Props = {
  value: string;
  options: (string | SelectOption)[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  prefixIcon?: string;
  variant?: 'default' | 'user';
};

export function HrmSelect({
  value,
  options,
  onChange,
  placeholder = '-- Chọn --',
  disabled = false,
  className = '',
  prefixIcon,
  variant = 'default',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt,
  );

  const selectedOpt = normalizedOptions.find((opt) => opt.value === value);

  // Derive initials for avatar fallback if variant is 'user'
  const userAvatarFallback =
    variant === 'user'
      ? (selectedOpt?.label || value)
          .split(' ')
          .filter(Boolean)
          .map((w) => w[0])
          .join('')
          .slice(-2)
          .toUpperCase()
      : undefined;

  const currentAvatar = selectedOpt?.avatar || userAvatarFallback;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`hrm-custom-select ${variant === 'user' ? 'hrm-custom-select--user' : ''} ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      <button
        type="button"
        className={`hrm-custom-select__trigger ${variant === 'user' ? 'hrm-custom-select__trigger--user' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {prefixIcon ? (
          <span className="hrm-custom-select__prefix-icon">
            <FormIcon name={prefixIcon} size={15} />
          </span>
        ) : null}

        {currentAvatar ? (
          <span className="hrm-custom-select__avatar">{currentAvatar}</span>
        ) : null}

        <div className="hrm-custom-select__label">
          {selectedOpt ? (
            <>
              <span className="hrm-custom-select__selected-title">{selectedOpt.label}</span>
              {selectedOpt.sub ? (
                <span className="hrm-custom-select__option-sub">{selectedOpt.sub}</span>
              ) : null}
            </>
          ) : value ? (
            <span className="hrm-custom-select__selected-title">{value}</span>
          ) : (
            <span className="hrm-custom-select__placeholder">{placeholder}</span>
          )}
        </div>

        <span className={`hrm-custom-select__arrow ${isOpen ? 'is-rotated' : ''}`}>
          <FormIcon name="chevron-down" size={14} />
        </span>
      </button>

      {isOpen ? (
        <div className="hrm-custom-select__dropdown" role="listbox">
          <div className="hrm-custom-select__options-list">
            {normalizedOptions.map((opt) => {
              const isSelected = opt.value === value;
              const optAvatar =
                opt.avatar ||
                (variant === 'user'
                  ? opt.label
                      .split(' ')
                      .filter(Boolean)
                      .map((w) => w[0])
                      .join('')
                      .slice(-2)
                      .toUpperCase()
                  : undefined);

              return (
                <div
                  key={opt.value}
                  className={`hrm-custom-select__option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelect(opt.value)}
                  role="option"
                  aria-selected={isSelected}
                >
                  {optAvatar ? (
                    <span className="hrm-custom-select__avatar">{optAvatar}</span>
                  ) : null}
                  <div className="hrm-custom-select__option-text">
                    <span className="hrm-custom-select__option-title">{opt.label}</span>
                    {opt.sub ? (
                      <span className="hrm-custom-select__option-sub">{opt.sub}</span>
                    ) : null}
                  </div>
                  {isSelected ? (
                    <span className="hrm-custom-select__check">
                      <FormIcon name="check" size={14} />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
