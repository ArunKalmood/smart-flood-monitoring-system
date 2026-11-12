"""
Single-use admin invites.

Tokens are 256-bit random strings (secrets.token_urlsafe(32)); only their
sha256 is stored. sha256 (not bcrypt) is fine here because the tokens are
high-entropy random values, not human passwords.
"""
import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from models.admin import AdminRole
from models.admin_invite import AdminInvite
from utils.config import settings
from utils.timeutil import utc_now


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_invite(
    db: Session,
    role: AdminRole,
    email: Optional[str] = None,
    expires_hours: Optional[int] = None,
    created_by_admin_id: Optional[int] = None,
) -> tuple:
    """Create an invite. Returns (plain_token, invite). The plain token is not stored."""
    token = secrets.token_urlsafe(32)
    invite = AdminInvite(
        token_hash=hash_token(token),
        role=role,
        email=email.lower() if email else None,
        created_by_admin_id=created_by_admin_id,
        expires_at=utc_now() + timedelta(hours=expires_hours or settings.ADMIN_INVITE_EXPIRE_HOURS),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return token, invite


def find_valid_invite(db: Session, token: str) -> Optional[AdminInvite]:
    """The unused, unexpired invite for this token, or None."""
    if not token:
        return None
    invite = db.query(AdminInvite).filter(AdminInvite.token_hash == hash_token(token)).first()
    if invite is None or invite.used_at is not None or invite.expires_at < utc_now():
        return None
    return invite


def consume_invite(db: Session, invite: AdminInvite, admin_id: int) -> bool:
    """
    Atomically mark the invite used. Returns False if another request used it
    first. Caller commits.
    """
    result = db.execute(
        update(AdminInvite)
        .where(AdminInvite.id == invite.id, AdminInvite.used_at.is_(None))
        .values(used_at=utc_now(), used_by_admin_id=admin_id)
    )
    return result.rowcount == 1


def invite_to_dict(invite: AdminInvite) -> dict:
    now = utc_now()
    return {
        "id": invite.id,
        "role": invite.role.value,
        "email": invite.email,
        "expires_at": invite.expires_at.isoformat(),
        "used_at": invite.used_at.isoformat() if invite.used_at else None,
        "status": "used" if invite.used_at else ("expired" if invite.expires_at < now else "active"),
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
    }
