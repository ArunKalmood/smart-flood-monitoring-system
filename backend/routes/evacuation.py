from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field

from database.connection import get_db
from auth.permissions import require_auth
from services.evacuation_service import (
    get_nearby_verified_shelters,
    recommend_safe_evacuation_route,
)

router = APIRouter(prefix="/evacuation", tags=["Intelligent Evacuation & Safe Routing"])


class RecommendRouteRequest(BaseModel):
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    center_id: int
    avoid_hazards: bool = True


@router.get("/nearby-centres")
async def nearby_evacuation_centres(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    radius_km: float = Query(50.0, ge=1.0, le=500.0),
    limit: int = Query(5, ge=1, le=20),
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Identifies verified, operational evacuation centres near the user's GPS coordinates.
    Filters out closed or full shelters, calculates distances, and suggests alternatives.
    """
    return get_nearby_verified_shelters(
        db=db,
        user_lat=latitude,
        user_lng=longitude,
        radius_km=radius_km,
        limit=limit,
    )


@router.post("/recommend-route")
async def recommend_route(
    payload: RecommendRouteRequest,
    current_user=Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Calculates the safest available evacuation route between user location and chosen shelter.
    Identifies and evaluates road geometry against active flood danger zones.
    """
    result = recommend_safe_evacuation_route(
        db=db,
        user_lat=payload.latitude,
        user_lng=payload.longitude,
        center_id=payload.center_id,
        avoid_hazards=payload.avoid_hazards,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
