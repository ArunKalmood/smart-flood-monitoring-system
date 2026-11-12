import enum
from sqlalchemy import Column, Integer, String, Float, Text, Boolean, ForeignKey, Enum as SQLEnum
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class FeedbackStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    RESOLVED = "resolved"


class FeedbackCategory(str, enum.Enum):
    FLOOD_REPORT = "flood_report"
    INFRASTRUCTURE = "infrastructure"
    SOS_ISSUE = "sos_issue"
    GENERAL = "general"
    SUGGESTION = "suggestion"
    COMPLAINT = "complaint"


class FeedbackPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String(300))
    latitude = Column(Float)
    longitude = Column(Float)
    priority = Column(String(20), default="medium")  # low, medium, high, critical
    is_anonymous = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # from JWT; None when anonymous
    user_name = Column(String(150))
    user_email = Column(String(150))
    photo = Column(String(300))
    status = Column(SQLEnum(FeedbackStatus), default=FeedbackStatus.PENDING)
    admin_notes = Column(Text)
    resolved_at = Column(UTCDateTime)
    # LLM-ready fields — populated by GenAI service when integrated
    ai_severity_score = Column(Float)
    ai_urgency = Column(String(20))
    ai_is_duplicate = Column(Boolean, default=False)
    ai_summary = Column(Text)
    created_at = Column(UTCDateTime, default=utc_now, index=True)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)
