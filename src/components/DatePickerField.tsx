import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  DEFAULT_DATE_FORMAT,
  emptyDateMask,
  filterDateInput,
  formatDateValue,
  normalizeDateFormat,
  parseDateInput,
} from '../lib/valueFormat';
import { FormIcon } from './form/FormIcon';

const WEEKDAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoOrValue(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const iso = formatDateValue(value, 'yyyy-MM-dd');
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function monthMatrix(year: number, month0: number): (number | null)[][] {
  const first = new Date(year, month0, 1);
  let start = first.getDay() - 1;
  if (start < 0) start = 6;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

type Props = {
  id?: string;
  disabled?: boolean;
  editable?: boolean;
  format?: string;
  placeholder?: string;
  value: unknown;
  style?: CSSProperties;
  onCommit: (s: string | null) => void;
};

/**
 * Date: input text (gõ số, tự chèn `/` `-` theo format) + icon lịch mở calendar.
 * Không dùng native Android/iOS date picker.
 */
export function DatePickerField({
  id,
  disabled,
  editable = true,
  format,
  placeholder,
  value,
  style,
  onCommit,
}: Props) {
  const fmt = normalizeDateFormat(format);
  const selected = useMemo(() => parseIsoOrValue(value), [value]);
  const displayFromValue = selected ? formatDateValue(selected, fmt) : '';
  const mask = emptyDateMask(fmt);
  const ph = placeholder?.trim() || mask || fmt || DEFAULT_DATE_FORMAT;

  const [text, setText] = useState(displayFromValue);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popId = useId();
  const canEdit = editable && !disabled;

  useEffect(() => {
    setText(displayFromValue);
  }, [displayFromValue]);

  useEffect(() => {
    if (!open) return;
    const base = selected ?? new Date();
    setView({ y: base.getFullYear(), m: base.getMonth() });
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows = useMemo(() => monthMatrix(view.y, view.m), [view.y, view.m]);
  const todayIso = toIsoDate(new Date());

  const textRef = useRef(text);
  textRef.current = text;

  const commitText = useCallback(
    (raw: string) => {
      const filtered = filterDateInput(raw, fmt).trim();
      if (!filtered) {
        onCommit(null);
        setText('');
        return;
      }
      const parsed = parseDateInput(filtered, fmt);
      if (parsed) {
        onCommit(parsed);
        const d = parseIsoOrValue(parsed);
        setText(d ? formatDateValue(d, fmt) : filtered);
      } else {
        // Sai ngày (vd. 32/4) → null + xóa ô
        onCommit(null);
        setText('');
      }
    },
    [fmt, onCommit],
  );

  const pick = useCallback(
    (day: number) => {
      const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`;
      onCommit(iso);
      const d = new Date(view.y, view.m, day);
      setText(formatDateValue(d, fmt));
      setOpen(false);
    },
    [fmt, onCommit, view.m, view.y],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    setText(filterDateInput(e.target.value, fmt));
  };

  const onBlur = () => {
    if (!canEdit) return;
    window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      commitText(textRef.current);
    }, 120);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitText(textRef.current);
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  if (!canEdit) {
    return (
      <input
        id={id}
        type="text"
        disabled
        readOnly
        value={displayFromValue}
        placeholder={ph}
        style={style}
      />
    );
  }

  return (
    <div className={`form-date-picker${open ? ' is-open' : ''}`} ref={rootRef}>
      <div className="form-date-picker__row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          placeholder={ph}
          value={text}
          style={style}
          className="form-date-picker__input"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="form-date-picker__icon-btn"
          title="Chọn ngày"
          aria-label="Mở lịch"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          <FormIcon name="calendar" size={18} />
        </button>
      </div>

      {open ? (
        <div id={popId} className="form-date-picker__pop" role="dialog" aria-label="Chọn ngày">
          <div className="form-date-picker__nav">
            <button
              type="button"
              className="form-date-picker__nav-btn"
              aria-label="Tháng trước"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                setView((v) => {
                  const m = v.m - 1;
                  return m < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m };
                })
              }
            >
              <FormIcon name="chevron-left" size={16} />
            </button>
            <span className="form-date-picker__month">
              Tháng {view.m + 1} / {view.y}
            </span>
            <button
              type="button"
              className="form-date-picker__nav-btn"
              aria-label="Tháng sau"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                setView((v) => {
                  const m = v.m + 1;
                  return m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m };
                })
              }
            >
              <FormIcon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="form-date-picker__weekdays">
            {WEEKDAYS_VI.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="form-date-picker__grid">
            {rows.map((row, ri) =>
              row.map((day, ci) => {
                if (day == null) {
                  return <span key={`${ri}-${ci}`} className="form-date-picker__day is-empty" />;
                }
                const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`;
                const isSel = selected != null && toIsoDate(selected) === iso;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    className={`form-date-picker__day${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(day)}
                  >
                    {day}
                  </button>
                );
              }),
            )}
          </div>
          <div className="form-date-picker__footer">
            <button
              type="button"
              className="form-date-picker__link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const n = new Date();
                onCommit(toIsoDate(n));
                setText(formatDateValue(n, fmt));
                setOpen(false);
              }}
            >
              Hôm nay
            </button>
            <button
              type="button"
              className="form-date-picker__link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCommit(null);
                setText('');
                setOpen(false);
              }}
            >
              Xóa
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
