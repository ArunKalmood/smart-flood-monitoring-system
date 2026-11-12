jest.mock('react-leaflet', () => ({
  useMap: () => ({
    setView: jest.fn(),
    fitBounds: jest.fn(),
    invalidateSize: jest.fn(),
    getContainer: jest.fn(),
  }),
}));

import {
  isValidLatLng,
  haversineDistanceKm,
  isShelterAvailable,
  withValidCoords,
  fetchRoadRoute,
  getSensorRiskColor,
} from '../mapUtils';

describe('mapUtils - isValidLatLng', () => {
  test('accepts valid geographic coordinates, including legitimate zero', () => {
    expect(isValidLatLng(0, 0)).toBe(true);
    expect(isValidLatLng(13.0827, 80.2707)).toBe(true);
    expect(isValidLatLng(-90, -180)).toBe(true);
    expect(isValidLatLng(90, 180)).toBe(true);
    expect(isValidLatLng('13.0827', '80.2707')).toBe(true);
    expect(isValidLatLng('0', '0')).toBe(true);
  });

  test('rejects empty, whitespace, and boolean values without coercing to zero', () => {
    expect(isValidLatLng('', '')).toBe(false);
    expect(isValidLatLng('   ', '   ')).toBe(false);
    expect(isValidLatLng(false, 0)).toBe(false);
    expect(isValidLatLng(0, true)).toBe(false);
    expect(isValidLatLng(false, false)).toBe(false);
    expect(isValidLatLng(null, 0)).toBe(false);
    expect(isValidLatLng(0, undefined)).toBe(false);
    expect(isValidLatLng(undefined, undefined)).toBe(false);
  });

  test('rejects NaN, Infinity, and out-of-range coordinates', () => {
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng(0, Infinity)).toBe(false);
    expect(isValidLatLng(-Infinity, 0)).toBe(false);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(-90.1, 0)).toBe(false);
    expect(isValidLatLng(0, 180.1)).toBe(false);
    expect(isValidLatLng(0, -181)).toBe(false);
    expect(isValidLatLng('invalid', '12')).toBe(false);
  });
});

describe('mapUtils - haversineDistanceKm', () => {
  test('returns 0 for identical points', () => {
    expect(haversineDistanceKm([13.0827, 80.2707], [13.0827, 80.2707])).toBe(0);
    expect(haversineDistanceKm([0, 0], [0, 0])).toBe(0);
  });

  test('calculates correct approximate distance between known cities', () => {
    // Chennai to Bengaluru (~290 km)
    const dist = haversineDistanceKm([13.0827, 80.2707], [12.9716, 77.5946]);
    expect(dist).toBeGreaterThan(280);
    expect(dist).toBeLessThan(300);
  });

  test('returns null for invalid inputs', () => {
    expect(haversineDistanceKm(null, [12, 77])).toBe(null);
    expect(haversineDistanceKm([12, 77], [])).toBe(null);
    expect(haversineDistanceKm(['bad', 77], [12, 77])).toBe(null);
  });
});

