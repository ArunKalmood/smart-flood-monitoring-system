"""
Stage 3 v2 Real-World Beaker Run Recorder.

Records real sensor runs (ultrasonic distance, rain ADC, rain digital, ruler ground truth)
to ml/data/real_runs/<name>.csv with columns:
  t_s, dist_cm, rain_adc, rain_digital, true_water_level_cm

Key Features:
  1. Serial Mode (Primary):
     - --serial <port> (e.g. /dev/ttyUSB0, /dev/ttyACM0) with --baud <baud> (default 115200).
     - --list-ports to enumerate available serial devices.
     - Parses key=value, CSV, and JSON formats robustly.
     - Prints first 5 raw lines at startup for format verification.
     - Clear diagnostic messages on missing ports or permission denied (dialout/uucp).
     - --dry-parse [N]: reads N lines without writing CSV.
  2. API Mode (with Freshness Guard):
     - --url <url> (e.g. http://localhost:8000/api/public/summary).
     - Freshness guard: rejects or flags data as -1 if sensors.online == 0 or
       recorded_at is older than --max-age-s (default 30s).
  3. Fixed Schedule Sampling:
     - 5.0 s fixed monotonic schedule (t_s = 0, 5, 10, ...) without time drift.
     - Unparseable or missing readings recorded as dist_cm = -1.0.
  4. Typical Dry Rain Fallback:
     - Looked up from synthetic_flood_dataset.csv: rain_adc = 4095.0, rain_digital = 'HIGH'.
  5. Interactive Ruler Ground Truth:
     - Initial prompt at startup.
     - Periodic prompt every 30s.
     - Allows entering updated water levels anytime (e.g. typing a number or 'w <val>').
  6. Pre-Save Quality Validation:
     - Rejects run if > 20% of rows are -1.0.
     - Rejects run if dist_cm has zero variance over a run longer than 1 minute (> 60s).
     - Never overwrites existing files without --force.
"""
import argparse
import csv
from datetime import datetime, timezone
import glob
import grp
import json
import os
import re
import select
import signal
import sys
import threading
import time
from typing import List, Optional, Tuple

import numpy as np

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

try:
    import requests
except ImportError:
    requests = None

# Key aliases for parsing payloads (customizable to board firmware)
DIST_KEYS = ("dist_cm", "distance_cm", "distance")
RAIN_ADC_KEYS = ("rain_adc",)
RAIN_DIG_KEYS = ("rain_digital", "rain_dig")

# Physical range bounds for ultrasonic distance (cm)
MIN_VALID_DIST_CM = 0.0
MAX_VALID_DIST_CM = 400.0

# Reference typical dry values looked up from synthetic_flood_dataset.csv (no rain, no faults)
# Under clean dry conditions: rain_adc mode = 4095 (12-bit pullup), rain_digital = "HIGH" (active-low pullup)
TYPICAL_DRY_RAIN_ADC = 4095.0
TYPICAL_DRY_RAIN_DIGITAL = "HIGH"

EMPTY_BEAKER_SENSOR_DIST_CM = 12.3

_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_REAL_RUNS_DIR = os.path.join(_HERE, "data", "real_runs")


def list_available_ports() -> List[str]:
    """Finds and lists all available /dev/ttyUSB* and /dev/ttyACM* ports."""
    ports = sorted(list(set(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))))
    if serial is not None:
        try:
            detected = [p.device for p in serial.tools.list_ports.comports()]
            for d in detected:
                if d not in ports and ("ttyUSB" in d or "ttyACM" in d):
                    ports.append(d)
        except Exception:
            pass
    return sorted(ports)


def print_ports_report():
    """Prints a user-friendly listing of serial ports."""
    ports = list_available_ports()
    print("\n" + "=" * 60)
    print("AVAILABLE SERIAL PORTS (/dev/ttyUSB*, /dev/ttyACM*):")
    print("=" * 60)
    if not ports:
        print("  No matching serial ports found.")
        print("  -> Ensure your board is plugged into a USB port.")
        print("  -> Check 'dmesg' or 'lsusb' to verify physical hardware connection.")
    else:
        for p in ports:
            print(f"  - {p}")
    print("=" * 60 + "\n")


