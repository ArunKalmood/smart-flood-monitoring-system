import {
  getDataFreshness,
  STALE_THRESHOLD_MINUTES,
  FRESHNESS_STATES,
} from '../dataFreshness';

describe('dataFreshness helper', () => {
  const baseTime = new Date('2026-10-14T12:00:00Z');

  test('default threshold is 60 minutes', () => {
    expect(STALE_THRESHOLD_MINUTES).toBe(60);
  });

  describe('no_data state', () => {
    test('returns no_data for null or undefined input', () => {
      const resNull = getDataFreshness(null, { now: baseTime });
      expect(resNull.status).toBe(FRESHNESS_STATES.NO_DATA);
      expect(resNull.isLive).toBe(false);
      expect(resNull.labelKey).toBe('status_no_data');

      const resUndefined = getDataFreshness(undefined, { now: baseTime });
      expect(resUndefined.status).toBe(FRESHNESS_STATES.NO_DATA);
      expect(resUndefined.isLive).toBe(false);
    });

    test('returns no_data for empty object or invalid timestamp', () => {
      expect(getDataFreshness({}, { now: baseTime }).status).toBe(FRESHNESS_STATES.NO_DATA);
      expect(getDataFreshness({ readings: {} }, { now: baseTime }).status).toBe(FRESHNESS_STATES.NO_DATA);
      expect(getDataFreshness('not-a-valid-date', { now: baseTime }).status).toBe(FRESHNESS_STATES.NO_DATA);
    });
  });

  describe('offline state', () => {
    test('returns offline when sensors.total > 0 and sensors.online === 0', () => {
      const recentDate = new Date(baseTime.getTime() - 5 * 60 * 1000).toISOString();
      const res = getDataFreshness(
        {
          readings: { recorded_at: recentDate },
          sensors: { total: 4, online: 0, offline: 4 },
        },
        { now: baseTime }
      );

      expect(res.status).toBe(FRESHNESS_STATES.OFFLINE);
      expect(res.isLive).toBe(false);
      expect(res.labelKey).toBe('status_offline');
    });

    test('returns offline when sensor array has zero online sensors', () => {
      const sensors = [
        { id: 's1', status: 'offline', last_reading: { recorded_at: '2026-10-14T11:55:00Z' } },
        { id: 's2', status: 'maintenance', last_reading: { recorded_at: '2026-10-14T11:50:00Z' } },
      ];
      const res = getDataFreshness(sensors, { now: baseTime });

      expect(res.status).toBe(FRESHNESS_STATES.OFFLINE);
      expect(res.isLive).toBe(false);
      expect(res.labelKey).toBe('status_offline');
    });
  });

  describe('stale state', () => {
    test('returns stale when reading age is >= threshold', () => {
      // 61 minutes ago with 60 min threshold
      const staleDate = new Date(baseTime.getTime() - 61 * 60 * 1000).toISOString();
      const res = getDataFreshness(
        {
          readings: { recorded_at: staleDate },
          sensors: { total: 4, online: 4 },
        },
        { now: baseTime }
      );

      expect(res.status).toBe(FRESHNESS_STATES.STALE);
      expect(res.isLive).toBe(false);
      expect(res.ageMinutes).toBeGreaterThanOrEqual(60);
      expect(res.labelKey).toBe('status_stale');
    });

    test('respects custom thresholdMinutes', () => {
      // 15 minutes ago with 10 min threshold
      const fifteenAgo = new Date(baseTime.getTime() - 15 * 60 * 1000).toISOString();
      const res = getDataFreshness(fifteenAgo, { thresholdMinutes: 10, now: baseTime });

      expect(res.status).toBe(FRESHNESS_STATES.STALE);
      expect(res.isLive).toBe(false);
    });
  });

  describe('live state', () => {
    test('returns live when age is under threshold and sensors are online', () => {
      const liveDate = new Date(baseTime.getTime() - 5 * 60 * 1000).toISOString();
      const res = getDataFreshness(
        {
          readings: { recorded_at: liveDate },
          sensors: { total: 4, online: 3 },
        },
        { now: baseTime }
      );

      expect(res.status).toBe(FRESHNESS_STATES.LIVE);
      expect(res.isLive).toBe(true);
      expect(res.labelKey).toBe('status_live');
      expect(Math.round(res.ageMinutes)).toBe(5);
    });

    test('returns live for recent sensor array with at least one online sensor', () => {
      const sensors = [
        { id: 's1', status: 'online', last_reading: { recorded_at: '2026-10-14T11:58:00Z' } },
        { id: 's2', status: 'offline', last_reading: { recorded_at: '2026-10-14T11:40:00Z' } },
      ];
      const res = getDataFreshness(sensors, { now: baseTime });

      expect(res.status).toBe(FRESHNESS_STATES.LIVE);
      expect(res.isLive).toBe(true);
      expect(Math.round(res.ageMinutes)).toBe(2);
    });

    test('handles minor future clock skew gracefully as age 0 and live', () => {
      const slightlyFuture = new Date(baseTime.getTime() + 10 * 1000).toISOString();
      const res = getDataFreshness(slightlyFuture, { now: baseTime });

      expect(res.status).toBe(FRESHNESS_STATES.LIVE);
      expect(res.isLive).toBe(true);
      expect(res.ageMinutes).toBe(0);
    });
  });

  describe('strict live guarantee', () => {
    test('isLive is ONLY true when status is live', () => {
      const cases = [
        null,
        {},
        { sensors: { total: 2, online: 0 } },
        new Date(baseTime.getTime() - 100 * 60 * 1000).toISOString(),
      ];

      for (const c of cases) {
        const res = getDataFreshness(c, { now: baseTime });
        if (res.status !== FRESHNESS_STATES.LIVE) {
          expect(res.isLive).toBe(false);
        }
      }
    });
  });
});
