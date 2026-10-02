"""
GenAI / LLM Integration Placeholder
Designed for future LangChain / OpenAI / IBM Watson integration
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.connection import get_db
from models.feedback import Feedback
from auth.jwt_handler import get_current_user

router = APIRouter(prefix="/genai", tags=["Generative AI (Future)"])


@router.get("/analyze-feedback")
async def analyze_feedback_ready(db: Session = Depends(get_db)):
    """
    LLM Integration Placeholder
    Future: Connect to LangChain/OpenAI/IBM Watson to:
    - Analyze severity
    - Detect duplicates
    - Generate summaries
    - Auto-prioritize
    """
    total = db.query(Feedback).count()
    pending_analysis = db.query(Feedback).filter(Feedback.ai_severity_score == None).count()
    return {
        "status": "ready_for_llm",
        "total_feedback": total,
        "pending_analysis": pending_analysis,
        "llm_features": [
            "severity_scoring",
            "urgency_detection",
            "duplicate_detection",
            "auto_summary",
            "priority_ranking",
            "category_validation"
        ],
        "integration_guide": "Set OPENAI_API_KEY or WATSON_API_KEY in .env and implement services/genai_service.py"
    }


@router.post("/analyze-feedback/{feedback_id}")
async def analyze_single_feedback(
    feedback_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Future: trigger LLM analysis for a single feedback item"""
    return {
        "status": "not_implemented",
        "message": "LLM service not configured. Implement services/genai_service.py",
        "feedback_id": feedback_id
    }


@router.get("/flood-summary")
async def get_flood_summary(db: Session = Depends(get_db)):
    """Future: AI-generated flood situation summary"""
    return {
        "status": "not_implemented",
        "message": "Connect to LLM to generate natural language situation reports"
    }