def parse_sensor_payload(
    raw_line: str,
    log_unparseable: bool = True,
    allow_water_level_derivation: bool = False,
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Parses a string line from serial or API payload into (dist_cm, rain_adc, rain_digital).
    Robustly supports:
      - JSON: {"dist_cm": 10.2, "rain_adc": 4095, "rain_digital": "HIGH"}
      - key=value or key: value: dist_cm=10.2 rain_adc=4095 rain_digital=HIGH
      - CSV: 10.2, 4095, HIGH or 10.2, 4095 (strictly 2 or 3 valid fields)
    """
    if not raw_line or not raw_line.strip():
        return None, None, None

    cleaned = raw_line.strip()
    dist_cm: Optional[float] = None
    rain_adc: Optional[float] = None
    rain_digital: Optional[str] = None

    # 1. JSON Format
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            data = json.loads(cleaned)
            if isinstance(data.get("latest_reading"), dict):
                for k, v in data["latest_reading"].items():
                    data.setdefault(k, v)
            if isinstance(data.get("readings"), dict):
                for k, v in data["readings"].items():
                    data.setdefault(k, v)

            # Distance
            for k in DIST_KEYS:
                if k in data and data[k] is not None:
                    try:
                        dist_cm = float(data[k])
                        break
                    except (ValueError, TypeError):
                        pass

            # water_level derivation (restricted to API mode only)
            if dist_cm is None and "water_level" in data and data["water_level"] is not None:
                if allow_water_level_derivation:
                    try:
                        wl = float(data["water_level"])
                        print("  [WARNING: Derived dist_cm from water_level (12.3 - water_level). Derived API data, not a real sensor reading!]")
                        dist_cm = float(EMPTY_BEAKER_SENSOR_DIST_CM - wl)
                    except (ValueError, TypeError):
                        pass

            # Rain ADC (strictly RAIN_ADC_KEYS; rainfall in mm is excluded)
            for k in RAIN_ADC_KEYS:
                if k in data and data[k] is not None:
                    try:
                        rain_adc = float(data[k])
                        break
                    except (ValueError, TypeError):
                        pass

            # Rain Digital (strictly RAIN_DIG_KEYS)
            for k in RAIN_DIG_KEYS:
                if k in data and data[k] is not None:
                    val = str(data[k]).upper()
                    if val in ["HIGH", "1", "TRUE"]:
                        rain_digital = "HIGH"
                        break
                    elif val in ["LOW", "0", "FALSE"]:
                        rain_digital = "LOW"
                        break

            # Range validation on distance
            if dist_cm is not None:
                if dist_cm < MIN_VALID_DIST_CM or dist_cm > MAX_VALID_DIST_CM:
                    if log_unparseable:
                        print(f"  [WARNING: dist_cm={dist_cm} out of valid range (0 to 400 cm): {raw_line!r}]")
                    dist_cm = None

            if dist_cm is not None or rain_adc is not None or rain_digital is not None:
                return dist_cm, rain_adc, rain_digital
        except Exception:
            pass

    # 2. Key=Value or Key: Value Format (e.g. dist_cm=10.5 rain_adc=4000 rain_digital=HIGH)
    kv_matches = re.findall(r"([a-zA-Z_]+)\s*[:=]\s*([^\s,;]+)", cleaned)
    if kv_matches:
        kv = {k.lower(): v for k, v in kv_matches}
        for k in DIST_KEYS:
            if k in kv:
                try:
                    m = re.match(r"^[-+]?[0-9]*\.?[0-9]+$", kv[k])
                    if m:
                        dist_cm = float(m.group(0))
                        break
                except Exception:
                    pass

        if dist_cm is None and "water_level" in kv:
            if allow_water_level_derivation:
                try:
                    m = re.match(r"^[-+]?[0-9]*\.?[0-9]+$", kv["water_level"])
                    if m:
                        wl = float(m.group(0))
                        print("  [WARNING: Derived dist_cm from water_level (12.3 - water_level). Derived API data, not a real sensor reading!]")
                        dist_cm = float(EMPTY_BEAKER_SENSOR_DIST_CM - wl)
                except Exception:
                    pass

        for k in RAIN_ADC_KEYS:
            if k in kv:
                try:
                    m = re.match(r"^[-+]?[0-9]*\.?[0-9]+$", kv[k])
                    if m:
                        rain_adc = float(m.group(0))
                        break
                except Exception:
                    pass

        for k in RAIN_DIG_KEYS:
            if k in kv:
                v = kv[k].upper()
                if v in ["HIGH", "1", "TRUE"]:
                    rain_digital = "HIGH"
                    break
                elif v in ["LOW", "0", "FALSE"]:
                    rain_digital = "LOW"
                    break

        if dist_cm is not None:
            if dist_cm < MIN_VALID_DIST_CM or dist_cm > MAX_VALID_DIST_CM:
                if log_unparseable:
                    print(f"  [WARNING: dist_cm={dist_cm} out of valid range (0 to 400 cm): {raw_line!r}]")
                dist_cm = None

        if dist_cm is not None or rain_adc is not None or rain_digital is not None:
            return dist_cm, rain_adc, rain_digital

    # 3. CSV Format (comma, tab, or semicolon separated)
    # Strictly accept only if line has 2 or 3 fields and all fields are valid
    tokens = [t.strip() for t in re.split(r"[,;\t]+", cleaned) if t.strip()]
    if len(tokens) in (2, 3):
        try:
            d_val = float(tokens[0])
            r_val = float(tokens[1])
            dig_val = None
            valid_csv = True

            if len(tokens) == 3:
                v = tokens[2].upper()
                if v in ["HIGH", "1", "TRUE"]:
                    dig_val = "HIGH"
                elif v in ["LOW", "0", "FALSE"]:
                    dig_val = "LOW"
                else:
                    valid_csv = False

            if valid_csv:
                if d_val < MIN_VALID_DIST_CM or d_val > MAX_VALID_DIST_CM:
                    if log_unparseable:
                        print(f"  [WARNING: dist_cm={d_val} out of valid range (0 to 400 cm): {raw_line!r}]")
                    return None, None, None
                return d_val, r_val, dig_val
        except ValueError:
            pass

    if log_unparseable:
        print(f"  [WARNING: Unparseable sensor line: {raw_line!r}]")
    return None, None, None


def check_api_freshness(data: dict, max_age_s: float = 30.0) -> Tuple[bool, str]:
    """
    Validates API payload freshness:
      1. sensors.online must be > 0.
      2. recorded_at timestamp must not be older than max_age_s relative to UTC now.
    """
    # Check sensor online count
    sensors_info = data.get("sensors", {})
    if isinstance(sensors_info, dict) and sensors_info.get("online", 1) == 0:
        return False, "sensors.online is 0 (all sensors reported offline)"

    # Check timestamp freshness
    rec_at_str = None
    if "latest_reading" in data and isinstance(data["latest_reading"], dict):
        rec_at_str = data["latest_reading"].get("recorded_at")
    elif "recorded_at" in data:
        rec_at_str = data.get("recorded_at")

    if rec_at_str:
        try:
            # Parse ISO 8601 with or without timezone
            rec_dt = datetime.fromisoformat(rec_at_str.replace("Z", "+00:00"))
            if rec_dt.tzinfo is None:
                rec_dt = rec_dt.replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            age_s = (now_dt - rec_dt).total_seconds()
            if age_s > max_age_s:
                return False, f"recorded_at is {age_s:.1f}s old (exceeds {max_age_s:.1f}s threshold)"
        except Exception as e:
            return False, f"Invalid recorded_at timestamp '{rec_at_str}': {e}"

    return True, "Fresh"


def validate_run(rows: List[dict], min_variance_duration_s: float = 60.0) -> Tuple[bool, str]:
    """
    Pre-save validation:
      1. Rejects if more than 20% of rows are dist_cm == -1.0.
      2. Rejects if dist_cm has zero variance over a run longer than 1 minute (> 60s).
    """
    if not rows:
        return False, "Run rejected: No data rows were recorded."

    n_total = len(rows)
    missing_count = sum(1 for r in rows if float(r["dist_cm"]) == -1.0)
    missing_pct = missing_count / n_total

    if missing_pct > 0.20:
        return False, (
            f"Run rejected: {missing_pct * 100:.1f}% of rows ({missing_count}/{n_total}) "
            f"have dist_cm = -1.0 (exceeds the 20.0% allowable threshold). "
            f"Check sensor wiring and port connection."
        )

    duration_s = float(rows[-1]["t_s"]) - float(rows[0]["t_s"])
    if duration_s > min_variance_duration_s:
        valid_dists = [float(r["dist_cm"]) for r in rows if float(r["dist_cm"]) != -1.0]
        if len(valid_dists) > 1:
            var = float(np.var(valid_dists))
            if var == 0.0 or len(set(valid_dists)) <= 1:
                return False, (
                    f"Run rejected: dist_cm has zero variance (constant at {valid_dists[0]:.2f} cm) "
                    f"over {duration_s:.1f} s duration (> 60 s threshold). "
                    f"Sensor appears frozen, disconnected, or reading static seeded data."
                )

    return True, "Validation passed."


class WaterLevelTerminalListener:
    """
    Manages non-blocking terminal input for true_water_level_cm.
    Allows entering values anytime (e.g. typing a number or 'w <val>') with timestamped updates.
    """

    def __init__(self, initial_value: float = 0.0):
        self.current_value = float(initial_value)
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.start_monotonic = time.monotonic()
        self.thread = threading.Thread(target=self._input_loop, daemon=True)

    def start(self):
        self.start_monotonic = time.monotonic()
        self.thread.start()

    def stop(self):
        self.stop_event.set()

    def get_value(self) -> float:
        with self.lock:
            return self.current_value

    def set_value(self, val: float):
        with self.lock:
            self.current_value = val

    def print_prompt(self, t_s: float):
        """Prints the periodic 30 s prompt."""
        with self.lock:
            curr = self.current_value
        sys.stdout.write(
            f"\n[t={t_s:.0f}s] Enter water height in cm (ruler) or press Enter to keep last value ({curr:.2f} cm): "
        )
        sys.stdout.flush()

    def _input_loop(self):
        """Background thread reading user inputs from stdin."""
        while not self.stop_event.is_set():
            try:
                if sys.platform != "win32":
                    rlist, _, _ = select.select([sys.stdin], [], [], 0.5)
                    if not rlist:
                        continue
                line = sys.stdin.readline()
                if not line:
                    break
                raw = line.strip()
                t_event = time.monotonic() - self.start_monotonic

                if raw == "":
                    with self.lock:
                        curr = self.current_value
                    print(f"  [t={t_event:.1f}s] -> Kept ruler water level: {curr:.2f} cm")
                else:
                    # Support 'w 4.5' or 'w4.5' or direct number '4.5'
                    m = re.search(r"[-+]?[0-9]*\.?[0-9]+", raw)
                    if m:
                        val = float(m.group(0))
                        with self.lock:
                            self.current_value = val
                        print(f"  [t={t_event:.1f}s] -> Ruler updated to: {val:.2f} cm (ground truth)")
                    else:
                        print(f"  [t={t_event:.1f}s] -> Could not parse number from '{raw}'. Keeping {self.get_value():.2f} cm")
            except Exception:
                break


class SensorReader:
    """Reads sensor measurements from Serial or HTTP API."""

    def __init__(
        self,
        source_type: str,
        serial_port: Optional[str] = None,
        baud: int = 115200,
        url: Optional[str] = None,
        max_age_s: float = 30.0,
    ):
        self.source_type = source_type
        self.serial_port = serial_port
        self.baud = baud
        self.url = url
        self.max_age_s = max_age_s
        self.ser = None

        if self.source_type == "serial":
            if serial is None:
                raise ImportError(
                    "pyserial is not installed in the virtual environment.\n"
                    "Install it using: ./venv/bin/pip install pyserial"
                )
            if not self.serial_port:
                raise ValueError("Serial port must be specified via --serial <port> (e.g. /dev/ttyUSB0, /dev/ttyACM0).")

            if not os.path.exists(self.serial_port):
                avail = list_available_ports()
                avail_str = f"Available ports: {avail}" if avail else "No /dev/ttyUSB* or /dev/ttyACM* ports detected."
                raise FileNotFoundError(
                    f"Serial port '{self.serial_port}' does not exist.\n"
                    f"{avail_str}\n"
                    f"Please plug in your microcontroller board."
                )

            try:
                print(f"Connecting to serial port {self.serial_port} at {self.baud} baud...")
                self.ser = serial.Serial(self.serial_port, self.baud, timeout=1.0)
                self.ser.reset_input_buffer()
                print("Serial connection established successfully.")
            except Exception as e:
                err_str = str(e)
                if isinstance(e, PermissionError) or "Permission" in err_str or "Errno 13" in err_str:
                    group_name = "dialout"
                    try:
                        stat_info = os.stat(self.serial_port)
                        group_name = grp.getgrgid(stat_info.st_gid).gr_name
                    except Exception:
                        pass
                    raise PermissionError(
                        f"Permission denied accessing serial port '{self.serial_port}'.\n"
                        f"Add yourself to group '{group_name}': sudo usermod -aG {group_name} $USER, then log out and back in."
                    )
                raise e

        elif self.source_type == "api":
            if not self.url:
                raise ValueError("API URL must be specified via --url <url>.")
            print(f"Configured API endpoint: {self.url} (freshness threshold: {self.max_age_s}s)")

    def read_raw_line(self, timeout_s: float = 2.0, flush_first: bool = False) -> str:
        """Reads a single raw string line from the serial port."""
        if self.ser is None:
            return ""
        if flush_first:
            try:
                self.ser.reset_input_buffer()
            except Exception:
                pass
        t_start = time.monotonic()
        while time.monotonic() - t_start < timeout_s:
            if self.ser.in_waiting:
                line = self.ser.readline().decode("utf-8", errors="ignore").strip()
                if line:
                    return line
            time.sleep(0.02)
        return ""

    def read_latest(self, timeout_s: float = 2.0) -> Tuple[float, float, str]:
        """
        Reads one sample within timeout_s.
        Returns (dist_cm, rain_adc, rain_digital).
        If reading fails, times out, or fails freshness guard, dist_cm is returned as -1.0.
        """
        dist_cm: Optional[float] = None
        rain_adc: Optional[float] = None
        rain_digital: Optional[str] = None

        if self.source_type == "serial":
            # Call reset_input_buffer() before each sample to avoid lagging behind stale queued lines
            line = self.read_raw_line(timeout_s=timeout_s, flush_first=True)
            if line:
                dist_cm, rain_adc, rain_digital = parse_sensor_payload(
                    line, log_unparseable=True, allow_water_level_derivation=False
                )
            else:
                print("  [WARNING: Serial read timed out (no data received on port)]")

        elif self.source_type == "api":
            try:
                body_text = None
                if requests is not None:
                    resp = requests.get(self.url, timeout=timeout_s)
                    if resp.status_code == 200:
                        body_text = resp.text
                else:
                    import urllib.request
                    with urllib.request.urlopen(self.url, timeout=timeout_s) as response:
                        body_text = response.read().decode("utf-8")

                if body_text:
                    try:
                        data = json.loads(body_text)
                        is_fresh, freshness_msg = check_api_freshness(data, max_age_s=self.max_age_s)
                        if not is_fresh:
                            print(f"  [WARNING: Freshness Guard Triggered: {freshness_msg}]")
                            dist_cm = None
                        else:
                            dist_cm, rain_adc, rain_digital = parse_sensor_payload(
                                body_text, log_unparseable=True, allow_water_level_derivation=True
                            )
                    except json.JSONDecodeError:
                        dist_cm, rain_adc, rain_digital = parse_sensor_payload(
                            body_text, log_unparseable=True, allow_water_level_derivation=True
                        )
            except Exception as e:
                print(f"  [WARNING: API request error: {e}]")

        # Missing or invalid readings set to -1.0
        final_dist = dist_cm if dist_cm is not None else -1.0

        # Dry rain fallback if missing from sensor
        final_rain_adc = rain_adc if rain_adc is not None else TYPICAL_DRY_RAIN_ADC
        final_rain_digital = rain_digital if rain_digital is not None else TYPICAL_DRY_RAIN_DIGITAL

        return final_dist, final_rain_adc, final_rain_digital

    def close(self):
        if self.ser is not None and self.ser.is_open:
            self.ser.close()


def run_dry_parse(reader: SensorReader, n_lines: int = 10):
    """Dry-parse mode: reads N lines and prints parsed values without saving CSV."""
    print("\n" + "=" * 70)
    print(f"DRY-PARSE MODE: Reading {n_lines} lines (no CSV will be written)")
    print("=" * 70)
    count = 0
    while count < n_lines:
        dist_cm, rain_adc, rain_digital = reader.read_latest(timeout_s=2.5)
        count += 1
        print(f"[{count:2d}/{n_lines}] Parsed: dist_cm={dist_cm:6.2f} cm | rain_adc={rain_adc:6.1f} | rain_digital={rain_digital}")
    print("=" * 70)
    print("Dry-parse finished successfully.\n")


def main():
    parser = argparse.ArgumentParser(description="Record a physical beaker run CSV with 5 s fixed sampling")
    parser.add_argument("--name", "-n", type=str, default=None, help="Run name (e.g. slow_fill, fast_fill, drain, stays_low)")
    parser.add_argument("--minutes", "-m", type=float, default=12.0, help="Duration in minutes (default: 12.0)")
    parser.add_argument("--serial", "-s", type=str, default=None, help="Serial port (e.g. /dev/ttyUSB0, /dev/ttyACM0)")
    parser.add_argument("--baud", "-b", type=int, default=115200, help="Serial baud rate (default: 115200)")
    parser.add_argument("--url", "-u", type=str, default=None, help="Backend API URL for sensor readings")
    parser.add_argument("--max-age-s", type=float, default=30.0, help="API data freshness threshold in seconds (default: 30.0)")
    parser.add_argument("--list-ports", action="store_true", help="Print available serial ports and exit")
    parser.add_argument("--dry-parse", type=int, nargs="?", const=10, default=None, help="Dry-parse N lines from source and exit without saving CSV (default: 10)")
    parser.add_argument("--no-rain", action="store_true", help="Force typical dry rain sensor values")
    parser.add_argument("--force", "-f", action="store_true", help="Force overwrite if target file exists")
    args = parser.parse_args()

    # 1. Handle --list-ports
    if args.list_ports:
        print_ports_report()
        sys.exit(0)

    # 2. Determine data source (Serial is primary)
    if args.serial is not None:
        source_type = "serial"
    elif args.url is not None:
        source_type = "api"
    else:
        # Check if serial ports exist to suggest one
        avail = list_available_ports()
        if len(avail) == 1:
            print(f"Auto-detected serial port: {avail[0]}")
            args.serial = avail[0]
            source_type = "serial"
        else:
            print("Error: No data source specified. Specify --serial <port> (primary) or --url <url>.")
            print_ports_report()
            print("Example Serial: python record_real_run.py --name slow_fill --serial /dev/ttyUSB0 --baud 115200")
            print("Example API:    python record_real_run.py --name slow_fill --url http://localhost:8000/api/public/summary")
            sys.exit(1)

    # 3. Dry-parse mode does not require --name
    if args.dry_parse is not None:
        try:
            reader = SensorReader(
                source_type=source_type,
                serial_port=args.serial,
                baud=args.baud,
                url=args.url,
                max_age_s=args.max_age_s,
            )
            run_dry_parse(reader, n_lines=args.dry_parse)
            reader.close()
            sys.exit(0)
        except Exception as e:
            print(f"Error during dry-parse: {e}")
            sys.exit(1)

    # 4. Standard Recording Mode requires --name
    if not args.name:
        print("Error: --name <run_name> is required for recording (e.g. --name slow_fill).")
        sys.exit(1)

    os.makedirs(DATA_REAL_RUNS_DIR, exist_ok=True)
    filename = f"{args.name}.csv" if not args.name.endswith(".csv") else args.name
    target_csv = os.path.join(DATA_REAL_RUNS_DIR, filename)

    # Check overwrite before doing anything
    if os.path.exists(target_csv) and not args.force:
        print(f"Error: Target file '{target_csv}' already exists.")
        print("Use --force to overwrite the existing file.")
        sys.exit(1)

    # 5. Connect to sensor source
    try:
        reader = SensorReader(
            source_type=source_type,
            serial_port=args.serial,
            baud=args.baud,
            url=args.url,
            max_age_s=args.max_age_s,
        )
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

    # If Serial, print the first 5 raw lines for format verification
    if source_type == "serial":
        print("\nVerifying serial payload format (first 5 raw lines):")
        for i in range(5):
            raw = reader.read_raw_line(timeout_s=2.0)
            parsed = parse_sensor_payload(raw, log_unparseable=False)
            print(f"  [raw {i+1}]: {raw!r} -> parsed: dist={parsed[0]}, rain_adc={parsed[1]}, rain_digital={parsed[2]}")

    # 6. Ruler prompt for initial ground truth
    print("\n" + "=" * 70)
    print(f"RECORDING RUN: {args.name}")
    print(f"Target file:     {target_csv}")
    print(f"Target duration: {args.minutes:.1f} minutes ({int(args.minutes * 60 / 5.0)} steps at 5.0s spacing)")
    print("=" * 70)

    initial_water_cm = 0.0
    if sys.stdin.isatty():
        try:
            init_input = input("Enter initial water height in cm (ruler) [default 0.0]: ").strip()
            initial_water_cm = float(init_input) if init_input else 0.0
        except (ValueError, EOFError):
            initial_water_cm = 0.0
    else:
        try:
            rlist, _, _ = select.select([sys.stdin], [], [], 0.1)
            if rlist:
                init_input = sys.stdin.readline().strip()
                initial_water_cm = float(init_input) if init_input else 0.0
        except Exception:
            pass
        print(f"Initial water height (non-interactive default): {initial_water_cm:.2f} cm")

    terminal_listener = WaterLevelTerminalListener(initial_value=initial_water_cm)
    terminal_listener.start()

    stop_requested = False

    def handle_sigint(signum, frame):
        nonlocal stop_requested
        print("\n\n[Ctrl+C received] Stopping recording and validating data before save...")
        stop_requested = True

    signal.signal(signal.SIGINT, handle_sigint)

    sample_interval = 5.0
    total_steps = int((args.minutes * 60) / sample_interval)
    recorded_rows: List[dict] = []

    print(f"\nStarting recording at t=0.0s (press Ctrl+C at any time to stop and save)...")
    print(f"Initial ground truth water level: {initial_water_cm:.2f} cm")
    print("Tip: Type a number anytime (e.g. '4.5' or 'w 4.5') to update the ruler measurement.\n")

    start_monotonic = time.monotonic()
    step = 0

    try:
        while step < total_steps and not stop_requested:
            # Fixed-schedule deadline (zero drift)
            target_monotonic = start_monotonic + (step * sample_interval)
            now = time.monotonic()
            wait_s = target_monotonic - now
            if wait_s > 0:
                time.sleep(wait_s)

            t_s = float(step * sample_interval)

            # Prompt every 30 seconds
            if step > 0 and (int(t_s) % 30 == 0):
                terminal_listener.print_prompt(t_s)

            # Read sensor measurement
            dist_cm, rain_adc, rain_digital = reader.read_latest(timeout_s=1.5)

            if args.no_rain:
                rain_adc = TYPICAL_DRY_RAIN_ADC
                rain_digital = TYPICAL_DRY_RAIN_DIGITAL

            # Fetch ruler ground truth
            true_water_level = terminal_listener.get_value()

            row = {
                "t_s": f"{t_s:.1f}",
                "dist_cm": f"{dist_cm:.2f}" if dist_cm != -1.0 else "-1.00",
                "rain_adc": f"{rain_adc:.1f}",
                "rain_digital": str(rain_digital),
                "true_water_level_cm": f"{true_water_level:.2f}",
            }
            recorded_rows.append(row)

            # Periodic status log
            if step % 6 == 0:  # Every 30 s
                print(
                    f"  [t={t_s:5.1f}s | step {step+1:3d}/{total_steps}] "
                    f"dist_cm={row['dist_cm']:>6s} | rain_adc={row['rain_adc']:>6s} | "
                    f"rain_dig={row['rain_digital']:>4s} | ruler={row['true_water_level_cm']:>5s} cm"
                )

            step += 1

    except Exception as e:
        print(f"\nUnexpected recording error: {e}")
    finally:
        reader.close()
        terminal_listener.stop()

    print("\n" + "=" * 70)
    print("RECORDING STOPPED — VALIDATING DATA BEFORE SAVE")
    print("=" * 70)

    # 7. Pre-save validation
    is_valid, validation_msg = validate_run(recorded_rows, min_variance_duration_s=60.0)

    if not is_valid:
        print("\n" + "!" * 70)
        print("VALIDATION FAILED: RUN REJECTED")
        print(f"Reason: {validation_msg}")
        print("CSV file was NOT saved to prevent storing corrupted or stale training data.")
        print("!" * 70 + "\n")
        sys.exit(1)

    # Final check on overwrite before writing
    if os.path.exists(target_csv) and not args.force:
        print(f"Error: Target file '{target_csv}' already exists. Use --force to overwrite.")
        sys.exit(1)

    # Write validated data to CSV
    with open(target_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["t_s", "dist_cm", "rain_adc", "rain_digital", "true_water_level_cm"])
        writer.writeheader()
        writer.writerows(recorded_rows)

    duration_saved = (len(recorded_rows) - 1) * sample_interval if recorded_rows else 0.0
    print(f"Validation passed successfully!")
    print(f"Saved file path: {target_csv}")
    print(f"Total rows:      {len(recorded_rows)} (duration: {duration_saved:.1f} s)")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
