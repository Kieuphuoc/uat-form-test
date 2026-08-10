import { useState } from 'react';
import {
  getLocalizedPart,
  hasExtraLocales,
  setLocalizedPart,
  type LocalizedText,
} from '../../lib/localizedText';

type Props = {
  value: LocalizedText | undefined;
  onChange: (next: LocalizedText | undefined) => void;
  placeholder?: string;
  /** Mở sẵn panel e/o. */
  defaultOpen?: boolean;
};

/**
 * Ô nhập text đa ngôn ngữ: mặc định `v`, icon mở thêm `e` / `o`.
 */
export function LocalizedTextInput({
  value,
  onChange,
  placeholder,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || hasExtraLocales(value));
  const v = getLocalizedPart(value, 'v');
  const e = getLocalizedPart(value, 'e');
  const o = getLocalizedPart(value, 'o');
  const extra = hasExtraLocales(value);

  return (
    <div className={`localized-text${open ? ' localized-text--open' : ''}`}>
      <div className="localized-text-main">
        <input
          value={v}
          placeholder={placeholder ?? 'Tiếng Việt (v)'}
          onChange={(ev) => onChange(setLocalizedPart(value, 'v', ev.target.value))}
          aria-label="Tiếng Việt (v)"
        />
        <button
          type="button"
          className={`localized-text-lang-btn${extra ? ' has-extra' : ''}${open ? ' open' : ''}`}
          title="Thêm ngôn ngữ e (Anh) / o (khác)"
          aria-label="Thêm ngôn ngữ e / o"
          aria-expanded={open}
          onClick={() => setOpen((x: boolean) => !x)}
        >
          <svg
            className="localized-text-lang-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden
          >
            {/* Aa — icon ngôn ngữ Latin / English */}
            <text
              x="1"
              y="12"
              fontSize="11"
              fontFamily="system-ui,Segoe UI,sans-serif"
              fontWeight="700"
              fill="currentColor"
            >
              A
            </text>
            <text
              x="8.5"
              y="12"
              fontSize="8"
              fontFamily="system-ui,Segoe UI,sans-serif"
              fontWeight="600"
              fill="currentColor"
            >
              a
            </text>
          </svg>
        </button>
      </div>
      {open ? (
        <div className="localized-text-extra">
          <label className="localized-text-extra-row">
            <span className="localized-text-code" title="English">
              e
            </span>
            <input
              value={e}
              placeholder="English (e)"
              onChange={(ev) => onChange(setLocalizedPart(value, 'e', ev.target.value))}
              aria-label="English (e)"
            />
          </label>
          <label className="localized-text-extra-row">
            <span className="localized-text-code" title="Other / JP / KR…">
              o
            </span>
            <input
              value={o}
              placeholder="Other (o)"
              onChange={(ev) => onChange(setLocalizedPart(value, 'o', ev.target.value))}
              aria-label="Other (o)"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
