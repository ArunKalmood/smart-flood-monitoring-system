from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.evacuation_center import Alert, CenterStatus, EvacuationCenter, Resource
from schemas.data_schema import EvacuationCenterCreate, ResourceCreate, AlertCreate
from auth.permissions import require_auth, require_permission
from utils.serializers import model_to_dict

# --- Evacuation Centers ---
evac_router = APIRouter(prefix="/evacuation-centers")

@evac_router.get("/")
async def get_centers(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    return [model_to_dict(c) for c in db.query(EvacuationCenter).order_by(EvacuationCenter.name).all()]


@evac_router.get("/map-data")
async def get_centers_map(current_user=Depends(require_auth), db: Session = Depends(get_db)):
    centers = db.query(EvacuationCenter).filter(EvacuationCenter.status != CenterStatus.CLOSED).all()
    fields = ("id", "name", "latitude", "longitude", "capacity", "current_occupancy", "status",
              "food_available", "medical_available", "contact_number")
    return [{k: v for k, v in model_to_dict(c).items() if k in fields}
            for c in centers if c.latitude is not None and c.longitude is not None]


@evac_router.post("/", status_code=201)
async def create_center(data: EvacuationCenterCreate, current_user=Depends(require_permission("evacuation.manage")), db: Session = Depends(get_db)):
    center = EvacuationCenter(**data.model_dump(mode="json"))
    db.add(center)
    db.commit()
    db.refresh(center)
    return model_to_dict(center)


@evac_router.put("/{center_id}")
async def update_center(center_id: int, data: EvacuationCenterCreate, current_user=Depends(require_permission("evacuation.manage")), db: Session = Depends(get_db)):
    center = db.query(EvacuationCenter).filter(EvacuationCenter.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    for key, val in data.model_dump(mode="json", exclude_unset=True).items():
        setattr(center, key, val)
    db.commit()
    db.refresh(center)
    return model_to_dict(center)


@evac_router.delete("/{center_id}")
async def delete_center(center_id: int, current_user=Depends(require_permission("evacuation.manage")), db: Session = Depends(get_db)):
    center = db.query(EvacuationCenter).filter(EvacuationCenter.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    db.delete(center)
    db.commit()
    return {"message": "Center deleted"}


# --- Resources ---
resource_router = APIRouter(prefix="/resources")

@resource_router.get("/")
async def get_resources(type: Optional[str] = None, current_user=Depends(require_permission("resources.view")), db: Session = Depends(get_db)):
    query = db.query(Resource)
    if type:
        query = query.filter(Resource.type == type)
    return [model_to_dict(r) for r in query.order_by(Resource.name).all()]


@resource_router.post("/", status_code=201)
async def create_resource(data: ResourceCreate, current_user=Depends(require_permission("resources.manage")), db: Session = Depends(get_db)):
    resource = Resource(**data.model_dump(mode="json"))
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return model_to_dict(resource)


@resource_router.put("/{resource_id}")
async def update_resource(resource_id: int, data: ResourceCreate, current_user=Depends(require_permission("resources.manage")), db: Session = Depends(get_db)):
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    for key, val in data.model_dump(mode="json", exclude_unset=True).items():
        setattr(resource, key, val)
    db.commit()
    db.refresh(resource)
    return model_to_dict(resource)


@resource_router.delete("/{resource_id}")
async def delete_resource(resource_id: int, current_user=Depends(require_permission("resources.manage")), db: Session = Depends(get_db)):
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.delete(resource)
    db.commit()
    return {"message": "Resource deleted"}


# --- Alerts ---
alert_router = APIRouter(prefix="/alerts")

@alert_router.get("/")
async def get_alerts(active_only: bool = True, current_user=Depends(require_auth), db: Session = Depends(get_db)):
    query = db.query(Alert)
    if active_only:
        query = query.filter(Alert.is_active.is_(True))
    return [model_to_dict(a) for a in query.order_by(desc(Alert.created_at)).all()]


@alert_router.post("/", status_code=201)
async def create_alert(data: AlertCreate, current_user=Depends(require_permission("alerts.manage")), db: Session = Depends(get_db)):
    alert = Alert(**data.model_dump(mode="json"))
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return model_to_dict(alert)


@alert_router.patch("/{alert_id}/deactivate")
async def deactivate_alert(alert_id: int, current_user=Depends(require_permission("alerts.manage")), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    db.commit()
    return {"message": "Alert deactivated"}
