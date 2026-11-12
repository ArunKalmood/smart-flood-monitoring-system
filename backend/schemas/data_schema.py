from typing import Annotated, List, Optional

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, model_validator

from models.evacuation_center import CenterStatus
from models.feedback import FeedbackCategory, FeedbackPriority, FeedbackStatus
from models.sensor import SensorType
from models.sos import EmergencyType, SOSStatus
from schemas.validators import (
    Latitude, Longitude, OptionalPhone, OptionalText, Phone, empty_to_none, optional_number, optional_text, reading,
)

NonNegativeInt = Annotated[int, BeforeValidator(lambda v: 0 if v in ("", None) else v), Field(0, ge=0)]


class SensorCreate(BaseModel):
    sensor_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=150)
    type: SensorType = SensorType.WATER_LEVEL
    location: OptionalText = None
    latitude: Latitude = None
    longitude: Longitude = None
    unit: OptionalText = None            # None → the frontend shows the default unit for the type
    firmware_version: OptionalText = None

    @model_validator(mode="after")
    def both_coordinates_or_neither(self) -> "SensorCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither")
        return self


class SensorDataCreate(BaseModel):
    """Reading posted by an IoT device. Out-of-range values are rejected (422)."""
    sensor_id: str = Field(..., min_length=1, max_length=50)
    water_level: reading("water_level") = None
    rainfall: reading("rainfall") = None
    temperature: reading("temperature") = None
    humidity: reading("humidity") = None
    river_flow: reading("river_flow") = None
    battery_level: reading("battery_level") = None
    latitude: Latitude = None
    longitude: Longitude = None

    @model_validator(mode="after")
    def both_coordinates_or_neither(self) -> "SensorDataCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither")
        return self


class PredictionCreate(BaseModel):
    """What-if simulation inputs (same physical ranges as sensor ingestion)."""
    water_level: reading("water_level", required=True)
    rainfall: reading("rainfall", required=True)
    temperature: reading("temperature", required=True)
    humidity: reading("humidity", required=True)
    river_flow: reading("river_flow") = None


class SOSCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    phone: Phone
    emergency_type: EmergencyType
    description: optional_text(1000) = None
    location: optional_text(300) = None
    latitude: Latitude = None
    longitude: Longitude = None

    @model_validator(mode="after")
    def both_coordinates_or_neither(self) -> "SOSCreate":
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither")
        return self


class SOSUpdate(BaseModel):
    status: Optional[SOSStatus] = None
    assigned_team: optional_text(200) = None
    notes: optional_text(1000) = None


class FeedbackCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    category: FeedbackCategory
    description: str = Field(..., min_length=5, max_length=2000)
    location: optional_text(300) = None
    latitude: Latitude = None
    longitude: Longitude = None
    priority: FeedbackPriority = FeedbackPriority.MEDIUM
    is_anonymous: bool = False


class FeedbackUpdate(BaseModel):
    status: Optional[FeedbackStatus] = None
    admin_notes: optional_text(2000) = None
    priority: Optional[FeedbackPriority] = None


BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
VOLUNTEER_SKILLS = ("medical", "rescue", "cooking", "driving", "boat_handling")


class VolunteerCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: Phone
    blood_group: Annotated[Optional[str], BeforeValidator(empty_to_none)] = None
    skills: List[str] = []
    location: optional_text(200) = None
    latitude: Latitude = None
    longitude: Longitude = None
    availability: bool = True
    organization: optional_text(200) = None

    @model_validator(mode="after")
    def known_values(self) -> "VolunteerCreate":
        if self.blood_group is not None and self.blood_group not in BLOOD_GROUPS:
            raise ValueError(f"Blood group must be one of: {', '.join(BLOOD_GROUPS)}")
        unknown = [s for s in self.skills if s not in VOLUNTEER_SKILLS]
        if unknown:
            raise ValueError(f"Unknown skills: {', '.join(unknown)}")
        return self


class EvacuationCenterCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    address: optional_text(300) = None
    capacity: NonNegativeInt = 0
    current_occupancy: NonNegativeInt = 0
    food_available: bool = False
    medical_available: bool = False
    contact_number: OptionalPhone = None
    latitude: Latitude = None
    longitude: Longitude = None
    status: CenterStatus = CenterStatus.OPEN
    notes: OptionalText = None

    @model_validator(mode="after")
    def occupancy_within_capacity(self) -> "EvacuationCenterCreate":
        if self.current_occupancy > self.capacity:
            raise ValueError("Current occupancy cannot exceed capacity")
        return self


RESOURCE_TYPES = ("boat", "ambulance", "food_kit", "medical_kit", "volunteer", "police", "fire_department")


class ResourceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    type: str
    quantity_total: NonNegativeInt = 0
    quantity_available: NonNegativeInt = 0
    current_location: optional_text(300) = None
    latitude: Latitude = None
    longitude: Longitude = None
    assigned_team: optional_text(200) = None
    is_available: bool = True
    notes: OptionalText = None

    @model_validator(mode="after")
    def consistent(self) -> "ResourceCreate":
        if self.type not in RESOURCE_TYPES:
            raise ValueError(f"Resource type must be one of: {', '.join(RESOURCE_TYPES)}")
        if self.quantity_available > self.quantity_total:
            raise ValueError("Available quantity cannot exceed the total")
        return self


class AlertCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    message: str = Field(..., min_length=3, max_length=2000)
    type: Annotated[Optional[str], BeforeValidator(empty_to_none)] = "flood_warning"
    severity: str = Field("medium", pattern="^(low|medium|high|critical)$")
    affected_area: optional_text(300) = None
    latitude: Latitude = None
    longitude: Longitude = None
    radius_km: optional_number(gt=0, le=500) = None
