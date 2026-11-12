import enum
from sqlalchemy import Column, Integer, String, Boolean, Float, Enum as SQLEnum
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class SensorStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"
    FAULT = "fault"


class SensorType(str, enum.Enum):
    WATER_LEVEL = "water_level"
    RAINFALL = "rainfall"
    TEMPERATURE = "temperature"
    HUMIDITY = "humidity"
    FLOW = "flow"


# Which reading (flood_data column) a sensor of each type reports as its current value.
READING_FIELD_FOR_TYPE = {
    SensorType.WATER_LEVEL.value: "water_level",
    SensorType.RAINFALL.value: "rainfall",
    SensorType.TEMPERATURE.value: "temperature",
    SensorType.HUMIDITY.value: "humidity",
    SensorType.FLOW.value: "river_flow",
}


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
    last_seen = Column(UTCDateTime)
    firmware_version = Column(String(20))
    device_key_hash = Column(String(64), unique=True, index=True)  # sha256 of the X-Device-Key; never returned by the API
    installed_at = Column(UTCDateTime, default=utc_now)
    created_at = Column(UTCDateTime, default=utc_now)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)
