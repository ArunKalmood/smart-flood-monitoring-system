import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPin, AlertTriangle, Navigation, Route, Zap, Locate, RefreshCw } from 'lucide-react';
import {
  MapContainer, TileLayer, Marker, Popup, Circle,
  Polyline, useMap, ZoomControl,
} from 'react-leaflet';
import L from 'leaflet';
import { evacuationAPI, sosAPI, alertAPI } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import 'leaflet/dist/leaflet.css';

// ── Fix default Leaflet icon paths ─────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Icon helpers ────────────────────────────────────────────────────────────
const createColoredIcon = (color) => L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  className: '',
});

const userLocationIcon = L.divIcon({
  html: `
    <div style="position:relative;width:28px;height:28px;">
      <div style="
        position:absolute;inset:0;
        border-radius:50%;
        background:rgba(59,130,246,0.25);
        animation:pulse-ring 1.8s ease-out infinite;
      "></div>
      <div style="
        position:absolute;inset:5px;
        border-radius:50%;
        background:#3b82f6;
        border:2.5px solid white;
        box-shadow:0 2px 10px rgba(59,130,246,0.6);
      "></div>
    </div>
    <style>
      @keyframes pulse-ring {
        0%   { transform:scale(1);   opacity:.8; }
        100% { transform:scale(2.6); opacity:0;  }
      }
    </style>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  className: '',
});

// ── Static overlay data ─────────────────────────────────────────────────────
const SAFE_ROUTES = [
  [[20.6, 79.0], [20.65, 79.05], [20.7, 79.08], [20.75, 79.1]],
  [[20.5, 78.9], [20.55, 78.95], [20.58, 79.0]],
];
const FLOODED_AREAS = [
  { center: [20.55, 78.95], radius: 2000 },
  { center: [20.62, 79.02], radius: 1500 },
];
const BLOCKED_ROADS = [
  [[20.57, 78.97], [20.59, 79.0]],
  [[20.63, 79.03], [20.65, 79.05]],
];

// ── Helper: fly to position from inside the map ─────────────────────────────
function FlyToLocation({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 14, { duration: 1.4 });
  }, [position, map]);
  return null;
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function RouteMap() {
  const { t } = useLanguage();

  // API data
  const [centers,    setCenters]    = useState([]);
  const [sosMarkers, setSosMarkers] = useState([]);
  const [alerts,     setAlerts]     = useState([]);
  const [loading,    setLoading]    = useState(true);

  // Layer toggles
  const [layers, setLayers] = useState({
    floodedAreas: true,
    safeRoutes:   true,
    blockedRoads: true,
    sosPins:      true,
    centers:      true,
  });

  // Real-time user location
  const [userPos,        setUserPos]        = useState(null);   // { lat, lng, accuracy }
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | locating | ok | denied | error
  const [flyTo,          setFlyTo]          = useState(null);   // triggers FlyToLocation
  const watchIdRef = useRef(null);

  // ── Fetch API data ────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([
      evacuationAPI.getMapData(),
      sosAPI.getMapData(),
      alertAPI.getAll(),
    ]).then(([cRes, sRes, aRes]) => {
      if (cRes.status === 'fulfilled') setCenters(cRes.value.data || []);
      if (sRes.status === 'fulfilled') setSosMarkers(sRes.value.data || []);
      if (aRes.status === 'fulfilled') setAlerts(aRes.value.data || []);
      setLoading(false);
    });
  }, []);

  // ── Start real-time GPS watch ─────────────────────────────────────────────
  const startLocationWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      return;
    }
    setLocationStatus('locating');

    // Clear any existing watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        };
        setUserPos(newPos);
        setLocationStatus('ok');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLocationStatus('denied');
        else setLocationStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  // ── Auto-start location on mount, clean up on unmount ────────────────────
  useEffect(() => {
    startLocationWatch();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startLocationWatch]);

  const centerOnMe = () => {
    if (userPos) setFlyTo([userPos.lat, userPos.lng]);
  };

  const toggleLayer = (key) =>
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Location status badge ─────────────────────────────────────────────────
  const locationBadge = () => {
    if (locationStatus === 'locating') return (
      <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <RefreshCw className="w-3 h-3 animate-spin" /> {t('map_locating')}
      </span>
    );
    if (locationStatus === 'ok' && userPos) return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
        {t('map_live_location')}
      </span>
    );
    if (locationStatus === 'denied') return (
      <span className="text-xs text-red-500">{t('map_location_denied')}</span>
    );
    if (locationStatus === 'error') return (
      <span className="text-xs text-orange-500">{t('map_location_error')}</span>
    );
    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Route className="w-5 h-5 text-green-500" /> {t('map_title')}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('map_subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {locationBadge()}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 text-xs font-medium">
            <Zap className="w-3.5 h-3.5" /> {t('map_ai_ready')}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* ── Left panel ─────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* YOUR LIVE LOCATION card */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" /> {t('map_your_location')}
            </h3>

            {locationStatus === 'locating' && (
              <div className="flex items-center gap-2 py-2">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-xs text-slate-500">{t('map_locating')}</span>
              </div>
            )}

            {locationStatus === 'ok' && userPos && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
                    <p className="text-xs text-blue-500 font-medium">{t('map_lat')}</p>
                    <p className="text-xs font-mono text-slate-700 dark:text-slate-200 mt-0.5">
                      {userPos.lat.toFixed(5)}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
                    <p className="text-xs text-blue-500 font-medium">{t('map_lng')}</p>
                    <p className="text-xs font-mono text-slate-700 dark:text-slate-200 mt-0.5">
                      {userPos.lng.toFixed(5)}
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-center">
                  <p className="text-xs text-slate-500">{t('map_accuracy')}</p>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">±{userPos.accuracy} m</p>
                </div>
                <button
                  onClick={centerOnMe}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
                >
                  <Locate className="w-3.5 h-3.5" /> {t('map_center_me')}
                </button>
              </motion.div>
            )}

            {(locationStatus === 'denied' || locationStatus === 'error') && (
              <div className="space-y-2">
                <p className="text-xs text-red-500">
                  {locationStatus === 'denied' ? t('map_location_denied') : t('map_location_error')}
                </p>
                <button
                  onClick={startLocationWatch}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )}
          </div>

          {/* Layer Controls */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('map_layers')}</h3>
            {[
              { key: 'floodedAreas', label: t('map_flooded'),   color: 'bg-blue-500',   count: FLOODED_AREAS.length  },
              { key: 'safeRoutes',   label: t('map_safe'),      color: 'bg-green-500',  count: SAFE_ROUTES.length    },
              { key: 'blockedRoads', label: t('map_blocked'),   color: 'bg-red-500',    count: BLOCKED_ROADS.length  },
              { key: 'sosPins',      label: t('map_sos_pins'),  color: 'bg-yellow-500', count: sosMarkers.length     },
              { key: 'centers',      label: t('map_centers'),   color: 'bg-purple-500', count: centers.length        },
            ].map(l => (
              <label
                key={l.key}
                className="flex items-center justify-between py-2 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${l.color}`} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">{l.label}</span>
                  <span className="text-xs text-slate-400">({l.count})</span>
                </div>
                <input
                  type="checkbox"
                  checked={layers[l.key]}
                  onChange={() => toggleLayer(l.key)}
                  className="w-4 h-4 accent-blue-500"
                />
              </label>
            ))}
          </div>

          {/* Legend */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('map_legend')}</h3>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-green-500 rounded" /> {t('map_safe_route')}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-red-500 rounded" style={{ border: '1px dashed #ef4444' }} /> {t('map_blocked_road')}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-400 opacity-50" /> {t('map_flooded_zone')}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" /> {t('map_active_sos')}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" /> {t('map_evac_center')}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" style={{ boxShadow: '0 0 0 3px rgba(59,130,246,0.3)' }} />
                {t('map_your_location')}
              </div>
            </div>
          </div>

          {/* AI info */}
          <div className="glass-card p-4 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30">
            <h3 className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> {t('map_ai_title')}
            </h3>
            <p className="text-xs text-purple-600 dark:text-purple-300">{t('map_ai_desc')}</p>
            <p className="text-xs text-purple-500 mt-2 font-mono">POST /api/routes/optimize</p>
          </div>

          {/* Active Alerts */}
          {alerts.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> {t('map_active_alerts')}
              </h3>
              <div className="space-y-2">
                {alerts.slice(0, 3).map((a, i) => (
                  <div key={i} className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs">
                    <p className="font-medium text-red-700 dark:text-red-400">{a.title}</p>
                    <p className="text-red-500 mt-0.5">{a.affected_area || a.message?.substring(0, 60)}…</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Main Map ────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 glass-card overflow-hidden" style={{ height: 600 }}>
          {loading ? (
            <div className="skeleton h-full w-full" />
          ) : (
            <MapContainer
              center={[20.5937, 78.9629]}
              zoom={7}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
              zoomControl={false}
            >
              <ZoomControl position="bottomright" />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
              />

              {/* Fly helper */}
              {flyTo && <FlyToLocation position={flyTo} />}

              {/* ── Flooded areas ── */}
              {layers.floodedAreas && FLOODED_AREAS.map((a, i) => (
                <Circle
                  key={i}
                  center={a.center}
                  radius={a.radius}
                  pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 }}
                >
                  <Popup>
                    <strong className="text-blue-600">{t('map_flooded_zone')}</strong>
                    <br /><span className="text-xs">Avoid this area</span>
                  </Popup>
                </Circle>
              ))}

              {/* ── Safe routes ── */}
              {layers.safeRoutes && SAFE_ROUTES.map((route, i) => (
                <Polyline
                  key={i}
                  positions={route}
                  pathOptions={{ color: '#22c55e', weight: 4 }}
                >
                  <Popup>
                    <strong className="text-green-600">✅ {t('map_safe_route')}</strong>
                  </Popup>
                </Polyline>
              ))}

              {/* ── Blocked roads ── */}
              {layers.blockedRoads && BLOCKED_ROADS.map((road, i) => (
                <Polyline
                  key={i}
                  positions={road}
                  pathOptions={{ color: '#ef4444', weight: 4, dashArray: '8 4' }}
                >
                  <Popup>
                    <strong className="text-red-600">🚫 {t('map_blocked_road')}</strong>
                  </Popup>
                </Polyline>
              ))}

              {/* ── SOS markers ── */}
              {layers.sosPins && sosMarkers.map(s => (
                <Marker
                  key={s.id}
                  position={[s.latitude, s.longitude]}
                  icon={createColoredIcon('#f59e0b')}
                >
                  <Popup>
                    <strong className="text-amber-600">🆘 SOS — {s.emergency_type}</strong>
                    <br />{s.name} · {s.phone}
                    <br /><span className="text-xs">{s.location}</span>
                  </Popup>
                </Marker>
              ))}

              {/* ── Evacuation centers ── */}
              {layers.centers && centers.map(c => (
                <Marker
                  key={c.id}
                  position={[c.latitude, c.longitude]}
                  icon={createColoredIcon('#8b5cf6')}
                >
                  <Popup>
                    <strong className="text-purple-600">🏠 {c.name}</strong>
                    <br />{t('map_centers')}: {c.current_occupancy}/{c.capacity}
                    <br />
                    <span className={`text-xs font-medium ${c.status === 'open' ? 'text-green-600' : 'text-red-600'}`}>
                      {c.status?.toUpperCase()}
                    </span>
                  </Popup>
                </Marker>
              ))}

              {/* ── REAL-TIME USER LOCATION ── */}
              {userPos && locationStatus === 'ok' && (
                <Marker
                  position={[userPos.lat, userPos.lng]}
                  icon={userLocationIcon}
                  zIndexOffset={1000}
                >
                  <Popup>
                    <div className="text-center">
                      <strong className="text-blue-600 flex items-center gap-1 justify-center">
                        📍 {t('map_your_location')}
                      </strong>
                      <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                        <p>{t('map_lat')}: <span className="font-mono">{userPos.lat.toFixed(6)}</span></p>
                        <p>{t('map_lng')}: <span className="font-mono">{userPos.lng.toFixed(6)}</span></p>
                        <p>{t('map_accuracy')}: ±{userPos.accuracy} m</p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}
        </div>
      </div>
    </div>
  );
}
