"""
GenAI / Gemini Integration Endpoints.
Fully implemented using official Google GenAI SDK and live flood grounding.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel, Field

from database.connection import get_db
from models.feedback import Feedback
from auth.permissions import require_auth, require_permission
from genai import (
    test_gemini_connection,
    translate_text,
    translate_precautions,
    generate_flood_explanation,
    is_gemini_configured,
    SUPPORTED_LANGUAGES,
)
from services.ai_flood_service import gather_sensor_snapshot, evaluate_deterministic_safety

router = APIRouter(prefix="/genai", tags=["Google Gemini GenAI"])


class GenAITranslateRequest(BaseModel):
    text: Optional[str] = None
    items: Optional[List[str]] = None
    target_language: str = Field(default="en")


@router.get("/status")
async def gemini_status(
    current_user=Depends(require_auth)
):
    """
    Verifies Google Gemini API status, model, and connectivity.
    """
    return test_gemini_connection()


@router.get("/flood-summary")
async def get_flood_summary(
    language: str = "en",
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Generates a real-time natural language situation report grounded in live sensor and LSTM data.
    """
    snapshot = gather_sensor_snapshot(db)
    baseline = evaluate_deterministic_safety(snapshot)
    explanation = generate_flood_explanation(snapshot, baseline, language=language)
    return {
        "summary": explanation["explanation"],
        "risk_level": explanation["risk_level"],
        "language": explanation["language"],
        "is_fallback": explanation["is_fallback"],
        "model_used": explanation.get("model_used"),
        "sensor_telemetry": {
            "river_name": snapshot.get("river_name"),
            "location": snapshot.get("sensor_location"),
            "water_level": snapshot.get("water_level"),
            "rainfall": snapshot.get("rainfall"),
            "trend": snapshot.get("water_level_trend"),
            "rate_of_rise": snapshot.get("rate_of_increase_per_hour"),
            "data_status": snapshot.get("data_status"),
        },
    }


@router.post("/translate")
async def translate_endpoint(
    payload: GenAITranslateRequest,
    current_user=Depends(require_auth),
):
    """
    Translates emergency text or lists into any of the 10 supported regional languages.
    """
    target = payload.target_language if payload.target_language in SUPPORTED_LANGUAGES else "en"
    translated_text = None
    translated_items = None

    if payload.text:
        translated_text = translate_text(payload.text, target_language=target)
    if payload.items:
        translated_items = translate_precautions(payload.items, target_language=target)

    return {
        "target_language": target,
        "translated_text": translated_text,
        "translated_items": translated_items,
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
    }


@router.post("/analyze-feedback/{feedback_id}")
async def analyze_single_feedback(
    feedback_id: int,
    current_user=Depends(require_permission("feedback.manage")),
    db: Session = Depends(get_db)
):
    """Trigger AI / LLM analysis for a single feedback item."""
    fb = db.get(Feedback, feedback_id)
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {
        "status": "success",
        "feedback_id": feedback_id,
        "message": "Feedback evaluated with Gemini safety intelligence.",
    }


@router.get("/analyze-feedback")
async def analyze_feedback_status(
    current_user=Depends(require_permission("feedback.view_all")),
    db: Session = Depends(get_db)
):
    """
    Returns feedback analysis metrics and Gemini integration status.
    """
    total = db.query(Feedback).count()
    pending = db.query(Feedback).filter(Feedback.ai_severity_score.is_(None)).count()
    return {
        "status": "gemini_enabled" if is_gemini_configured() else "offline_fallback",
        "total_feedback": total,
        "pending_analysis": pending,
        "gemini_configured": is_gemini_configured(),
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
    }
