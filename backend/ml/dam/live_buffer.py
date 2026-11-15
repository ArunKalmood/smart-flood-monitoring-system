"""
DamLiveBuffer
=============
Thread-safe rolling 60-minute window that feeds the dam LSTM predictor with
actual live ESP32 readings.

Design principles
-----------------
* Completely isolated from the serial read loop and from FastAPI request
  handling. It is called only from two places:
    1. `main.py` lifespan — bootstrap() pre-fills from the last 60 minutes
       of FloodData rows on startup (ARDUINO-001 only).
    2. `routes/sensors.py` ingest hook — push() is called once per accepted
       reading, inside a try/except so it can NEVER affect sensor ingestion.

* No I/O of its own after bootstrap. No file reads, no DB connections held.

* The DB stores water_level in METRES. This module converts to centimetres
  (× 100) on every push() and bootstrap() call so the buffer always holds
  centimetre values matching the model's training data.

* A bucket is one calendar minute. High-frequency ESP32 readings within the
  same minute are aggregated: mean water_level_cm, max rain_detected.

* get_window() returns is_ready=True only when the deque contains exactly
  WINDOW_LEN complete, contiguous one-minute buckets with no gaps larger than
  MAX_GAP_MINUTES. If gaps exist the prediction is suppressed.

Unit note
---------
  DB column `flood_data.water_level`  → metres  (range 0–50 m per validators.py)
  Training CSV `water_level_cm`       → centimetres
  Buffer internal storage             → centimetres  (conversion: cm = m × 100)
"""
import logging
import threading
from collections import deque
from datetime import datetime, timedelta, timezone

import numpy as np

log = logging.getLogger(__name__)

# ── constants ─────────────────────────────────────────────────────────────────
WINDOW_LEN     = 60   # number of one-minute buckets required for a prediction
MAX_GAP_MINUTES = 2   # consecutive missing minutes that invalidate the window
TARGET_SENSOR_ID = "ARDUINO-001"   # only readings from this sensor fill the buffer

# ── internal types ────────────────────────────────────────────────────────────
# Each bucket: {"minute": datetime (floor to minute, UTC), "wl_sum": float,
#               "wl_count": int, "rain_max": float}


def _floor_minute(dt: datetime) -> datetime:
    """Truncate a timezone-aware datetime to the minute boundary."""
    return dt.replace(second=0, microsecond=0)


