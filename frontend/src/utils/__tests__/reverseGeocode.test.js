import { renderHook, act, waitFor } from '@testing-library/react';
import {
  formatAreaName,
  getCacheKey,
  hasMovedFarEnough,
  reverseGeocode,
  clearAreaCache,
  useAreaName,
  MOVEMENT_THRESHOLD_KM,
} from '../reverseGeocode';

describe('reverseGeocode utilities', () => {
  beforeEach(() => {
    clearAreaCache();
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    clearAreaCache();
  });

  describe('formatAreaName', () => {
    test('prioritizes suburb/neighbourhood/village -> city/town -> county/district -> state', () => {
      // Suburb + City
      expect(
        formatAreaName({
          suburb: 'Kadri',
          city: 'Mangaluru',
          county: 'Dakshina Kannada',
          state: 'Karnataka',
        })
      ).toBe('Kadri, Mangaluru');

      // Neighbourhood + Town
      expect(
        formatAreaName({
          neighbourhood: 'Indiranagar',
          town: 'Bengaluru',
          state: 'Karnataka',
        })
      ).toBe('Indiranagar, Bengaluru');

      // Village + District
      expect(
        formatAreaName({
          village: 'Hebbal',
          state_district: 'Mysuru',
          state: 'Karnataka',
        })
      ).toBe('Hebbal, Mysuru');

      // City + State (no locality level)
      expect(
        formatAreaName({
          city: 'Pune',
          state: 'Maharashtra',
        })
      ).toBe('Pune, Maharashtra');

      // District + State
      expect(
        formatAreaName({
          county: 'Thane',
          state: 'Maharashtra',
        })
      ).toBe('Thane, Maharashtra');

      // State only
      expect(
        formatAreaName({
          state: 'Kerala',
        })
      ).toBe('Kerala');
    });

    test('limits output to at most two distinct parts', () => {
      const address = {
        suburb: 'Bandra',
        city: 'Mumbai',
        county: 'Mumbai Suburban',
        state: 'Maharashtra',
      };
      const result = formatAreaName(address);
      expect(result).toBe('Bandra, Mumbai');
      expect(result.split(', ')).toHaveLength(2);
    });

    test('deduplicates case-insensitively while preserving original casing', () => {
      const address = {
        city: 'Mangalore',
        county: 'mangalore',
        state: 'Karnataka',
      };
      expect(formatAreaName(address)).toBe('Mangalore, Karnataka');
    });

    test('strictly excludes road names and house numbers for privacy', () => {
      const address = {
        house_number: '101',
        road: 'Mahatma Gandhi Road',
        suburb: 'Koramangala',
        city: 'Bengaluru',
      };
      const result = formatAreaName(address);
      expect(result).toBe('Koramangala, Bengaluru');
      expect(result).not.toContain('101');
      expect(result).not.toContain('Mahatma Gandhi');
    });

    test('handles empty or invalid address gracefully', () => {
      expect(formatAreaName({})).toBe('');
      expect(formatAreaName(null)).toBe('');
      expect(formatAreaName(undefined)).toBe('');
      expect(formatAreaName({ road: 'Only Road' })).toBe('');
    });
  });

  describe('getCacheKey', () => {
    test('rounds coordinates to 3 decimal places', () => {
      expect(getCacheKey(12.9716, 77.5946, 'en')).toBe('12.972,77.595:en');
      expect(getCacheKey('12.9714', '77.5944', 'KN')).toBe('12.971,77.594:kn');
    });

    test('returns null for invalid coordinates', () => {
      expect(getCacheKey('abc', 77.5946)).toBeNull();
      expect(getCacheKey(null, null)).toBeNull();
    });
  });

  describe('hasMovedFarEnough', () => {
    const origin = { lat: 12.9716, lon: 77.5946 };

    test('returns true when prev is null', () => {
      expect(hasMovedFarEnough(null, origin)).toBe(true);
    });

    test('returns false when next is null', () => {
      expect(hasMovedFarEnough(origin, null)).toBe(false);
    });

    test('returns false when moved less than 200m (0.2km)', () => {
      // 0.0005 deg latitude is ~55 meters
      const moved55m = { lat: 12.9721, lon: 77.5946 };
      expect(hasMovedFarEnough(origin, moved55m, MOVEMENT_THRESHOLD_KM)).toBe(false);
    });

    test('returns true when moved more than 200m (0.2km)', () => {
      // 0.003 deg latitude is ~333 meters
      const moved330m = { lat: 12.9746, lon: 77.5946 };
      expect(hasMovedFarEnough(origin, moved330m, MOVEMENT_THRESHOLD_KM)).toBe(true);
    });
  });

  describe('reverseGeocode API calling and caching', () => {
    test('fetches Nominatim, parses area name, and caches result by rounded coordinates', async () => {
      const mockResponse = {
        address: {
          suburb: 'Kadri',
          city: 'Mangaluru',
          state: 'Karnataka',
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result1 = await reverseGeocode({ lat: 12.9716, lon: 77.5946, language: 'en' });
      expect(result1).toBe('Kadri, Mangaluru');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('lat=12.9716');
      expect(url).toContain('lon=77.5946');
      expect(url).toContain('accept-language=en');

      // Second call with coordinates rounding to the same 3 decimals (12.972, 77.595)
      const result2 = await reverseGeocode({ lat: 12.9719, lon: 77.5948, language: 'en' });
      expect(result2).toBe('Kadri, Mangaluru');
      // Should NOT call fetch again (cache hit)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('throws on HTTP error status', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(reverseGeocode({ lat: 12.9716, lon: 77.5946 })).rejects.toThrow(
        /status 500/
      );
    });

    test('throws on network failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network offline'));

      await expect(reverseGeocode({ lat: 12.9716, lon: 77.5946 })).rejects.toThrow(
        /Network offline/
      );
    });

    test('throws on empty address data', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: {} }),
      });

      await expect(reverseGeocode({ lat: 12.9716, lon: 77.5946 })).rejects.toThrow(
        /No area name available/
      );
    });

    test('aborts in-flight request when signal is aborted', async () => {
      const controller = new AbortController();
      global.fetch.mockImplementationOnce((_url, { signal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = reverseGeocode({
        lat: 12.9716,
        lon: 77.5946,
        signal: controller.signal,
      });

      controller.abort();
      await expect(promise).rejects.toThrow();
    });
  });

  describe('useAreaName hook lifecycle', () => {
    test('transitions through locating -> ok on success', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { suburb: 'Indiranagar', city: 'Bengaluru' },
        }),
      });

      const { result } = renderHook(() =>
        useAreaName({ lat: 12.9716, lng: 77.5946 }, 'en')
      );

      // Initially locating
      expect(result.current.areaStatus).toBe('locating');
      expect(result.current.areaName).toBeNull();

      await waitFor(() => {
        expect(result.current.areaStatus).toBe('ok');
        expect(result.current.areaName).toBe('Indiranagar, Bengaluru');
      });
    });

    test('transitions to unavailable on fetch error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Fetch failed'));

      const { result } = renderHook(() =>
        useAreaName({ lat: 12.9716, lng: 77.5946 }, 'en')
      );

      expect(result.current.areaStatus).toBe('locating');

      await waitFor(() => {
        expect(result.current.areaStatus).toBe('unavailable');
        expect(result.current.areaName).toBeNull();
      });
    });

    test('does not re-query when position moves less than 200m', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: { suburb: 'Indiranagar', city: 'Bengaluru' },
        }),
      });

      let pos = { lat: 12.9716, lng: 77.5946 };
      const { result, rerender } = renderHook(() => useAreaName(pos, 'en'));

      await waitFor(() => {
        expect(result.current.areaStatus).toBe('ok');
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Small movement ~50m
      pos = { lat: 12.9720, lng: 77.5946 };
      rerender();

      // Fetch count should still be 1
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.areaName).toBe('Indiranagar, Bengaluru');
    });
  });
});
