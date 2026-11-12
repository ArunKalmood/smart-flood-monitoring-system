"""In-app notifications, respecting each account's notification preferences."""
from sqlalchemy.orm import Session

from models.notification import Notification
from models.user import User
from utils.notification_prefs import prefs_for


def notify_user(db: Session, user_id: int, pref_key: str, title: str, message: str,
                type_: str = "general", link: str = None):
    """Queue a notification for a user account if their `pref_key` preference is on. Caller commits."""
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if user is None or not prefs_for(user).get(pref_key, True):
        return None
    notification = Notification(user_id=user_id, title=title, message=message, type=type_, link=link)
    db.add(notification)
    return notification
