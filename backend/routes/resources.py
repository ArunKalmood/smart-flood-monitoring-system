from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.evacuation_center import EvacuationCenter, Resource, Alert
from schemas.data_schema import EvacuationCenterCreate, ResourceCreate, AlertCreate
from auth.jwt_handler import get_current_user
from datetime import datetime

# --- Evacuation Centers ---
evac_router = APIRouter(prefix="/evacuation-centers")

@evac_router.get("/")
async def get_centers(db: Session = Depends(get_db)):
    return db.query(EvacuationCenter).all()


@evac_router.get("/map-data")
async def get_centers_map(db: Session = Depends(get_db)):
    centers = db.query(EvacuationCenter).filter(EvacuationCenter.status != "closed").all()
    return [
        {
            "id": c.id, "name": c.name, "latitude": c.latitude, "longitude": c.longitude,
            "capacity": c.capacity, "current_occupancy": c.current_occupancy,
            "status": c.status.value if hasattr(c.status, 'value') else c.status,
            "food_available": c.food_available, "medical_available": c.medical_available,
            "contact_number": c.contact_number
        }
        for c in centers if c.latitude and c.longitude
    ]


@evac_router.post("/", status_code=201)
async def create_center(data: EvacuationCenterCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    center = EvacuationCenter(**data.model_dump())
    db.add(center)
    db.commit()
    db.refresh(center)
    return center


@evac_router.put("/{center_id}")
async def update_center(center_id: int, data: EvacuationCenterCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    center = db.query(EvacuationCenter).filter(EvacuationCenter.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(center, key, val)
    center.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(center)
    return center


@evac_router.delete("/{center_id}")
async def delete_center(center_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    center = db.query(EvacuationCenter).filter(EvacuationCenter.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Center not found")
    db.delete(center)
    db.commit()
    return {"message": "Center deleted"}


# --- Resources ---
resource_router = APIRouter(prefix="/resources")

@resource_router.get("/")
async def get_resources(type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Resource)
    if type:
        query = query.filter(Resource.type == type)
    return query.all()


@resource_router.post("/", status_code=201)
async def create_resource(data: ResourceCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    resource = Resource(**data.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@resource_router.put("/{resource_id}")
async def update_resource(resource_id: int, data: ResourceCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(resource, key, val)
    resource.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(resource)
    return resource


@resource_router.delete("/{resource_id}")
async def delete_resource(resource_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.delete(resource)
    db.commit()
    return {"message": "Resource deleted"}


# --- Alerts ---
alert_router = APIRouter(prefix="/alerts")

@alert_router.get("/")
async def get_alerts(active_only: bool = True, db: Session = Depends(get_db)):
    query = db.query(Alert)
    if active_only:
        query = query.filter(Alert.is_active == True)
    return query.order_by(desc(Alert.created_at)).all()


@alert_router.post("/", status_code=201)
async def create_alert(data: AlertCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    alert = Alert(**data.model_dump())
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@alert_router.patch("/{alert_id}/deactivate")
async def deactivate_alert(alert_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    db.commit()
    return {"message": "Alert deactivated"}
