import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Navigation, Locate, RefreshCw, Map as MapIcon, ShieldCheck, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { alertAPI, evacuationAPI, sensorAPI, sosAPI } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import PageHeader from '../../components/common/PageHeader';
import {
  FitToPoints, INDIA_CENTER, InvalidateSizeOnMount, TILE_ATTRIBUTION, TILE_URL,
  dotIcon, haversineDistanceKm, isValidLatLng, withValidCoords,
  fetchRoadRoute, isShelterAvailable, getSensorRiskColor, useAreaName,
} from '../../components/maps/mapUtils';
import { SOS_STATUS_STYLES } from '../../constants/status';
import { formatDateTime } from '../../utils/datetime';
import { latitudeRules, longitudeRules } from '../../utils/validation';
import { toastError } from '../../utils/toast';

const LAYERS = [
  { key: 'alertZones', labelKey: 'map_layer_alert_zones', color: 'bg-red-400' },
  { key: 'sos', labelKey: 'map_layer_sos', color: 'bg-amber-500' },
  { key: 'centers', labelKey: 'map_layer_centers', color: 'bg-purple-500' },
  { key: 'sensors', labelKey: 'map_layer_sensors', color: 'bg-cyan-500' },
  { key: 'routes', labelKey: 'map_layer_routes', color: 'bg-emerald-500' },
];
const DEFAULT_ALERT_RADIUS_KM = 1;

const userIcon = L.divIcon({
  html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 6px rgba(59,130,246,0.25)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: '',
});

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 1.2 });
  }, [target, map]);
  return null;
}

