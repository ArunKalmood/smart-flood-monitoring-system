/**
 * useWebSerial
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the full Web Serial API lifecycle for the ESP32 / HC-SR04 sensor.
 *
 * Performance design:
 *  - The read loop only holds refs — never reads React state.
 *  - onReading is called once per valid line, synchronously, with no await.
 *  - Backend POST is fully decoupled: queued on a separate microtask, never
 *    awaited inside the parsing loop.
 *  - Two setState calls per reading (setReading + setLastReadAt) are batched
 *    into a single render by React 18 automatic batching.
 *  - The returned object is stable (same reference) unless a value changes,
 *    preventing unnecessary context re-renders in consumers.
 *
 * Compatible with Chrome 89+ on localhost.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// ── parser ────────────────────────────────────────────────────────────────────
// Compiled at module load — not inside the render cycle.

const DISTANCE_RE = /Distance:\s*(\d+(?:\.\d+)?)\s*cm/i;
const RAIN_RE     = /Rain:\s*(YES|NO)/i;
const WARNING_RE  = /Warning:\s*(YES|NO)/i;
const CRITICAL_RE = /Critical:\s*(YES|NO)/i;
const GPS_LAT_RE  = /Lat:\s*(-?\d+(?:\.\d+)?)/i;
const GPS_LON_RE  = /Lon:\s*(-?\d+(?:\.\d+)?)/i;
const BARE_NUM_RE = /^\s*(\d+(?:\.\d+)?)\s*$/;
const NOISE_RE    = /^[^a-zA-Z0-9]+$/;

const SKIP_PREFIXES = [
  'retrying', 'wifi:', 'e (', 'i (', 'w (', 'ets ', 'rst:', 'boot:',
  'configsip:', 'clk_drv:', 'load:', 'entry ',
];
const SKIP_SUBSTRINGS = ['wifi:sta', 'connecting', 'sdk ver', 'compile time'];

/**
 * Parse one ESP32 serial line.
 * Returns null for noise/invalid.  On success returns:
 *   { distance_cm, distance_m, rainfall (bool), warning (bool),
 *     critical (bool), gps_status, wifi_status, latitude, longitude,
 *     raw, timestamp, _t (performance.now for latency measurement) }
 *
 * Example:
 *   "Distance: 189.68 cm | Rain: YES | Warning: YES | Critical: NO | GPS: WAITING | WiFi: DISCONNECTED"
 */
export function parseSerialLine(raw) {
  const line = raw.trim();
  if (!line) return null;

  const lower = line.toLowerCase();
  if (NOISE_RE.test(line)) return null;
  if (SKIP_PREFIXES.some((p) => lower.startsWith(p))) return null;
  if (SKIP_SUBSTRINGS.some((s) => lower.includes(s))) return null;
  if (lower.includes('invalid') || lower.includes('no reading')) return null;

  const distMatch = DISTANCE_RE.exec(line);
  const bareMatch = !distMatch ? BARE_NUM_RE.exec(line) : null;

  let distance_cm = null;
  if (distMatch) {
    const v = parseFloat(distMatch[1]);
    if (!Number.isNaN(v) && v >= 0 && v <= 99999) distance_cm = v;
  } else if (bareMatch) {
    const v = parseFloat(bareMatch[1]);
    if (!Number.isNaN(v) && v >= 0 && v <= 99999) distance_cm = v;
  }
  if (distance_cm === null) return null;

  const rainMatch = RAIN_RE.exec(line);
  const warnMatch = WARNING_RE.exec(line);
  const critMatch = CRITICAL_RE.exec(line);
  const latMatch  = GPS_LAT_RE.exec(line);
  const lonMatch  = GPS_LON_RE.exec(line);
  const gpsMatch  = /GPS:\s*(\S+)/i.exec(line);
  const wifiMatch = /WiFi:\s*(\S+)/i.exec(line);

  const distance_m = Math.round((distance_cm / 100) * 10000) / 10000;
  const rainfall   = rainMatch ? rainMatch[1].toUpperCase() === 'YES' : false;
  const warning    = warnMatch ? warnMatch[1].toUpperCase() === 'YES' : false;
  const critical   = critMatch ? critMatch[1].toUpperCase() === 'YES' : false;

  let latitude  = null;
  let longitude = null;
  if (latMatch && lonMatch) {
    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) { latitude = lat; longitude = lon; }
  }

  return {
    distance_cm,
    distance_m,
    rainfall,   // boolean: true = rain detected
    warning,
    critical,
    gps_status:  gpsMatch  ? gpsMatch[1]  : 'UNKNOWN',
    wifi_status: wifiMatch ? wifiMatch[1] : 'UNKNOWN',
    latitude,
    longitude,
    raw:       line,
    timestamp: new Date().toISOString(),
    _t:        performance.now(), // latency measurement: parse complete
  };
}

// ── background POST queue ─────────────────────────────────────────────────────
// Completely decoupled from the read loop.
// Uses a single-entry queue: if a POST is in-flight, the latest reading
// overwrites the pending slot (we only need the freshest data in the DB).

