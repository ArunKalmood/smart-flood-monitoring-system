from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from auth.device_keys import authenticate_device, issue_device_key
from auth.permissions import require_auth, require_permission
from database.connection import get_db
from models.flood_data import FloodData, Prediction
from models.sensor import READING_FIELD_FOR_TYPE, Sensor
from schemas.data_schema import SensorCreate, SensorDataCreate
from services.prediction import record_live_prediction
from services.readings import READING_FIELDS, sensor_health, sensor_status
from utils.config import settings
from utils.serializers import model_to_dict
from utils.timeutil import as_utc, iso, utc_now

router = APIRouter(prefix="/sensors", tags=["Sensors & IoT"])


def serialize_sensor(sensor: Sensor, db: Optional[Session] = None) -> dict:
    """Sensor row with `status` computed from last_seen (never trusted from the stored value)."""
    data = model_to_dict(sensor)
    data["status"] = sensor_status(sensor)
    if db is not None:
        if (data.get("latitude") is None or data.get("longitude") is None):
            latest_geo = (db.query(FloodData)
                          .filter(FloodData.sensor_id == sensor.id,
                                  FloodData.latitude.isnot(None),
                                  FloodData.longitude.isnot(None))
                          .order_by(desc(FloodData.recorded_at)).first())
            if latest_geo:
                data["latitude"] = latest_geo.latitude
                data["longitude"] = latest_geo.longitude

        latest_reading = (db.query(FloodData)
                          .filter(FloodData.sensor_id == sensor.id)
                          .order_by(desc(FloodData.recorded_at)).first())
        if latest_reading:
            data["water_level"] = latest_reading.water_level
            data["rainfall"] = latest_reading.rainfall
            data["reading_recorded_at"] = iso(latest_reading.recorded_at)
            age = utc_now() - as_utc(latest_reading.recorded_at)
            data["is_stale"] = age > timedelta(minutes=settings.LIVE_READING_WINDOW_MINUTES)
            if not data.get("last_seen") and latest_reading.recorded_at:
                data["last_seen"] = iso(latest_reading.recorded_at)
        else:
            data["water_level"] = None
            data["rainfall"] = None
            data["reading_recorded_at"] = None
            data["is_stale"] = True

        latest_pred = (db.query(Prediction)
                       .filter(Prediction.sensor_id == sensor.id)
                       .order_by(desc(Prediction.predicted_at)).first())
        if latest_pred:
            data["risk_level"] = latest_pred.risk_level
            data["confidence"] = latest_pred.confidence
            data["predicted_at"] = iso(latest_pred.predicted_at)
        else:
            data["risk_level"] = None
            data["confidence"] = None
            data["predicted_at"] = None
    return data


@router.get("/")
async def get_all_sensors(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    sensors = db.query(Sensor).filter(Sensor.is_active.is_(True)).order_by(Sensor.id).all()
    return [serialize_sensor(s, db=db) for s in sensors]


@router.get("/dashboard")
async def get_sensor_dashboard(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """Sensor health summary plus every active sensor."""
    sensors = db.query(Sensor).filter(Sensor.is_active.is_(True)).order_by(Sensor.id).all()
    return {**sensor_health(db), "sensors": [serialize_sensor(s, db=db) for s in sensors]}


@router.post("/data")
async def ingest_sensor_data(
    data: SensorDataCreate,
    sensor: Sensor = Depends(authenticate_device),
    db: Session = Depends(get_db),
):
    """
    IoT endpoint to receive sensor data. Requires the device's `X-Device-Key`
    header; the key must belong to the `sensor_id` in the body. Sensors must be
    registered (and given a key) first — unknown devices are not auto-created.
    Each reading also produces a live flood-risk prediction.
    """
    if data.sensor_id != sensor.sensor_id:
        raise HTTPException(status_code=401, detail="Device key does not match sensor_id")
    if not sensor.is_active:
        raise HTTPException(status_code=403, detail="Sensor is deactivated")

    readings = data.model_dump(include=set(READING_FIELDS))
    own_field = READING_FIELD_FOR_TYPE.get(sensor.type)
    if own_field and readings.get(own_field) is not None:
        sensor.current_value = readings[own_field]
    if data.battery_level is not None:
        sensor.battery_level = data.battery_level
    if data.latitude is not None and data.longitude is not None:
        sensor.latitude = data.latitude
        sensor.longitude = data.longitude
    sensor.last_seen = utc_now()

    db.add(FloodData(sensor_id=sensor.id, latitude=data.latitude, longitude=data.longitude, **readings))
    db.flush()
    prediction = record_live_prediction(db, sensor_id=sensor.id)
    db.commit()

    return {"status": "received", "sensor_id": sensor.id,
            "risk_level": prediction.risk_level if prediction else None}


@router.get("/data/history")
async def get_sensor_history(
    sensor_id: Optional[int] = None,
    hours: int = Query(24, ge=1, le=720),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    cutoff = utc_now() - timedelta(hours=hours)
    query = db.query(FloodData).filter(FloodData.recorded_at >= cutoff)
    if sensor_id:
        query = query.filter(FloodData.sensor_id == sensor_id)
    return [model_to_dict(d) for d in query.order_by(FloodData.recorded_at).all()]


@router.post("/admin/register-sensor", status_code=201)
async def register_sensor(
    data: SensorCreate,
    current_user=Depends(require_permission("sensors.manage")),
    db: Session = Depends(get_db)
):
    """Register a sensor. The response contains `device_key` once — flash it into the device."""
    existing = db.query(Sensor).filter(Sensor.sensor_id == data.sensor_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sensor ID already registered")
    sensor = Sensor(**data.model_dump(mode="json"))
    device_key = issue_device_key(sensor)
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return {**serialize_sensor(sensor), "device_key": device_key}


@router.post("/admin/{sensor_id}/rotate-key")
async def rotate_sensor_key(
    sensor_id: int,
    current_user=Depends(require_permission("sensors.manage")),
    db: Session = Depends(get_db)
):
    """Issue a new device key (the old one stops working immediately). Returned once."""
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    device_key = issue_device_key(sensor)
    db.commit()
    return {"sensor_id": sensor.sensor_id, "device_key": device_key}


@router.get("/{sensor_id}")
async def get_sensor(sensor_id: int, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return serialize_sensor(sensor, db=db)