export default function RouteMap() {
  const { t, language } = useLanguage();
  const [centers, setCenters] = useState([]);
  const [sosMarkers, setSosMarkers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState({ alertZones: true, sos: true, centers: true, sensors: true, routes: true });
  const [userPos, setUserPos] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | ok | denied | unavailable
  const { areaName, areaStatus } = useAreaName(geoStatus === 'ok' ? userPos : null, language);
  const [manual, setManual] = useState({ lat: '', lng: '' });
  const [manualError, setManualError] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [selectedCenterId, setSelectedCenterId] = useState(null);
  const [roadRoute, setRoadRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const watchId = useRef(null);
  const routeSeqRef = useRef(0);

  const load = useCallback(async () => {
    const [c, s, a, sn] = await Promise.allSettled([
      evacuationAPI.getMapData(),
      sosAPI.getMapData(),
      alertAPI.getAll(),
      sensorAPI.getAll(),
    ]);
    if (c.status === 'fulfilled') setCenters(withValidCoords(c.value.data, 'evacuation centers'));
    if (s.status === 'fulfilled') setSosMarkers(withValidCoords(s.value.data, 'SOS requests'));
    if (a.status === 'fulfilled') setAlerts(a.value.data || []);
    if (sn.status === 'fulfilled') setSensors(withValidCoords(sn.value.data, 'sensors'));
    const failed = [c, s, a, sn].find((r) => r.status === 'rejected');
    if (failed) toastError(failed.reason);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startLocating = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      return;
    }
    setGeoStatus('locating');
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setGeoStatus('ok');
      },
      (err) => setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => {
    startLocating();
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [startLocating]);

  const applyManualLocation = (e) => {
    e.preventDefault();
    const latOk = latitudeRules().validate(manual.lat);
    const lngOk = longitudeRules().validate(manual.lng);
    if (manual.lat === '' || manual.lng === '' || latOk !== true || lngOk !== true) {
      setManualError(t('map_manual_invalid'));
      return;
    }
    setManualError('');
    const pos = { lat: Number(manual.lat), lng: Number(manual.lng), accuracy: null };
    setUserPos(pos);
    setGeoStatus('ok');
    setFlyTarget([pos.lat, pos.lng]);
  };

  const alertZones = useMemo(() => alerts.filter((a) => isValidLatLng(a.latitude, a.longitude)), [alerts]);
  const alertsWithoutArea = alerts.length - alertZones.length;

  // Available shelters: open status and remaining capacity
  const availableCenters = useMemo(() => centers.filter(isShelterAvailable), [centers]);

  // Calculate nearest evacuation center from user location (strictly available shelters)
  const nearestCenter = useMemo(() => {
    if (!userPos || !availableCenters.length) return null;
    let closest = null;
    let minKm = Infinity;
    for (const c of availableCenters) {
      const dist = haversineDistanceKm([userPos.lat, userPos.lng], [c.latitude, c.longitude]);
      if (dist !== null && dist < minKm) {
        minKm = dist;
        closest = {
          center: c,
          distance: Math.round(dist * 10) / 10,
          isAvailable: true,
        };
      }
    }
    return closest;
  }, [userPos, availableCenters]);

  // Target center for evacuation route (custom selected shelter or nearest available shelter)
  const targetCenter = useMemo(() => {
    if (selectedCenterId) {
      const found = centers.find((c) => String(c.id) === String(selectedCenterId));
      if (found) {
        const dist = userPos
          ? Math.round((haversineDistanceKm([userPos.lat, userPos.lng], [found.latitude, found.longitude]) || 0) * 10) / 10
          : null;
        return { center: found, distance: dist, isAvailable: isShelterAvailable(found), isCustom: true };
      }
    }
    return nearestCenter ? { ...nearestCenter, isCustom: false } : null;
  }, [selectedCenterId, centers, nearestCenter, userPos]);

  // Fetch real road route asynchronously via OSRM with direct fallback and sequence protection
  useEffect(() => {
    if (!userPos || !targetCenter || !layers.routes) {
      setRoadRoute(null);
      setRouteLoading(false);
      return;
    }

    const controller = new AbortController();
    const seq = ++routeSeqRef.current;
    setRouteLoading(true);

    fetchRoadRoute(
      [userPos.lat, userPos.lng],
      [targetCenter.center.latitude, targetCenter.center.longitude],
      { signal: controller.signal }
    )
      .then((route) => {
        if (seq === routeSeqRef.current && !controller.signal.aborted) {
          setRoadRoute(route);
          setRouteLoading(false);
        }
      })
      .catch((err) => {
        if (seq === routeSeqRef.current && !controller.signal.aborted) {
          setRouteLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [userPos, targetCenter, layers.routes]);

  const evacuationPositions = useMemo(() => {
    if (!layers.routes || !roadRoute || !roadRoute.coordinates || roadRoute.coordinates.length < 2) return null;
    return roadRoute.coordinates;
  }, [layers.routes, roadRoute]);

  // Fit to everything that is drawn
  const points = useMemo(() => [
    ...(layers.alertZones ? alertZones.map((a) => [a.latitude, a.longitude]) : []),
    ...(layers.sos ? sosMarkers.map((s) => [s.latitude, s.longitude]) : []),
    ...(layers.centers ? centers.map((c) => [c.latitude, c.longitude]) : []),
    ...(layers.sensors ? sensors.map((sn) => [sn.latitude, sn.longitude]) : []),
    ...(evacuationPositions ? evacuationPositions : []),
  ], [layers, alertZones, sosMarkers, centers, sensors, evacuationPositions]);

  const counts = {
    alertZones: alertZones.length,
    sos: sosMarkers.length,
    centers: centers.length,
    sensors: sensors.length,
    routes: evacuationPositions ? 1 : 0,
  };

  return (
    <div className="page-container">
      <PageHeader icon={MapIcon} iconClass="text-green-500" title={t('map_title')} subtitle={t('map_subtitle')}>
        <button type="button" onClick={load} className="btn-outline py-2 px-3 text-xs">
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> {t('action_refresh')}
        </button>
      </PageHeader>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="space-y-4">
          <section className="glass-card p-4" aria-labelledby="my-location-title">
            <h2 id="my-location-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" aria-hidden="true" /> {t('map_your_location')}
            </h2>
            {geoStatus === 'locating' && (
              <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('map_locating')}
              </p>
            )}
            {geoStatus === 'ok' && userPos && (
              <div className="space-y-2 text-xs">
                {areaStatus === 'locating' && (
                  <p className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 py-0.5" role="status">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" aria-hidden="true" />
                    <span>{t('map_area_locating')}</span>
                  </p>
                )}
                {areaStatus === 'ok' && areaName && (
                  <div className="space-y-0.5">
                    <div className="flex items-start gap-1.5 text-slate-800 dark:text-slate-100 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="leading-tight">{areaName}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 pl-5 leading-tight">
                      {t('map_area_attribution')}
                    </p>
                  </div>
                )}
                {areaStatus === 'unavailable' && (
                  <div className="space-y-0.5">
                    <p className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                      {t('map_area_unavailable')}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {t('map_area_attribution')}
                    </p>
                  </div>
                )}
                <p className="font-mono text-slate-700 dark:text-slate-200">{userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}</p>
                {userPos.accuracy !== null && <p className="text-slate-500">{t('map_accuracy', { meters: userPos.accuracy })}</p>}
                <button type="button" onClick={() => setFlyTarget([userPos.lat, userPos.lng])}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium">
                  <Locate className="w-3.5 h-3.5" aria-hidden="true" /> {t('map_center_me')}
                </button>
                {targetCenter ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                      <span className="flex items-center gap-1">
                        {roadRoute?.isRoadRoute ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {targetCenter.isCustom ? t('map_shelter_selected') : t('map_road_route')}
                            </span>
                          </>
                        ) : (
                          <>
                            <Navigation className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-amber-700 dark:text-amber-400">
                              {targetCenter.isCustom ? t('map_shelter_selected') : t('map_direct_route')}
                            </span>
                          </>
                        )}
                      </span>
                      {targetCenter.isCustom && (
                        <button
                          type="button"
                          onClick={() => setSelectedCenterId(null)}
                          className="text-[10px] text-blue-500 hover:underline"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{targetCenter.center.name}</p>
                    <p className="text-slate-500 text-[11px]">
                      {(roadRoute?.distanceKm !== undefined ? roadRoute.distanceKm : targetCenter.distance)} km · {t(`evac_status_${targetCenter.center.status}`)}
                      {targetCenter.center.capacity > 0 && ` (${Math.round(((targetCenter.center.current_occupancy || 0) / targetCenter.center.capacity) * 100)}% full)`}
                      {roadRoute?.durationMinutes ? ` · ${t('map_route_duration', { minutes: roadRoute.durationMinutes })}` : ''}
                    </p>
                    {!targetCenter.isAvailable && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold mt-1">
                        ⚠️ {t(targetCenter.center.status ? `evac_status_${targetCenter.center.status}` : 'evac_status_closed')} — Not currently accepting evacuees
                      </p>
                    )}
                    <p className="text-[10px] mt-0.5">
                      {routeLoading ? (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" /> {t('action_refresh')}…
                        </span>
                      ) : roadRoute?.isRoadRoute ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t('map_road_route')}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ {t('map_direct_route')}</span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFlyTarget([targetCenter.center.latitude, targetCenter.center.longitude])}
                      className="mt-2 w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium"
                    >
                      {t('map_nearest_shelter', {
                        name: targetCenter.center.name,
                        distance: roadRoute?.distanceKm !== undefined ? roadRoute.distanceKm : targetCenter.distance,
                      })}
                    </button>
                  </div>
                ) : availableCenters.length === 0 && centers.length > 0 ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                    {t('map_no_open_shelter')}
                  </div>
                ) : null}
              </div>
            )}
            {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
              <div className="space-y-2">
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {t(geoStatus === 'denied' ? 'map_location_denied' : 'map_location_error')}
                </p>
                <button type="button" onClick={startLocating}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {t('action_retry')}
                </button>
              </div>
            )}
            <form onSubmit={applyManualLocation} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2" noValidate>
              <p className="text-xs text-slate-500">{t('map_manual_hint')}</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="any" value={manual.lat} onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
                  placeholder={t('field_latitude')} aria-label={t('field_latitude')} className="input-base py-1.5 text-xs" />
                <input type="number" step="any" value={manual.lng} onChange={(e) => setManual((m) => ({ ...m, lng: e.target.value }))}
                  placeholder={t('field_longitude')} aria-label={t('field_longitude')} className="input-base py-1.5 text-xs" />
              </div>
              {manualError && <p className="field-error" role="alert">{manualError}</p>}
              <button type="submit" className="w-full btn-ghost text-xs py-1.5">{t('map_manual_use')}</button>
            </form>
          </section>

          <section className="glass-card p-4" aria-labelledby="layers-title">
            <h2 id="layers-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('map_layers')}</h2>
            {LAYERS.map((l) => (
              <label key={l.key} className="flex items-center justify-between py-2 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0">
                <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span className={`w-3 h-3 rounded-full ${l.color}`} aria-hidden="true" /> {t(l.labelKey)}
                  <span className="text-slate-400">({counts[l.key]})</span>
                </span>
                <input type="checkbox" checked={layers[l.key]} onChange={() => setLayers((p) => ({ ...p, [l.key]: !p[l.key] }))} className="w-4 h-4 accent-blue-500" />
              </label>
            ))}
            {alertsWithoutArea > 0 && <p className="text-xs text-slate-500 mt-2">{t('map_alerts_without_area', { count: alertsWithoutArea })}</p>}
          </section>

          {alerts.length > 0 && (
            <section className="glass-card p-4" aria-labelledby="map-alerts-title">
              <h2 id="map-alerts-title" className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" /> {t('dash_active_alerts')}
              </h2>
              <ul className="space-y-2">
                {alerts.slice(0, 5).map((a) => (
                  <li key={a.id} className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs">
                    <p className="font-medium text-red-700 dark:text-red-400">{a.title}</p>
                    <p className="text-red-600 dark:text-red-300 mt-0.5">{a.affected_area || a.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="lg:col-span-3 glass-card overflow-hidden relative" style={{ height: 600 }} aria-label={t('map_title')}>
          {loading ? <div className="skeleton h-full w-full" /> : (
            <MapContainer center={INDIA_CENTER} zoom={5} className="h-full w-full z-0" zoomControl={false}>
              <ZoomControl position="bottomright" />
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <InvalidateSizeOnMount />
              <FitToPoints points={points} />
              <FlyTo target={flyTarget} />

              {/* Evacuation Route Polyline */}
              {layers.routes && evacuationPositions && targetCenter && (
                <Polyline
                  positions={evacuationPositions}
                  pathOptions={{
                    color: roadRoute?.isRoadRoute ? '#10b981' : '#f59e0b',
                    weight: roadRoute?.isRoadRoute ? 4 : 2.5,
                    dashArray: roadRoute?.isRoadRoute ? undefined : '6 8',
                    opacity: 0.9,
                  }}
                >
                  <Popup>
                    <strong>{targetCenter.center.name}</strong>
                    <br />
                    <span className={`text-[11px] font-semibold ${roadRoute?.isRoadRoute ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {roadRoute?.isRoadRoute ? t('map_road_route') : `⚠️ ${t('map_direct_route')}`}
                    </span>
                    <br />
                    {roadRoute?.distanceKm !== undefined ? `${roadRoute.distanceKm} km` : `${targetCenter.distance} km`}
                    {roadRoute?.isRoadRoute && roadRoute?.durationMinutes !== null && roadRoute?.durationMinutes !== undefined && (
                      <> · {t('map_route_duration', { minutes: roadRoute.durationMinutes })}</>
                    )}
                    {!roadRoute?.isRoadRoute && (
                      <span className="block text-[10px] text-slate-400 mt-1">
                        (Directional bearing only; road route service unavailable)
                      </span>
                    )}
                  </Popup>
                </Polyline>
              )}

              {/* Observed Alert Zones */}
              {layers.alertZones && alertZones.map((a) => (
                <Circle key={`alert-${a.id}`} center={[a.latitude, a.longitude]} radius={(a.radius_km || DEFAULT_ALERT_RADIUS_KM) * 1000}
                  pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2 }}>
                  <Popup>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-500">[{t('map_observed_alert')}]</span>
                    <br /><strong>{a.title}</strong><br />{a.message}
                    {a.affected_area && <><br />{a.affected_area}</>}
                    <br />{formatDateTime(a.created_at)}
                  </Popup>
                </Circle>
              ))}

              {/* SOS Markers */}
              {layers.sos && sosMarkers.map((s) => (
                <Marker key={`sos-${s.id}`} position={[s.latitude, s.longitude]} icon={dotIcon(SOS_STATUS_STYLES[s.status]?.pin || '#f59e0b')}>
                  <Popup>
                    <strong>SOS #{s.id} · {t(`emergency_${s.emergency_type}`)}</strong>
                    <br />{s.name} · {s.phone}
                    {s.location && <><br />{s.location}</>}
                    <br />{t(`sos_status_${s.status}`)}
                  </Popup>
                </Marker>
              ))}

              {/* Evacuation Centers */}
              {layers.centers && centers.map((c) => {
                const isAvailable = isShelterAvailable(c);
                const isSelected = selectedCenterId && String(c.id) === String(selectedCenterId);
                return (
                  <Marker key={`center-${c.id}`} position={[c.latitude, c.longitude]} icon={dotIcon(isSelected ? '#10b981' : '#8b5cf6')}>
                    <Popup>
                      <strong>{c.name}</strong>
                      {isAvailable && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
                          {t('map_shelter_available_badge')}
                        </span>
                      )}
                      <br />{t('evac_capacity_pct', { capacity: c.capacity, pct: c.capacity ? Math.round((c.current_occupancy / c.capacity) * 100) : 0 })}
                      <br />{t(`evac_status_${c.status}`)}
                      {c.contact_number && <><br /><a href={`tel:${c.contact_number}`}>{c.contact_number}</a></>}
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setSelectedCenterId(c.id)}
                          className="text-[11px] px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium"
                        >
                          {isSelected ? `✓ ${t('map_shelter_selected')}` : t('map_shelter_selected')}
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Monitoring Sensors with Telemetry and Modelled Flood Risk */}
              {layers.sensors && sensors.map((sn) => {
                const riskColor = getSensorRiskColor(sn.risk_level, sn.status);
                return (
                  <Marker key={`sensor-${sn.id}`} position={[sn.latitude, sn.longitude]} icon={dotIcon(riskColor)}>
                    <Popup>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                        [{t('map_modelled_risk')}]
                      </span>
                      {sn.is_stale && (
                        <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                          (Stale)
                        </span>
                      )}
                      <br /><strong>{sn.name}</strong> ({sn.sensor_id})
                      {sn.location && <><br />{sn.location}</>}
                      <br />{t('field_status')}: {sn.status}
                      {sn.risk_level && (
                        <><br />{t(`risk_${sn.risk_level}`)} {sn.confidence ? `(${(sn.confidence * 100).toFixed(0)}%)` : ''}</>
                      )}
                      {sn.water_level !== null && sn.water_level !== undefined && (
                        <><br />{t('reading_water_level')}: {sn.water_level} m</>
                      )}
                      {sn.rainfall !== null && sn.rainfall !== undefined && (
                        <><br />{t('reading_rainfall')}: {sn.rainfall} mm/h</>
                      )}
                      {sn.reading_recorded_at ? (
                        <><br /><span className="text-[11px] text-slate-400">{formatDateTime(sn.reading_recorded_at)}</span></>
                      ) : sn.last_seen ? (
                        <><br /><span className="text-[11px] text-slate-400">{formatDateTime(sn.last_seen)}</span></>
                      ) : null}
                    </Popup>
                  </Marker>
                );
              })}

              {/* User Position Marker */}
              {userPos && geoStatus === 'ok' && (
                <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} zIndexOffset={1000}>
                  <Popup>
                    <div className="text-xs space-y-1">
                      <strong className="block text-slate-800 dark:text-slate-100">{t('map_your_location')}</strong>
                      {areaName && <p className="text-blue-600 dark:text-blue-400 font-medium">{areaName}</p>}
                      <p className="font-mono text-slate-500">{userPos.lat.toFixed(5)}, {userPos.lng.toFixed(5)}</p>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          )}
          {!loading && points.length === 0 && (
            <p className="absolute bottom-3 left-3 right-16 z-[400] text-center text-xs bg-white/90 dark:bg-slate-800/90 rounded-lg p-2 text-slate-600 dark:text-slate-300">
              {t('map_no_data')}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
