from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.flood_data import Prediction
from models.sensor import Sensor
from schemas.data_schema import PredictionCreate
from auth.jwt_handler import get_current_user
from datetime import datetime

router = APIRouter(prefix="/predictions", tags=["Flood Prediction"])


def simple_rule_based_prediction(water_level: float, rainfall: float, humidity: float, temperature: float) -> dict:
    """
    Rule-based placeholder. Replace with ML model in production.
    ML model path: backend/ml/models/flood_predictor.pkl
    """
    score = 0
    if water_level > 8.0:
        score += 40
    elif water_level > 5.0:
        score += 20
    elif water_level > 3.0:
        score += 10

    if rainfall > 100:
        score += 30
    elif rainfall > 50:
        score += 15
    elif rainfall > 20:
        score += 5

    if humidity > 90:
        score += 20
    elif humidity > 75:
        score += 10

    if temperature > 35:
        score += 10

    if score >= 60:
        risk_level = "danger"
        confidence = min(0.95, 0.6 + score / 200)
    elif score >= 30:
        risk_level = "warning"
        confidence = min(0.85, 0.5 + score / 200)
    else:
        risk_level = "safe"
        confidence = min(0.92, 0.7 + (60 - score) / 200)

    time_to_flood = max(0, (100 - score) * 0.5) if score > 30 else None

    return {
        "risk_level": risk_level,
        "confidence": round(confidence, 3),
        "score": score,
        "time_to_flood_hours": time_to_flood,
        "features": {
            "water_level": water_level,
            "rainfall": rainfall,
            "humidity": humidity,
            "temperature": temperature
        }
    }


@router.post("/predict")
async def predict_flood(data: PredictionCreate, db: Session = Depends(get_db)):
    result = simple_rule_based_prediction(
        data.water_level, data.rainfall, data.humidity, data.temperature
    )

    prediction = Prediction(
        sensor_id=data.sensor_id,
        risk_level=result["risk_level"],
        confidence=result["confidence"],
        predicted_water_level=data.water_level,
        time_to_flood_hours=result.get("time_to_flood_hours"),
        model_version="rule_based_v1",
        features_used=str(result["features"]),
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    return {**result, "prediction_id": prediction.id, "predicted_at": prediction.predicted_at}


@router.get("/latest")
async def get_latest_predictions(
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    predictions = db.query(Prediction).order_by(desc(Prediction.predicted_at)).limit(limit).all()
    return predictions


@router.get("/history")
async def get_prediction_history(
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    return db.query(Prediction).order_by(desc(Prediction.predicted_at)).limit(limit).all()


@router.get("/stats")
async def get_prediction_stats(db: Session = Depends(get_db)):
    total = db.query(Prediction).count()
    safe = db.query(Prediction).filter(Prediction.risk_level == "safe").count()
    warning = db.query(Prediction).filter(Prediction.risk_level == "warning").count()
    danger = db.query(Prediction).filter(Prediction.risk_level == "danger").count()
    return {
        "total": total,
        "safe": safe,
        "warning": warning,
        "danger": danger,
        "model_info": {
            "current_version": "rule_based_v1",
            "ml_ready": True,
            "ml_model_path": "ml/models/flood_predictor.pkl",
            "description": "Rule-based model. Replace with trained ML model for production."
        }
    }
