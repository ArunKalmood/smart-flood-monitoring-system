/** Units and number display for sensor readings. Missing values always render as "—". */

export const DEFAULT_UNITS = {
  water_level: 'm',
  rainfall: 'mm/h',
  temperature: '°C',
  humidity: '%',
  flow: 'm/s',
  river_flow: 'm/s',
  battery_level: '%',
};

const MISSING = new Set([null, undefined, '', 'null', 'Null', 'NULL', 'undefined', 'None']);

/** The stored unit if present, otherwise the default for the sensor/reading type. */
export function unitFor(type, unit) {
  if (!MISSING.has(unit)) return unit;
  return DEFAULT_UNITS[type] || '';
}

export const isMissing = (value) => value === null || value === undefined || value === '' || Number.isNaN(Number(value));

/** 4.4999 → "4.5"; null/NaN → "—". */
export function formatNumber(value, maxDigits = 2) {
  if (isMissing(value)) return '—';
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: maxDigits });
}

/** "4.5 m" / "—" */
export function formatReading(value, type, unit) {
  if (isMissing(value)) return '—';
  const u = unitFor(type, unit);
  return u ? `${formatNumber(value)} ${u}` : formatNumber(value);
}
