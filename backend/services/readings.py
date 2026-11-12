"""
Live sensor readings and sensor health — one place for "what is the current
reading" and "is this sensor online", used by the dashboard, sensors page,
public summary and live predictions.
"""
from datetime import timedelta

from sqlalchemy import desc
from sqlalchemy.orm import Session

from models.flood_data import FloodData
from models.sensor import Sensor, SensorStatus
from utils.config import settings
from utils.timeutil import as_utc, iso, utc_now

READING_FIELDS = ("water_level", "rainfall", "temperature", "humidity", "river_flow")


def latest_readings(db: Session, max_age_minutes=None) -> dict:
    """
    Latest non-null value of each reading, with its timestamp:
    {"water_level": {"value": 4.5, "recorded_at": "..."} | None, ..., "recorded_at": newest timestamp | None}
    """
    cutoff = utc_now() - timedelta(minutes=max_age_minutes) if max_age_minutes else None
    result = {}
    newest = None
    for field in READING_FIELDS:
        column = getattr(FloodData, field)
        query = db.query(column, FloodData.recorded_at).filter(column.isnot(None))
        if cutoff is not None:
            query = query.filter(FloodData.recorded_at >= cutoff)
        row = query.order_by(desc(FloodData.recorded_at)).first()
        if row is None:
            result[field] = None
            continue
        result[field] = {"value": row[0], "recorded_at": iso(row[1])}
        if newest is None or row[1] > newest:
            newest = row[1]
    result["recorded_at"] = iso(newest)
    return result


def reading_values(readings: dict) -> dict:
    """{"water_level": 4.5, ...} from latest_readings() output (None when missing)."""
    return {f: (readings[f]["value"] if readings.get(f) else None) for f in READING_FIELDS}


def water_level_change_24h(db: Session):
    """Latest water level minus the reading closest to 24 h earlier (within ±3 h), or None."""
    latest = (db.query(FloodData).filter(FloodData.water_level.isnot(None))
              .order_by(desc(FloodData.recorded_at)).first())
    if latest is None:
        return None
    target = latest.recorded_at - timedelta(hours=24)
    window = timedelta(hours=3)
    candidates = (db.query(FloodData)
                  .filter(FloodData.water_level.isnot(None),
                          FloodData.recorded_at >= target - window,
                          FloodData.recorded_at <= target + window)
                  .all())
    if not candidates:
        return None
    previous = min(candidates, key=lambda r: abs(r.recorded_at - target))
    return round(latest.water_level - previous.water_level, 2)


def sensor_status(sensor: Sensor, now=None) -> str:
    """
    Effective status: maintenance/fault are set by staff; otherwise a sensor is
    online only if it reported within SENSOR_OFFLINE_AFTER_MINUTES.
    """
    stored = sensor.status.value if hasattr(sensor.status, "value") else sensor.status
    if stored in (SensorStatus.MAINTENANCE.value, SensorStatus.FAULT.value):
        return stored
    if sensor.last_seen is None:
        return SensorStatus.OFFLINE.value
    now = now or utc_now()
    fresh = now - as_utc(sensor.last_seen) <= timedelta(minutes=settings.SENSOR_OFFLINE_AFTER_MINUTES)
    return SensorStatus.ONLINE.value if fresh else SensorStatus.OFFLINE.value


def sensor_health(db: Session) -> dict:
    """Counts and lowest battery over active sensors, using effective status."""
    sensors = db.query(Sensor).filter(Sensor.is_active.is_(True)).all()
    now = utc_now()
    statuses = [(s, sensor_status(s, now)) for s in sensors]
    online = [s for s, st in statuses if st == SensorStatus.ONLINE.value]
    with_battery = [s for s in online if s.battery_level is not None]
    lowest = min(with_battery, key=lambda s: s.battery_level) if with_battery else None
    return {
        "total": len(sensors),
        "online": len(online),
        "offline": len(sensors) - len(online),
        "lowest_battery": {"sensor": lowest.name, "value": lowest.battery_level} if lowest else None,
    }
