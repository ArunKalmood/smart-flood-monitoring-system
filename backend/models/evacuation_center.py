import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, Enum as SQLEnum
from database.connection import Base
from datetime import datetime


class CenterStatus(str, enum.Enum):
    OPEN = "open"
    FULL = "full"
    CLOSED = "closed"


class EvacuationCenter(Base):
    __tablename__ = "evacuation_centers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    address = Column(String(300))
    capacity = Column(Integer, default=0)
    current_occupancy = Column(Integer, default=0)
    food_available = Column(Boolean, default=False)
    medical_available = Column(Boolean, default=False)
    contact_number = Column(String(20))
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(SQLEnum(CenterStatus), default=CenterStatus.OPEN)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)  # boat, ambulance, food_kit, medical_kit, police, fire
    quantity_total = Column(Integer, default=0)
    quantity_available = Column(Integer, default=0)
    current_location = Column(String(300))
    latitude = Column(Float)
    longitude = Column(Float)
    assigned_team = Column(String(200))
    is_available = Column(Boolean, default=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50))  # flood_warning, heavy_rain, evacuation, weather
    severity = Column(String(20), default="medium")  # low, medium, high, critical
    affected_area = Column(String(300))
    latitude = Column(Float)
    longitude = Column(Float)
    radius_km = Column(Float)
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(50), nullable=False)
    title = Column(String(200))
    generated_by = Column(Integer)
    file_path = Column(String(300))
    period_days = Column(Integer)
    total_records = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
