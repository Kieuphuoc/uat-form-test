import {
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
  DEFAULT_TIME_FORMAT,
  filterTimeInput,
  formatTimeValue,
  normalizeTimeFormat,
  parseTimeInput,
} from '../lib/valueFormat';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_5 = Array.from({ length: 12 }, (_, i) => i * 5);

function parseParts(
  value: unknown,
  format?: string,
): { hh: number | null; mm: number | null; ss: number | null } {
  if (value == null || value === '') return { hh: null, mm: null, ss: null };
  const parsed = parseTimeInput(String(value), format);
  if (!parsed) return { hh: null, mm: null, ss: null };
  const segs = parsed.split(':').map((x) => Number(x));
  return {
    hh: Number.isFinite(segs[0]) ? segs[0]! : null,
    mm: Number.isFinite(segs[1]) ? segs[1]! : null,
    ss: Number.isFinite(segs[2]) ? segs[2]! : null,
  };
}

function snapMinute(m: number | null): number | null {
  if (m == null) return null;
  if (m % 5 === 0) return m;
  return Math.min(55, Math.round(m / 5) * 5);
}

type Props = {
  id?: string;
  disabled?: boolean;
  editable?: boolean;
  format?: string;
  placeholder?: string;
  value: unknown;
  style?: CSSProperties;
  onCommit: (s: string) => void;
};

/**
 * Time: input text (nhập tay số + `:`) + popover picker bên dưới (giờ / phút block 5′).
 * Không dùng native Android/iOS time picker.
 */
export function TimePickerField({
  id,
  disabled,
  editable = true,
  format,
  placeholder,
  value,
  style,
  onCommit,
}: Props) {
  const fmt = normalizeTimeFormat(format);
  const withSec = fmt.includes('ss');
  const ph = placeholder?.trim() || (withSec ? '00:00:00' : '00:00') || DEFAULT_TIME_FORMAT;

  const fromValue = useMemo(() => parseParts(value, fmt), [value, fmt]);
  const displayFromValue = useMemo(() => formatTimeValue(value, fmt), [value, fmt]);

  const [text, setText] = useState(displayFromValue);
  const [open, setOpen] = useState(false);
  const [pickH, setPickH] = useState<number>(() => fromValue.hh ?? 0);
  const [pickM, setPickM] = useState<number>(() => snapMinute(fromValue.mm) ?? 0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popId = useId();
  const canEdit = editable && !disabled;

  useEffect(() => {
    setText(displayFromValue);
  }, [displayFromValue]);

  useEffect(() => {
    if (!open) return;
    setPickH(fromValue.hh ?? 0);
    setPickM(snapMinute(fromValue.mm) ?? 0);
  }, [open, fromValue.hh, fromValue.mm]);

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

  const minuteOpts = useMemo(() => {
    const set = new Set(MINUTES_5);
    if (fromValue.mm != null && fromValue.mm % 5 !== 0) set.add(fromValue.mm);
    if (pickM % 5 !== 0) set.add(pickM);
    return [...set].sort((a, b) => a - b);
  }, [fromValue.mm, pickM]);

  const textRef = useRef(text);
  textRef.current = text;

  const commitText = (raw: string) => {
    const filtered = filterTimeInput(raw, fmt).trim();
    if (!filtered) {
      onCommit('');
      setText('');
      return;
    }
    const parsed = parseTimeInput(filtered, fmt);
    if (parsed) {
      onCommit(parsed);
      setText(parsed);
    } else {
      // Sai giờ (vd. 25, 10:99) → clear
      onCommit('');
      setText('');
    }
  };

  const applyPick = (h: number, m: number) => {
    const base = `${pad2(h)}:${pad2(m)}`;
    const next = withSec ? `${base}:${pad2(fromValue.ss ?? 0)}` : base;
    onCommit(next);
    setText(next);
    setOpen(false);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    setText(filterTimeInput(e.target.value, fmt));
  };

  const onBlur = () => {
    if (!canEdit) return;
    // Trễ nhẹ để click trong popover không bị blur-commit sớm
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
    <div className={`form-time-picker${open ? ' is-open' : ''}`} ref={rootRef}>
      <div className="form-time-picker__row">
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
          className="form-time-picker__input"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onFocus={() => {
            /* giữ mở nếu đang chọn picker */
          }}
        />
        <button
          type="button"
          className="form-time-picker__icon-btn"
          title="Chọn giờ"
          aria-label="Mở time picker"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
        >
          🕐
        </button>
      </div>

      {open ? (
        <div id={popId} className="form-time-picker__pop" role="dialog" aria-label="Chọn giờ">
          <div className="form-time-picker__cols">
            <label className="form-time-picker__col">
              <span className="form-time-picker__col-label">Giờ</span>
              <select
                className="form-time-picker__sel"
                value={pickH}
                aria-label="Giờ"
                onChange={(e) => setPickH(Number(e.target.value))}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
            </label>
            <span className="form-time-picker__sep" aria-hidden>
              :
            </span>
            <label className="form-time-picker__col">
              <span className="form-time-picker__col-label">Phút</span>
              <select
                className="form-time-picker__sel"
                value={pickM}
                aria-label="Phút"
                onChange={(e) => setPickM(Number(e.target.value))}
              >
                {minuteOpts.map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-time-picker__footer">
            <button
              type="button"
              className="form-time-picker__link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCommit('');
                setText('');
                setOpen(false);
              }}
            >
              Xóa
            </button>
            <button
              type="button"
              className="form-time-picker__ok"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyPick(pickH, pickM)}
            >
              Đặt
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
