from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import Optional
from database.connection import get_db
from models.feedback import Feedback, FeedbackStatus
from schemas.data_schema import FeedbackCreate, FeedbackUpdate
from auth.jwt_handler import get_current_user
from datetime import datetime
import os, aiofiles, uuid

router = APIRouter(prefix="/feedback", tags=["Feedback"])
UPLOAD_DIR = "uploads/feedback"
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


@router.post("/submit", status_code=201)
async def submit_feedback(
    title: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    location: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    priority: str = Form("medium"),
    is_anonymous: bool = Form(False),
    user_name: Optional[str] = Form(None),
    user_email: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    photo_path = None
    if photo:
        ext = photo.filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Invalid file type. Allowed: jpg, jpeg, png, gif, webp")
        filename = f"{uuid.uuid4()}.{ext}"
        path = f"{UPLOAD_DIR}/{filename}"
        async with aiofiles.open(path, "wb") as f:
            await f.write(await photo.read())
        photo_path = path

    fb = Feedback(
        title=title, category=category, description=description,
        location=location, latitude=latitude, longitude=longitude,
        priority=priority, is_anonymous=is_anonymous,
        user_name=user_name if not is_anonymous else None,
        user_email=user_email if not is_anonymous else None,
        photo=photo_path,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return fb


@router.get("/")
async def get_feedback_list(
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query("newest", pattern="^(newest|oldest|priority|category)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Feedback)
    if status:
        query = query.filter(Feedback.status == status)
    if category:
        query = query.filter(Feedback.category == category)
    if priority:
        query = query.filter(Feedback.priority == priority)
    if search:
        query = query.filter(
            or_(Feedback.title.ilike(f"%{search}%"), Feedback.description.ilike(f"%{search}%"))
        )

    if sort == "newest":
        query = query.order_by(desc(Feedback.created_at))
    elif sort == "oldest":
        query = query.order_by(Feedback.created_at)
    elif sort == "priority":
        query = query.order_by(Feedback.priority)

    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/stats/summary")
async def get_feedback_stats(db: Session = Depends(get_db)):
    """LLM-ready: returns all feedback data for AI analysis"""
    total = db.query(Feedback).count()
    pending = db.query(Feedback).filter(Feedback.status == FeedbackStatus.PENDING).count()
    resolved = db.query(Feedback).filter(Feedback.status == FeedbackStatus.RESOLVED).count()
    return {
        "total": total,
        "pending": pending,
        "resolved": resolved,
        "llm_analysis_ready": True,
        "llm_endpoint": "/api/genai/analyze-feedback"
    }


@router.get("/{feedback_id}")
async def get_feedback(feedback_id: int, db: Session = Depends(get_db)):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return fb


@router.patch("/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    data: FeedbackUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if data.status:
        fb.status = data.status
        if data.status == FeedbackStatus.RESOLVED.value:
            fb.resolved_at = datetime.utcnow()
    if data.admin_notes:
        fb.admin_notes = data.admin_notes
    if data.priority:
        fb.priority = data.priority

    fb.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(fb)
    return fb