describe('mapUtils - isShelterAvailable', () => {
  test('returns true only for open shelters with remaining positive capacity', () => {
    expect(isShelterAvailable({ status: 'open', capacity: 100, current_occupancy: 40 })).toBe(true);
    expect(isShelterAvailable({ status: 'OPEN', capacity: 50, current_occupancy: 0 })).toBe(true);
    // Missing occupancy defaults to 0 occupancy
    expect(isShelterAvailable({ status: 'open', capacity: 50, current_occupancy: null })).toBe(true);
  });

  test('returns false when capacity is 0, null, negative, or invalid', () => {
    // capacity = 0 cannot house any evacuees
    expect(isShelterAvailable({ status: 'open', capacity: 0, current_occupancy: 0 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: null, current_occupancy: 0 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: undefined, current_occupancy: 0 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: -10, current_occupancy: 0 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: 'invalid', current_occupancy: 0 })).toBe(false);
  });

  test('returns false when shelter is full or at/above capacity', () => {
    expect(isShelterAvailable({ status: 'full', capacity: 100, current_occupancy: 50 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: 100, current_occupancy: 100 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: 100, current_occupancy: 105 })).toBe(false);
  });

  test('returns false when shelter is closed or has unknown status', () => {
    expect(isShelterAvailable({ status: 'closed', capacity: 100, current_occupancy: 10 })).toBe(false);
    expect(isShelterAvailable({ status: 'maintenance', capacity: 100, current_occupancy: 10 })).toBe(false);
    expect(isShelterAvailable({ status: 'unknown', capacity: 100, current_occupancy: 10 })).toBe(false);
    expect(isShelterAvailable({ status: null, capacity: 100, current_occupancy: 10 })).toBe(false);
    expect(isShelterAvailable(null)).toBe(false);
  });

  test('returns false when occupancy is negative or invalid', () => {
    expect(isShelterAvailable({ status: 'open', capacity: 100, current_occupancy: -5 })).toBe(false);
    expect(isShelterAvailable({ status: 'open', capacity: 100, current_occupancy: 'bad' })).toBe(false);
  });
});

describe('mapUtils - withValidCoords', () => {
  test('preserves valid coordinates and converts them to Numbers', () => {
    const records = [
      { id: 1, latitude: '13.0827', longitude: '80.2707' },
      { id: 2, latitude: 0, longitude: 0 },
    ];
    const valid = withValidCoords(records, 'test');
    expect(valid).toHaveLength(2);
    expect(typeof valid[0].latitude).toBe('number');
    expect(typeof valid[0].longitude).toBe('number');
  });

  test('filters out invalid or empty coordinates to prevent (0,0) rendering', () => {
    const records = [
      { id: 1, latitude: '', longitude: '' },
      { id: 2, latitude: null, longitude: 80.27 },
      { id: 3, latitude: 95, longitude: 80.27 },
      { id: 4, latitude: 13.08, longitude: 80.27 },
    ];
    const valid = withValidCoords(records, 'test');
    expect(valid).toHaveLength(1);
    expect(valid[0].id).toBe(4);
  });
});

describe('mapUtils - fetchRoadRoute', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('aborts cleanly when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchRoadRoute([13.0, 80.0], [13.1, 80.1], { signal: controller.signal })
    ).rejects.toThrow('The user aborted a request.');
  });

  test('returns parsed road route when OSRM responds with valid geometry', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [80.0, 13.0],
                [80.05, 13.05],
                [80.1, 13.1],
              ],
            },
            distance: 15400,
            duration: 1200,
          },
        ],
      }),
    });

    const route = await fetchRoadRoute([13.0, 80.0], [13.1, 80.1]);
    expect(route).not.toBeNull();
    expect(route.isRoadRoute).toBe(true);
    expect(route.coordinates).toEqual([
      [13.0, 80.0],
      [13.05, 80.05],
      [13.1, 80.1],
    ]);
    expect(route.distanceKm).toBe(15.4);
    expect(route.durationMinutes).toBe(20);
  });

  test('falls back gracefully to direct bearing if OSRM service fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const route = await fetchRoadRoute([13.0, 80.0], [13.1, 80.1]);
    expect(route).not.toBeNull();
    expect(route.isRoadRoute).toBe(false);
    expect(route.coordinates).toEqual([
      [13.0, 80.0],
      [13.1, 80.1],
    ]);
    expect(route.distanceKm).toBeGreaterThan(0);
  });
});

describe('mapUtils - getSensorRiskColor', () => {
  test('returns mapped color for danger and warning', () => {
    expect(getSensorRiskColor('danger')).toBe('#ef4444');
    expect(getSensorRiskColor('warning')).toBe('#f59e0b');
    expect(getSensorRiskColor('safe')).toBe('#10b981');
  });

  test('falls back to status color for unknown risk level', () => {
    expect(getSensorRiskColor('unknown', 'online')).toBe('#06b6d4');
    expect(getSensorRiskColor(null, 'offline')).toBe('#64748b');
  });
});
