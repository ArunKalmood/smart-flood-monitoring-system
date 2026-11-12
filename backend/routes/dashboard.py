from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from auth.permissions import require_auth, require_permission
from database.connection import get_db
from models.evacuation_center import Alert, CenterStatus, EvacuationCenter
from models.flood_data import FloodData
from models.sos import ACTIVE_SOS_STATUSES, SOS, SOSStatus
from services.prediction import latest_live_prediction
from services.readings import latest_readings, sensor_health, water_level_change_24h
from services.sos import scope_sos_query, serialize_sos_list
from utils.serializers import model_to_dict
from utils.timeutil import iso, utc_now

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """
    Main dashboard numbers. Readings are the latest real values (null when none);
    risk comes only from live predictions; `active_sos` is scoped to what the
    caller may see (public users: their own requests).
    """
    readings = latest_readings(db)
    prediction = latest_live_prediction(db)
    return {
        "readings": readings,
        "water_level_change_24h": water_level_change_24h(db),
        "risk": {
            "level": prediction.risk_level,
            "confidence": prediction.confidence,
            "predicted_at": iso(prediction.predicted_at),
        } if prediction else None,
        "sensors": sensor_health(db),
        "active_sos": scope_sos_query(db.query(SOS), current_user).filter(SOS.status.in_(ACTIVE_SOS_STATUSES)).count(),
        "active_alerts": db.query(Alert).filter(Alert.is_active.is_(True)).count(),
        "open_evacuation_centers": db.query(EvacuationCenter).filter(EvacuationCenter.status == CenterStatus.OPEN).count(),
    }


@router.get("/water-level-trend")
async def get_water_level_trend(hours: int = Query(24, ge=1, le=168), current_user=Depends(require_auth),
                                db: Session = Depends(get_db)):
    """Readings in the last `hours`, oldest first. Timestamps are ISO-8601 UTC."""
    cutoff = utc_now() - timedelta(hours=hours)
    rows = db.query(FloodData).filter(FloodData.recorded_at >= cutoff).order_by(FloodData.recorded_at).all()
    return [
        {
            "recorded_at": iso(d.recorded_at),
            "water_level": d.water_level,
            "rainfall": d.rainfall,
            "temperature": d.temperature,
            "humidity": d.humidity,
        }
        for d in rows
    ]


@router.get("/recent-alerts")
async def get_recent_alerts(limit: int = Query(5, ge=1, le=50), current_user=Depends(require_auth),
                            db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.is_active.is_(True)).order_by(desc(Alert.created_at)).limit(limit).all()
    return [model_to_dict(a) for a in alerts]


@router.get("/sos-summary")
async def get_sos_summary(current_user=Depends(require_permission("sos.view_all")), db: Session = Depends(get_db)):
    counts = {s.value: db.query(SOS).filter(SOS.status == s).count() for s in SOSStatus}
    recent = db.query(SOS).order_by(desc(SOS.created_at)).limit(5).all()
    return {**counts, "recent": serialize_sos_list(db, recent, current_user)}
