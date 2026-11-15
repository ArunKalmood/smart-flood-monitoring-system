/**
 * SerialContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Split into TWO contexts to minimise re-renders:
 *
 *   SerialReadingContext  — changes every ~200 ms (new sensor reading)
 *   SerialControlContext  — changes only on connect/disconnect/error
 *
 * This means:
 *  - ArduinoLivePanel (reads both) re-renders on every reading → correct.
 *  - Dashboard.js StatCards (reads both for override) re-renders on every
 *    reading → acceptable, but we isolate them in SerialLiveCards so the
 *    chart/stats body of Dashboard does NOT re-render on serial data.
 *  - Any component that only needs serial.connected (e.g. button state)
 *    re-renders only on connect/disconnect, not 5×/sec.
 *
 * Usage (unchanged public API):
 *   const { reading, serial } = useSerial();
 *
 * Also exports:
 *   useSerialReading()  — only the reading (re-renders 5×/sec when connected)
 *   useSerialControl()  — only the serial object (stable between readings)
 */
import React, {
  createContext, useContext, useState, useCallback, useRef, memo,
} from 'react';
import useWebSerial from '../hooks/useWebSerial';

const DEVICE_KEY = 'XYnEJ_xPht1ogPphEwrIKu1O3c23q7OOa5NSlHmUEec';
const SENSOR_ID  = 'ARDUINO-001';
const API_BASE   = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const BAUD_RATE  = 115200;

// ── two separate contexts ─────────────────────────────────────────────────────

const SerialReadingContext = createContext(null);  // { reading }
const SerialControlContext = createContext(null);  // { serial }

// ── inner provider that holds the reading state ───────────────────────────────
// Wrapped in memo so its children only re-render when reading changes.
// SerialControlProvider (outer) passes onReading down via a stable ref.

const SerialReadingProvider = memo(function SerialReadingProvider({ onReadingRef, children }) {
  const [reading, setReading] = useState(null);

  // Store setReading in the shared ref so the read loop can call it
  // without this component being in the callstack (no extra render from hook).
  onReadingRef.current = useCallback((parsed) => {
    // Perf marker: when does React state actually get the value?
    if (process.env.NODE_ENV === 'development') {
      console.debug(
        `[Serial] parse→setState Δ ${(performance.now() - parsed._t).toFixed(1)} ms | ` +
        `dist=${parsed.distance_cm} cm rain=${parsed.rainfall} warn=${parsed.warning}`,
      );
    }
    setReading(parsed);
  }, []);

  return (
    <SerialReadingContext.Provider value={reading}>
      {children}
    </SerialReadingContext.Provider>
  );
});

// ── outer provider that holds the serial control state ────────────────────────

export function SerialProvider({ children }) {
  // Shared ref: SerialReadingProvider writes its setReading wrapper here;
  // useWebSerial's onReading calls it without depending on the component tree.
  const onReadingRef = useRef(() => {});

  // Stable onReading passed to useWebSerial — calls whatever is in the ref.
  const onReading = useCallback((parsed) => {
    onReadingRef.current(parsed);
  }, []);

  const serial = useWebSerial({
    onReading,
    deviceKey: DEVICE_KEY,
    sensorId:  SENSOR_ID,
    apiBase:   API_BASE,
    baudRate:  BAUD_RATE,
  });

  return (
    <SerialControlContext.Provider value={serial}>
      <SerialReadingProvider onReadingRef={onReadingRef}>
        {children}
      </SerialReadingProvider>
    </SerialControlContext.Provider>
  );
}

// ── focused hooks ─────────────────────────────────────────────────────────────

/** Returns only the latest reading. Re-renders every ~200 ms when connected. */
export function useSerialReading() {
  const ctx = useContext(SerialReadingContext);
  if (ctx === null && ctx === undefined) return null;
  return ctx;
}

/** Returns only the serial control object. Stable between readings. */
export function useSerialControl() {
  const ctx = useContext(SerialControlContext);
  if (!ctx) throw new Error('useSerialControl must be used inside <SerialProvider>');
  return ctx;
}

/**
 * Combined hook — same API as before.
 * Components using this re-render on every reading.
 * Prefer useSerialReading() + useSerialControl() separately for heavy components.
 */
export function useSerial() {
  const reading = useContext(SerialReadingContext);
  const serial  = useContext(SerialControlContext);
  if (!serial) throw new Error('useSerial must be used inside <SerialProvider>');
  return { reading, serial };
}
