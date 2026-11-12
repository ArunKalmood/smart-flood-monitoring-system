from collections import defaultdict
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from auth.permissions import require_auth
from database.connection import get_db
from models.flood_data import Prediction
from schemas.data_schema import PredictionCreate
from services.prediction import (
    FEATURE_WEIGHTS, MODEL_VERSION, SOURCE_LIVE, SOURCE_SIMULATION, rule_based_prediction, save_prediction,
)
from utils.serializers import model_to_dict
from utils.timeutil import utc_now

router = APIRouter(prefix="/predictions", tags=["Flood Prediction"])

Source = Literal["live", "simulation"]
RISK_LEVELS = ("safe", "warning", "danger")


@router.post("/predict")
async def simulate_flood(data: PredictionCreate, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """
    What-if simulation from manually entered values. Stored with
    source="simulation" — it never affects the live risk, dashboard or alerts.
    """
    result = rule_based_prediction(data.model_dump())
    prediction = save_prediction(db, result, SOURCE_SIMULATION)
    db.commit()
    db.refresh(prediction)
    return {**result, "source": SOURCE_SIMULATION, "prediction_id": prediction.id,
            "predicted_at": model_to_dict(prediction)["predicted_at"]}


@router.get("/latest")
async def get_latest_predictions(
    limit: int = Query(10, ge=1, le=100),
    source: Source = SOURCE_LIVE,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    rows = (db.query(Prediction).filter(Prediction.source == source)
            .order_by(desc(Prediction.predicted_at)).limit(limit).all())
    return [model_to_dict(p) for p in rows]


@router.get("/history")
async def get_prediction_history(
    hours: int = Query(24, ge=1, le=24 * 30),
    source: Source = SOURCE_LIVE,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Predictions in the last `hours`, oldest first (for timelines)."""
    cutoff = utc_now() - timedelta(hours=hours)
    rows = (db.query(Prediction)
            .filter(Prediction.source == source, Prediction.predicted_at >= cutoff)
            .order_by(Prediction.predicted_at).all())
    return [model_to_dict(p) for p in rows]


@router.get("/daily")
async def get_daily_risk(
    days: int = Query(14, ge=1, le=90),
    utc_offset_minutes: int = Query(0, ge=-720, le=840, description="Viewer's offset from UTC, e.g. 330 for IST"),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Live predictions per local calendar day and risk level for the last `days` days (zeros included)."""
    offset = timedelta(minutes=utc_offset_minutes)
    today = (utc_now() + offset).date()
    start = today - timedelta(days=days - 1)
    rows = (db.query(Prediction.predicted_at, Prediction.risk_level)
            .filter(Prediction.source == SOURCE_LIVE,
                    Prediction.predicted_at >= utc_now() - timedelta(days=days + 1)).all())
    counts = defaultdict(lambda: dict.fromkeys(RISK_LEVELS, 0))
    for predicted_at, level in rows:
        local_day = (predicted_at + offset).date()
        if level in RISK_LEVELS and local_day >= start:
            counts[local_day][level] += 1
    return [{"date": (start + timedelta(days=i)).isoformat(), **counts[start + timedelta(days=i)]}
            for i in range(days)]


@router.get("/stats")
async def get_prediction_stats(
    days: int = Query(7, ge=1, le=365),
    source: Source = SOURCE_LIVE,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Counts by risk level over the last `days` days, plus the model's feature weights."""
    base = db.query(Prediction).filter(Prediction.source == source,
                                       Prediction.predicted_at >= utc_now() - timedelta(days=days))
    by_level = {level: base.filter(Prediction.risk_level == level).count() for level in RISK_LEVELS}
    return {
        "source": source,
        "days": days,
        "total": sum(by_level.values()),
        **by_level,
        "model_info": {
            "current_version": MODEL_VERSION,
            "type": "rule_based",
            "feature_weights": FEATURE_WEIGHTS,
        },
    }
