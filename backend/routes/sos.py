from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.sos import SOS, SOSStatus, EmergencyType
from schemas.data_schema import SOSCreate, SOSUpdate
from auth.jwt_handler import get_current_user
from utils.audit import log_action
from datetime import datetime
import os, aiofiles, uuid

router = APIRouter(prefix="/sos", tags=["SOS Emergency"])
UPLOAD_DIR = "uploads/sos"
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


@router.post("/submit", status_code=201)
async def submit_sos(
    name: str = Form(...),
    phone: str = Form(...),
    emergency_type: str = Form(...),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
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
            content = await photo.read()
            await f.write(content)
        photo_path = path

    sos = SOS(
        name=name, phone=phone,
        emergency_type=emergency_type,
        description=description,
        location=location,
        latitude=latitude,
        longitude=longitude,
        photo=photo_path,
    )
    db.add(sos)
    db.commit()
    db.refresh(sos)
    return sos


@router.get("/")
async def get_all_sos(
    status: Optional[str] = None,
    emergency_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(SOS).order_by(desc(SOS.created_at))
    if status:
        query = query.filter(SOS.status == status)
    if emergency_type:
        query = query.filter(SOS.emergency_type == emergency_type)
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/map-data")
async def get_sos_map_data(db: Session = Depends(get_db)):
    """Active SOS locations for map display"""
    active = db.query(SOS).filter(
        SOS.status.in_([SOSStatus.PENDING, SOSStatus.ACCEPTED])
    ).all()
    return [
        {
            "id": s.id, "name": s.name, "phone": s.phone,
            "emergency_type": s.emergency_type.value if hasattr(s.emergency_type, 'value') else s.emergency_type,
            "status": s.status.value if hasattr(s.status, 'value') else s.status,
            "latitude": s.latitude, "longitude": s.longitude,
            "location": s.location, "created_at": s.created_at
        }
        for s in active if s.latitude and s.longitude
    ]


@router.get("/stats")
async def get_sos_stats(db: Session = Depends(get_db)):
    total = db.query(SOS).count()
    pending = db.query(SOS).filter(SOS.status == SOSStatus.PENDING).count()
    accepted = db.query(SOS).filter(SOS.status == SOSStatus.ACCEPTED).count()
    rescued = db.query(SOS).filter(SOS.status == SOSStatus.RESCUED).count()
    return {"total": total, "pending": pending, "accepted": accepted, "rescued": rescued}


@router.get("/{sos_id}")
async def get_sos(sos_id: int, db: Session = Depends(get_db)):
    sos = db.query(SOS).filter(SOS.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")
    return sos


@router.patch("/{sos_id}/status")
async def update_sos_status(
    sos_id: int,
    data: SOSUpdate,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sos = db.query(SOS).filter(SOS.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")

    before = {"status": sos.status.value if hasattr(sos.status, "value") else sos.status,
              "assigned_team": sos.assigned_team, "notes": sos.notes}

    if data.status:
        sos.status = data.status
        if data.status == SOSStatus.RESCUED.value:
            sos.resolved_at = datetime.utcnow()
    if data.assigned_team:
        sos.assigned_team = data.assigned_team
    if data.notes:
        sos.notes = data.notes

    sos.updated_at = datetime.utcnow()

    after = {"status": sos.status.value if hasattr(sos.status, "value") else sos.status,
             "assigned_team": sos.assigned_team, "notes": sos.notes}

    log_action(db, current_user, "SOS_STATUS_UPDATE",
               resource="sos_requests", resource_id=sos_id,
               before=before, after=after,
               ip_address=request.client.host if request.client else None)

    db.commit()
    db.refresh(sos)
    return sos
