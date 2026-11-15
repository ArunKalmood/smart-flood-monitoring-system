from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from database.connection import get_db
from auth.permissions import require_auth
from services.ai_flood_service import (
    analyze_flood_risk_with_gemini,
    get_latest_flood_status,
    get_analysis_history,
)
from services.gemini_service import chat_emergency_assistant
from genai import (
    test_gemini_connection,
    translate_text,
    translate_precautions,
    SUPPORTED_LANGUAGES,
)

router = APIRouter(prefix="/ai", tags=["Gemini AI Flood Intelligence"])


class AnalyzeFloodRequest(BaseModel):
    sensor_id: Optional[int] = None
    force_refresh: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    language: Optional[str] = "en"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    language: Optional[str] = "en"
    history: Optional[List[Dict[str, Any]]] = None


class TranslateRequest(BaseModel):
    text: Optional[str] = None
    items: Optional[List[str]] = None
    target_language: str = Field(default="en")


@router.post("/analyze-flood")
async def analyze_flood(
    payload: Optional[AnalyzeFloodRequest] = None,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Trigger or fetch intelligent flood risk analysis powered by Gemini AI and validated safety rules.
    Outputs natural disaster-management prose in the requested language (English, Kannada, Hindi, etc.).
    """
    sensor_id = payload.sensor_id if payload else None
    force = payload.force_refresh if payload else False
    lat = payload.latitude if payload else None
    lng = payload.longitude if payload else None
    lang = payload.language if payload and payload.language else "en"

    result = analyze_flood_risk_with_gemini(
        db=db,
        sensor_id=sensor_id,
        force_refresh=force,
        user_lat=lat,
        user_lng=lng,
        language=lang,
    )
    return result


@router.get("/flood-status")
async def flood_status(
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Retrieve current flood risk status and latest sensor evaluation.
    """
    return get_latest_flood_status(db)


@router.post("/chat")
async def emergency_chat(
    payload: ChatRequest,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Ask the Gemini AI emergency assistant questions about flood danger, nearest shelters,
    evacuation kits, route safety, and survival precautions in any supported language.
    """
    return chat_emergency_assistant(
        db=db,
        message=payload.message,
        conversation_id=payload.conversation_id,
        user_lat=payload.latitude,
        user_lng=payload.longitude,
        location_name=payload.location_name,
        language=payload.language or "en",
        history=payload.history,
    )


@router.post("/translate")
async def translate_emergency_content(
    payload: TranslateRequest,
    current_user=Depends(require_auth),
):
    """
    Translates emergency situation text, safety precautions, or instructions into
    one of the 10 supported regional languages.
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


@router.get("/gemini-status")
async def get_gemini_status(
    current_user=Depends(require_auth),
):
    """
    Checks whether GEMINI_API_KEY is configured and verifies live connectivity.
    """
    return test_gemini_connection()


@router.get("/languages")
async def list_supported_languages():
    """
    Returns metadata for all 10 supported emergency response languages.
    """
    return {
        "default": "en",
        "languages": [
            {"code": code, "name": info["name"], "native": info["native"]}
            for code, info in SUPPORTED_LANGUAGES.items()
        ],
    }


@router.get("/history")
async def analysis_history(
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    List past AI risk analyses and risk-level transitions.
    """
    return get_analysis_history(db, limit=limit)
