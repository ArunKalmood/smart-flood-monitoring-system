"""
Per-device API keys for IoT sensors.

Each sensor has its own random key; only its sha256 is stored
(sensors.device_key_hash). Devices send it in the `X-Device-Key` header.
"""
import hashlib
import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from models.sensor import Sensor


def hash_device_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def issue_device_key(sensor: Sensor) -> str:
    """Generate a new key, store its hash on the sensor, return the plain key (caller commits)."""
    key = secrets.token_urlsafe(32)
    sensor.device_key_hash = hash_device_key(key)
    return key


async def authenticate_device(
    x_device_key: Optional[str] = Header(None, alias="X-Device-Key"),
    db: Session = Depends(get_db),
) -> Sensor:
    """Dependency: the sensor owning the X-Device-Key header, else 401."""
    if not x_device_key:
        raise HTTPException(status_code=401, detail="Missing X-Device-Key header")
    sensor = db.query(Sensor).filter(Sensor.device_key_hash == hash_device_key(x_device_key)).first()
    if sensor is None:
        raise HTTPException(status_code=401, detail="Invalid device key")
    return sensor
