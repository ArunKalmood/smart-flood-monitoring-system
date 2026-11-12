"""
Public, unauthenticated endpoints for the home page.

Only aggregated, non-personal data: counts, the live risk level, the latest
reading and active public alerts. Never names, phones, emails or SOS locations.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from database.connection import get_db
from models.evacuation_center import Alert, CenterStatus, EvacuationCenter
from models.sos import ACTIVE_SOS_STATUSES, SOS, SOSStatus
from models.volunteer import Volunteer, VolunteerStatus
from services.prediction import latest_live_prediction
from services.readings import latest_readings, reading_values, sensor_health
from utils.config import settings
from utils.rate_limit import limiter
from utils.timeutil import iso

router = APIRouter(prefix="/public", tags=["Public"])

PUBLIC_ALERT_LIMIT = 5


@router.get("/summary")
@limiter.limit(settings.RATE_LIMIT_PUBLIC)
async def public_summary(request: Request, db: Session = Depends(get_db)):
    prediction = latest_live_prediction(db)
    readings = latest_readings(db)
    health = sensor_health(db)
    alerts = (db.query(Alert).filter(Alert.is_active.is_(True))
              .order_by(desc(Alert.created_at)).limit(PUBLIC_ALERT_LIMIT).all())
    shelters = db.query(EvacuationCenter).filter(EvacuationCenter.status != CenterStatus.CLOSED)

    return {
        "sensors": {"total": health["total"], "online": health["online"]},
        "risk": {
            "level": prediction.risk_level,
            "confidence": prediction.confidence,
            "predicted_at": iso(prediction.predicted_at),
        } if prediction else None,
        "latest_reading": {**reading_values(readings), "recorded_at": readings["recorded_at"]}
        if readings["recorded_at"] else None,
        "alerts": {
            "active": db.query(Alert).filter(Alert.is_active.is_(True)).count(),
            "items": [
                {"id": a.id, "title": a.title, "message": a.message, "severity": a.severity,
                 "affected_area": a.affected_area, "created_at": iso(a.created_at)}
                for a in alerts
            ],
        },
        "sos": {
            "active": db.query(SOS).filter(SOS.status.in_(ACTIVE_SOS_STATUSES)).count(),
            "resolved": db.query(SOS).filter(SOS.status.in_([SOSStatus.RESCUED, SOSStatus.RESOLVED])).count(),
        },
        "shelters": {
            "open": shelters.filter(EvacuationCenter.status == CenterStatus.OPEN).count(),
            "people_sheltered": shelters.with_entities(
                func.coalesce(func.sum(EvacuationCenter.current_occupancy), 0)).scalar(),
        },
        "volunteers": {
            "approved": db.query(Volunteer).filter(Volunteer.status == VolunteerStatus.APPROVED).count(),
        },
    }
