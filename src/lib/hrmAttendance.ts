import type { FormControlDef, ClientFormDto } from '../types/form';
import { resolveLocalizedText, type LangCode } from './localizedText';

const COMING_SOON_RE = /sắp ra mắt|coming soon|sap ra mat/i;

function formTitleBlob(form: ClientFormDto): string {
  const title =
    typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  return `${form.id} ${title}`;
}

export function isHrmAttendanceForm(slug: string, form: ClientFormDto): boolean {
  if (slug !== 'hrm') return false;
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  const blob = formTitleBlob(form);
  if (COMING_SOON_RE.test(blob)) return false;
  const lower = blob.toLowerCase();
  if (/chấm\s*công|cham.?cong|check.?in|attendance|presence|timekeep/.test(lower)) return true;
  const formats = form.controls.map((c) => (c.format ?? '').toLowerCase());
  return formats.includes('livedate') && formats.includes('livetime');
}

/** Form HRM kiểu “Sắp ra mắt” (stack, không phải chấm công). */
export function isHrmComingSoonForm(slug: string, form: ClientFormDto): boolean {
  if (slug !== 'hrm') return false;
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  return COMING_SOON_RE.test(formTitleBlob(form));
}

/** Tên chức năng đang chờ (thường là field “Chức năng”). */
export function hrmComingSoonFeature(
  form: ClientFormDto,
  values: Record<string, unknown>,
  lan: LangCode,
): string | undefined {
  const byLabel = form.controls.find((c) =>
    /chức năng|chuc nang|feature|function/i.test(controlBlob(c, lan)),
  );
  const c = byLabel ?? form.controls.find((x) => x.type === 'text');
  if (!c) return undefined;
  const raw = values[c.id];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const fromText = resolveLocalizedText(c.text, lan).trim();
  return fromText || undefined;
}

function controlBlob(c: FormControlDef, lan: LangCode): string {
  return `${c.id} ${resolveLocalizedText(c.text, lan)} ${resolveLocalizedText(c.label, lan)}`.toLowerCase();
}

export function findAttendanceControl(
  controls: FormControlDef[],
  lan: LangCode,
  pattern: RegExp,
  type?: string,
): FormControlDef | undefined {
  return controls.find((c) => {
    if (type && c.type !== type) return false;
    return pattern.test(controlBlob(c, lan));
  });
}

export function attendanceTimeDisplay(
  form: ClientFormDto,
  values: Record<string, unknown>,
  lan: LangCode,
  pattern: RegExp,
): string {
  for (const c of form.controls) {
    if (c.type !== 'time' && c.type !== 'text' && c.type !== 'label') continue;
    if (!pattern.test(controlBlob(c, lan))) continue;
    const raw = String(values[c.id] ?? '').trim();
    if (raw) return formatClock(raw);
  }
  for (const [key, val] of Object.entries(values)) {
    if (!pattern.test(key.toLowerCase())) continue;
    const raw = String(val ?? '').trim();
    if (raw) return formatClock(raw);
  }
  return '-- : --';
}

function formatClock(raw: string): string {
  const m = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return raw;
  return `${m[1].padStart(2, '0')} : ${m[2]}`;
}

export const ATT_IN_RE = /vào\s*ca|vao\s*ca|check[\s_-]*in|gio[_\s-]*vao|time[\s_-]*in|chấm\s*công|cham\s*cong|^in$/i;
export const ATT_OUT_RE = /tan\s*ca|ra\s*ca|check[\s_-]*out|gio[_\s-]*ra|time[\s_-]*out|^out$/i;
export const ATT_TOTAL_RE = /tổng\s*giờ|tong\s*gio|total\s*hour|cong[\s_-]*gio|hours/i;
export const ATT_REQUEST_RE = /request|đơn\+|don\+|nghỉ phép|leave/i;
export const ATT_WFH_RE = /làm việc tại nhà|lam viec tai nha|\bwfh\b|work from home|remote/i;
export const ATT_HISTORY_RE = /lịch\s*sử|lich\s*su|\bhistory\b/i;

export type AttendanceDayRecord = {
  inTime?: string;
  outTime?: string;
  totalTime?: string;
  status: 'full' | 'partial' | 'none';
};

export function isAttendanceHistoryHeader(c: FormControlDef, lan: LangCode): boolean {
  return ATT_HISTORY_RE.test(controlBlob(c, lan));
}

