from sqlalchemy import Column, Integer, String, ForeignKey, Enum as SQLEnum
from database.connection import Base
from models.admin import AdminRole
from utils.timeutil import UTCDateTime, utc_now


class AdminInvite(Base):
    """
    Single-use admin registration invite. Only the sha256 of the token is
    stored; the plain token is shown once, when the invite is created.
    The invite (not the registrant) decides the admin role.
    """
    __tablename__ = "admin_invites"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    role = Column(SQLEnum(AdminRole), nullable=False)
    email = Column(String(150), nullable=True)  # if set, only this email may use the invite
    created_by_admin_id = Column(Integer, ForeignKey("admins.id"), nullable=True)  # None = created via CLI
    expires_at = Column(UTCDateTime, nullable=False)
    used_at = Column(UTCDateTime, nullable=True)
    used_by_admin_id = Column(Integer, ForeignKey("admins.id"), nullable=True)
    created_at = Column(UTCDateTime, default=utc_now)
