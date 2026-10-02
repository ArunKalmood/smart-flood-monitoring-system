import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum as SQLEnum
from database.connection import Base
from datetime import datetime


class SOSStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    RESCUED = "rescued"
    CLOSED = "closed"


class EmergencyType(str, enum.Enum):
    MEDICAL = "medical"
    FLOOD = "flood"
    FOOD = "food"
    SHELTER = "shelter"
    RESCUE = "rescue"


class SOS(Base):
    __tablename__ = "sos_requests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    phone = Column(String(20), nullable=False)
    emergency_type = Column(String(30), nullable=False)
    description = Column(Text)
    location = Column(String(300))
    latitude = Column(Float)
    longitude = Column(Float)
    photo = Column(String(300))
    status = Column(SQLEnum(SOSStatus), default=SOSStatus.PENDING)
    assigned_team = Column(String(200))
    notes = Column(Text)
    resolved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
