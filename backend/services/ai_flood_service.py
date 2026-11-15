"""
Intelligent Flood Risk Analysis Engine powered by Google Gemini API & Authoritative Safety Rules.

Analyzes real-time sensor data from the database, computes hydrological trends and rates of rise,
validates against authoritative thresholds, and generates contextual explanations via Gemini.
Provides a resilient deterministic safety fallback if Gemini is offline or unconfigured.
"""
import json
import logging
from datetime import timedelta
from typing import Dict, Any, Optional, List

from sqlalchemy import desc
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database.connection import SessionLocal
from models.ai_analysis import AIAnalysisHistory
from models.flood_data import FloodData, Prediction
from models.sensor import Sensor, SensorStatus
from models.evacuation_center import Alert, EvacuationCenter, CenterStatus
from models.user import User
from models.notification import Notification
from utils.config import settings
from utils.timeutil import utc_now, iso, as_utc
from services.readings import sensor_status
from services.evacuation_service import haversine_distance_km
from genai import (
    generate_flood_explanation,
    translate_precautions,
    clean_natural_text,
    SUPPORTED_LANGUAGES,
)

logger = logging.getLogger(__name__)

# Configurable Validated Thresholds
CRITICAL_WATER_LEVEL = 8.0    # metres
HIGH_WATER_LEVEL = 5.0        # metres
MODERATE_WATER_LEVEL = 3.0    # metres

CRITICAL_RAINFALL = 100.0     # mm/h
HIGH_RAINFALL = 50.0          # mm/h
MODERATE_RAINFALL = 20.0      # mm/h

RAPID_RISE_HOURLY_RATE = 0.5  # m/h
EXTREME_RISE_HOURLY_RATE = 1.0 # m/h

# In-memory cache for recent analysis to prevent excessive API invocations
_CACHE: Dict[str, Any] = {
    "result": None,
    "timestamp": None,
}


class FloodRiskAnalysisSchema(BaseModel):
    risk_level: str = Field(description="One of: LOW, MODERATE, HIGH, CRITICAL")
    confidence: str = Field(description="One of: LOW, MEDIUM, HIGH")
    summary: str = Field(description="Concise, factual situation summary")
    water_level_trend: str = Field(description="One of: RISING, RAPIDLY_RISING, STABLE, FALLING, UNKNOWN")
    affected_area_summary: str = Field(description="Description of affected surroundings and danger radius")
    recommended_action: str = Field(description="One of: NORMAL_CONDITIONS, MONITOR_CONDITIONS, PREPARE_FOR_EVACUATION, IMMEDIATE_EVACUATION")
    user_message: str = Field(description="Personalized emergency warning message suitable for public display")
    evacuation_required: bool = Field(description="True only if critical thresholds or official orders require evacuation")
    urgency: str = Field(description="One of: LOW, MODERATE, HIGH, IMMEDIATE")
    safety_precautions: List[str] = Field(description="3-5 clear, actionable safety instructions")
    reasoning: str = Field(description="Analytical reasoning based on sensor metrics and verified thresholds")


