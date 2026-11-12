from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth.jwt_handler import get_current_user
from auth.permissions import is_admin_account
from database.connection import get_db
from models.notification import Notification
from utils.serializers import model_to_dict
from utils.timeutil import utc_now

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def own_notifications(db: Session, account):
    """
    The caller's notifications. Rows older than the account are excluded: they
    can only belong to a deleted account whose id was reused.
    """
    query = db.query(Notification)
    if is_admin_account(account):
        query = query.filter(Notification.admin_id == account.id)
    else:
        query = query.filter(Notification.user_id == account.id)
    if account.created_at is not None:
        query = query.filter(Notification.created_at >= account.created_at)
    return query


def _get_own(db: Session, notification_id: int, account) -> Notification:
    n = own_notifications(db, account).filter(Notification.id == notification_id).first()
    if n is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return n


@router.get("/")
async def get_my_notifications(
    current_user=Depends(get_current_user),
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """`total` and `unread_count` are computed over the same set the list comes from."""
    base = own_notifications(db, current_user)
    total = base.count()
    unread_count = base.filter(Notification.is_read.is_(False)).count()
    listed = base.filter(Notification.is_read.is_(False)) if unread_only else base
    notifications = listed.order_by(Notification.created_at.desc()).limit(limit).all()
    return {"notifications": [model_to_dict(n) for n in notifications],
            "total": total, "unread_count": unread_count}


@router.patch("/mark-all-read")
async def mark_all_read(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    own_notifications(db, current_user).filter(Notification.is_read.is_(False)).update(
        {"is_read": True, "read_at": utc_now()}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read"}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    n = _get_own(db, notification_id, current_user)
    n.is_read = True
    n.read_at = utc_now()
    db.commit()
    return {"status": "ok"}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: int, current_user=Depends(get_current_user),
                              db: Session = Depends(get_db)):
    db.delete(_get_own(db, notification_id, current_user))
    db.commit()
    return {"message": "Deleted"}
