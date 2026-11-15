/**
 * ArduinoLivePanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Data sources (priority order):
 *   1. Web Serial (browser → COM7 directly) — when connected, zero latency
 *      Updates immediately on every valid ESP32 line (~200 ms intervals).
 *   2. Backend polling (/api/sensors/live) every 1 s — fallback when not
 *      connected via serial (e.g. serial_bridge.py is running instead)
 *
 * Connect/Disconnect button lives here.
 * Uses SerialContext so the same reading is shared with Dashboard.js.
 * Uses raw fetch() for the polling fallback — bypasses the shared axios
 * interceptor so errors never show global toasts.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Droplets, CloudRain, AlertTriangle, MapPin, Clock,
  Radio, Wifi, WifiOff, ShieldAlert, Usb, Unplug,
} from 'lucide-react';
import usePolling from '../../hooks/usePolling';
import { useSerial } from '../../context/SerialContext';
import { parseDate } from '../../utils/datetime';
import { formatNumber } from '../../utils/units';

const POLL_MS   = 1000;
const SENSOR_ID = 'ARDUINO-001';
const API_BASE  = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const WARN_M    = 5.0;
const DANGER_M  = 8.0;

// ── small helpers ─────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" aria-hidden="true" />
      LIVE
    </span>
  );
}

function RiskBadge({ level }) {
  const map = {
    danger:  { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',                label: 'CRITICAL' },
    warning: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',        label: 'WARNING'  },
    safe:    { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: 'SAFE'     },
  };
  const { cls, label } = map[level] || map.safe;
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

/**
 * Shows the USB direct connection status separately from ESP32 WiFi status.
 * USB = browser ↔ COM7 (this component)
 * WiFi = ESP32 ↔ router (shown from serial reading)
 */
function ConnectionBadge({ online, serialConnected, wifiStatus, error }) {
  if (serialConnected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
        <Usb className="w-3 h-3" aria-hidden="true" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
        USB Connected
        {wifiStatus && wifiStatus !== 'UNKNOWN' && (
          <span className="ml-1 text-slate-400 dark:text-slate-500 font-normal">
            · ESP32 WiFi: {wifiStatus}
          </span>
        )}
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
        <WifiOff className="w-3 h-3" aria-hidden="true" /> No connection
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${online ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
      {online
        ? <><Wifi className="w-3 h-3" aria-hidden="true" /><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" /> API Online</>
        : <><WifiOff className="w-3 h-3" aria-hidden="true" /> Offline</>
      }
    </span>
  );
}

function Tile({ icon: Icon, iconColor, label, children, highlight }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
      highlight
        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40'
        : 'bg-slate-50 dark:bg-slate-700/50'
    }`}>
      <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center bg-white dark:bg-slate-800 shadow-sm ${iconColor}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-none mb-1">{label}</p>
        <div className="text-sm font-bold text-slate-800 dark:text-white">{children}</div>
      </div>
    </div>
  );
}

/** Binary rain display: DETECTED (highlighted) or NO RAIN (muted) */
function RainValue({ detected }) {
  return detected
    ? <span className="text-cyan-600 dark:text-cyan-400">DETECTED</span>
    : <span className="text-slate-400 dark:text-slate-500 font-normal">NO RAIN</span>;
}

function YesNo({ yes }) {
  return (
    <span className={yes ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
      {yes ? 'YES' : 'NO'}
    </span>
  );
}

/** Shows a live-updating "X ago" string from an ISO timestamp */
function LiveClock({ isoString }) {
  const [text, setText] = useState('—');
  useEffect(() => {
    if (!isoString) { setText('—'); return; }
    const tick = () => {
      const date = parseDate(isoString);
      if (!date) { setText('—'); return; }
      const diff = Math.round((Date.now() - date.getTime()) / 1000);
      if (diff < 3)  return setText('just now');
      if (diff < 60) return setText(`${diff}s ago`);
      const m = Math.floor(diff / 60);
      if (m < 60)   return setText(`${m}m ago`);
      const h = Math.floor(m / 60);
      setText(`${h}h ${m % 60}m ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isoString]);
  return <span>{text}</span>;
}