function makePostQueue({ apiBaseRef, deviceKeyRef, sensorIdRef }) {
  let inFlight   = false;
  let pending    = null;    // latest reading waiting to be sent
  let lastSentAt = 0;
  const MIN_INTERVAL_MS = 2000; // at most 1 POST per 2 s

  async function flush() {
    if (inFlight || !pending) return;
    const reading = pending;
    pending    = null;
    inFlight   = true;
    lastSentAt = Date.now();

    const payload = {
      sensor_id:   sensorIdRef.current,
      water_level: reading.distance_m,
      rainfall:    reading.rainfall ? 1.0 : 0.0,
    };
    if (reading.latitude  != null) payload.latitude  = reading.latitude;
    if (reading.longitude != null) payload.longitude = reading.longitude;

    try {
      await fetch(`${apiBaseRef.current}/sensors/data`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Key': deviceKeyRef.current },
        body:    JSON.stringify(payload),
      });
    } catch { /* network error — silent */ }
    finally {
      inFlight = false;
      // If another reading arrived while in-flight, send it now
      if (pending) setTimeout(flush, 0);
    }
  }

  return function enqueue(reading) {
    const now = Date.now();
    if (now - lastSentAt < MIN_INTERVAL_MS) return; // rate-limit
    pending = reading;
    // Schedule on next microtask so we never block the read loop
    setTimeout(flush, 0);
  };
}

// ── hook ──────────────────────────────────────────────────────────────────────

export default function useWebSerial({
  onReading,
  deviceKey,
  sensorId,
  apiBase,
  baudRate = 115200,
}) {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [connected,  setConnected]  = useState(false);
  const [portName,   setPortName]   = useState(null);
  const [error,      setError]      = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [lastReadAt, setLastReadAt] = useState(null);

  // All mutable state used inside the async read loop lives in refs.
  const portRef       = useRef(null);
  const abortRef      = useRef(false);
  const lineBufferRef = useRef('');

  // onReading ref: always current, no loop restart needed
  const onReadingRef = useRef(onReading);
  useEffect(() => { onReadingRef.current = onReading; }, [onReading]);

  // Backend config refs
  const apiBaseRef   = useRef(apiBase);
  const deviceKeyRef = useRef(deviceKey);
  const sensorIdRef  = useRef(sensorId);
  useEffect(() => { apiBaseRef.current   = apiBase;   }, [apiBase]);
  useEffect(() => { deviceKeyRef.current = deviceKey; }, [deviceKey]);
  useEffect(() => { sensorIdRef.current  = sensorId;  }, [sensorId]);

  // POST queue — created once, stable ref
  const postQueueRef = useRef(null);
  if (!postQueueRef.current) {
    postQueueRef.current = makePostQueue({ apiBaseRef, deviceKeyRef, sensorIdRef });
  }

  // Abort on unmount
  useEffect(() => () => { abortRef.current = true; }, []);

  // ── disconnect ───────────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    abortRef.current = true;
    try { await portRef.current?.close(); } catch { /* ignore */ }
    portRef.current       = null;
    lineBufferRef.current = '';
    setConnected(false);
    setPortName(null);
  }, []);

  // ── read loop ─────────────────────────────────────────────────────────────────
  // Plain async function — not a hook, not in useCallback deps.
  // All state access is via refs; React state is only SET here (no reads).
  async function runReadLoop(port) {
    const decoder     = new TextDecoderStream();
    const pipePromise = port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader      = decoder.readable.getReader();

    try {
      while (!abortRef.current) {
        let result;
        try { result = await reader.read(); } catch { break; }
        if (result.done || abortRef.current) break;

        const chunk = result.value;
        if (!chunk) continue;

        // ── line splitting: handles partial chunks and \r\n ──────────────────
        lineBufferRef.current += chunk;
        const lines = lineBufferRef.current.split('\n');
        lineBufferRef.current = lines.pop() ?? ''; // keep incomplete tail

        for (const rawLine of lines) {
          const reading = parseSerialLine(rawLine);
          if (!reading) continue;

          // ── IMMEDIATE UI update — no await, no debounce ───────────────────
          // React 18 batches these two setState calls into one render.
          onReadingRef.current(reading);    // → setReading in SerialContext
          setLastReadAt(reading.timestamp); // → updates lastReadAt only

          // ── backend POST — fully decoupled, never blocks here ─────────────
          postQueueRef.current(reading);
        }
      }
    } finally {
      try { reader.cancel();      } catch { /* ignore */ }
      try { reader.releaseLock(); } catch { /* ignore */ }
      await pipePromise;
    }
  }

  // ── connect ───────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!supported || connected || connecting) {
      if (!supported) setError('Web Serial API not supported. Use Chrome 89+ on localhost.');
      return;
    }
    setConnecting(true);
    setError(null);

    try {
      const port = await navigator.serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate });

      const info = port.getInfo?.() ?? {};
      const name = info.usbVendorId
        ? `USB ${info.usbVendorId.toString(16).toUpperCase()}:${(info.usbProductId ?? 0).toString(16).toUpperCase()}`
        : 'Serial Port';

      abortRef.current      = false;
      lineBufferRef.current = '';

      setPortName(name);
      setConnected(true);
      setConnecting(false);

      // Fire-and-forget; .then() resets connected state when loop exits
      runReadLoop(port).then(() => {
        setConnected(false);
        setPortName(null);
      });
    } catch (err) {
      setConnecting(false);
      portRef.current = null;
      setError(err.name === 'NotFoundError' ? null : `Cannot open port: ${err.message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, connected, connecting, baudRate]);

  // Stable return object — only recreated when a value actually changes.
  // This prevents SerialControlContext consumers from re-rendering on every reading.
  return useMemo(() => ({
    supported,
    connected,
    connecting,
    portName,
    error,
    lastReadAt,
    connect,
    disconnect,
  }), [supported, connected, connecting, portName, error, lastReadAt, connect, disconnect]);
}
