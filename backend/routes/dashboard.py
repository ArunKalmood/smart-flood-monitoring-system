from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from database.connection import get_db
from models.user import User
from models.sos import SOS
from models.volunteer import Volunteer
from models.feedback import Feedback
from models.sensor import Sensor
from models.flood_data import FloodData, Prediction
from models.evacuation_center import Alert, EvacuationCenter
from auth.jwt_handler import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Main dashboard statistics"""
    from datetime import datetime

    total_users = db.query(User).count()
    total_volunteers = db.query(Volunteer).count()
    active_sos = db.query(SOS).filter(SOS.status == "pending").count()
    total_sensors = db.query(Sensor).count()
    online_sensors = db.query(Sensor).filter(Sensor.status == "online").count()
    active_alerts = db.query(Alert).filter(Alert.is_active == True).count()
    open_centers = db.query(EvacuationCenter).filter(EvacuationCenter.status == "open").count()
    pending_feedback = db.query(Feedback).filter(Feedback.status == "pending").count()

    latest_prediction = db.query(Prediction).order_by(desc(Prediction.predicted_at)).first()
    latest_data = db.query(FloodData).order_by(desc(FloodData.recorded_at)).first()

    return {
        "total_users": total_users,
        "total_volunteers": total_volunteers,
        "active_sos": active_sos,
        "total_sensors": total_sensors,
        "online_sensors": online_sensors,
        "active_alerts": active_alerts,
        "open_evacuation_centers": open_centers,
        "pending_feedback": pending_feedback,
        "current_water_level": latest_data.water_level if latest_data else 0,
        "current_rainfall": latest_data.rainfall if latest_data else 0,
        "current_temperature": latest_data.temperature if latest_data else 0,
        "current_humidity": latest_data.humidity if latest_data else 0,
        "flood_risk": latest_prediction.risk_level if latest_prediction else "safe",
        "risk_confidence": latest_prediction.confidence if latest_prediction else 0,
    }


@router.get("/water-level-trend")
async def get_water_level_trend(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    data = db.query(FloodData).filter(
        FloodData.recorded_at >= cutoff
    ).order_by(FloodData.recorded_at).all()
    return [
        {
            "time": d.recorded_at.strftime("%H:%M") if d.recorded_at else "",
            "water_level": d.water_level,
            "rainfall": d.rainfall,
            "temperature": d.temperature,
            "humidity": d.humidity,
        }
        for d in data
    ]


@router.get("/recent-alerts")
async def get_recent_alerts(limit: int = 5, db: Session = Depends(get_db)):
    return db.query(Alert).filter(Alert.is_active == True).order_by(desc(Alert.created_at)).limit(limit).all()


@router.get("/sos-summary")
async def get_sos_summary(db: Session = Depends(get_db)):
    from models.sos import SOSStatus
    pending = db.query(SOS).filter(SOS.status == SOSStatus.PENDING).count()
    accepted = db.query(SOS).filter(SOS.status == SOSStatus.ACCEPTED).count()
    rescued = db.query(SOS).filter(SOS.status == SOSStatus.RESCUED).count()
    recent = db.query(SOS).order_by(desc(SOS.created_at)).limit(5).all()
    return {
        "pending": pending, "accepted": accepted, "rescued": rescued,
        "recent": recent
    }
