/**
 * Reverse geocoding helper using OpenStreetMap Nominatim.
 *
 * Nominatim Usage Policy compliance:
 * - Rate limited to at most 1 request per second overall.
 * - Distance threshold: only queries when unqueried or moved > ~200 m.
 * - In-memory cache keyed by coordinates rounded to 3 decimal places (~110m).
 * - Request cancellation via AbortController on unmount or newer request.
 * - Backoff on failure (no tight retry loops).
 * - Privacy: extracts at most two parts from locality/city/district/state only;
 *   never includes road names, house numbers, or PII.
 */
import { useEffect, useRef, useState } from 'react';

export const isValidLatLng = (lat, lng) =>
  lat !== null && lng !== null && lat !== undefined && lng !== undefined &&
  typeof lat !== 'boolean' && typeof lng !== 'boolean' &&
  (typeof lat !== 'string' || lat.trim() !== '') &&
  (typeof lng !== 'string' || lng.trim() !== '') &&
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

export function haversineDistanceKm(p1, p2) {
  if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) return null;
  const [lat1, lon1] = p1;
  const [lat2, lon2] = p2;
  if (!isValidLatLng(lat1, lon1) || !isValidLatLng(lat2, lon2)) return null;
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (nLat1 === nLat2 && nLon1 === nLon2) return 0;
  const R = 6371;
  const dLat = (nLat2 - nLat1) * (Math.PI / 180);
  const dLon = (nLon2 - nLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * (Math.PI / 180)) * Math.cos(nLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const MOVEMENT_THRESHOLD_KM = 0.2; // 200 meters
export const RATE_LIMIT_MS = 1000; // 1 request per second max
export const FAILURE_COOLDOWN_MS = 5000; // Wait 5s after failure before retrying

// In-memory cache: "lat3,lon3:lang" -> areaName
const areaCache = new Map();

let lastRequestTimestamp = 0;
let rateLimitTimer = null;

export function clearAreaCache() {
  areaCache.clear();
  lastRequestTimestamp = 0;
  if (rateLimitTimer) {
    clearTimeout(rateLimitTimer);
    rateLimitTimer = null;
  }
}

export function getCacheKey(lat, lon, language = 'en') {
  if (!isValidLatLng(lat, lon)) return null;
  const nLat = Number(lat);
  const nLon = Number(lon);
  return `${nLat.toFixed(3)},${nLon.toFixed(3)}:${(language || 'en').toLowerCase()}`;
}

/**
 * Format address fields according to priority:
 * suburb/neighbourhood/village -> city/town -> county/state_district -> state.
 * Returns at most two distinct parts (e.g. "Kadri, Mangaluru").
 * Excludes house numbers, road names, and full addresses.
 */
export function formatAreaName(address) {
  if (!address || typeof address !== 'object') return '';

  // Priority 1: locality / neighbourhood / village / hamlet
  const locality =
    address.suburb ||
    address.neighbourhood ||
    address.village ||
    address.hamlet ||
    address.quarter ||
    address.residential ||
    '';

  // Priority 2: city / town / municipality
  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.city_district ||
    '';

  // Priority 3: county / state_district / district
  const district =
    address.county ||
    address.state_district ||
    address.district ||
    '';

  // Priority 4: state / province
  const state = address.state || address.province || '';

  const candidates = [locality, city, district, state]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  const parts = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      parts.push(c);
    }
    if (parts.length === 2) break;
  }

  return parts.join(', ');
}

/**
 * Checks if the position has moved far enough from the last query position.
 */
export function hasMovedFarEnough(prev, next, thresholdKm = MOVEMENT_THRESHOLD_KM) {
  if (!prev) return true;
  if (!next) return false;
  const dist = haversineDistanceKm([prev.lat, prev.lon], [next.lat, next.lon]);
  return dist === null || dist >= thresholdKm;
}

/**
 * Perform throttled reverse geocoding fetch with rate limiting and caching.
 */
export async function reverseGeocode({ lat, lon, language = 'en', signal }) {
  if (!isValidLatLng(lat, lon)) {
    throw new Error('Invalid coordinates');
  }

  const cacheKey = getCacheKey(lat, lon, language);
  if (cacheKey && areaCache.has(cacheKey)) {
    return areaCache.get(cacheKey);
  }

  // Throttle to 1 request per second
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;
  if (timeSinceLast < RATE_LIMIT_MS) {
    await new Promise((resolve, reject) => {
      const wait = RATE_LIMIT_MS - timeSinceLast;
      const timeoutId = setTimeout(resolve, wait);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }
    });
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  lastRequestTimestamp = Date.now();

  const lang = encodeURIComponent(language || 'en');
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lon)}&zoom=16&addressdetails=1&accept-language=${lang}`;

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim request failed with status ${response.status}`);
  }

  const data = await response.json();
  const areaName = formatAreaName(data?.address);

  if (!areaName) {
    throw new Error('No area name available');
  }

  if (cacheKey) {
    areaCache.set(cacheKey, areaName);
  }

  return areaName;
}

/**
 * React hook to manage reverse geocoded area name for a user position.
 * Handles locating, success, failure/offline states, movement threshold, and cleanup.
 */
export function useAreaName(userPos, language = 'en') {
  const [areaName, setAreaName] = useState(null);
  const [areaStatus, setAreaStatus] = useState('idle'); // 'idle' | 'locating' | 'ok' | 'unavailable'

  const activeAbortRef = useRef(null);
  const lastQueriedRef = useRef(null);
  const lastFailureTimeRef = useRef(0);
  const lat = userPos?.lat;
  const lng = userPos?.lng;

  useEffect(() => {
    if (!isValidLatLng(lat, lng)) {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }
      setAreaName(null);
      setAreaStatus('idle');
      lastQueriedRef.current = null;
      return;
    }

    const currentCoords = { lat: Number(lat), lon: Number(lng) };
    const cacheKey = getCacheKey(currentCoords.lat, currentCoords.lon, language);

    // 1. Check instant cache hit
    if (cacheKey && areaCache.has(cacheKey)) {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }
      setAreaName(areaCache.get(cacheKey));
      setAreaStatus('ok');
      lastQueriedRef.current = currentCoords;
      return;
    }

    // 2. Check 200m movement threshold
    if (!hasMovedFarEnough(lastQueriedRef.current, currentCoords, MOVEMENT_THRESHOLD_KM)) {
      return;
    }

    // 3. Failure cooldown guard (avoid rapid loops on failure)
    const now = Date.now();
    if (now - lastFailureTimeRef.current < FAILURE_COOLDOWN_MS) {
      return;
    }

    // Position moved far away or first time: clear previous area name to avoid stale display
    setAreaName(null);
    setAreaStatus('locating');

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    reverseGeocode({
      lat: currentCoords.lat,
      lon: currentCoords.lon,
      language,
      signal: controller.signal,
    })
      .then((name) => {
        if (controller.signal.aborted) return;
        setAreaName(name);
        setAreaStatus('ok');
        lastQueriedRef.current = currentCoords;
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        lastFailureTimeRef.current = Date.now();
        lastQueriedRef.current = currentCoords;
        setAreaName(null);
        setAreaStatus('unavailable');
      });

    return () => {
      controller.abort();
    };
  }, [lat, lng, language]);

  return { areaName, areaStatus };
}
