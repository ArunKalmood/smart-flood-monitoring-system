"""
Intelligent nearby evacuation center detection and safe route recommendations.
Integrates with the shelter database, active alerts, sensors, and OSRM routing.
"""
import math
import logging
from typing import List, Dict, Any, Optional, Tuple
import httpx
from sqlalchemy.orm import Session

from models.evacuation_center import EvacuationCenter, CenterStatus, Alert
from models.sensor import Sensor
from models.flood_data import Prediction
from utils.timeutil import utc_now

logger = logging.getLogger(__name__)

# Standard Indian Disaster Emergency Helplines
EMERGENCY_CONTACTS = [
    {"name": "National Emergency Helpline", "number": "112", "type": "National Universal Helpline"},
    {"name": "NDRF (Disaster Response)", "number": "1078", "type": "National Disaster Helpline"},
    {"name": "State Disaster Management", "number": "1070", "type": "State Helpline"},
    {"name": "District Disaster Helpline", "number": "1077", "type": "District Helpline"},
    {"name": "Ambulance", "number": "108", "type": "Medical Emergency"},
    {"name": "Fire & Rescue", "number": "101", "type": "Emergency Services"},
    {"name": "Police", "number": "100", "type": "Law Enforcement"},
]

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


def is_valid_lat_lng(lat: Any, lng: Any) -> bool:
    try:
        if lat is None or lng is None:
            return False
        n_lat = float(lat)
        n_lng = float(lng)
        return -90.0 <= n_lat <= 90.0 and -180.0 <= n_lng <= 180.0
    except (ValueError, TypeError):
        return False


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> Optional[float]:
    if not is_valid_lat_lng(lat1, lon1) or not is_valid_lat_lng(lat2, lon2):
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, [float(lat1), float(lon1), float(lat2), float(lon2)])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.asin(math.sqrt(a))
    r = 6371.0
    return round(c * r, 2)


def get_nearby_verified_shelters(
    db: Session,
    user_lat: float,
    user_lng: float,
    radius_km: float = 50.0,
    limit: int = 5
) -> Dict[str, Any]:
    """
    Identifies verified, operational evacuation centres near the user coordinates.
    Filters out closed or full shelters, sorts by proximity, and returns details.
    """
    if not is_valid_lat_lng(user_lat, user_lng):
        return {
            "error": "Invalid user GPS coordinates provided.",
            "nearest_shelter": None,
            "alternative_shelters": [],
            "emergency_contacts": EMERGENCY_CONTACTS,
            "total_found": 0,
        }

    centers = db.query(EvacuationCenter).filter(
        EvacuationCenter.latitude.isnot(None),
        EvacuationCenter.longitude.isnot(None),
    ).all()

    suitable_centers = []
    for c in centers:
        if not is_valid_lat_lng(c.latitude, c.longitude):
            continue

        # Status must be OPEN
        status_val = c.status.value if hasattr(c.status, "value") else str(c.status).lower()
        if status_val != CenterStatus.OPEN.value:
            continue

        # Must have positive available capacity
        cap = int(c.capacity or 0)
        occ = int(c.current_occupancy or 0)
        available_spots = max(0, cap - occ)
        if cap <= 0 or available_spots <= 0:
            continue

        dist = haversine_distance_km(user_lat, user_lng, c.latitude, c.longitude)
        if dist is not None and dist <= radius_km:
            suitable_centers.append({
                "id": c.id,
                "name": c.name,
                "address": c.address or "Address on file",
                "latitude": c.latitude,
                "longitude": c.longitude,
                "distance_km": dist,
                "capacity": cap,
                "current_occupancy": occ,
                "available_spots": available_spots,
                "status": status_val,
                "food_available": bool(c.food_available),
                "medical_available": bool(c.medical_available),
                "contact_number": c.contact_number or "112",
                "notes": c.notes,
            })

    # Sort by distance
    suitable_centers.sort(key=lambda x: x["distance_km"])

    nearest = suitable_centers[0] if suitable_centers else None
    alternatives = suitable_centers[1:limit] if len(suitable_centers) > 1 else []

    message = (
        f"Found {len(suitable_centers)} verified, operational evacuation shelter(s) within {radius_km} km."
        if suitable_centers
        else f"No verified evacuation shelters with open capacity found within {radius_km} km. Contact emergency services immediately."
    )

    return {
        "user_location": {"latitude": user_lat, "longitude": user_lng},
        "search_radius_km": radius_km,
        "total_found": len(suitable_centers),
        "nearest_shelter": nearest,
        "alternative_shelters": alternatives,
        "emergency_contacts": EMERGENCY_CONTACTS,
        "message": message,
    }


def _get_active_hazards(db: Session) -> List[Dict[str, Any]]:
    """Gather active flood alerts and critical sensors to check against routes."""
    hazards = []

    # Active alerts
    now = utc_now()
    alerts = db.query(Alert).filter(
        Alert.is_active.is_(True),
        Alert.latitude.isnot(None),
        Alert.longitude.isnot(None),
    ).all()
    for a in alerts:
        if a.expires_at and a.expires_at < now:
            continue
        hazards.append({
            "type": "alert",
            "name": a.title,
            "severity": a.severity or "high",
            "latitude": a.latitude,
            "longitude": a.longitude,
            "radius_km": float(a.radius_km or 2.0),
        })

    # Sensors in danger / critical state
    danger_sensors = db.query(Sensor).filter(
        Sensor.is_active.is_(True),
        Sensor.latitude.isnot(None),
        Sensor.longitude.isnot(None),
    ).all()
    for s in danger_sensors:
        val = s.current_value or 0
        if val >= 5.0:  # High/danger water level
            hazards.append({
                "type": "danger_sensor",
                "name": f"Sensor {s.name or s.sensor_id} (Water level {val}m)",
                "severity": "critical" if val >= 8.0 else "high",
                "latitude": s.latitude,
                "longitude": s.longitude,
                "radius_km": 1.5,
            })

    return hazards