class DamLiveBuffer:
    """
    Rolling 60-minute aggregation buffer for the dam LSTM predictor.

    Thread safety: a single threading.Lock guards every mutation.
    The lock is never held across I/O.
    """

    def __init__(self, window_len: int = WINDOW_LEN):
        self._window_len = window_len
        self._lock       = threading.Lock()
        # Deque of dicts: {"minute": datetime, "wl_sum": float,
        #                  "wl_count": int, "rain_max": float}
        self._buckets: deque = deque(maxlen=window_len)

    # ── public API ────────────────────────────────────────────────────────────

    def push(
        self,
        water_level_m: float | None,
        rainfall: float | None,
        recorded_at: datetime,
    ) -> None:
        """
        Ingest one sensor reading.

        Parameters
        ----------
        water_level_m : float | None
            Water level in METRES as stored in FloodData.water_level.
            Converted to centimetres (× 100) internally.
        rainfall : float | None
            0.0 or 1.0 from FloodData.rainfall.  None treated as 0.0.
        recorded_at : datetime
            Timestamp of the reading (UTC-aware or naive UTC).
        """
        if water_level_m is None:
            return                     # nothing to aggregate without a water level

        # Ensure UTC awareness
        if recorded_at.tzinfo is None:
            recorded_at = recorded_at.replace(tzinfo=timezone.utc)

        wl_cm    = float(water_level_m) * 100.0   # metres → centimetres
        rain_val = float(rainfall) if rainfall is not None else 0.0
        minute   = _floor_minute(recorded_at)

        with self._lock:
            if self._buckets and self._buckets[-1]["minute"] == minute:
                # Aggregate into the current bucket
                b = self._buckets[-1]
                b["wl_sum"]   += wl_cm
                b["wl_count"] += 1
                b["rain_max"]  = max(b["rain_max"], rain_val)
            else:
                # New minute — append a new bucket
                self._buckets.append({
                    "minute":   minute,
                    "wl_sum":   wl_cm,
                    "wl_count": 1,
                    "rain_max": rain_val,
                })

    def bootstrap(self, db) -> int:
        """
        Pre-fill the buffer from the last WINDOW_LEN minutes of FloodData
        rows that belong to sensor ARDUINO-001.

        Parameters
        ----------
        db : SQLAlchemy Session

        Returns
        -------
        int : number of one-minute buckets loaded.

        Raises
        ------
        Does not raise. Any database error is logged and the buffer remains
        empty (the predictor will report "Collecting sensor history").
        """
        try:
            return self._bootstrap_impl(db)
        except Exception as exc:
            log.warning("DamLiveBuffer bootstrap failed: %s", exc, exc_info=True)
            return 0

    def get_window(self) -> tuple[np.ndarray | None, bool, int, str | None]:
        """
        Return the current rolling window for LSTM inference.

        Returns
        -------
        window : ndarray shape (WINDOW_LEN, 2) or None
            Columns: [water_level_cm (float32), rain_detected (float32)].
            Oldest bucket first.  None when not ready.
        is_ready : bool
            True only when WINDOW_LEN contiguous buckets are present and
            no gap between consecutive buckets exceeds MAX_GAP_MINUTES.
        minutes_available : int
            Number of complete buckets currently in the deque.
        reason : str | None
            Human-readable explanation when is_ready is False, else None.
        """
        with self._lock:
            buckets = list(self._buckets)   # snapshot under lock

        n = len(buckets)

        if n < self._window_len:
            return (
                None, False, n,
                f"Collecting sensor history ({n}/{self._window_len} minutes)"
            )

        # Validate that there are no large gaps between consecutive buckets
        gap_reason = self._check_gaps(buckets)
        if gap_reason:
            return (None, False, n, gap_reason)

        # Build the (60, 2) array
        wl_arr   = np.array(
            [b["wl_sum"] / b["wl_count"] for b in buckets], dtype=np.float32
        )
        rain_arr = np.array(
            [b["rain_max"] for b in buckets], dtype=np.float32
        )
        window = np.column_stack([wl_arr, rain_arr])   # (60, 2)
        return (window, True, n, None)

    def minutes_available(self) -> int:
        """Number of one-minute buckets currently in the deque."""
        with self._lock:
            return len(self._buckets)

    # ── private helpers ───────────────────────────────────────────────────────

    def _bootstrap_impl(self, db) -> int:
        """
        Internal bootstrap: runs DB query, aggregates into buckets, fills deque.
        Called only from bootstrap() which wraps it in try/except.

        Only loads readings from sensor ARDUINO-001.
        Only loads readings from the last WINDOW_LEN minutes.
        """
        # Import here so this module can be unit-tested without a DB
        from datetime import timedelta
        from sqlalchemy import desc
        from models.flood_data import FloodData
        from models.sensor import Sensor

        log.info("DamLiveBuffer: bootstrapping from DB (sensor=%s, window=%d min) ...",
                 TARGET_SENSOR_ID, self._window_len)

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self._window_len)

        # Find the sensor row for ARDUINO-001
        sensor_row = (
            db.query(Sensor)
            .filter(Sensor.sensor_id == TARGET_SENSOR_ID)
            .first()
        )
        if sensor_row is None:
            log.warning(
                "DamLiveBuffer: sensor '%s' not found in DB; buffer stays empty.",
                TARGET_SENSOR_ID,
            )
            return 0

        rows = (
            db.query(FloodData)
            .filter(
                FloodData.sensor_id == sensor_row.id,
                FloodData.water_level.isnot(None),
                FloodData.recorded_at >= cutoff,
            )
            .order_by(FloodData.recorded_at)
            .all()
        )

        if not rows:
            log.info("DamLiveBuffer: no recent FloodData rows; buffer stays empty.")
            return 0

        # Aggregate into one-minute buckets (dict: minute → accumulator)
        minute_map: dict[datetime, dict] = {}
        for row in rows:
            # Recorded_at may be naive (SQLite stores without tz); treat as UTC
            ts = row.recorded_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            minute = _floor_minute(ts)

            wl_cm    = float(row.water_level) * 100.0  # metres → centimetres
            rain_val = float(row.rainfall) if row.rainfall is not None else 0.0

            if minute not in minute_map:
                minute_map[minute] = {"wl_sum": wl_cm, "wl_count": 1, "rain_max": rain_val}
            else:
                b = minute_map[minute]
                b["wl_sum"]   += wl_cm
                b["wl_count"] += 1
                b["rain_max"]  = max(b["rain_max"], rain_val)

        # Sort by minute, take the last WINDOW_LEN buckets
        sorted_minutes = sorted(minute_map.keys())
        kept = sorted_minutes[-self._window_len:]

        with self._lock:
            self._buckets.clear()
            for m in kept:
                agg = minute_map[m]
                self._buckets.append({
                    "minute":   m,
                    "wl_sum":   agg["wl_sum"],
                    "wl_count": agg["wl_count"],
                    "rain_max": agg["rain_max"],
                })

        loaded = len(self._buckets)
        log.info("DamLiveBuffer: bootstrap complete — %d/%d minute buckets loaded.",
                 loaded, self._window_len)
        return loaded

    @staticmethod
    def _check_gaps(buckets: list) -> str | None:
        """
        Return a reason string if any consecutive pair of buckets is separated
        by more than MAX_GAP_MINUTES; None when the window is contiguous.
        """
        for i in range(1, len(buckets)):
            prev = buckets[i - 1]["minute"]
            curr = buckets[i]["minute"]
            gap  = int((curr - prev).total_seconds() / 60)
            if gap > MAX_GAP_MINUTES:
                return (
                    f"Window has a {gap}-minute gap at "
                    f"{curr.strftime('%H:%M UTC')} — prediction suppressed"
                )
        return None


# ── module-level singleton ─────────────────────────────────────────────────────
# Imported by both routes/sensors.py (push) and routes/lstm.py (get_window).
dam_buffer = DamLiveBuffer()