// ── main component ─────────────────────────────────────────────────────────────

export default function ArduinoLivePanel() {
  // ── serial context (Web Serial — primary source) ───────────────────────────
  const { reading: serialReading, serial } = useSerial();

  // ── polling fallback (backend API — used when serial is not connected) ──────
  const [apiData,    setApiData]    = useState(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError,   setApiError]   = useState(false);
  const prevRecordedAt = useRef(null);
  const [flash, setFlash] = useState(false);

  const poll = useCallback(async () => {
    // Skip polling when Web Serial is active — saves unnecessary requests
    if (serial.connected) { setApiLoading(false); return; }
    try {
      const url = `${API_BASE}/sensors/live?sensor_id=${encodeURIComponent(SENSOR_ID)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const incoming = await res.json();
      if (incoming?.recorded_at && incoming.recorded_at !== prevRecordedAt.current) {
        prevRecordedAt.current = incoming.recorded_at;
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
      setApiData(incoming);
      setApiError(false);
    } catch {
      setApiError(true);
    } finally {
      setApiLoading(false);
    }
  }, [serial.connected]);

  usePolling(poll, POLL_MS);

  // Flash border on new serial reading
  useEffect(() => {
    if (serialReading) {
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
    }
  }, [serialReading]);

  // ── unified display values ─────────────────────────────────────────────────
  // When serial is connected AND we have at least one reading, use USB data.
  // Otherwise fall back to the API polling result.
  const usingSerial = serial.connected && serialReading != null;

  const wcm      = usingSerial ? serialReading.distance_cm
                 : apiData?.water_level != null ? apiData.water_level * 100 : null;
  const wm       = usingSerial ? serialReading.distance_m
                 : apiData?.water_level ?? null;

  // rainfall: boolean from serial; >0 from API
  const raining  = usingSerial
    ? serialReading.rainfall            // boolean
    : apiData?.rainfall != null && apiData.rainfall > 0;

  const hasGps   = usingSerial
    ? serialReading.latitude != null
    : apiData?.latitude != null;
  const latitude  = usingSerial ? serialReading.latitude  : apiData?.latitude;
  const longitude = usingSerial ? serialReading.longitude : apiData?.longitude;

  // Prefer serial.lastReadAt (set by hook on every valid line) for the clock
  const timestamp = usingSerial
    ? (serial.lastReadAt || serialReading.timestamp)
    : apiData?.recorded_at;

  const isOnline  = usingSerial ? true : (apiData?.online ?? false);
  const gpsStatus = usingSerial ? serialReading.gps_status : (hasGps ? 'FIX' : 'WAITING');
  const wifiStatus = usingSerial ? serialReading.wifi_status : null;

  // Warning / Critical: direct from serial fields; from backend risk otherwise
  const isWarning  = usingSerial
    ? (serialReading.warning || serialReading.critical)
    : (apiData?.risk_level === 'warning' || apiData?.risk_level === 'danger');
  const isCritical = usingSerial
    ? serialReading.critical
    : apiData?.risk_level === 'danger';

  const riskLevel  = isCritical ? 'danger' : isWarning ? 'warning' : 'safe';

  const loading   = !usingSerial && apiLoading;
  const hasError  = !usingSerial && apiError;

  const borderClass = isCritical
    ? 'border-red-300 dark:border-red-700'
    : isWarning
    ? 'border-amber-300 dark:border-amber-700'
    : 'border-emerald-200 dark:border-emerald-800/40';

  const serialSupported = serial.supported;

  return (
    <section
      className={`glass-card p-5 border-2 transition-all duration-300 ${borderClass} ${flash ? 'ring-2 ring-blue-400 ring-opacity-60' : ''}`}
      aria-labelledby="arduino-panel-title"
      aria-live="polite"
      aria-atomic="false"
    >
      {/* ── header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-sm">
            <Radio className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="arduino-panel-title"
              className="text-sm font-bold text-slate-800 dark:text-white flex flex-wrap items-center gap-1.5"
            >
              ESP32 Live Sensor
              <LiveBadge />
              {!loading && <RiskBadge level={riskLevel} />}
              {usingSerial && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  USB Direct
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <ConnectionBadge
                online={isOnline}
                serialConnected={usingSerial}
                wifiStatus={wifiStatus}
                error={hasError}
              />
              <span className="text-slate-300 dark:text-slate-600 text-xs">·</span>
              <span className="text-xs text-slate-400">{SENSOR_ID}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Last received reading time */}
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {timestamp
              ? <LiveClock isoString={timestamp} />
              : <span>waiting…</span>
            }
          </div>

          {/* Connect / Disconnect button */}
          {serialSupported ? (
            serial.connected ? (
              <button
                type="button"
                onClick={serial.disconnect}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition"
              >
                <Unplug className="w-3.5 h-3.5" aria-hidden="true" /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={serial.connect}
                disabled={serial.connecting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
              >
                <Usb className="w-3.5 h-3.5" aria-hidden="true" />
                {serial.connecting ? 'Connecting…' : 'Connect ESP32'}
              </button>
            )
          ) : (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              Chrome required for USB
            </span>
          )}
        </div>
      </div>

      {/* Serial error or browser-unsupported notice */}
      {serial.error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-xs text-red-700 dark:text-red-300">
          {serial.error}
        </div>
      )}
      {!serialSupported && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-300">
          <strong>Web Serial API not supported.</strong> Use Chrome 89+ on <code>localhost</code> for direct USB.
          Readings below come from the Python serial bridge via the backend API.
        </div>
      )}

      {/* ── body ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : hasError ? (
        <div className="flex items-center gap-2 py-3 text-sm text-red-600 dark:text-red-400">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          Cannot reach backend at port 8000. Connect ESP32 via USB or start the backend server.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

          <Tile icon={Droplets} iconColor="text-blue-500" label="Water Level (cm)" highlight={isCritical}>
            {wcm != null
              ? <>{formatNumber(wcm, 1)} <span className="text-xs font-normal text-slate-500">cm</span></>
              : '—'}
          </Tile>

          <Tile icon={Droplets} iconColor="text-blue-400" label="Water Level (m)" highlight={isCritical}>
            {wm != null
              ? <>{formatNumber(wm, 3)} <span className="text-xs font-normal text-slate-500">m</span></>
              : '—'}
          </Tile>

          {/* Rainfall: binary YL-83 reading — DETECTED or NO RAIN */}
          <Tile icon={CloudRain} iconColor="text-cyan-500" label="Rainfall (YL-83)" highlight={raining}>
            <RainValue detected={raining} />
          </Tile>

          <Tile icon={AlertTriangle} iconColor="text-amber-500" label="Warning" highlight={isWarning && !isCritical}>
            <YesNo yes={isWarning} />
          </Tile>

          <Tile
            icon={ShieldAlert}
            iconColor={isCritical ? 'text-red-500' : 'text-slate-400'}
            label="Critical"
            highlight={isCritical}
          >
            <YesNo yes={isCritical} />
          </Tile>

          <Tile icon={MapPin} iconColor="text-green-500" label="GPS Status">
            {hasGps
              ? <span className="text-xs leading-tight">{formatNumber(latitude, 4)}, {formatNumber(longitude, 4)}</span>
              : <span className="text-slate-400 font-normal text-xs">{gpsStatus}</span>
            }
          </Tile>

        </div>
      )}

      {/* ── footer ──────────────────────────────────────────────────── */}
      {!loading && !hasError && (
        <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-600 text-right">
          {usingSerial
            ? `Source: USB direct · ~200 ms updates · `
            : `Polling every ${POLL_MS / 1000}s · `}
          thresholds: warning &gt; {WARN_M} m · critical &gt; {DANGER_M} m
        </p>
      )}
    </section>
  );
}
