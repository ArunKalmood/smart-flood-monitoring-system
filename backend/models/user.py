import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    GOVERNMENT = "government_authority"
    VOLUNTEER = "volunteer"
    PUBLIC = "public_user"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=False)
    password_hash = Column(String(255), nullable=False)
    address = Column(String(300))
    city = Column(String(100))
    state = Column(String(100))
    pin_code = Column(String(10))
    role = Column(SQLEnum(UserRole), default=UserRole.PUBLIC, nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    profile_photo = Column(String(300))
    language = Column(String(10), default="en")
    theme = Column(String(10), default="light")
    notification_enabled = Column(Boolean, default=True)
    notification_prefs = Column(JSON)  # see utils/notification_prefs.py; None = defaults
    google_sub = Column(String(255), unique=True, index=True)
    auth_provider = Column(String(20), default="local", nullable=False)
    tokens_valid_after = Column(UTCDateTime)
    last_login = Column(UTCDateTime)
    created_at = Column(UTCDateTime, default=utc_now)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)

    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
