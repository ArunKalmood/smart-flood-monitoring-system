from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Optional
from database.connection import get_db
from models.volunteer import VOLUNTEER_TRANSITIONS, Volunteer, VolunteerStatus
from schemas.data_schema import VolunteerCreate
from auth.permissions import require_permission, has_permission
from utils.audit import log_action
from utils.config import settings
from utils.rate_limit import limiter
from utils.serializers import model_to_dict, mask_phone

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


def serialize_volunteer(v, user) -> dict:
    data = model_to_dict(v)
    if not has_permission(user.effective_role, "contact.view_full"):
        data["phone"] = mask_phone(v.phone)
        data["blood_group"] = None
    return data


@router.post("/register", status_code=201)
@limiter.limit(settings.RATE_LIMIT_SUBMIT)
async def register_volunteer(request: Request, data: VolunteerCreate, db: Session = Depends(get_db)):
    existing = db.query(Volunteer).filter(Volunteer.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered as volunteer")

    volunteer = Volunteer(**data.model_dump(mode="json"))
    db.add(volunteer)
    db.commit()
    db.refresh(volunteer)
    return model_to_dict(volunteer)


@router.get("/")
async def get_volunteers(
    status: Optional[str] = None,
    availability: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(require_permission("volunteers.view")),
    db: Session = Depends(get_db)
):
    query = db.query(Volunteer)
    if status:
        query = query.filter(Volunteer.status == status)
    if availability is not None:
        query = query.filter(Volunteer.availability == availability)
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": [serialize_volunteer(v, current_user) for v in items]}


@router.get("/stats")
async def get_volunteer_stats(current_user=Depends(require_permission("volunteers.view")), db: Session = Depends(get_db)):
    total = db.query(Volunteer).count()
    approved = db.query(Volunteer).filter(Volunteer.status == VolunteerStatus.APPROVED).count()
    pending = db.query(Volunteer).filter(Volunteer.status == VolunteerStatus.PENDING).count()
    available = db.query(Volunteer).filter(
        Volunteer.status == VolunteerStatus.APPROVED,
        Volunteer.availability.is_(True)
    ).count()
    return {"total": total, "approved": approved, "pending": pending, "available": available}


@router.get("/{volunteer_id}")
async def get_volunteer(volunteer_id: int, current_user=Depends(require_permission("volunteers.view")), db: Session = Depends(get_db)):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return serialize_volunteer(v, current_user)


@router.patch("/{volunteer_id}/status")
async def update_volunteer_status(
    volunteer_id: int,
    status: VolunteerStatus,
    request: Request,
    current_user=Depends(require_permission("volunteers.approve")),
    db: Session = Depends(get_db)
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    current = VolunteerStatus(v.status.value if hasattr(v.status, "value") else v.status)
    if status not in VOLUNTEER_TRANSITIONS[current]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot change volunteer status from '{current.value}' to '{status.value}'")
    v.status = status
    log_action(db, current_user, "VOLUNTEER_STATUS_UPDATE",
               resource="volunteers", resource_id=volunteer_id,
               before={"status": current.value}, after={"status": status.value},
               ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(v)
    return serialize_volunteer(v, current_user)