def recommend_safe_evacuation_route(
    db: Session,
    user_lat: float,
    user_lng: float,
    center_id: int,
    avoid_hazards: bool = True
) -> Dict[str, Any]:
    """
    Calculates the safest available evacuation route between user and shelter.
    Checks road safety, detects flood-prone/blocked hazard zones, and provides warnings.
    """
    if not is_valid_lat_lng(user_lat, user_lng):
        return {"error": "Invalid user GPS coordinates."}

    center = db.get(EvacuationCenter, center_id)
    if not center or not is_valid_lat_lng(center.latitude, center.longitude):
        return {"error": "Evacuation center not found or has invalid coordinates."}

    # Operational status check
    status_val = center.status.value if hasattr(center.status, "value") else str(center.status).lower()
    if status_val == CenterStatus.CLOSED.value:
        return {"error": "Selected evacuation center is currently closed. Please select an operational shelter."}

    dest_lat = float(center.latitude)
    dest_lng = float(center.longitude)
    direct_dist = haversine_distance_km(user_lat, user_lng, dest_lat, dest_lng) or 0.0

    # Default fallback straight-line route
    fallback_route = {
        "coordinates": [[user_lat, user_lng], [dest_lat, dest_lng]],
        "distance_km": round(direct_dist, 2),
        "duration_minutes": max(1, int(round((direct_dist / 30.0) * 60))),
        "is_road_route": False,
    }

    # Fetch driving route from OSRM
    route_data = fallback_route
    try:
        url = f"{OSRM_URL}/{user_lng},{user_lat};{dest_lng},{dest_lat}?overview=full&geometries=geojson"
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                body = resp.json()
                if body.get("code") == "Ok" and body.get("routes"):
                    first_route = body["routes"][0]
                    # GeoJSON is [lon, lat] -> convert to [lat, lon] for Leaflet
                    geo_coords = first_route.get("geometry", {}).get("coordinates", [])
                    lat_lng_coords = [[pt[1], pt[0]] for pt in geo_coords if len(pt) >= 2]
                    dist_km = round(first_route.get("distance", 0) / 1000.0, 2)
                    dur_min = max(1, int(round(first_route.get("duration", 0) / 60.0)))
                    if lat_lng_coords:
                        route_data = {
                            "coordinates": lat_lng_coords,
                            "distance_km": dist_km,
                            "duration_minutes": dur_min,
                            "is_road_route": True,
                        }
    except Exception as e:
        logger.warning(f"OSRM route fetch failed, using direct bearing fallback: {e}")

    # Check route points against active hazard zones
    hazards = _get_active_hazards(db) if avoid_hazards else []
    detected_hazards = []

    for pt in route_data["coordinates"]:
        p_lat, p_lng = pt[0], pt[1]
        for hz in hazards:
            d = haversine_distance_km(p_lat, p_lng, hz["latitude"], hz["longitude"])
            if d is not None and d <= hz["radius_km"]:
                if hz not in detected_hazards:
                    detected_hazards.append(hz)

    # Determine safety status
    if detected_hazards:
        has_critical = any(h.get("severity") == "critical" for h in detected_hazards)
        safety_status = "UNSAFE" if has_critical else "CAUTION"
        safety_notes = (
            f"WARNING: Route passes within {len(detected_hazards)} identified flood hazard zone(s). "
            "Road may be waterlogged or blocked. Exercise extreme caution or consider alternative routes."
        )
    elif route_data["is_road_route"]:
        safety_status = "UNVERIFIED_SAFETY"
        safety_notes = (
            "Road geometry calculated. NOTE: Real-time road flood status cannot be guaranteed 100%. "
            "Never attempt to drive or walk through moving floodwater. Follow local emergency personnel instructions."
        )
    else:
        safety_status = "UNVERIFIED_SAFETY"
        safety_notes = (
            "Direct bearing line shown (live road routing service unavailable). "
            "Road safety between location and shelter has NOT been verified. Proceed with utmost caution."
        )

    return {
        "center": {
            "id": center.id,
            "name": center.name,
            "address": center.address,
            "latitude": dest_lat,
            "longitude": dest_lng,
            "available_spots": max(0, int(center.capacity or 0) - int(center.current_occupancy or 0)),
            "contact_number": center.contact_number,
        },
        "user_location": {"latitude": user_lat, "longitude": user_lng},
        "route_coordinates": route_data["coordinates"],
        "distance_km": route_data["distance_km"],
        "duration_minutes": route_data["duration_minutes"],
        "is_road_route": route_data["is_road_route"],
        "safety_status": safety_status,  # SAFE, CAUTION, UNSAFE, UNVERIFIED_SAFETY
        "safety_notes": safety_notes,
        "hazards_detected": detected_hazards,
        "emergency_contacts": EMERGENCY_CONTACTS,
    }
