"""
Timezone handling: every timestamp in the system is timezone-aware UTC.

- `utc_now()` replaces `datetime.utcnow()` (which returns a naive value).
- `UTCDateTime` is the column type for every timestamp. It stores UTC and
  always returns aware UTC datetimes, so `.isoformat()` ends in "+00:00" and
  the frontend can convert to the viewer's local time.
  * PostgreSQL: TIMESTAMP WITH TIME ZONE.
  * SQLite (no timezone support): stored as naive UTC text; the timezone is
    re-attached on read. Rows written before this change were already naive
    UTC, so they need no rewrite.
"""
from datetime import datetime, timezone

from sqlalchemy.types import DateTime, TypeDecorator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value):
    """Aware UTC version of `value`; naive datetimes are taken to be UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso(value):
    """ISO-8601 string with offset, or None."""
    return as_utc(value).isoformat() if value is not None else None


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        value = as_utc(value)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value, dialect):
        return as_utc(value)
