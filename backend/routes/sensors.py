from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List
from database.connection import get_db
from models.sensor import Sensor, SensorStatus
from models.flood_data import FloodData, Prediction
from schemas.data_schema import SensorDataCreate, PredictionCreate, SensorCreate
from auth.jwt_handler import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/sensors", tags=["Sensors & IoT"])


@router.get("/")
async def get_all_sensors(db: Session = Depends(get_db)):
    sensors = db.query(Sensor).filter(Sensor.is_active == True).all()
    return sensors


@router.get("/dashboard")
async def get_sensor_dashboard(db: Session = Depends(get_db)):
    """Get aggregated sensor data for dashboard cards"""
    sensors = db.query(Sensor).filter(Sensor.is_active == True).all()
    total = len(sensors)
    online = len([s for s in sensors if s.status == SensorStatus.ONLINE])
    offline = total - online

    # Latest flood data aggregates
    latest_data = db.query(FloodData).order_by(desc(FloodData.recorded_at)).limit(100).all()

    avg_water_level = None
    avg_rainfall = None
    avg_temperature = None
    avg_humidity = None

    if latest_data:
        wl = [d.water_level for d in latest_data if d.water_level is not None]
        rf = [d.rainfall for d in latest_data if d.rainfall is not None]
        tp = [d.temperature for d in latest_data if d.temperature is not None]
        hm = [d.humidity for d in latest_data if d.humidity is not None]
        avg_water_level = sum(wl) / len(wl) if wl else 0
        avg_rainfall = sum(rf) / len(rf) if rf else 0
        avg_temperature = sum(tp) / len(tp) if tp else 0
        avg_humidity = sum(hm) / len(hm) if hm else 0

    return {
        "total_sensors": total,
        "online": online,
        "offline": offline,
        "avg_water_level": round(avg_water_level or 0, 2),
        "avg_rainfall": round(avg_rainfall or 0, 2),
        "avg_temperature": round(avg_temperature or 0, 2),
        "avg_humidity": round(avg_humidity or 0, 2),
        "sensors": sensors
    }


@router.post("/data")
async def ingest_sensor_data(data: SensorDataCreate, db: Session = Depends(get_db)):
    """IoT endpoint to receive sensor data"""
    sensor = db.query(Sensor).filter(Sensor.sensor_id == data.sensor_id).first()
    if not sensor:
        # Auto-register new sensor
        sensor = Sensor(sensor_id=data.sensor_id, name=f"Sensor {data.sensor_id}", type="water_level")
        db.add(sensor)
        db.flush()

    # Update sensor current values
    if data.water_level is not None:
        sensor.current_value = data.water_level
    if data.battery_level is not None:
        sensor.battery_level = data.battery_level
    sensor.status = SensorStatus.ONLINE
    sensor.last_seen = datetime.utcnow()

    # Store flood data record
    flood_record = FloodData(
        sensor_id=sensor.id,
        water_level=data.water_level,
        rainfall=data.rainfall,
        temperature=data.temperature,
        humidity=data.humidity,
        river_flow=data.river_flow,
        latitude=data.latitude,
        longitude=data.longitude,
    )
    db.add(flood_record)
    db.commit()

    return {"status": "received", "sensor_id": sensor.id}


@router.get("/data/history")
async def get_sensor_history(
    sensor_id: Optional[int] = None,
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db)
):
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    query = db.query(FloodData).filter(FloodData.recorded_at >= cutoff)
    if sensor_id:
        query = query.filter(FloodData.sensor_id == sensor_id)
    data = query.order_by(FloodData.recorded_at).all()
    return data


@router.post("/admin/register-sensor", status_code=201)
async def register_sensor(
    data: SensorCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(Sensor).filter(Sensor.sensor_id == data.sensor_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sensor ID already registered")
    sensor = Sensor(**data.model_dump())
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor


@router.get("/{sensor_id}")
async def get_sensor(sensor_id: int, db: Session = Depends(get_db)):
    sensor = db.query(Sensor).filter(Sensor.id == sensor_id).first()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return sensor
