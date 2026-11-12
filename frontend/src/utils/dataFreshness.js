import { ageInMinutes, parseDate } from './datetime';

/**
 * Single configurable threshold for data freshness (in minutes).
 * Readings older than this are flagged as stale.
 */
export const STALE_THRESHOLD_MINUTES = 60;

/**
 * Explicit freshness states supported across the dashboard and sensor telemetry.
 */
export const FRESHNESS_STATES = Object.freeze({
  LIVE: 'live',
  STALE: 'stale',
  OFFLINE: 'offline',
  NO_DATA: 'no_data',
});

/**
 * Determine data freshness classification for sensor readings and telemetry.
 *
 * States:
 * - 'live':    Sensors are reporting online and the latest reading is within `thresholdMinutes`.
 * - 'stale':   A reading exists but its age is >= `thresholdMinutes`.
 * - 'offline': Sensors are explicitly reported as offline (0 online out of total > 0).
 * - 'no_data': No valid reading timestamp or sensor data available.
 *
 * Strict Rule: `isLive` is ONLY true when status === 'live'. Never show pulsing/live indicator otherwise.
 *
 * @param {Object|string|Array} source - Telemetry payload, dashboard stats, sensor array, or timestamp.
 * @param {Object} [options]
 * @param {number} [options.thresholdMinutes=STALE_THRESHOLD_MINUTES] - Stale threshold in minutes.
 * @param {Date} [options.now=new Date()] - Reference timestamp for testing or synchronization.
 * @returns {{
 *   status: 'live' | 'stale' | 'offline' | 'no_data',
 *   isLive: boolean,
 *   ageMinutes: number | null,
 *   recordedAt: Date | null,
 *   labelKey: string
 * }}
 */
export function getDataFreshness(source, { thresholdMinutes = STALE_THRESHOLD_MINUTES, now = new Date() } = {}) {
  if (!source) {
    return {
      status: FRESHNESS_STATES.NO_DATA,
      isLive: false,
      ageMinutes: null,
      recordedAt: null,
      labelKey: 'status_no_data',
    };
  }

  let recordedAtRaw = null;
  let sensorsOnline = null;
  let totalSensors = null;

  if (typeof source === 'string' || typeof source === 'number' || source instanceof Date) {
    recordedAtRaw = source;
  } else if (Array.isArray(source)) {
    totalSensors = source.length;
    sensorsOnline = source.filter((s) => s?.status === 'online').length;

    // Find the newest reading across all sensors
    let newest = null;
    for (const s of source) {
      const ts = s?.last_reading?.recorded_at || s?.recorded_at;
      if (ts) {
        const d = parseDate(ts);
        if (d && (!newest || d.getTime() > newest.getTime())) {
          newest = d;
        }
      }
    }
    recordedAtRaw = newest;
  } else if (typeof source === 'object') {
    // 1. Dashboard stats structure: stats.readings.recorded_at, stats.sensors
    if (source.readings) {
      recordedAtRaw = source.readings.recorded_at;
    } else if (source.latest_reading) {
      recordedAtRaw = source.latest_reading.recorded_at;
    } else {
      recordedAtRaw = source.recorded_at || source.recordedAt || source.timestamp;
    }

    if (source.sensors) {
      sensorsOnline = source.sensors.online;
      totalSensors = source.sensors.total;
    } else {
      if (source.sensorsOnline !== undefined) sensorsOnline = source.sensorsOnline;
      if (source.totalSensors !== undefined) totalSensors = source.totalSensors;
    }
  }

  // Check offline sensor state first
  if (totalSensors !== null && totalSensors > 0 && sensorsOnline === 0) {
    const recordedAt = parseDate(recordedAtRaw);
    const age = recordedAt ? Math.max(0, ageInMinutes(recordedAt, now)) : null;
    return {
      status: FRESHNESS_STATES.OFFLINE,
      isLive: false,
      ageMinutes: age,
      recordedAt,
      labelKey: 'status_offline',
    };
  }

  if (sensorsOnline === 0 && (totalSensors === null || totalSensors === undefined)) {
    const recordedAt = parseDate(recordedAtRaw);
    const age = recordedAt ? Math.max(0, ageInMinutes(recordedAt, now)) : null;
    return {
      status: FRESHNESS_STATES.OFFLINE,
      isLive: false,
      ageMinutes: age,
      recordedAt,
      labelKey: 'status_offline',
    };
  }

  const recordedAt = parseDate(recordedAtRaw);
  if (!recordedAt) {
    return {
      status: FRESHNESS_STATES.NO_DATA,
      isLive: false,
      ageMinutes: null,
      recordedAt: null,
      labelKey: 'status_no_data',
    };
  }

  const age = ageInMinutes(recordedAt, now);
  if (age === null || Number.isNaN(age)) {
    return {
      status: FRESHNESS_STATES.NO_DATA,
      isLive: false,
      ageMinutes: null,
      recordedAt: null,
      labelKey: 'status_no_data',
    };
  }

  const normalizedAge = Math.max(0, age);

  if (normalizedAge >= thresholdMinutes) {
    return {
      status: FRESHNESS_STATES.STALE,
      isLive: false,
      ageMinutes: normalizedAge,
      recordedAt,
      labelKey: 'status_stale',
    };
  }

  return {
    status: FRESHNESS_STATES.LIVE,
    isLive: true,
    ageMinutes: normalizedAge,
    recordedAt,
    labelKey: 'status_live',
  };
}
