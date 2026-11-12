from sqlalchemy import Column, Integer, Float, ForeignKey, String, Text
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class FloodData(Base):
    __tablename__ = "flood_data"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=True)
    water_level = Column(Float)
    rainfall = Column(Float)
    temperature = Column(Float)
    humidity = Column(Float)
    river_flow = Column(Float)
    latitude = Column(Float)
    longitude = Column(Float)
    recorded_at = Column(UTCDateTime, default=utc_now, index=True)


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=True)
    risk_level = Column(String(20), nullable=False)  # safe, warning, danger
    confidence = Column(Float)
    predicted_water_level = Column(Float)
    time_to_flood_hours = Column(Float)
    model_version = Column(String(50), default="rule_based_v1")
    features_used = Column(Text)
    score = Column(Integer)
    # "live" = computed from sensor data; "simulation" = manual what-if run.
    # Only live predictions may drive the dashboard, public summary or alerts.
    source = Column(String(20), default="live", nullable=False, index=True)
    predicted_at = Column(UTCDateTime, default=utc_now, index=True)
