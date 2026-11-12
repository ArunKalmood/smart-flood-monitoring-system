"""
Shared validation rules. The frontend mirrors these in src/utils/validation.js;
keep the two in step.
"""
import re
from typing import Annotated, Optional

from pydantic import AfterValidator, BeforeValidator, Field

# ── Phone: Indian mobile, optional +91 prefix ────────────────
PHONE_PATTERN = re.compile(r"^(\+91[\-\s]?)?[6-9]\d{9}$")
PHONE_MESSAGE = "Enter a valid 10-digit Indian mobile number (optionally starting with +91)"


def validate_phone(value: str) -> str:
    value = value.strip()
    if not PHONE_PATTERN.match(value):
        raise ValueError(PHONE_MESSAGE)
    return value


# ── Password policy ──────────────────────────────────────────
PASSWORD_MIN_LENGTH = 8
PASSWORD_RULES = [
    (re.compile(r".{%d,}" % PASSWORD_MIN_LENGTH), f"at least {PASSWORD_MIN_LENGTH} characters"),
    (re.compile(r"[A-Z]"), "an uppercase letter"),
    (re.compile(r"[a-z]"), "a lowercase letter"),
    (re.compile(r"\d"), "a number"),
    (re.compile(r"[^A-Za-z0-9]"), "a special character"),
]


def validate_password(value: str) -> str:
    missing = [label for pattern, label in PASSWORD_RULES if not pattern.search(value)]
    if missing:
        raise ValueError("Password must contain " + ", ".join(missing))
    return value


def empty_to_none(value):
    """HTML forms send "" for blank optional fields."""
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


# ── Reusable annotated types ─────────────────────────────────
# Constraints go on the inner type so that None (an omitted/blank field) is
# accepted without being checked against them.


def optional_text(max_length: int):
    """Optional string, blank → None, at most `max_length` characters."""
    return Annotated[Optional[Annotated[str, Field(max_length=max_length)]], BeforeValidator(empty_to_none)]


def optional_number(**constraints):
    """Optional float, blank → None, with Field constraints (ge/le/gt...)."""
    return Annotated[Optional[Annotated[float, Field(**constraints)]], BeforeValidator(empty_to_none)]


Phone = Annotated[str, AfterValidator(validate_phone)]
OptionalPhone = Annotated[Optional[Annotated[str, AfterValidator(validate_phone)]], BeforeValidator(empty_to_none)]
Password = Annotated[str, AfterValidator(validate_password)]
Latitude = optional_number(ge=-90, le=90)
Longitude = optional_number(ge=-180, le=180)
OptionalText = Annotated[Optional[str], BeforeValidator(empty_to_none)]
PinCode = Annotated[Optional[Annotated[str, Field(pattern=r"^\d{6}$")]], BeforeValidator(empty_to_none)]

# ── Physical sensor ranges (ingestion and simulation share them) ──
READING_RANGES = {
    "water_level": (0, 50),        # m
    "rainfall": (0, 500),          # mm/h
    "temperature": (-20, 60),      # °C
    "humidity": (0, 100),          # %
    "river_flow": (0, 30),         # m/s
    "battery_level": (0, 100),     # %
}


def reading(name: str, required: bool = False):
    low, high = READING_RANGES[name]
    if required:
        return Annotated[float, Field(ge=low, le=high)]
    return optional_number(ge=low, le=high)
