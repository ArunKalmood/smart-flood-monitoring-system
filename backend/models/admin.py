import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class AdminRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    DISTRICT_ADMIN = "district_admin"
    OPERATIONS = "operations"
    ANALYST = "analyst"


class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    department = Column(String(150))
    role = Column(SQLEnum(AdminRole), default=AdminRole.DISTRICT_ADMIN, nullable=False)
    is_active = Column(Boolean, default=True)
    language = Column(String(10), default="en")
    theme = Column(String(10), default="light")
    notification_prefs = Column(JSON)  # see utils/notification_prefs.py; None = defaults
    last_login = Column(UTCDateTime)
    created_at = Column(UTCDateTime, default=utc_now)
    updated_at = Column(UTCDateTime, default=utc_now, onupdate=utc_now)

    notifications = relationship("Notification", back_populates="admin", cascade="all, delete-orphan")
