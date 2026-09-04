import { useMemo, useState } from 'react';
import type { ClientFormDto, FormControlDef, FormMode } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { resolveLocalizedText } from '../../lib/localizedText';
import { isControlVisible } from '../../lib/formMode';
import { parseMapLocations } from '../../lib/mapLocations';
import { MapsControl } from '../MapsControl';
import { FormIcon } from '../form/FormIcon';
import {
  ATT_IN_RE,
  ATT_OUT_RE,
  ATT_TOTAL_RE,
  ATT_WFH_RE,
  attendanceTimeDisplay,
  findAttendanceControl,
} from '../../lib/hrmAttendance';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

type Props = {
  form: ClientFormDto;
  values: Record<string, unknown>;
  formMode?: FormMode | string | null;
  lan: LangCode;
  busy: boolean;
  onControlClick: (c: FormControlDef) => void;
  onMapsChange: (controlId: string, serialized: string) => void;
  onOpenHistory?: () => void;
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

export function HrmAttendanceView({
  form,
  values,
  formMode,
  lan,
  busy,
  onControlClick,
  onMapsChange,
  onOpenHistory,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selected, setSelected] = useState(today);
  const [mapOpen, setMapOpen] = useState(false);

  const mode: FormMode =
    formMode === 'new' || formMode === 'edit' || formMode === 'view' ? formMode : 'view';
  const visible = form.controls.filter((c) => isControlVisible(c, mode));
  const checkInBtn =
    findAttendanceControl(visible, lan, ATT_IN_RE, 'button') ||
    findAttendanceControl(visible, lan, ATT_IN_RE, 'iconButton');
  const checkOutBtn =
    findAttendanceControl(visible, lan, ATT_OUT_RE, 'button') ||
    findAttendanceControl(visible, lan, ATT_OUT_RE, 'iconButton');
  const wfhBtn =
    findAttendanceControl(visible, lan, ATT_WFH_RE, 'button') ||
    findAttendanceControl(visible, lan, ATT_WFH_RE);
  const maps = visible.find((c) => c.type === 'maps');
  const fallbackBtn = visible.find(
    (c) =>
      (c.type === 'button' || c.type === 'iconButton') &&
      c.placement !== 'header' &&
      c !== checkOutBtn &&
      c !== wfhBtn,
  );

  const inTime = attendanceTimeDisplay(form, values, lan, ATT_IN_RE);
  const outTime = attendanceTimeDisplay(form, values, lan, ATT_OUT_RE);
  const totalTime = attendanceTimeDisplay(form, values, lan, ATT_TOTAL_RE);
  const hasIn = inTime !== '-- : --';
  const hasOut = outTime !== '-- : --';

  const primary = !hasIn ? checkInBtn || fallbackBtn : !hasOut ? checkOutBtn || checkInBtn : null;
  const primaryKind = !hasIn ? 'in' : !hasOut ? 'out' : 'done';
  const primaryLabel = primaryKind === 'in' ? 'Vào ca' : primaryKind === 'out' ? 'Tan ca' : 'Đã chấm';

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i - 3)), [today]);
  const monthLabel = `Tháng ${selected.getMonth() + 1}, ${selected.getFullYear()}`;

  const points = maps ? parseMapLocations(values[maps.id] ?? maps.defaultValue) : [];
  const locLabel =
    points[0] != null
      ? `${points[0].lat.toFixed(4)}, ${points[0].lng.toFixed(4)}`
      : 'Đang xác định vị trí…';

  return (
    <div className="hrm-att">
      <div className="hrm-att__head">
        <div className="hrm-att__month">
          <FormIcon name="calendar" size={18} />
          <span>{monthLabel}</span>
        </div>
        {onOpenHistory ? (
          <button type="button" className="hrm-att__history" onClick={onOpenHistory}>
            <FormIcon name="calendar-days" size={15} />
            Lịch sử
          </button>
        ) : null}
      </div>

      <div className="hrm-att__days" role="listbox" aria-label="Ngày">
        {days.map((d) => {
          const active = sameDay(d, selected);
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="option"
              aria-selected={active}
              className={`hrm-att__day${active ? ' is-active' : ''}`}
              onClick={() => setSelected(d)}
            >
              <span className="hrm-att__day-num">{d.getDate()}</span>
              <span className="hrm-att__day-name">{WEEKDAYS[d.getDay()]}</span>
            </button>
          );
        })}
      </div>

      {maps ? (
        <div className="hrm-att__loc">
          <span className="hrm-att__loc-icon">
            <FormIcon name="map-pin" size={18} />
          </span>
          <div className="hrm-att__loc-text">
            <span className="hrm-att__loc-kicker">Đã ghi nhận vị trí</span>
            <span className="hrm-att__loc-name">{locLabel}</span>
          </div>
          <button type="button" className="hrm-att__change" onClick={() => setMapOpen((v) => !v)}>
            Đổi
          </button>
        </div>
      ) : null}

      {maps ? (
        <div className={`hrm-att__map${mapOpen ? ' is-open' : ''}`}>
          <MapsControl
            value={values[maps.id] ?? maps.defaultValue}
            height="180px"
            autoLocate={!String(values[maps.id] ?? '').trim()}
            onLocationsChange={(serialized) => onMapsChange(maps.id, serialized)}
          />
        </div>
      ) : null}

      <div className="hrm-att__hero">
        <span className="hrm-att__ring hrm-att__ring--a" aria-hidden />
        <span className="hrm-att__ring hrm-att__ring--b" aria-hidden />
        <span className="hrm-att__orbit" aria-hidden />
        <button
          type="button"
          className={`hrm-att__pulse${primaryKind === 'out' ? ' is-out' : ''}${primaryKind === 'done' ? ' is-done' : ''}`}
          disabled={busy || !primary || primary.enabled === false}
          onClick={() => primary && onControlClick(primary)}
        >
          {primaryLabel}
        </button>
      </div>

      <div className="hrm-att__stats">
        <div className="hrm-att__stat">
          <span className="hrm-att__stat-icon hrm-att__stat-icon--in">
            <FormIcon name="clock" size={18} />
          </span>
          <strong>{inTime}</strong>
          <span>Vào ca</span>
        </div>
        <div className="hrm-att__stat">
          <span className="hrm-att__stat-icon hrm-att__stat-icon--out">
            <FormIcon name="clock" size={18} />
          </span>
          <strong>{outTime}</strong>
          <span>Tan ca</span>
        </div>
        <div className="hrm-att__stat">
          <span className="hrm-att__stat-icon hrm-att__stat-icon--total">
            <FormIcon name="clock" size={18} />
          </span>
          <strong>{totalTime}</strong>
          <span>Tổng giờ</span>
        </div>
      </div>

      {wfhBtn ? (
        <button
          type="button"
          className="hrm-att__wfh"
          disabled={busy || wfhBtn.enabled === false}
          onClick={() => onControlClick(wfhBtn)}
        >
          <FormIcon name="home" size={16} />
          {resolveLocalizedText(wfhBtn.text, lan) ||
            resolveLocalizedText(wfhBtn.label, lan) ||
            "Tôi làm việc tại nhà"}
        </button>
      ) : (
        <div className="hrm-att__wfh" aria-hidden>
          <FormIcon name="home" size={16} />
          Tôi làm việc tại nhà
        </div>
      )}
    </div>
  );
}
