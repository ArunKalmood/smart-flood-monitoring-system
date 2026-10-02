from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


class SensorCreate(BaseModel):
    sensor_id: str
    name: str
    type: Optional[str] = "water_level"
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    unit: Optional[str] = "m"
    battery_level: Optional[float] = 100.0
    firmware_version: Optional[str] = "1.0.0"

    @field_validator("latitude", "longitude", "battery_level", mode="before")
    @classmethod
    def empty_to_none_sensor(cls, v):
        return None if v == "" or v is None else v


class SensorDataCreate(BaseModel):
    sensor_id: str
    water_level: Optional[float] = None
    rainfall: Optional[float] = None
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    river_flow: Optional[float] = None
    battery_level: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator(
        "water_level", "rainfall", "temperature", "humidity",
        "river_flow", "battery_level", "latitude", "longitude",
        mode="before"
    )
    @classmethod
    def empty_to_none_readings(cls, v):
        return None if v == "" or v is None else v


class PredictionCreate(BaseModel):
    sensor_id: Optional[int] = None
    water_level: float
    rainfall: float
    temperature: float
    humidity: float
    river_flow: Optional[float] = None

    @field_validator("sensor_id", "river_flow", mode="before")
    @classmethod
    def empty_to_none_pred(cls, v):
        return None if v == "" or v is None else v


class SOSCreate(BaseModel):
    name: str
    phone: str
    emergency_type: str
    description: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def empty_to_none_lat_lng(cls, v):
        return None if v == "" or v is None else v


class SOSUpdate(BaseModel):
    status: Optional[str] = None
    assigned_team: Optional[str] = None
    notes: Optional[str] = None


class FeedbackCreate(BaseModel):
    title: str
    category: str
    description: str
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    priority: str = "medium"
    is_anonymous: bool = False
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def empty_to_none_lat_lng(cls, v):
        return None if v == "" or v is None else v


class FeedbackUpdate(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    priority: Optional[str] = None


class VolunteerCreate(BaseModel):
    full_name: str
    email: str
    phone: str
    blood_group: Optional[str] = None
    skills: Optional[List[str]] = []
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    availability: bool = True
    organization: Optional[str] = None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def empty_to_none_lat_lng(cls, v):
        return None if v == "" or v is None else v


class EvacuationCenterCreate(BaseModel):
    name: str
    address: Optional[str] = None
    capacity: int = 0
    current_occupancy: int = 0
    food_available: bool = False
    medical_available: bool = False
    contact_number: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = "open"
    notes: Optional[str] = None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def empty_to_none_lat_lng(cls, v):
        return None if v == "" or v is None else v

    @field_validator("capacity", "current_occupancy", mode="before")
    @classmethod
    def empty_to_zero(cls, v):
        return 0 if v == "" or v is None else v


class ResourceCreate(BaseModel):
    name: str
    type: str
    quantity_total: int = 0
    quantity_available: int = 0
    current_location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    assigned_team: Optional[str] = None
    is_available: bool = True
    notes: Optional[str] = None

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def empty_to_none_lat_lng(cls, v):
        return None if v == "" or v is None else v

    @field_validator("quantity_total", "quantity_available", mode="before")
    @classmethod
    def empty_to_zero(cls, v):
        return 0 if v == "" or v is None else v


class AlertCreate(BaseModel):
    title: str
    message: str
    type: Optional[str] = "flood_warning"
    severity: str = "medium"
    affected_area: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: Optional[float] = None

    @field_validator("latitude", "longitude", "radius_km", mode="before")
    @classmethod
    def empty_to_none_numbers(cls, v):
        return None if v == "" or v is None else v
