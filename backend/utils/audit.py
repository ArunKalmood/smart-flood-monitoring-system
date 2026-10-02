"""
Audit log helper — import and call log_action() from any route
that needs to record admin actions.
"""
from sqlalchemy.orm import Session
from models.audit_log import AuditLog
from typing import Optional, Any


def log_action(
    db: Session,
    actor,                    # Admin or User ORM object
    action: str,              # e.g. "SOS_STATUS_UPDATE"
    resource: Optional[str] = None,     # table name
    resource_id: Optional[int] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """
    Append a single audit record.  Call inside the same DB transaction
    as the mutation so both commit or both roll back together.
    """
    email = getattr(actor, "email", "unknown")
    role  = actor.role.value if hasattr(actor.role, "value") else str(actor.role)

    entry = AuditLog(
        actor_id    = actor.id,
        actor_email = email,
        actor_role  = role,
        action      = action,
        resource    = resource,
        resource_id = resource_id,
        before      = before,
        after       = after,
        ip_address  = ip_address,
    )
    db.add(entry)
    # caller is responsible for db.commit()
