import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SQLEnum, Float, Text
from sqlalchemy.types import JSON
from database.connection import Base
from datetime import datetime


class VolunteerStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Volunteer(Base):
    __tablename__ = "volunteers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=False)
    blood_group = Column(String(5))
    skills = Column(JSON)  # ["medical", "rescue", "cooking", "driving", "boat_handling"]
    location = Column(String(200))
    latitude = Column(Float)
    longitude = Column(Float)
    availability = Column(Boolean, default=True)
    organization = Column(String(200))
    id_document = Column(String(300))  # uploaded ID path
    status = Column(SQLEnum(VolunteerStatus), default=VolunteerStatus.PENDING)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
