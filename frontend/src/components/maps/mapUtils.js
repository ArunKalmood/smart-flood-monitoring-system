/**
 * Shared Leaflet helpers: coordinate validation, fit-to-data, resize handling,
 * and marker icons. Used by the SOS map and the Route Map.
 */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// Ensure default icon paths resolve correctly in Webpack bundles
if (L.Icon && L.Icon.Default && L.Icon.Default.prototype) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

export const INDIA_CENTER = [20.5937, 78.9629];
export const TILE_URL = process.env.REACT_APP_MAPS_TILE || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSRM_ROUTER_URL = process.env.REACT_APP_OSRM_ROUTER_URL || 'https://router.project-osrm.org/route/v1/driving';

export const isValidLatLng = (lat, lng) =>
  lat !== null && lng !== null && lat !== undefined && lng !== undefined &&
  typeof lat !== 'boolean' && typeof lng !== 'boolean' &&
  (typeof lat !== 'string' || lat.trim() !== '') &&
  (typeof lng !== 'string' || lng.trim() !== '') &&
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;

/** Haversine distance in kilometers between two [lat, lng] points */
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

export const SENSOR_RISK_COLORS = {
  danger: '#ef4444',
  warning: '#f59e0b',
  safe: '#10b981',
};

export function getSensorRiskColor(riskLevel, status = 'online') {
  if (riskLevel && SENSOR_RISK_COLORS[riskLevel]) {
    return SENSOR_RISK_COLORS[riskLevel];
  }
  return status === 'online' ? '#06b6d4' : '#64748b';
}

/** Check whether an evacuation center is currently open and has available capacity */
export function isShelterAvailable(center) {
  if (!center || typeof center !== 'object') return false;

  // Operational status: must be explicitly 'open' (case-insensitive)
  const rawStatus = typeof center.status === 'string' ? center.status.trim().toLowerCase() : '';
  if (rawStatus !== 'open') {
    return false;
  }

  // Capacity validation: capacity must be a valid positive number
  if (center.capacity === null || center.capacity === undefined || center.capacity === '') {
    return false;
  }
  const capacityNum = Number(center.capacity);
  if (!Number.isFinite(capacityNum) || capacityNum <= 0) {
    return false;
  }

  // Occupancy validation: missing occupancy defaults to 0, otherwise non-negative finite number
  const rawOccupancy = center.current_occupancy;
  const occupancyNum = (rawOccupancy === null || rawOccupancy === undefined || rawOccupancy === '')
    ? 0
    : Number(rawOccupancy);
  if (!Number.isFinite(occupancyNum) || occupancyNum < 0) {
    return false;
  }

  // Must have remaining space: occupancy < capacity
  return occupancyNum < capacityNum;
}

/**
 * Fetch a driving road route between two [lat, lng] points using OpenStreetMap's OSRM service.
 * Returns { coordinates: [[lat, lng], ...], distanceKm: number, durationMinutes: number | null, isRoadRoute: boolean }
 * Falls back to direct bearing if OSRM service is unreachable.
 */
export async function fetchRoadRoute(startLatLng, endLatLng, options = {}) {
  if (!startLatLng || !endLatLng) return null;
  const [startLat, startLng] = startLatLng;
  const [endLat, endLng] = endLatLng;
  if (!isValidLatLng(startLat, startLng) || !isValidLatLng(endLat, endLng)) return null;

  const directDist = haversineDistanceKm(startLatLng, endLatLng);
  const fallback = {
    coordinates: [[Number(startLat), Number(startLng)], [Number(endLat), Number(endLng)]],
    distanceKm: directDist !== null ? Math.round(directDist * 10) / 10 : 0,
    durationMinutes: directDist !== null ? Math.max(1, Math.round((directDist / 30) * 60)) : null,
    isRoadRoute: false,
  };

  if (options.signal?.aborted) {
    const err = new Error('The user aborted a request.');
    err.name = 'AbortError';
    throw err;
  }

  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 5000;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  const onCallerAbort = () => timeoutController.abort();
  if (options.signal) {
    options.signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    const url = `${OSRM_ROUTER_URL}/${Number(startLng)},${Number(startLat)};${Number(endLng)},${Number(endLat)}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: timeoutController.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
      const route = data.routes[0];
      const rawCoords = route.geometry?.coordinates;
      if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
        const roadCoords = rawCoords
          .map(([lon, lat]) => [Number(lat), Number(lon)])
          .filter(([lat, lon]) => isValidLatLng(lat, lon));

        if (roadCoords.length >= 2) {
          const routeDistKm = typeof route.distance === 'number' && Number.isFinite(route.distance) && route.distance >= 0
            ? Math.round((route.distance / 1000) * 10) / 10
            : (directDist !== null ? Math.round(directDist * 10) / 10 : 0);

          const routeDurationMins = typeof route.duration === 'number' && Number.isFinite(route.duration) && route.duration >= 0
            ? Math.max(1, Math.round(route.duration / 60))
            : (directDist !== null ? Math.max(1, Math.round((directDist / 30) * 60)) : null);

          return {
            coordinates: roadCoords,
            distanceKm: routeDistKm,
            durationMinutes: routeDurationMins,
            isRoadRoute: true,
          };
        }
      }
    }
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }
    if (err?.name !== 'AbortError' && process.env.NODE_ENV !== 'production') {
      console.warn('[map] OSRM road routing unavailable, using direct bearing fallback:', err?.message || err);
    }
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onCallerAbort);
    }
  }

  return fallback;
}

/** Keep only records with usable coordinates; report the rest in the console (not to users). */
export function withValidCoords(records, label) {
  const valid = [];
  const skipped = [];
  (records || []).forEach((r) => {
    if (r && isValidLatLng(r.latitude, r.longitude)) {
      valid.push({
        ...r,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
      });
    } else {
      skipped.push(r);
    }
  });
  if (skipped.length && process.env.NODE_ENV !== 'production') {
    console.warn(`[map] Skipped ${skipped.length} ${label} with missing/invalid coordinates`, skipped.map((r) => r?.id));
  }
  return valid;
}

/** Fit the map to all given [lat, lng] points once they are known (and when the set changes). */
export function FitToPoints({ points, maxZoom = 14 }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], maxZoom);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, maxZoom]);
  return null;
}

/** Leaflet renders grey tiles if its container was sized after mount; recompute after mount and on resize. */
export function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 150);
    const container = map.getContainer();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    observer?.observe(container);
    return () => {
      clearTimeout(id);
      observer?.disconnect();
    };
  }, [map]);
  return null;
}

export const dotIcon = (color, size = 16) => L.divIcon({
  html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></span>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  className: '',
});

export { formatAreaName, reverseGeocode, useAreaName } from '../../utils/reverseGeocode';
