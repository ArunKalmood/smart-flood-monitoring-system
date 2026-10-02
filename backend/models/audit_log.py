from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from database.connection import Base
from datetime import datetime


class AuditLog(Base):
    """
    Immutable append-only audit trail.
    Written by log_action() — never updated or deleted via API.
    """
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    actor_id    = Column(Integer, nullable=False, index=True)   # admin.id or user.id
    actor_email = Column(String(150), nullable=False)
    actor_role  = Column(String(50),  nullable=False)
    action      = Column(String(100), nullable=False, index=True)  # e.g. "SOS_STATUS_UPDATE"
    resource    = Column(String(100), nullable=True)               # e.g. "sos_requests"
    resource_id = Column(Integer,     nullable=True)
    before      = Column(JSON,        nullable=True)   # snapshot before change
    after       = Column(JSON,        nullable=True)   # snapshot after change
    ip_address  = Column(String(45),  nullable=True)
    created_at  = Column(DateTime,    default=datetime.utcnow, index=True)
