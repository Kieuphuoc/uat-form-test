import { useMemo, useState } from 'react';
import type { ClientFormDto } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import {
  attendanceDateKey,
  buildAttendanceHistoryMap,
  type AttendanceDayRecord,
} from '../../lib/hrmAttendance';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

type Props = {
  form: ClientFormDto;
  values: Record<string, unknown>;
  datasets: Record<string, Record<string, unknown>[]>;
  lan: LangCode;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function calendarCells(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function formatDetailDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].replace('Tháng ', 'tháng ')}`;
}

function statusLabel(record: AttendanceDayRecord): string | null {
  if (record.status === 'full') return 'Đủ ca';
  if (record.inTime && !record.outTime) return 'Thiếu tan ca';
  if (!record.inTime && record.outTime) return 'Thiếu vào ca';
  if (record.status === 'partial') return 'Thiếu ca';
  return null;
}

function DayDetail({ record, date }: { record?: AttendanceDayRecord; date: Date }) {
  const inTime = record?.inTime ?? '-- : --';
  const outTime = record?.outTime ?? '-- : --';
  const totalTime = record?.totalTime ?? '-- : --';
  const empty = !record || record.status === 'none';
  const badge = record ? statusLabel(record) : null;

  return (
    <div className="hrm-att-hist__detail-card">
      <div className="hrm-att-hist__detail-head">
        <div>
          <p className="hrm-att-hist__detail-kicker">Chi tiết ngày</p>
          <p className="hrm-att-hist__detail-date">{formatDetailDate(date)}</p>
        </div>
        {badge ? (
          <span
            className={`hrm-att-hist__badge${record?.status === 'partial' ? ' hrm-att-hist__badge--warn' : ''}`}
          >
            {badge}
          </span>
        ) : null}
      </div>

      {empty ? (
        <div className="hrm-att-hist__empty" role="status">
          <span className="hrm-att-hist__empty-icon" aria-hidden>
            <FormIcon name="calendar-days" size={24} />
          </span>
          <p className="hrm-att-hist__empty-title">Chưa có dữ liệu</p>
          <p className="hrm-att-hist__empty-text">Ngày này chưa ghi nhận chấm công.</p>
        </div>
      ) : (
        <ul className="hrm-att-hist__times">
          <li className="hrm-att-hist__time hrm-att-hist__time--in">
            <span className="hrm-att-hist__time-icon">
              <FormIcon name="clock" size={16} />
            </span>
            <span className="hrm-att-hist__time-label">Vào ca</span>
            <strong className="hrm-att-hist__time-val">{inTime}</strong>
          </li>
          <li className="hrm-att-hist__time hrm-att-hist__time--out">
            <span className="hrm-att-hist__time-icon">
              <FormIcon name="clock" size={16} />
            </span>
            <span className="hrm-att-hist__time-label">Tan ca</span>
            <strong className="hrm-att-hist__time-val">{outTime}</strong>
          </li>
          <li className="hrm-att-hist__time hrm-att-hist__time--total">
            <span className="hrm-att-hist__time-icon">
              <FormIcon name="clock" size={16} />
            </span>
            <span className="hrm-att-hist__time-label">Tổng giờ</span>
            <strong className="hrm-att-hist__time-val">{totalTime}</strong>
          </li>
        </ul>
      )}
    </div>
  );
}

export function HrmAttendanceHistoryView({ form, values, datasets, lan }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);

  const history = useMemo(
    () => buildAttendanceHistoryMap(form, values, datasets, lan, today),
    [form, values, datasets, lan, today],
  );

  const cells = useMemo(() => calendarCells(viewMonth), [viewMonth]);
  const monthLabel = MONTHS[viewMonth.getMonth()];
  const yearLabel = viewMonth.getFullYear();

  const monthStats = useMemo(() => {
    let full = 0;
    let partial = 0;
    for (const d of cells) {
      if (d.getMonth() !== viewMonth.getMonth()) continue;
      const rec = history.get(attendanceDateKey(d));
      if (!rec) continue;
      if (rec.status === 'full') full += 1;
      else if (rec.status === 'partial') partial += 1;
    }
    return { full, partial, total: full + partial };
  }, [cells, history, viewMonth]);

  const selectedRecord = history.get(attendanceDateKey(selected));

  const shiftMonth = (delta: number) => {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <div className="hrm-att-hist">
      <div className="hrm-att-hist__hero">
        <div className="hrm-att-hist__hero-glow" aria-hidden />
        <div className="hrm-att-hist__toolbar">
          <button type="button" className="hrm-att-hist__nav" onClick={() => shiftMonth(-1)} aria-label="Tháng trước">
            <FormIcon name="chevron-left" size={18} />
          </button>
          <div className="hrm-att-hist__month">
            <span className="hrm-att-hist__month-name">{monthLabel}</span>
            <span className="hrm-att-hist__month-year">{yearLabel}</span>
          </div>
          <button type="button" className="hrm-att-hist__nav" onClick={() => shiftMonth(1)} aria-label="Tháng sau">
            <FormIcon name="chevron-right" size={18} />
          </button>
        </div>

        <div className="hrm-att-hist__summary">
          <div className="hrm-att-hist__stat">
            <span className="hrm-att-hist__stat-icon">
              <FormIcon name="calendar-check" size={16} />
            </span>
            <div>
              <strong>{monthStats.total}</strong>
              <span>Đã chấm</span>
            </div>
          </div>
          <div className="hrm-att-hist__stat hrm-att-hist__stat--ok">
            <span className="hrm-att-hist__stat-icon">
              <FormIcon name="check" size={16} />
            </span>
            <div>
              <strong>{monthStats.full}</strong>
              <span>Đủ ca</span>
            </div>
          </div>
          <div className="hrm-att-hist__stat hrm-att-hist__stat--warn">
            <span className="hrm-att-hist__stat-icon">
              <FormIcon name="alert-triangle" size={16} />
            </span>
            <div>
              <strong>{monthStats.partial}</strong>
              <span>Thiếu ca</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hrm-att-hist__cal">
        <div className="hrm-att-hist__weekdays" aria-hidden>
          {WEEKDAYS.map((w) => (
            <span key={w} className="hrm-att-hist__weekday">
              {w}
            </span>
          ))}
        </div>
        <div className="hrm-att-hist__grid" role="grid" aria-label={`Lịch ${monthLabel} ${yearLabel}`}>
          {cells.map((d) => {
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const key = attendanceDateKey(d);
            const rec = history.get(key);
            const isToday = sameDay(d, today);
            const isSelected = sameDay(d, selected);
            const status = rec?.status ?? 'none';
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${d.getDate()} ${WEEKDAYS[d.getDay()]}${isToday ? ', hôm nay' : ''}${
                  rec
                    ? rec.status === 'full'
                      ? ', đủ ca'
                      : rec.inTime && !rec.outTime
                        ? ', thiếu tan ca'
                        : !rec.inTime && rec.outTime
                          ? ', thiếu vào ca'
                          : ', thiếu ca'
                    : ''
                }`}
                className={[
                  'hrm-att-hist__cell',
                  !inMonth ? 'is-other' : '',
                  isToday ? 'is-today' : '',
                  isSelected ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(d)}
              >
                <span className="hrm-att-hist__cell-inner">
                  <span className="hrm-att-hist__cell-num">{d.getDate()}</span>
                  {rec && status !== 'none' ? (
                    <span className="hrm-att-hist__marks" aria-hidden>
                      <span className={`hrm-att-hist__mark${rec.inTime ? ' is-in' : ''}`} />
                      <span className={`hrm-att-hist__mark${rec.outTime ? ' is-out' : ''}`} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hrm-att-hist__legend">
          <span className="hrm-att-hist__legend-item">
            <span className="hrm-att-hist__mark is-in" />
            Vào ca
          </span>
          <span className="hrm-att-hist__legend-item">
            <span className="hrm-att-hist__mark is-out" />
            Tan ca
          </span>
        </div>
      </div>

      <DayDetail record={selectedRecord} date={selected} />
    </div>
  );
}
