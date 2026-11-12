"""SOS business rules: who sees what, status transitions, history and notifications."""
from fastapi import HTTPException
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from auth.permissions import VOLUNTEER, has_permission, is_admin_account, user_account_id
from models.sos import SOS, SOS_TRANSITIONS, SOSStatus, SOSStatusHistory
from services.notify import notify_user
from utils.serializers import mask_phone, model_to_dict
from utils.timeutil import iso, utc_now

STATUS_MESSAGES = {
    SOSStatus.ACCEPTED: "A responder has accepted your SOS request.",
    SOSStatus.IN_PROGRESS: "Responders are on the way / working on your SOS request.",
    SOSStatus.RESCUED: "Your SOS request has been marked as rescued.",
    SOSStatus.RESOLVED: "Your SOS request has been resolved.",
    SOSStatus.CANCELLED: "Your SOS request has been cancelled.",
}


def status_of(sos: SOS) -> SOSStatus:
    return SOSStatus(sos.status.value if hasattr(sos.status, "value") else sos.status)


def scope_sos_query(query, user):
    """Limit an SOS query to what the caller may see."""
    role = user.effective_role
    if has_permission(role, "sos.view_all"):
        return query
    uid = user_account_id(user)
    if has_permission(role, "sos.view_assigned"):
        # Volunteers: open requests, the ones they accepted, and their own.
        return query.filter(or_(
            SOS.status == SOSStatus.PENDING,
            SOS.accepted_by_user_id == uid,
            SOS.user_id == uid,
        ))
    return query.filter(SOS.user_id == uid)  # public users: only their own


def _latest_changes(db: Session, sos_ids) -> dict:
    """{sos_id: newest SOSStatusHistory} for the given ids (one query)."""
    if not sos_ids:
        return {}
    rows = (db.query(SOSStatusHistory).filter(SOSStatusHistory.sos_id.in_(sos_ids))
            .order_by(SOSStatusHistory.sos_id, desc(SOSStatusHistory.changed_at)).all())
    latest = {}
    for row in rows:
        latest.setdefault(row.sos_id, row)
    return latest


def serialize_sos_list(db: Session, items, user) -> list:
    changes = _latest_changes(db, [s.id for s in items])
    return [serialize_sos(s, user, changes.get(s.id)) for s in items]


def serialize_sos(sos: SOS, user, last_change: SOSStatusHistory = None) -> dict:
    data = model_to_dict(sos)
    own = sos.user_id is not None and sos.user_id == user_account_id(user)
    if not own and not has_permission(user.effective_role, "contact.view_full"):
        data["phone"] = mask_phone(sos.phone)
    data["next_statuses"] = allowed_next_statuses(sos, user)
    data["last_change"] = history_to_dict(last_change) if last_change else None
    return data


def history_to_dict(row: SOSStatusHistory) -> dict:
    return {
        "from_status": row.from_status, "to_status": row.to_status,
        "changed_by": row.changed_by_name, "changed_at": iso(row.changed_at), "note": row.note,
    }


def allowed_next_statuses(sos: SOS, user) -> list:
    """Statuses this user may move this SOS to right now (drives the UI buttons)."""
    if not has_permission(user.effective_role, "sos.update_status"):
        return []
    current = status_of(sos)
    allowed = SOS_TRANSITIONS[current]
    if user.effective_role == VOLUNTEER:
        uid = user_account_id(user)
        if current == SOSStatus.PENDING:
            allowed = {SOSStatus.ACCEPTED}
        elif sos.accepted_by_user_id != uid:
            allowed = set()
    order = list(SOSStatus)
    return [s.value for s in sorted(allowed, key=order.index)]


def change_status(db: Session, sos: SOS, new_status: SOSStatus, user, note: str = None):
    """Validate and apply a status change, recording history and notifying the submitter. Caller commits."""
    current = status_of(sos)
    if new_status == current:
        return
    if new_status not in SOS_TRANSITIONS[current]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot change status from '{current.value}' to '{new_status.value}'")
    if new_status.value not in allowed_next_statuses(sos, user):
        raise HTTPException(status_code=403,
                            detail="Volunteers can only accept pending requests or update ones they accepted")

    if new_status == SOSStatus.ACCEPTED and user.effective_role == VOLUNTEER:
        sos.accepted_by_user_id = user_account_id(user)
    if new_status in (SOSStatus.RESCUED, SOSStatus.RESOLVED, SOSStatus.CANCELLED):
        sos.resolved_at = utc_now()
    sos.status = new_status

    db.add(SOSStatusHistory(
        sos_id=sos.id,
        from_status=current.value,
        to_status=new_status.value,
        changed_by_id=user.id,
        changed_by_type="admin" if is_admin_account(user) else "user",
        changed_by_name=getattr(user, "full_name", None) or getattr(user, "name", None) or user.email,
        note=note,
    ))
    notify_user(db, sos.user_id, "sos_updates",
                title=f"SOS #{sos.id}: {new_status.value.replace('_', ' ')}",
                message=STATUS_MESSAGES[new_status],
                type_="sos_update", link="/dashboard/sos")
