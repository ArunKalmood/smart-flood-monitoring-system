import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from database.connection import Base
from datetime import datetime


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
    last_login = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    notifications = relationship("Notification", back_populates="admin", cascade="all, delete-orphan")
