"""
Arduino Serial Bridge for FloodMonitor
=======================================
Reads Arduino serial output, parses each line, and POSTs readings to the
FloodMonitor API endpoint  POST /api/sensors/data  with the device key.

QUICK START
-----------
1. Register the sensor (one time):
       cd backend
       python scripts/setup_arduino_sensor.py
   Copy the printed device key.

2. Edit the CONFIG section below:
       SERIAL_PORT  – e.g. "COM3" on Windows, "/dev/ttyUSB0" on Linux
       DEVICE_KEY   – paste the key from step 1
       SENSOR_ID    – must match what you used in setup_arduino_sensor.py

3. Run (from project root or backend/):
       python serial_bridge.py

Arduino output format expected (one line per reading):
    Distance: 193.50 cm | Rain: NO | Warning: NO | Critical: NO | GPS: WAITING | WiFi: DISCONNECTED
    Distance: INVALID / NO READING | Rain: NO | ...

The bridge also handles bare numeric lines like:
    193.50
"""

import re
import sys
import time
import requests

# ─────────────────────────────────────────────────────────────
#  CONFIG  –  edit these three values
# ─────────────────────────────────────────────────────────────
SERIAL_PORT  = "COM7"          # Windows: "COM3", "COM4" … | Linux: "/dev/ttyUSB0"
BAUD_RATE    = 115200             # Must match Arduino Serial.begin(BAUD)
DEVICE_KEY   = "XYnEJ_xPht1ogPphEwrIKu1O3c23q7OOa5NSlHmUEec"
SENSOR_ID    = "ARDUINO-001"   # Must match what you registered

API_URL      = "http://localhost:8000/api/sensors/data"
POST_INTERVAL_SECONDS = 2      # Minimum seconds between posts (rate-limit guard)
# ─────────────────────────────────────────────────────────────

# Regex patterns for the Arduino output
# [\d.]+ is intentionally NOT used for bare-number matching — see _BARE_NUM_RE below.
_DISTANCE_RE  = re.compile(r"Distance:\s*(\d+(?:\.\d+)?)\s*cm",   re.IGNORECASE)
_RAIN_RE      = re.compile(r"Rain:\s*(YES|NO)",                    re.IGNORECASE)
_WARNING_RE   = re.compile(r"Warning:\s*(YES|NO)",                 re.IGNORECASE)
_CRITICAL_RE  = re.compile(r"Critical:\s*(YES|NO)",                re.IGNORECASE)
_GPS_LAT_RE   = re.compile(r"Lat:\s*(-?\d+(?:\.\d+)?)",           re.IGNORECASE)
_GPS_LON_RE   = re.compile(r"Lon:\s*(-?\d+(?:\.\d+)?)",           re.IGNORECASE)
# Bare number: requires at least one digit before the optional decimal point.
# This rejects ".....", "---", lone ".", and other non-numeric garbage.
_BARE_NUM_RE  = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*$")

# ESP32 / Arduino boot & progress lines to silently discard.
# This list covers: WiFi dots, ROM boot log, IDF log prefixes, reset-reason
# lines, and any line that is pure punctuation / non-ASCII garbage.
_SKIP_PREFIXES = (
    "retrying", "wifi:", "e (", "i (", "w (", "ets ", "rst:", "boot:",
    "configsip:", "clk_drv:", "load:", "entry ", "�", "\xff", "\x00",
)
_SKIP_SUBSTRINGS = ("wifi:sta", "connecting", "sdk ver", "compile time")