export function attendanceDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseRowDate(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

function rowField(row: Record<string, unknown>, pattern: RegExp): string {
  for (const [key, val] of Object.entries(row)) {
    if (!pattern.test(key.toLowerCase())) continue;
    const raw = String(val ?? '').trim();
    if (raw) return formatClock(raw);
  }
  return '';
}

function rowDateField(row: Record<string, unknown>): Date | null {
  for (const [key, val] of Object.entries(row)) {
    if (!/date|ngay|ngày|day|work/i.test(key.toLowerCase())) continue;
    const d = parseRowDate(val);
    if (d) return d;
  }
  for (const val of Object.values(row)) {
    const d = parseRowDate(val);
    if (d) return d;
  }
  return null;
}

function recordFromTimes(inTime: string, outTime: string, totalTime: string): AttendanceDayRecord {
  const hasIn = inTime.length > 0 && inTime !== '-- : --';
  const hasOut = outTime.length > 0 && outTime !== '-- : --';
  const status = hasIn && hasOut ? 'full' : hasIn || hasOut ? 'partial' : 'none';
  return {
    inTime: hasIn ? inTime : undefined,
    outTime: hasOut ? outTime : undefined,
    totalTime: totalTime && totalTime !== '-- : --' ? totalTime : undefined,
    status,
  };
}

function findHistoryList(form: ClientFormDto): string | undefined {
  for (const list of form.lists) {
    const blob = `${list.bind} ${list.id}`.toLowerCase();
    if (/lich\s*su|history|cham\s*cong|attendance|timekeep|chấm\s*công/.test(blob)) {
      return list.bind;
    }
  }
  return form.lists[0]?.bind;
}

/** Gom bản ghi chấm công theo ngày (YYYY-MM-DD) từ dataset + giá trị form hiện tại. */
export function buildAttendanceHistoryMap(
  form: ClientFormDto,
  values: Record<string, unknown>,
  datasets: Record<string, Record<string, unknown>[]>,
  lan: LangCode,
  today = new Date(),
): Map<string, AttendanceDayRecord> {
  const map = new Map<string, AttendanceDayRecord>();
  const bind = findHistoryList(form);
  const rows = bind ? datasets[bind] ?? [] : [];

  for (const row of rows) {
    const d = rowDateField(row);
    if (!d) continue;
    const inTime = rowField(row, ATT_IN_RE);
    const outTime = rowField(row, ATT_OUT_RE);
    const totalTime = rowField(row, ATT_TOTAL_RE);
    const rec = recordFromTimes(inTime, outTime, totalTime);
    if (rec.status !== 'none') map.set(attendanceDateKey(d), rec);
  }

  const todayKey = attendanceDateKey(today);
  const liveIn = attendanceTimeDisplay(form, values, lan, ATT_IN_RE);
  const liveOut = attendanceTimeDisplay(form, values, lan, ATT_OUT_RE);
  const liveTotal = attendanceTimeDisplay(form, values, lan, ATT_TOTAL_RE);
  const live = recordFromTimes(liveIn, liveOut, liveTotal);
  if (live.status !== 'none') map.set(todayKey, live);

  mergeAttendanceHistoryMock(map, today);

  return map;
}

/** Demo lịch sử — chỉ điền ngày chưa có dữ liệu thật (tháng hiện tại + tháng trước). */
function mergeAttendanceHistoryMock(map: Map<string, AttendanceDayRecord>, today: Date): void {
  const fillMonth = (year: number, month: number, maxDay: number) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const limit = Math.min(maxDay, daysInMonth);

    for (let day = 1; day <= limit; day++) {
      const d = new Date(year, month, day);
      const key = attendanceDateKey(d);
      if (map.has(key)) continue;

      const dow = d.getDay();
      if (dow === 0) continue;

      const seed = day * 17 + month * 31 + year;
      const roll = seed % 10;
      if (roll === 0) continue;

      if (roll <= 6) {
        const inH = 7 + (seed % 3);
        const inM = (seed % 4) * 5;
        const outH = 16 + (seed % 3);
        const outM = (seed % 3) * 10;
        const totalH = outH - inH - (inM + outM >= 60 ? 1 : 0);
        const totalM = (outM - inM + 60) % 60;
        map.set(key, {
          inTime: `${String(inH).padStart(2, '0')} : ${String(inM).padStart(2, '0')}`,
          outTime: `${String(outH).padStart(2, '0')} : ${String(outM).padStart(2, '0')}`,
          totalTime: `${String(totalH).padStart(2, '0')} : ${String(totalM).padStart(2, '0')}`,
          status: 'full',
        });
      } else {
        const inH = 8 + (seed % 2);
        const inM = (seed % 5) * 3;
        map.set(key, {
          inTime: `${String(inH).padStart(2, '0')} : ${String(inM).padStart(2, '0')}`,
          status: 'partial',
        });
      }
    }
  };

  const y = today.getFullYear();
  const m = today.getMonth();
  fillMonth(y, m, today.getDate());
  fillMonth(y, m - 1, 31);
}