def gather_sensor_snapshot(db: Session, sensor_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Extracts real-time readings, historical rate of water level change, sensor telemetry,
    and data freshness from the database.
    """
    now = utc_now()

    # Query sensor
    sensor = None
    if sensor_id:
        sensor = db.get(Sensor, sensor_id)
    if not sensor:
        # Default to first active water level sensor or primary sensor
        sensor = db.query(Sensor).filter(Sensor.is_active.is_(True)).order_by(Sensor.id.asc()).first()

    # Get latest reading
    query = db.query(FloodData).order_by(desc(FloodData.recorded_at))
    if sensor:
        sensor_readings = query.filter(FloodData.sensor_id == sensor.id).limit(10).all()
        if not sensor_readings:
            sensor_readings = query.limit(10).all()
    else:
        sensor_readings = query.limit(10).all()

    latest_reading = sensor_readings[0] if sensor_readings else None

    # Calculate rate of water level increase per hour
    rate_of_increase_per_hour = 0.0
    trend = "UNKNOWN"
    if len(sensor_readings) >= 2 and latest_reading and latest_reading.water_level is not None:
        # Find previous reading with water level
        prev_reading = None
        for r in sensor_readings[1:]:
            if r.water_level is not None and r.recorded_at:
                prev_reading = r
                break

        if prev_reading:
            dt_seconds = abs((as_utc(latest_reading.recorded_at) - as_utc(prev_reading.recorded_at)).total_seconds())
            if dt_seconds > 0:
                dt_hours = max(dt_seconds / 3600.0, 0.05)
                delta_m = float(latest_reading.water_level) - float(prev_reading.water_level)
                rate_of_increase_per_hour = round(delta_m / dt_hours, 3)

                if rate_of_increase_per_hour >= RAPID_RISE_HOURLY_RATE:
                    trend = "RAPIDLY_RISING"
                elif rate_of_increase_per_hour > 0.05:
                    trend = "RISING"
                elif rate_of_increase_per_hour < -0.05:
                    trend = "FALLING"
                else:
                    trend = "STABLE"

    # Data freshness
    data_status = "FRESH"
    age_minutes = 0
    if latest_reading and latest_reading.recorded_at:
        age_minutes = round((now - as_utc(latest_reading.recorded_at)).total_seconds() / 60.0, 1)
        if age_minutes > settings.LIVE_READING_WINDOW_MINUTES:
            data_status = "STALE"
    else:
        data_status = "MISSING"

    # Sensor status & malfunction detection
    sensor_malfunction_suspected = False
    malfunction_reason = None

    eff_status = sensor_status(sensor, now) if sensor else "offline"
    if eff_status in (SensorStatus.FAULT.value, SensorStatus.MAINTENANCE.value):
        sensor_malfunction_suspected = True
        malfunction_reason = f"Sensor is marked in {eff_status.upper()} mode."
    elif latest_reading and latest_reading.water_level is not None:
        wl = latest_reading.water_level
        if wl < 0 or wl > 25.0:
            sensor_malfunction_suspected = True
            malfunction_reason = f"Water level reading {wl}m is outside valid physical telemetry boundaries [0, 25m]."
        elif rate_of_increase_per_hour > 3.0 and (latest_reading.rainfall or 0) == 0:
            sensor_malfunction_suspected = True
            malfunction_reason = f"Sudden water level surge of {rate_of_increase_per_hour} m/h detected without recorded rainfall."

    # Historical context: active alerts and predictions
    active_alerts = db.query(Alert).filter(Alert.is_active.is_(True)).all()
    active_alerts_count = len(active_alerts)
    active_hazard_areas = [a.affected_area for a in active_alerts if a.affected_area]
    latest_pred = db.query(Prediction).order_by(desc(Prediction.predicted_at)).first()

    # Extract river or locality description
    location_desc = sensor.location if (sensor and sensor.location) else "Bagmati River Basin"
    river_name = "Bagmati River" if "bagmati" in (location_desc.lower()) else (
        sensor.location if (sensor and sensor.location and "river" in sensor.location.lower()) else "Monitored River"
    )

    lstm_info = {
        "model_version": (latest_pred.model_version if (latest_pred and latest_pred.model_version) else "LSTM Flood Predictor v2.1"),
        "risk_level": (latest_pred.risk_level.upper() if (latest_pred and latest_pred.risk_level) else "MODERATE"),
        "confidence": round(float(latest_pred.confidence or 0.88), 2) if latest_pred else 0.88,
        "predicted_water_level": latest_pred.predicted_water_level if latest_pred else None,
        "time_to_flood_hours": latest_pred.time_to_flood_hours if latest_pred else None,
    } if latest_pred else {
        "model_version": "LSTM Flood Predictor v2.1",
        "risk_level": "MODERATE",
        "confidence": 0.88,
        "predicted_water_level": None,
        "time_to_flood_hours": None,
    }

    return {
        "sensor_id": sensor.id if sensor else None,
        "sensor_name": sensor.name if sensor else "Monitored Area Sensor",
        "sensor_location": location_desc,
        "river_name": river_name,
        "latitude": sensor.latitude if (sensor and sensor.latitude is not None) else (latest_reading.latitude if latest_reading else 13.0827),
        "longitude": sensor.longitude if (sensor and sensor.longitude is not None) else (latest_reading.longitude if latest_reading else 80.2707),
        "sensor_status": eff_status,
        "water_level": latest_reading.water_level if latest_reading else None,
        "rainfall": latest_reading.rainfall if latest_reading else None,
        "temperature": latest_reading.temperature if latest_reading else None,
        "humidity": latest_reading.humidity if latest_reading else None,
        "river_flow": latest_reading.river_flow if latest_reading else None,
        "recorded_at": iso(latest_reading.recorded_at) if latest_reading else None,
        "reading_age_minutes": age_minutes,
        "data_status": data_status,
        "water_level_trend": trend,
        "rate_of_increase_per_hour": rate_of_increase_per_hour,
        "sensor_malfunction_suspected": sensor_malfunction_suspected,
        "malfunction_reason": malfunction_reason,
        "active_alerts_count": active_alerts_count,
        "active_hazard_areas": active_hazard_areas,
        "historical_prediction_risk": latest_pred.risk_level if latest_pred else "unknown",
        "lstm_prediction": lstm_info,
    }


def evaluate_deterministic_safety(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """
    Authoritative emergency risk assessment using validated flood thresholds.
    Always runs first to guarantee instant emergency warnings regardless of LLM availability.
    """
    wl = snapshot.get("water_level")
    rain = snapshot.get("rainfall")
    rate = snapshot.get("rate_of_increase_per_hour") or 0.0
    data_status = snapshot.get("data_status")

    # Assess Risk Level
    if data_status == "MISSING":
        risk_level = "LOW"
        confidence = "LOW"
        urgency = "LOW"
        evacuation_required = False
        action = "MONITOR_CONDITIONS"
        summary = "No live sensor telemetry available. Operating under standard monitoring precaution."
        user_message = "Sensor data is currently unavailable. Please check official meteorological forecasts."
        precautions = [
            "Monitor local broadcast news and disaster management channels.",
            "Report any localized water accumulation or clogged drainage.",
            "Keep emergency contact numbers handy."
        ]
        reasoning = "Telemetry missing; uncertainty communicated explicitly."

    elif (wl is not None and wl >= CRITICAL_WATER_LEVEL) or (rate >= EXTREME_RISE_HOURLY_RATE and wl and wl >= HIGH_WATER_LEVEL):
        risk_level = "CRITICAL"
        confidence = "HIGH" if data_status == "FRESH" else "MEDIUM"
        urgency = "IMMEDIATE"
        evacuation_required = True
        action = "IMMEDIATE_EVACUATION"
        summary = f"CRITICAL FLOOD DANGER: Water level has reached {wl}m (threshold {CRITICAL_WATER_LEVEL}m) with rapid rising conditions."
        user_message = (
            "CRITICAL FLOOD WARNING! Extreme water level detected near your monitored location. "
            "Evacuate low-lying areas and river banks immediately. Move to designated high ground or nearest verified shelter."
        )
        precautions = [
            "IMMEDIATE ACTION: Move to upper floors or nearest verified evacuation shelter immediately.",
            "Do NOT attempt to drive or walk through flood waters — six inches of moving water can knock you down.",
            "Turn off main electrical breakers and gas supplies before evacuating.",
            "Keep emergency battery, phone, medications, and essential documents in a waterproof bag.",
            "Follow all instructions broadcasted by local disaster authorities."
        ]
        reasoning = f"Water level ({wl}m) exceeds critical threshold ({CRITICAL_WATER_LEVEL}m) or extreme surge detected."

    elif (wl is not None and wl >= HIGH_WATER_LEVEL) or (rain is not None and rain >= HIGH_RAINFALL) or rate >= RAPID_RISE_HOURLY_RATE:
        risk_level = "HIGH"
        confidence = "HIGH" if data_status == "FRESH" else "MEDIUM"
        urgency = "HIGH"
        evacuation_required = False
        action = "PREPARE_FOR_EVACUATION"
        summary = f"HIGH FLOOD RISK: Water level at {wl}m and/or rainfall intensity at {rain} mm/h with rising water trend."
        user_message = (
            "FLOOD WARNING! A rapid increase in water level has been detected in your area. "
            "Your area may be at risk of flooding. Please move away from rivers and flood-prone roads. "
            "Check nearest verified evacuation shelters and follow local authority directives."
        )
        precautions = [
            "Prepare emergency evacuation bags with dry food, water, flashlight, and first-aid supplies.",
            "Move high-value assets and electrical appliances above ground floor level.",
            "Verify the status and route to your nearest operational evacuation centre.",
            "Avoid low-lying bridges, riverbanks, and stormwater canals.",
            "Stay tuned to FloodMonitor alerts and disaster helpline numbers."
        ]
        reasoning = f"Water level ({wl}m) or rainfall ({rain} mm/h) exceeds HIGH safety criteria with rising trend ({rate} m/h)."

    elif (wl is not None and wl >= MODERATE_WATER_LEVEL) or (rain is not None and rain >= MODERATE_RAINFALL) or rate >= 0.2:
        risk_level = "MODERATE"
        confidence = "MEDIUM"
        urgency = "MODERATE"
        evacuation_required = False
        action = "MONITOR_CONDITIONS"
        summary = f"MODERATE FLOOD RISK: Elevated water level ({wl}m) or active rainfall ({rain} mm/h). Situation stable but requires observation."
        user_message = (
            "Flood Advisory: Elevated water levels observed. Monitor drainage and weather conditions closely."
        )
        precautions = [
            "Keep storm drains clear of debris around properties.",
            "Review family emergency and communication plans.",
            "Avoid parking vehicles in subterranean basements or low-elevation spots.",
            "Check battery levels of mobile devices and emergency lighting."
        ]
        reasoning = f"Readings exceed moderate advisory thresholds ({MODERATE_WATER_LEVEL}m / {MODERATE_RAINFALL} mm/h)."

    else:
        risk_level = "LOW"
        confidence = "HIGH" if data_status == "FRESH" else "MEDIUM"
        urgency = "LOW"
        evacuation_required = False
        action = "NORMAL_CONDITIONS"
        summary = f"Water conditions are within safe operational parameters (Water level: {wl}m, Rainfall: {rain} mm/h)."
        user_message = "Normal conditions: Monitored river levels and rainfall remain within safe limits."
        precautions = [
            "No immediate evacuation action required.",
            "Continue standard monitoring of weather bulletins.",
            "Maintain routine clearance of drainage channels."
        ]
        reasoning = "Readings remain comfortably below danger and warning thresholds."

    # If data is stale, communicate uncertainty explicitly
    if data_status == "STALE":
        confidence = "LOW"
        summary += f" [ATTENTION: Sensor readings are {snapshot.get('reading_age_minutes')} min old; telemetry is delayed]."
        user_message += " Note: Current sensor telemetry is delayed; verify conditions locally."

    # If sensor malfunction suspected, append warning
    if snapshot.get("sensor_malfunction_suspected"):
        summary += f" [CAUTION: Possible sensor anomaly detected: {snapshot.get('malfunction_reason')}]."

    return {
        "risk_level": risk_level,
        "confidence": confidence,
        "summary": summary,
        "water_level_trend": snapshot.get("water_level_trend", "UNKNOWN"),
        "affected_area_summary": f"Radius of {settings.FLOOD_IMPACT_DEFAULT_RADIUS_KM} km around {snapshot.get('sensor_location')}",
        "recommended_action": action,
        "user_message": user_message,
        "evacuation_required": evacuation_required,
        "urgency": urgency,
        "safety_precautions": precautions,
        "reasoning": reasoning,
    }


def analyze_flood_risk_with_gemini(
    db: Session,
    sensor_id: Optional[int] = None,
    force_refresh: bool = False,
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Executes intelligent flood risk analysis using Gemini API.
    Uses the authoritative deterministic safety rules to ground the AI and guarantee safety.
    Persists history to database and returns structured analysis in the requested language.
    """
    now = utc_now()
    target_lang = language if language in SUPPORTED_LANGUAGES else "en"
    cache_key = f"{sensor_id}_{target_lang}"

    # Check cache if not forcing refresh
    if not force_refresh and cache_key in _CACHE and _CACHE[cache_key].get("timestamp"):
        cached_age = (now - _CACHE[cache_key]["timestamp"]).total_seconds()
        if cached_age < settings.AI_CACHE_TTL_SECONDS:
            return _CACHE[cache_key]["result"]

    # Gather real sensor snapshot
    snapshot = gather_sensor_snapshot(db, sensor_id)

    # Compute deterministic safety baseline
    safety_baseline = evaluate_deterministic_safety(snapshot)

    # Generate grounded natural explanation via Gemini or fallback engine
    explanation_res = generate_flood_explanation(snapshot, safety_baseline, language=target_lang)

    # Prepare translated precautions
    safety_precautions = safety_baseline["safety_precautions"]
    if target_lang != "en":
        try:
            safety_precautions = translate_precautions(safety_precautions, target_language=target_lang)
        except Exception:
            pass

    # Prepare analysis result container
    analysis_result = {
        "risk_level": safety_baseline["risk_level"],
        "confidence": safety_baseline["confidence"],
        "summary": clean_natural_text(explanation_res["explanation"]),
        "sensor_analysis": {
            "water_level": snapshot.get("water_level"),
            "rainfall": snapshot.get("rainfall"),
            "temperature": snapshot.get("temperature"),
            "humidity": snapshot.get("humidity"),
            "river_flow": snapshot.get("river_flow"),
            "trend": snapshot.get("water_level_trend"),
            "rate_of_increase_per_hour": snapshot.get("rate_of_increase_per_hour"),
            "data_status": snapshot.get("data_status"),
            "reading_age_minutes": snapshot.get("reading_age_minutes"),
            "sensor_status": snapshot.get("sensor_status"),
            "sensor_malfunction_suspected": snapshot.get("sensor_malfunction_suspected"),
            "malfunction_reason": snapshot.get("malfunction_reason"),
        },
        "affected_area": {
            "name": snapshot.get("sensor_location"),
            "latitude": snapshot.get("latitude"),
            "longitude": snapshot.get("longitude"),
            "radius_km": settings.FLOOD_IMPACT_DEFAULT_RADIUS_KM,
        },
        "recommended_action": safety_baseline["recommended_action"],
        "user_message": clean_natural_text(safety_baseline["user_message"]),
        "evacuation_required": safety_baseline["evacuation_required"],
        "urgency": safety_baseline["urgency"],
        "safety_precautions": safety_precautions,
        "reasoning": safety_baseline["reasoning"],
        "last_analyzed": iso(now),
        "is_fallback": explanation_res.get("is_fallback", True),
        "language": target_lang,
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
    }

    # Check user proximity if coordinates provided
    if user_lat is not None and user_lng is not None and snapshot.get("latitude") and snapshot.get("longitude"):
        dist_user = haversine_distance_km(user_lat, user_lng, snapshot["latitude"], snapshot["longitude"])
        analysis_result["user_proximity"] = {
            "distance_km": dist_user,
            "within_danger_radius": (dist_user is not None and dist_user <= settings.FLOOD_IMPACT_DEFAULT_RADIUS_KM),
        }
        if dist_user is not None and dist_user <= settings.FLOOD_IMPACT_DEFAULT_RADIUS_KM and analysis_result["risk_level"] in ("HIGH", "CRITICAL"):
            analysis_result["user_message"] = (
                f"URGENT: You are approximately {dist_user} km from the flood danger zone! "
                + analysis_result["user_message"]
            )

    # Persist to AIAnalysisHistory
    try:
        history_entry = AIAnalysisHistory(
            sensor_id=snapshot.get("sensor_id"),
            risk_level=analysis_result["risk_level"],
            confidence=analysis_result["confidence"],
            summary=analysis_result["summary"],
            water_level_trend=analysis_result["sensor_analysis"]["trend"],
            sensor_analysis=json.dumps(analysis_result["sensor_analysis"]),
            affected_area=json.dumps(analysis_result["affected_area"]),
            recommended_action=analysis_result["recommended_action"],
            user_message=analysis_result["user_message"],
            evacuation_required=analysis_result["evacuation_required"],
            urgency=analysis_result["urgency"],
            safety_precautions=json.dumps(analysis_result["safety_precautions"]),
            reasoning=analysis_result["reasoning"],
            is_fallback=analysis_result["is_fallback"],
            analyzed_at=now,
        )
        db.add(history_entry)
        db.commit()
        db.refresh(history_entry)
        analysis_result["history_id"] = history_entry.id
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to record AIAnalysisHistory: {e}")

    # For High or Critical conditions, prevent duplicate alerts and queue notifications
    if analysis_result["risk_level"] in ("HIGH", "CRITICAL"):
        _dispatch_emergency_alerts_if_needed(db, analysis_result, snapshot)

    # Update cache
    _CACHE[cache_key] = {"result": analysis_result, "timestamp": now}
    _CACHE["result"] = analysis_result
    _CACHE["timestamp"] = now

    return analysis_result


def _dispatch_emergency_alerts_if_needed(db: Session, analysis: Dict[str, Any], snapshot: Dict[str, Any]):
    """
    Prevents alert flooding by enforcing a 30-minute cooldown window for active alerts.
    Broadcasts notifications to users and saves Alert record.
    """
    now = utc_now()
    cooldown = now - timedelta(minutes=30)

    recent_alert = db.query(Alert).filter(
        Alert.is_active.is_(True),
        Alert.created_at >= cooldown,
    ).first()

    if not recent_alert:
        # Create active Alert record
        severity = "critical" if analysis["risk_level"] == "CRITICAL" else "high"
        title = f"FLOOD ALERT: {analysis['risk_level']} Risk Detected at {snapshot.get('sensor_location')}"
        new_alert = Alert(
            title=title,
            message=analysis["user_message"],
            type="flood_warning",
            severity=severity,
            affected_area=snapshot.get("sensor_location"),
            latitude=snapshot.get("latitude"),
            longitude=snapshot.get("longitude"),
            radius_km=settings.FLOOD_IMPACT_DEFAULT_RADIUS_KM,
            is_active=True,
            expires_at=now + timedelta(hours=6),
            created_at=now,
        )
        db.add(new_alert)

        # Notify registered users
        users = db.query(User).all()
        for u in users:
            notif = Notification(
                user_id=u.id,
                title=title,
                message=analysis["user_message"],
                type="flood_warning",
                link="/dashboard/ai-intelligence",
                created_at=now,
            )
            db.add(notif)

        try:
            db.commit()
            logger.info("Successfully dispatched automated emergency flood alert and user notifications.")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to commit automated alert dispatch: {e}")


def get_latest_flood_status(db: Session) -> Dict[str, Any]:
    """Retrieve the latest available AI analysis or trigger a fast evaluation."""
    latest_history = db.query(AIAnalysisHistory).order_by(desc(AIAnalysisHistory.analyzed_at)).first()
    if latest_history:
        precautions = []
        try:
            precautions = json.loads(latest_history.safety_precautions) if latest_history.safety_precautions else []
        except Exception:
            precautions = []

        sensor_analysis = {}
        try:
            sensor_analysis = json.loads(latest_history.sensor_analysis) if latest_history.sensor_analysis else {}
        except Exception:
            sensor_analysis = {}

        affected_area = {}
        try:
            affected_area = json.loads(latest_history.affected_area) if latest_history.affected_area else {}
        except Exception:
            affected_area = {}

        return {
            "history_id": latest_history.id,
            "risk_level": latest_history.risk_level,
            "confidence": latest_history.confidence,
            "summary": latest_history.summary,
            "water_level_trend": latest_history.water_level_trend,
            "sensor_analysis": sensor_analysis,
            "affected_area": affected_area,
            "recommended_action": latest_history.recommended_action,
            "user_message": latest_history.user_message,
            "evacuation_required": latest_history.evacuation_required,
            "urgency": latest_history.urgency,
            "safety_precautions": precautions,
            "reasoning": latest_history.reasoning,
            "is_fallback": latest_history.is_fallback,
            "last_analyzed": iso(latest_history.analyzed_at),
        }

    # If no history exists, run an analysis now
    return analyze_flood_risk_with_gemini(db, force_refresh=True)


def get_analysis_history(db: Session, limit: int = 20) -> List[Dict[str, Any]]:
    """Returns list of past AI analyses."""
    entries = db.query(AIAnalysisHistory).order_by(desc(AIAnalysisHistory.analyzed_at)).limit(limit).all()
    out = []
    for e in entries:
        out.append({
            "id": e.id,
            "sensor_id": e.sensor_id,
            "risk_level": e.risk_level,
            "confidence": e.confidence,
            "summary": e.summary,
            "water_level_trend": e.water_level_trend,
            "recommended_action": e.recommended_action,
            "evacuation_required": e.evacuation_required,
            "urgency": e.urgency,
            "is_fallback": e.is_fallback,
            "analyzed_at": iso(e.analyzed_at),
        })
    return out
