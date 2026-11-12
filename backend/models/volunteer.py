import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum as SQLEnum, Float, Text
from sqlalchemy.types import JSON
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class VolunteerStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


# Allowed status changes by an approver. Suspending removes volunteer powers
# (they are granted only while APPROVED); reinstating restores them.
VOLUNTEER_TRANSITIONS = {
    VolunteerStatus.PENDING: {VolunteerStatus.APPROVED, VolunteerStatus.REJECTED},
    VolunteerStatus.APPROVED: {VolunteerStatus.SUSPENDED},
    VolunteerStatus.SUSPENDED: {VolunteerStatus.APPROVED},
    VolunteerStatus.REJECTED: {VolunteerStatus.APPROVED},
}


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
    created_at = Column(UTCDateTime, default=utc_now)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)
