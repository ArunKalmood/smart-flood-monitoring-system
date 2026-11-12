"""
Flood-risk model (rule-based) and the live prediction pipeline.

- `rule_based_prediction()` scores a set of readings. Missing readings
  contribute nothing.
- `record_live_prediction()` runs after each sensor reading and stores a
  prediction with source="live". Only live predictions drive the dashboard,
  public summary and alerts; manual what-if runs are stored as "simulation".
"""
import json

from sqlalchemy import desc
from sqlalchemy.orm import Session

from models.flood_data import Prediction
from services.readings import latest_readings, reading_values
from utils.config import settings

MODEL_VERSION = "rule_based_v2"
SOURCE_LIVE = "live"
SOURCE_SIMULATION = "simulation"

# (threshold, points) per feature, highest first. A feature scores the points
# of the first threshold it exceeds.
RULES = {
    "water_level": [(8.0, 40), (5.0, 20), (3.0, 10)],   # m
    "rainfall":    [(100, 30), (50, 15), (20, 5)],      # mm/h
    "humidity":    [(90, 20), (75, 10)],                # %
    "temperature": [(35, 10)],                          # °C
    "river_flow":  [(3.0, 10), (2.0, 5)],               # m/s
}
# Maximum points each feature can add = its weight in the model.
FEATURE_WEIGHTS = {feature: rules[0][1] for feature, rules in RULES.items()}
DANGER_SCORE = 60
WARNING_SCORE = 30


def rule_based_prediction(values: dict) -> dict:
    score = 0
    for feature, rules in RULES.items():
        value = values.get(feature)
        if value is None:
            continue
        for threshold, points in rules:
            if value > threshold:
                score += points
                break

    if score >= DANGER_SCORE:
        risk_level, confidence = "danger", min(0.95, 0.6 + score / 200)
    elif score >= WARNING_SCORE:
        risk_level, confidence = "warning", min(0.85, 0.5 + score / 200)
    else:
        risk_level, confidence = "safe", min(0.92, 0.7 + (DANGER_SCORE - score) / 200)

    return {
        "risk_level": risk_level,
        "confidence": round(confidence, 3),
        "score": score,
        "time_to_flood_hours": max(0, (100 - score) * 0.5) if score > WARNING_SCORE else None,
        "features": {feature: values.get(feature) for feature in RULES},
    }


def save_prediction(db: Session, result: dict, source: str, sensor_id=None) -> Prediction:
    prediction = Prediction(
        sensor_id=sensor_id,
        risk_level=result["risk_level"],
        confidence=result["confidence"],
        score=result["score"],
        predicted_water_level=result["features"].get("water_level"),
        time_to_flood_hours=result.get("time_to_flood_hours"),
        model_version=MODEL_VERSION,
        features_used=json.dumps(result["features"]),
        source=source,
    )
    db.add(prediction)
    return prediction


def record_live_prediction(db: Session, sensor_id=None):
    """Predict from the latest readings within the live window. Caller commits."""
    values = reading_values(latest_readings(db, settings.LIVE_READING_WINDOW_MINUTES))
    if values["water_level"] is None and values["rainfall"] is None:
        return None  # not enough to say anything about flood risk
    return save_prediction(db, rule_based_prediction(values), SOURCE_LIVE, sensor_id)


def latest_live_prediction(db: Session):
    return (db.query(Prediction).filter(Prediction.source == SOURCE_LIVE)
            .order_by(desc(Prediction.predicted_at)).first())
