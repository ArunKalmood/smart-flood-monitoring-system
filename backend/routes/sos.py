from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session

from auth.permissions import optional_auth, require_auth, require_permission, user_account_id
from database.connection import get_db
from models.sos import ACTIVE_SOS_STATUSES, SOS, SOSStatus, SOSStatusHistory
from schemas.data_schema import SOSCreate, SOSUpdate
from services.sos import (
    change_status, history_to_dict, scope_sos_query, serialize_sos, serialize_sos_list, status_of,
)
from utils.audit import log_action
from utils.config import settings
from utils.forms import parse_form
from utils.rate_limit import limiter
from utils.serializers import model_to_dict
from utils.uploads import save_image

router = APIRouter(prefix="/sos", tags=["SOS Emergency"])


@router.post("/submit", status_code=201)
@limiter.limit(settings.RATE_LIMIT_SUBMIT)
async def submit_sos(
    request: Request,
    name: str = Form(...),
    phone: str = Form(...),
    emergency_type: str = Form(...),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    current_user=Depends(optional_auth),
    db: Session = Depends(get_db)
):
    data = parse_form(SOSCreate, name=name, phone=phone, emergency_type=emergency_type,
                      description=description, location=location, latitude=latitude, longitude=longitude)
    photo_path = await save_image(photo, "sos")

    sos = SOS(
        **data.model_dump(mode="json"),
        photo=photo_path,
        user_id=user_account_id(current_user),  # from the JWT, never from the form
    )
    db.add(sos)
    db.commit()
    db.refresh(sos)
    return model_to_dict(sos)


@router.get("/")
async def get_all_sos(
    status: Optional[SOSStatus] = None,
    emergency_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    query = scope_sos_query(db.query(SOS), current_user).order_by(desc(SOS.created_at))
    if status:
        query = query.filter(SOS.status == status)
    if emergency_type:
        query = query.filter(SOS.emergency_type == emergency_type)
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": serialize_sos_list(db, items, current_user)}


@router.get("/map-data")
async def get_sos_map_data(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """Active SOS locations for map display (scoped to what the caller may see)"""
    active = scope_sos_query(db.query(SOS), current_user).filter(SOS.status.in_(ACTIVE_SOS_STATUSES)).all()
    return [
        {
            "id": s.id, "name": s.name, "phone": serialize_sos(s, current_user)["phone"],
            "emergency_type": s.emergency_type,
            "status": status_of(s).value,
            "latitude": s.latitude, "longitude": s.longitude,
            "location": s.location, "created_at": model_to_dict(s)["created_at"],
        }
        for s in active if s.latitude is not None and s.longitude is not None
    ]


@router.get("/stats")
async def get_sos_stats(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """Counts over the SOS requests the caller may see. `active` = pending + accepted + in_progress."""
    base = scope_sos_query(db.query(SOS), current_user)
    counts = {s.value: base.filter(SOS.status == s).count() for s in SOSStatus}
    return {
        "total": base.count(),
        "active": sum(counts[s.value] for s in ACTIVE_SOS_STATUSES),
        **counts,
    }


@router.get("/{sos_id}")
async def get_sos(sos_id: int, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    sos = scope_sos_query(db.query(SOS), current_user).filter(SOS.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")
    return serialize_sos_list(db, [sos], current_user)[0]


@router.get("/{sos_id}/history")
async def get_sos_history(sos_id: int, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    """Status change trail: who changed it, when, and any note."""
    sos = scope_sos_query(db.query(SOS), current_user).filter(SOS.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")
    rows = (db.query(SOSStatusHistory).filter(SOSStatusHistory.sos_id == sos_id)
            .order_by(SOSStatusHistory.changed_at).all())
    return [history_to_dict(r) for r in rows]


@router.patch("/{sos_id}/status")
async def update_sos_status(
    sos_id: int,
    data: SOSUpdate,
    request: Request,
    current_user=Depends(require_permission("sos.update_status")),
    db: Session = Depends(get_db)
):
    sos = scope_sos_query(db.query(SOS), current_user).filter(SOS.id == sos_id).first()
    if not sos:
        raise HTTPException(status_code=404, detail="SOS request not found")

    before = {"status": status_of(sos).value, "assigned_team": sos.assigned_team, "notes": sos.notes}

    if data.status:
        change_status(db, sos, data.status, current_user, note=data.notes)
    if data.assigned_team:
        sos.assigned_team = data.assigned_team
    if data.notes:
        sos.notes = data.notes

    log_action(db, current_user, "SOS_STATUS_UPDATE",
               resource="sos_requests", resource_id=sos_id,
               before=before,
               after={"status": status_of(sos).value, "assigned_team": sos.assigned_team, "notes": sos.notes},
               ip_address=request.client.host if request.client else None)

    db.commit()
    db.refresh(sos)
    return serialize_sos_list(db, [sos], current_user)[0]
