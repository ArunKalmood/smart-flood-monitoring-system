from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from database.connection import get_db
from models.audit_log import AuditLog
from auth.jwt_handler import get_current_user, require_role
from datetime import datetime, timedelta

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get("/")
async def get_audit_logs(
    action:      Optional[str] = None,
    actor_email: Optional[str] = None,
    resource:    Optional[str] = None,
    days:        int = Query(7, ge=1, le=90),
    limit:       int = Query(50, ge=1, le=200),
    offset:      int = 0,
    current_user=Depends(require_role("super_admin", "district_admin")),
    db: Session = Depends(get_db),
):
    """
    List audit log entries. Restricted to super_admin and district_admin.
    Supports filtering by action keyword, actor email, resource name and date range.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)
    query  = db.query(AuditLog).filter(AuditLog.created_at >= cutoff)

    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if actor_email:
        query = query.filter(AuditLog.actor_email.ilike(f"%{actor_email}%"))
    if resource:
        query = query.filter(AuditLog.resource == resource)

    total = query.count()
    items = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.get("/actions")
async def get_distinct_actions(
    current_user=Depends(require_role("super_admin", "district_admin")),
    db: Session = Depends(get_db),
):
    """Return the list of distinct action names recorded so far — useful for filter dropdowns."""
    rows = db.query(AuditLog.action).distinct().all()
    return {"actions": [r[0] for r in rows]}


@router.get("/stats")
async def get_audit_stats(
    days: int = Query(7, ge=1, le=90),
    current_user=Depends(require_role("super_admin", "district_admin")),
    db: Session = Depends(get_db),
):
    """High-level count of audit events grouped by action for the requested window."""
    from sqlalchemy import func
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(AuditLog.action, func.count(AuditLog.id).label("count"))
        .filter(AuditLog.created_at >= cutoff)
        .group_by(AuditLog.action)
        .order_by(desc("count"))
        .all()
    )
    return {
        "period_days": days,
        "breakdown": [{"action": r[0], "count": r[1]} for r in rows],
        "total": sum(r[1] for r in rows),
    }
