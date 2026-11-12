"""
Role-based access control.

PERMISSIONS is the single source of truth for who may do what. The frontend
mirrors it in frontend/src/config/permissions.js (tests/test_permissions.py
fails if the two drift apart).

Usage in a route:

    @router.patch("/{sos_id}/status")
    async def update(..., current_user=Depends(require_permission("sos.update_status"))):

The permission check runs as a dependency, i.e. before the route body looks
anything up, so an unauthorized caller always gets 403 (never 404).
"""
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from auth.jwt_handler import get_current_user, get_current_user_optional
from database.connection import get_db

# ── Roles ────────────────────────────────────────────────────
PUBLIC_USER = "public_user"
VOLUNTEER = "volunteer"
GOVERNMENT = "government_authority"
SUPER_ADMIN = "super_admin"
DISTRICT_ADMIN = "district_admin"
OPERATIONS = "operations"
ANALYST = "analyst"

ADMIN_ROLES = frozenset({SUPER_ADMIN, DISTRICT_ADMIN, OPERATIONS, ANALYST})
ALL_ROLES = frozenset({PUBLIC_USER, VOLUNTEER, GOVERNMENT}) | ADMIN_ROLES

# Roles a person may pick for themselves on public registration.
SELF_REGISTER_ROLES = frozenset({PUBLIC_USER, VOLUNTEER})
# Roles a super_admin may assign to a (non-admin) user account.
ASSIGNABLE_USER_ROLES = frozenset({PUBLIC_USER, VOLUNTEER, GOVERNMENT})

_STAFF = frozenset({GOVERNMENT, SUPER_ADMIN, DISTRICT_ADMIN, OPERATIONS})
_STAFF_AND_ANALYST = _STAFF | {ANALYST}

# ── Permission matrix ────────────────────────────────────────
PERMISSIONS = {
    # SOS
    "sos.submit":            ALL_ROLES,
    "sos.view_all":          _STAFF_AND_ANALYST,
    "sos.view_assigned":     frozenset({VOLUNTEER}),   # pending + ones they accepted
    "sos.update_status":     _STAFF | {VOLUNTEER},      # volunteers: only pending / their own
    # Feedback
    "feedback.view_all":     _STAFF_AND_ANALYST,
    "feedback.manage":       _STAFF,
    # Volunteers
    "volunteers.view":       _STAFF_AND_ANALYST,
    "volunteers.approve":    frozenset({GOVERNMENT, SUPER_ADMIN, DISTRICT_ADMIN}),
    # Evacuation centers, resources, alerts
    "evacuation.manage":     _STAFF,
    "resources.view":        _STAFF_AND_ANALYST,
    "resources.manage":      _STAFF,
    "alerts.manage":         _STAFF,
    # Reports, sensors
    "reports.view":          _STAFF_AND_ANALYST,
    "sensors.manage":        frozenset({SUPER_ADMIN, DISTRICT_ADMIN, OPERATIONS}),
    # Administration
    "users.view_all":        frozenset({SUPER_ADMIN, DISTRICT_ADMIN}),
    "users.change_role":     frozenset({SUPER_ADMIN}),
    "admin.invite":          frozenset({SUPER_ADMIN}),
    "audit.view":            frozenset({SUPER_ADMIN, DISTRICT_ADMIN}),
    # Unmasked phone numbers of other people (responders need to call them)
    "contact.view_full":     _STAFF | {VOLUNTEER},
}


def is_admin_account(user) -> bool:
    """Admin accounts live in the `admins` table; ordinary users in `users`."""
    return not hasattr(user, "full_name")


def _role_value(user) -> str:
    role = user.role
    return role.value if hasattr(role, "value") else str(role)


def effective_role(user, db: Session) -> str:
    """
    The role used for permission checks.

    - A `volunteer` user only gets volunteer powers once a matching volunteer
      record (same email) has been approved; until then they act as public_user.
    - The legacy `admin` value on ordinary user accounts grants nothing: real
      admins are created through the invite flow and live in the admins table.
    """
    role = _role_value(user)
    if is_admin_account(user):
        return role if role in ADMIN_ROLES else PUBLIC_USER

    if role == VOLUNTEER:
        from models.volunteer import Volunteer, VolunteerStatus
        approved = db.query(Volunteer.id).filter(
            Volunteer.email == user.email,
            Volunteer.status == VolunteerStatus.APPROVED,
        ).first()
        return VOLUNTEER if approved else PUBLIC_USER
    if role in (PUBLIC_USER, GOVERNMENT):
        return role
    return PUBLIC_USER


def has_permission(role: str, permission: str) -> bool:
    return role in PERMISSIONS[permission]


def require_permission(*permissions: str):
    """Dependency: authenticated user whose role has at least one of `permissions`."""
    for p in permissions:
        if p not in PERMISSIONS:
            raise ValueError(f"Unknown permission: {p}")

    async def checker(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
        role = effective_role(current_user, db)
        if not any(has_permission(role, p) for p in permissions):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        current_user.effective_role = role
        return current_user

    return checker


async def require_auth(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Dependency: any authenticated account, with `effective_role` attached."""
    current_user.effective_role = effective_role(current_user, db)
    return current_user


async def optional_auth(current_user=Depends(get_current_user_optional), db: Session = Depends(get_db)):
    """Dependency: the account if a valid token was sent, else None."""
    if current_user is not None:
        current_user.effective_role = effective_role(current_user, db)
    return current_user


def user_account_id(user) -> Optional[int]:
    """users.id of the caller, or None for admin accounts / anonymous callers."""
    if user is None or is_admin_account(user):
        return None
    return user.id
