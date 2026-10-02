import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Enum as SQLEnum
from database.connection import Base
from datetime import datetime


class SensorStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"
    FAULT = "fault"


class Sensor(Base):
    __tablename__ = "sensors"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    type = Column(String(50))  # water_level, rain, temperature, humidity, flow, battery, gps
    location = Column(String(200))
    latitude = Column(Float)
    longitude = Column(Float)
    current_value = Column(Float)
    unit = Column(String(20))
    battery_level = Column(Float)
    status = Column(SQLEnum(SensorStatus), default=SensorStatus.OFFLINE)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime)
    firmware_version = Column(String(20))
    installed_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
