from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String, Text
from database.connection import Base
from datetime import datetime


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
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)


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
    predicted_at = Column(DateTime, default=datetime.utcnow, index=True)
