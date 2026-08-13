import { useEffect, useMemo, useState, type CSSProperties, type ChangeEvent } from 'react';
import { normalizeTimeFormat, parseTimeInput } from '../lib/valueFormat';

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

/** Time picker: select giờ 00–23 + phút theo block 5 phút. Không dùng native. */
export function TimePickerField({
  id,
  disabled,
  editable = true,
  format,
  value,
  style,
  onCommit,
}: Props) {
  const fmt = normalizeTimeFormat(format);
  const withSec = fmt.includes('ss');
  const fromValue = useMemo(() => parseParts(value, fmt), [value, fmt]);

  const [hh, setHh] = useState<number | null>(fromValue.hh);
  const [mm, setMm] = useState<number | null>(() => snapMinute(fromValue.mm));

  useEffect(() => {
    setHh(fromValue.hh);
    setMm(snapMinute(fromValue.mm));
  }, [fromValue.hh, fromValue.mm]);

  const minuteOpts = useMemo(() => {
    const set = new Set(MINUTES_5);
    if (fromValue.mm != null && fromValue.mm % 5 !== 0) set.add(fromValue.mm);
    if (mm != null && mm % 5 !== 0) set.add(mm);
    return [...set].sort((a, b) => a - b);
  }, [fromValue.mm, mm]);

  const canEdit = editable && !disabled;
  const ss = withSec ? (fromValue.ss ?? 0) : null;

  const emit = (nextH: number | null, nextM: number | null) => {
    if (nextH == null || nextM == null) {
      onCommit('');
      return;
    }
    const base = `${pad2(nextH)}:${pad2(nextM)}`;
    onCommit(withSec ? `${base}:${pad2(ss ?? 0)}` : base);
  };

  if (!canEdit) {
    const text =
      hh == null || mm == null
        ? ''
        : withSec
          ? `${pad2(hh)}:${pad2(mm)}:${pad2(ss ?? 0)}`
          : `${pad2(hh)}:${pad2(mm)}`;
    return (
      <input
        id={id}
        type="text"
        disabled
        readOnly
        value={text}
        placeholder="--:--"
        style={style}
      />
    );
  }

  const onHour = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const nextH = v === '' ? null : Number(v);
    setHh(nextH);
    emit(nextH, mm);
  };
  const onMinute = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    const nextM = v === '' ? null : Number(v);
    setMm(nextM);
    emit(hh, nextM);
  };

  return (
    <div className="form-time-picker" style={style} id={id}>
      <select
        className="form-time-picker__sel"
        disabled={disabled}
        value={hh == null ? '' : String(hh)}
        aria-label="Giờ"
        onChange={onHour}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {pad2(h)}
          </option>
        ))}
      </select>
      <span className="form-time-picker__sep" aria-hidden>
        :
      </span>
      <select
        className="form-time-picker__sel"
        disabled={disabled}
        value={mm == null ? '' : String(mm)}
        aria-label="Phút"
        onChange={onMinute}
      >
        <option value="">--</option>
        {minuteOpts.map((m) => (
          <option key={m} value={m}>
            {pad2(m)}
          </option>
        ))}
      </select>
      {withSec ? (
        <>
          <span className="form-time-picker__sep" aria-hidden>
            :
          </span>
          <span className="form-time-picker__sec">{pad2(ss ?? 0)}</span>
        </>
      ) : null}
    </div>
  );
}
