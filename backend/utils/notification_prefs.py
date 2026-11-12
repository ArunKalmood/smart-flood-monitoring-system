"""Per-account notification preferences (stored as JSON on users/admins)."""

DEFAULT_NOTIFICATION_PREFS = {
    "flood_warnings": True,
    "sos_updates": True,
    "volunteer_updates": True,
    "weather_alerts": True,
    "system_messages": True,
}


def prefs_for(account) -> dict:
    """Stored preferences merged over the defaults (unknown keys dropped)."""
    stored = getattr(account, "notification_prefs", None) or {}
    return {key: bool(stored.get(key, default)) for key, default in DEFAULT_NOTIFICATION_PREFS.items()}
