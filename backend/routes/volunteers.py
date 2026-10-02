from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.volunteer import Volunteer, VolunteerStatus
from schemas.data_schema import VolunteerCreate
from auth.jwt_handler import get_current_user
from utils.audit import log_action
from datetime import datetime

router = APIRouter(prefix="/volunteers", tags=["Volunteers"])


@router.post("/register", status_code=201)
async def register_volunteer(data: VolunteerCreate, db: Session = Depends(get_db)):
    existing = db.query(Volunteer).filter(Volunteer.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered as volunteer")

    volunteer = Volunteer(**data.model_dump())
    db.add(volunteer)
    db.commit()
    db.refresh(volunteer)
    return volunteer


@router.get("/")
async def get_volunteers(
    status: Optional[str] = None,
    availability: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Volunteer)
    if status:
        query = query.filter(Volunteer.status == status)
    if availability is not None:
        query = query.filter(Volunteer.availability == availability)
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/stats")
async def get_volunteer_stats(db: Session = Depends(get_db)):
    total = db.query(Volunteer).count()
    approved = db.query(Volunteer).filter(Volunteer.status == VolunteerStatus.APPROVED).count()
    pending = db.query(Volunteer).filter(Volunteer.status == VolunteerStatus.PENDING).count()
    available = db.query(Volunteer).filter(
        Volunteer.status == VolunteerStatus.APPROVED,
        Volunteer.availability == True
    ).count()
    return {"total": total, "approved": approved, "pending": pending, "available": available}


@router.get("/{volunteer_id}")
async def get_volunteer(volunteer_id: int, db: Session = Depends(get_db)):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return v


@router.patch("/{volunteer_id}/status")
async def update_volunteer_status(
    volunteer_id: int,
    status: str,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    valid_statuses = [s.value for s in VolunteerStatus]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}. Allowed values: {', '.join(valid_statuses)}")
    before = {"status": v.status.value if hasattr(v.status, "value") else v.status}
    v.status = status
    v.updated_at = datetime.utcnow()
    log_action(db, current_user, "VOLUNTEER_STATUS_UPDATE",
               resource="volunteers", resource_id=volunteer_id,
               before=before, after={"status": status},
               ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(v)
    return v
