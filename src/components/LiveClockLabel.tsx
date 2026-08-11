import { useEffect, useState, type CSSProperties } from 'react';

const WEEKDAYS_VI = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function formatLiveDate(d: Date): string {
  return `${WEEKDAYS_VI[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatLiveTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type Props = {
  kind: 'liveDate' | 'liveTime';
  className?: string;
  style?: CSSProperties;
};

/** Đồng hồ ngày/giờ realtime cho form Chấm công. */
export function LiveClockLabel({ kind, className, style }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const text = kind === 'liveDate' ? formatLiveDate(now) : formatLiveTime(now);
  return (
    <p className={className} style={style}>
      {text}
    </p>
  );
}
