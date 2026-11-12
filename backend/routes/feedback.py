from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from auth.permissions import has_permission, optional_auth, require_auth, require_permission, user_account_id
from database.connection import get_db
from models.feedback import Feedback, FeedbackStatus
from models.user import User
from schemas.data_schema import FeedbackCreate, FeedbackUpdate
from utils.config import settings
from utils.forms import parse_form
from utils.rate_limit import limiter
from utils.serializers import model_to_dict
from utils.timeutil import utc_now
from utils.uploads import save_image

router = APIRouter(prefix="/feedback", tags=["Feedback"])


def scope_feedback_query(query, user):
    """Staff see all feedback; everyone else only their own (non-anonymous) submissions."""
    if has_permission(user.effective_role, "feedback.view_all"):
        return query
    return query.filter(Feedback.user_id == user_account_id(user))


def serialize_feedback_list(db: Session, items) -> list:
    """Feedback rows plus `submitted_by`: the account's current name, the name given, or None if anonymous."""
    user_ids = {f.user_id for f in items if f.user_id}
    names = dict(db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()) if user_ids else {}
    result = []
    for f in items:
        data = model_to_dict(f)
        data["submitted_by"] = None if f.is_anonymous else (names.get(f.user_id) or f.user_name)
        result.append(data)
    return result


@router.post("/submit", status_code=201)
@limiter.limit(settings.RATE_LIMIT_SUBMIT)
async def submit_feedback(
    request: Request,
    title: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    location: Optional[str] = Form(None),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    priority: str = Form("medium"),
    is_anonymous: bool = Form(False),
    photo: Optional[UploadFile] = File(None),
    current_user=Depends(optional_auth),
    db: Session = Depends(get_db)
):
    data = parse_form(FeedbackCreate, title=title, category=category, description=description,
                      location=location, latitude=latitude, longitude=longitude,
                      priority=priority, is_anonymous=is_anonymous)
    photo_path = await save_image(photo, "feedback")

    # Identity comes from the JWT (never the form), unless the user chose anonymity.
    identified = current_user is not None and not data.is_anonymous
    fb = Feedback(
        **data.model_dump(mode="json"),
        user_id=user_account_id(current_user) if identified else None,
        user_name=(getattr(current_user, "full_name", None) or getattr(current_user, "name", None)) if identified else None,
        user_email=current_user.email if identified else None,
        photo=photo_path,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return serialize_feedback_list(db, [fb])[0]


@router.get("/")
async def get_feedback_list(
    status: Optional[FeedbackStatus] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=100),
    sort: str = Query("newest", pattern="^(newest|oldest|priority|category)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    query = scope_feedback_query(db.query(Feedback), current_user)
    if status:
        query = query.filter(Feedback.status == status)
    if category:
        query = query.filter(Feedback.category == category)
    if priority:
        query = query.filter(Feedback.priority == priority)
    if search:
        query = query.filter(or_(Feedback.title.ilike(f"%{search}%"), Feedback.description.ilike(f"%{search}%")))

    order = {"newest": desc(Feedback.created_at), "oldest": Feedback.created_at,
             "priority": Feedback.priority, "category": Feedback.category}[sort]
    query = query.order_by(order)

    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": serialize_feedback_list(db, items)}


@router.get("/stats/summary")
async def get_feedback_stats(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """Counts over the feedback the caller may see."""
    base = scope_feedback_query(db.query(Feedback), current_user)
    return {
        "total": base.count(),
        "pending": base.filter(Feedback.status == FeedbackStatus.PENDING).count(),
        "resolved": base.filter(Feedback.status == FeedbackStatus.RESOLVED).count(),
    }


@router.get("/{feedback_id}")
async def get_feedback(feedback_id: int, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    fb = scope_feedback_query(db.query(Feedback), current_user).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return serialize_feedback_list(db, [fb])[0]


@router.patch("/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    data: FeedbackUpdate,
    current_user=Depends(require_permission("feedback.manage")),
    db: Session = Depends(get_db)
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if data.status:
        fb.status = data.status
        if data.status == FeedbackStatus.RESOLVED:
            fb.resolved_at = utc_now()
    if data.admin_notes:
        fb.admin_notes = data.admin_notes
    if data.priority:
        fb.priority = data.priority.value

    db.commit()
    db.refresh(fb)
    return serialize_feedback_list(db, [fb])[0]
