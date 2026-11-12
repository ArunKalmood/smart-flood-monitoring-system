from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_id = Column(Integer, ForeignKey("admins.id"), nullable=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50))  # flood_warning, sos_accepted, volunteer_assigned, shelter_available, weather_alert
    is_read = Column(Boolean, default=False)
    read_at = Column(UTCDateTime)
    link = Column(String(300))
    created_at = Column(UTCDateTime, default=utc_now, index=True)

    user = relationship("User", back_populates="notifications")
    admin = relationship("Admin", back_populates="notifications")
