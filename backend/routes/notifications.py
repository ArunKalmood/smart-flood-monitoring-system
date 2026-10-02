from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from models.notification import Notification
from auth.jwt_handler import get_current_user
from datetime import datetime

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
async def get_my_notifications(
    current_user=Depends(get_current_user),
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    is_admin = not hasattr(current_user, 'full_name')
    query = db.query(Notification)

    if is_admin:
        query = query.filter(Notification.admin_id == current_user.id)
    else:
        query = query.filter(Notification.user_id == current_user.id)

    if unread_only:
        query = query.filter(Notification.is_read == False)

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()

    # Use a fresh query for the count so the LIMIT clause doesn't affect it
    count_query = db.query(Notification).filter(Notification.is_read == False)
    if is_admin:
        count_query = count_query.filter(Notification.admin_id == current_user.id)
    else:
        count_query = count_query.filter(Notification.user_id == current_user.id)
    unread_count = count_query.count()

    return {"notifications": notifications, "unread_count": unread_count}


@router.patch("/mark-all-read")
async def mark_all_read(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    is_admin = not hasattr(current_user, 'full_name')
    query = db.query(Notification).filter(Notification.is_read == False)
    if is_admin:
        query = query.filter(Notification.admin_id == current_user.id)
    else:
        query = query.filter(Notification.user_id == current_user.id)
    query.update({"is_read": True, "read_at": datetime.utcnow()})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        n.is_read = True
        n.read_at = datetime.utcnow()
        db.commit()
    return {"status": "ok"}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        db.delete(n)
        db.commit()
    return {"message": "Deleted"}
