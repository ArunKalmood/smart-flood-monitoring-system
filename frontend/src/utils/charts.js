/** Chart helpers: a time axis whose ticks always include both ends (no skipped labels). */
import { formatDayMonth, formatTime, parseDate } from './datetime';
import { formatNumber } from './units';

/** Rows with a timestamp field → rows with numeric `t` (ms) for a time-scaled X axis. */
export const withTime = (rows, field = 'recorded_at') =>
  rows
    .map((row) => ({ ...row, t: parseDate(row[field])?.getTime() }))
    .filter((row) => Number.isFinite(row.t));

/** Evenly spaced ticks from first to last point, inclusive. */
export function timeTicks(rows, count = 6) {
  if (!rows.length) return [];
  const first = rows[0].t;
  const last = rows[rows.length - 1].t;
  if (first === last) return [first];
  const step = (last - first) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(first + i * step));
}

/** Props for a recharts <XAxis> over `withTime` rows. Labels are times, or dates when the span exceeds a day. */
export function timeAxisProps(rows, count = 6) {
  const span = rows.length ? rows[rows.length - 1].t - rows[0].t : 0;
  return {
    dataKey: 't',
    type: 'number',
    scale: 'time',
    domain: ['dataMin', 'dataMax'],
    ticks: timeTicks(rows, count),
    interval: 0,
    tickFormatter: (t) => (span > 36 * 3600 * 1000 ? formatDayMonth(t) : formatTime(t)),
  };
}

/** Recharts tooltip formatter: "4.57 m". */
export const valueFormatter = (unit) => (value) => [unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)];
