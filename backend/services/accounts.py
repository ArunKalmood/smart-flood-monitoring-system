"""One serialized shape for user and admin accounts (login, register, profile)."""
from auth.permissions import is_admin_account
from utils.notification_prefs import prefs_for
from utils.timeutil import iso


def serialize_account(account) -> dict:
    common = {
        "id": account.id,
        "email": account.email,
        "role": account.role.value if hasattr(account.role, "value") else account.role,
        "is_active": account.is_active,
        "language": account.language,
        "theme": account.theme,
        "notification_prefs": prefs_for(account),
        "last_login": iso(account.last_login),
        "created_at": iso(account.created_at),
    }
    if is_admin_account(account):
        return {**common, "full_name": account.name, "name": account.name,
                "department": account.department, "user_type": "admin"}
    return {
        **common,
        "full_name": account.full_name,
        "name": account.full_name,
        "phone": account.phone,
        "address": account.address,
        "city": account.city,
        "state": account.state,
        "pin_code": account.pin_code,
        "is_verified": account.is_verified,
        "auth_provider": getattr(account, "auth_provider", "local"),
        "user_type": "user",
    }
