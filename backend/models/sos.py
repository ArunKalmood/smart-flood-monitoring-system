import enum
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Enum as SQLEnum
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class SOSStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    RESCUED = "rescued"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


# "Active" = still needs a response. Used by the SOS page, dashboard and public summary.
ACTIVE_SOS_STATUSES = (SOSStatus.PENDING, SOSStatus.ACCEPTED, SOSStatus.IN_PROGRESS)
CLOSED_SOS_STATUSES = (SOSStatus.RESCUED, SOSStatus.RESOLVED, SOSStatus.CANCELLED)

# Allowed status changes. Terminal states have no outgoing transitions.
SOS_TRANSITIONS = {
    SOSStatus.PENDING: {SOSStatus.ACCEPTED, SOSStatus.CANCELLED},
    SOSStatus.ACCEPTED: {SOSStatus.IN_PROGRESS, SOSStatus.RESCUED, SOSStatus.RESOLVED, SOSStatus.CANCELLED},
    SOSStatus.IN_PROGRESS: {SOSStatus.RESCUED, SOSStatus.RESOLVED, SOSStatus.CANCELLED},
    SOSStatus.RESCUED: set(),
    SOSStatus.RESOLVED: set(),
    SOSStatus.CANCELLED: set(),
}


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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)              # submitter (from JWT)
    accepted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # volunteer who accepted
    assigned_team = Column(String(200))
    notes = Column(Text)
    resolved_at = Column(UTCDateTime)
    created_at = Column(UTCDateTime, default=utc_now, index=True)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)


class SOSStatusHistory(Base):
    """Audit trail of SOS status changes: who, when, from/to, optional note."""
    __tablename__ = "sos_status_history"

    id = Column(Integer, primary_key=True, index=True)
    sos_id = Column(Integer, ForeignKey("sos_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(String(20))
    to_status = Column(String(20), nullable=False)
    changed_by_id = Column(Integer, nullable=False)
    changed_by_type = Column(String(10), nullable=False)  # "user" | "admin"
    changed_by_name = Column(String(150), nullable=False)
    note = Column(Text)
    changed_at = Column(UTCDateTime, default=utc_now, nullable=False)
