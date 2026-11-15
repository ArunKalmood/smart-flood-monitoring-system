from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from database.connection import Base
from utils.timeutil import UTCDateTime, utc_now


class AIAnalysisHistory(Base):
    __tablename__ = "ai_analysis_history"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(Integer, ForeignKey("sensors.id"), nullable=True, index=True)
    risk_level = Column(String(20), nullable=False, index=True)  # LOW, MODERATE, HIGH, CRITICAL
    confidence = Column(String(20), default="MEDIUM")           # LOW, MEDIUM, HIGH
    summary = Column(Text, nullable=False)
    water_level_trend = Column(String(30), default="UNKNOWN")   # RISING, RAPIDLY_RISING, STABLE, FALLING, UNKNOWN
    sensor_analysis = Column(Text)                              # JSON string of sensor values and metrics
    affected_area = Column(Text)                                # JSON string { name, latitude, longitude, radius_km }
    recommended_action = Column(String(100))                    # MONITOR, PREPARE_FOR_EVACUATION, IMMEDIATE_EVACUATION, etc.
    user_message = Column(Text)                                 # Tailored emergency warning message
    evacuation_required = Column(Boolean, default=False)
    urgency = Column(String(20), default="LOW")                 # LOW, MODERATE, HIGH, IMMEDIATE
    safety_precautions = Column(Text)                           # JSON list of safety precautions
    reasoning = Column(Text)
    is_fallback = Column(Boolean, default=False)                # True if local deterministic fallback was used
    analyzed_at = Column(UTCDateTime, default=utc_now, index=True)
