/**
 * Date/time display. API timestamps are UTC; strings without a timezone
 * suffix (older rows) are treated as UTC too. Output uses the viewer's local
 * time zone (Asia/Kolkata for this project's users) and the UI language.
 */
import { getLocale } from '../i18n';

const DISPLAY_TIME_ZONE = process.env.REACT_APP_TIME_ZONE || undefined; // undefined = browser's zone
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  const text = String(value).trim();
  let date;
  if (DATE_ONLY.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    date = new Date(y, m - 1, d); // a calendar day, not an instant
  } else {
    date = new Date(HAS_ZONE.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(value, options, timeZone) {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(getLocale(), { timeZone: timeZone ?? DISPLAY_TIME_ZONE, ...options }).format(date);
}

/** "02 Oct 2026, 17:06" */
export const formatDateTime = (value, { timeZone } = {}) =>
  format(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, timeZone);

/** "02 Oct 2026" */
export const formatDate = (value, { timeZone } = {}) =>
  format(value, { day: '2-digit', month: 'short', year: 'numeric' }, timeZone);

/** "02 Oct" */
export const formatDayMonth = (value, { timeZone } = {}) => format(value, { day: '2-digit', month: 'short' }, timeZone);

/** "17:06" */
export const formatTime = (value, { timeZone } = {}) =>
  format(value, { hour: '2-digit', minute: '2-digit', hour12: false }, timeZone);

const UNITS = [
  ['year', 365 * 24 * 3600], ['month', 30 * 24 * 3600], ['week', 7 * 24 * 3600],
  ['day', 24 * 3600], ['hour', 3600], ['minute', 60], ['second', 1],
];

/** "5 minutes ago" / "in 2 hours" (localised). */
export function formatRelative(value, now = new Date()) {
  const date = parseDate(value);
  if (!date) return '—';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') return rtf.format(Math.round(seconds / size), unit);
  }
  return '—';
}

/** Minutes since `value`, or null if unknown. */
export function ageInMinutes(value, now = new Date()) {
  const date = parseDate(value);
  return date ? (now.getTime() - date.getTime()) / 60000 : null;
}

/** The viewer's offset from UTC in minutes (e.g. 330 for IST), for day-bucketed API queries. */
export const utcOffsetMinutes = () => -new Date().getTimezoneOffset();
