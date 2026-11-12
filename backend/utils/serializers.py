"""
Helpers for turning ORM rows into response dicts.

Routes should return these dicts rather than ORM objects so that secret
columns (password/key hashes) can never leak into a response, and so that
personal data can be masked per role.
"""
import enum
from datetime import datetime

# Columns that must never appear in any API response or report.
SENSITIVE_COLUMNS = frozenset({"password_hash", "device_key_hash", "token_hash"})


def model_to_dict(obj, exclude=()) -> dict:
    out = {}
    for col in obj.__table__.columns:
        if col.name in SENSITIVE_COLUMNS or col.name in exclude:
            continue
        val = getattr(obj, col.name)
        if isinstance(val, enum.Enum):
            val = val.value
        elif isinstance(val, datetime):
            val = val.isoformat()
        out[col.name] = val
    return out


def mask_phone(phone):
    """'+91 98765 43210' -> '+91 98XXXXXX10'. Keeps the country code, first 2 and last 2 digits."""
    if not phone:
        return phone
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    prefix = ""
    if str(phone).strip().startswith("+") and len(digits) > 10:
        prefix = "+" + digits[:-10] + " "
        digits = digits[-10:]
    if len(digits) <= 4:
        return prefix + "X" * len(digits)
    return prefix + digits[:2] + "X" * (len(digits) - 4) + digits[-2:]
