import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  DEFAULT_DATE_FORMAT,
  emptyDateMask,
  formatDateValue,
  normalizeDateFormat,
} from '../lib/valueFormat';

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
  // Mon-first: JS getDay Sun=0 → shift
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

/** Date picker tùy chỉnh — không dùng native Android/iOS. */
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
  const display = selected ? formatDateValue(selected, fmt) : '';
  const mask = emptyDateMask(fmt);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popId = useId();

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
    const onKey = (e: KeyboardEvent) => {
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

  const pick = useCallback(
    (day: number) => {
      const iso = `${view.y}-${pad2(view.m + 1)}-${pad2(day)}`;
      onCommit(iso);
      setOpen(false);
    },
    [onCommit, view.m, view.y],
  );

  const canEdit = editable && !disabled;

  return (
    <div className={`form-date-picker${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`form-date-picker__trigger${display ? '' : ' is-empty'}`}
        disabled={!canEdit}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        style={style}
        onClick={() => {
          if (canEdit) setOpen((v) => !v);
        }}
      >
        {display ? (
          <span className="form-date-picker__value">{display}</span>
        ) : (
          <span className="form-date-picker__mask" aria-label={placeholder || fmt || DEFAULT_DATE_FORMAT}>
            {mask}
          </span>
        )}
        <span className="form-date-picker__icon" aria-hidden>
          📅
        </span>
      </button>

      {open && canEdit ? (
        <div id={popId} className="form-date-picker__pop" role="dialog" aria-label="Chọn ngày">
          <div className="form-date-picker__nav">
            <button
              type="button"
              className="form-date-picker__nav-btn"
              aria-label="Tháng trước"
              onClick={() =>
                setView((v) => {
                  const m = v.m - 1;
                  return m < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m };
                })
              }
            >
              ‹
            </button>
            <span className="form-date-picker__month">
              Tháng {view.m + 1} / {view.y}
            </span>
            <button
              type="button"
              className="form-date-picker__nav-btn"
              aria-label="Tháng sau"
              onClick={() =>
                setView((v) => {
                  const m = v.m + 1;
                  return m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m };
                })
              }
            >
              ›
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
              onClick={() => {
                const n = new Date();
                onCommit(toIsoDate(n));
                setOpen(false);
              }}
            >
              Hôm nay
            </button>
            <button
              type="button"
              className="form-date-picker__link"
              onClick={() => {
                onCommit(null);
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
