from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database.connection import get_db
from models.user import User
from schemas.user_schema import UserUpdate
from auth.jwt_handler import get_current_user
from datetime import datetime

router = APIRouter(prefix="/users", tags=["User Profile"])


def serialize_user(user):
    if hasattr(user, "full_name"):
        return {
            "id": user.id,
            "full_name": user.full_name,
            "name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "address": user.address,
            "city": user.city,
            "state": user.state,
            "pin_code": user.pin_code,
            "role": user.role.value if hasattr(user.role, "value") else user.role,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "profile_photo": user.profile_photo,
            "language": user.language,
            "theme": user.theme,
            "notification_enabled": user.notification_enabled,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "user_type": "user",
        }
    return {
        "id": user.id,
        "full_name": user.name,
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "is_active": user.is_active,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "user_type": "admin",
    }


@router.get("/profile")
async def get_profile(current_user=Depends(get_current_user)):
    return serialize_user(current_user)


@router.put("/profile")
async def update_profile(
    data: UserUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    update_data = data.model_dump(exclude_unset=True)

    if hasattr(current_user, "full_name"):
        for key, val in update_data.items():
            if hasattr(current_user, key):
                setattr(current_user, key, val)
    else:
        # Admin profile update
        if data.name:
            current_user.name = data.name
        elif data.full_name:
            current_user.name = data.full_name
        if data.department:
            current_user.department = data.department

    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return serialize_user(current_user)


@router.get("/admin/all-users")
async def get_all_users(
    role: str = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = 0,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    users = query.offset(offset).limit(limit).all()
    return {"total": total, "users": [serialize_user(u) for u in users]}