def _safe_float(s: str) -> float | None:
    """Convert *s* to float; return None instead of raising on bad input."""
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_line(line: str) -> dict | None:
    """
    Parse one Arduino serial line into a dict suitable for SensorDataCreate.
    Returns None for any line that carries no valid numeric sensor reading.
    Never raises — all conversions are guarded.
    """
    line = line.strip()
    if not line:
        return None

    lower = line.lower()

    # ── Discard ESP32 boot/WiFi/progress noise ───────────────────
    # 1. Lines that are only dots, dashes, or other non-alphanumeric chars
    if re.fullmatch(r"[^a-zA-Z0-9]+", line):
        print(f"  [SKIP-noise ] {line!r}")
        return None

    # 2. Known boot/status prefixes and substrings
    if any(lower.startswith(p) for p in _SKIP_PREFIXES):
        print(f"  [SKIP-boot  ] {line!r}")
        return None
    if any(s in lower for s in _SKIP_SUBSTRINGS):
        print(f"  [SKIP-status] {line!r}")
        return None

    # 3. Lines flagged as invalid by the firmware itself
    if "invalid" in lower or "no reading" in lower:
        print(f"  [SKIP-invalid] {line!r}")
        return None

    reading = {}

    # ── Water level (distance in cm → metres for the API) ───────
    dist_match = _DISTANCE_RE.search(line)
    if dist_match:
        cm = _safe_float(dist_match.group(1))
        if cm is None or cm < 0 or cm > 99999:
            print(f"  [SKIP-range ] distance out of range: {dist_match.group(1)!r}")
            return None
        reading["water_level"] = round(cm / 100.0, 4)   # API uses metres

    # ── Bare numeric line (e.g. firmware sending just "193.50") ──
    if "water_level" not in reading:
        bare = _BARE_NUM_RE.match(line)
        if bare:
            cm = _safe_float(bare.group(1))
            if cm is not None and 0 <= cm <= 99999:
                reading["water_level"] = round(cm / 100.0, 4)
            else:
                print(f"  [SKIP-range ] bare number out of range: {bare.group(1)!r}")
                return None

    # ── Rainfall flag ────────────────────────────────────────────
    rain_match = _RAIN_RE.search(line)
    if rain_match:
        reading["rainfall"] = 1.0 if rain_match.group(1).upper() == "YES" else 0.0

    # ── GPS coordinates ──────────────────────────────────────────
    lat_m = _GPS_LAT_RE.search(line)
    lon_m = _GPS_LON_RE.search(line)
    if lat_m and lon_m:
        lat = _safe_float(lat_m.group(1))
        lon = _safe_float(lon_m.group(1))
        if lat is not None and lon is not None:
            reading["latitude"]  = lat
            reading["longitude"] = lon

    if not reading:
        print(f"  [SKIP-nodata] {line!r}")
        return None

    reading["sensor_id"] = SENSOR_ID
    return reading


def post_reading(payload: dict) -> bool:
    """POST one reading to the API. Returns True on success."""
    try:
        resp = requests.post(
            API_URL,
            json=payload,
            headers={"X-Device-Key": DEVICE_KEY},
            timeout=5,
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"  [OK] Posted → water_level={payload.get('water_level')} m"
                  f"  risk={data.get('risk_level', '?')}")
            return True
        else:
            print(f"  [WARN] API returned {resp.status_code}: {resp.text[:120]}")
            return False
    except requests.exceptions.ConnectionError:
        print("  [ERROR] Cannot reach API at", API_URL, "– is the backend running?")
        return False
    except Exception as exc:
        print(f"  [ERROR] {exc}")
        return False


def run_bridge():
    try:
        import serial
    except ImportError:
        print("[ERROR] pyserial not installed. Run:  pip install pyserial")
        sys.exit(1)

    if DEVICE_KEY == "PASTE_YOUR_DEVICE_KEY_HERE":
        print("[ERROR] DEVICE_KEY is not set.")
        print("        Run:  cd backend && python scripts/setup_arduino_sensor.py")
        print("        Then paste the printed key into DEVICE_KEY in this file.")
        sys.exit(1)

    print(f"[*] Opening serial port {SERIAL_PORT} at {BAUD_RATE} baud ...")
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
    except serial.SerialException as exc:
        print(f"[ERROR] Cannot open {SERIAL_PORT}: {exc}")
        print()
        print("  Available ports:")
        from serial.tools import list_ports
        for p in list_ports.comports():
            print(f"    {p.device}  –  {p.description}")
        sys.exit(1)

    print(f"[*] Connected to {SERIAL_PORT}. Sending readings to {API_URL}")
    print(f"[*] Sensor: {SENSOR_ID}  |  Press Ctrl+C to stop.\n")

    last_post = 0.0
    try:
        while True:
            raw = ser.readline()
            if not raw:
                continue
            try:
                line = raw.decode("utf-8", errors="replace")
            except Exception:
                continue

            print(f"  [SERIAL] {line.rstrip()}")

            payload = parse_line(line)
            if payload is None:
                continue

            now = time.time()
            if now - last_post < POST_INTERVAL_SECONDS:
                continue   # rate-limit: skip until interval elapses

            if post_reading(payload):
                last_post = now

    except KeyboardInterrupt:
        print("\n[*] Stopped by user.")
    finally:
        ser.close()


if __name__ == "__main__":
    run_bridge()
