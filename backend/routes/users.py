from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from database.connection import get_db
from models.user import User, UserRole
from schemas.user_schema import UserUpdate, UserRoleChange
from auth.jwt_handler import get_current_user
from auth.permissions import require_permission, ASSIGNABLE_USER_ROLES
from utils.audit import log_action
from services.accounts import serialize_account

router = APIRouter(prefix="/users", tags=["User Profile"])


@router.get("/profile")
async def get_profile(current_user=Depends(get_current_user)):
    return serialize_account(current_user)


@router.put("/profile")
async def update_profile(
    data: UserUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    update_data = data.model_dump(exclude_unset=True)
    if hasattr(current_user, "full_name"):
        editable = {"full_name", "phone", "address", "city", "state", "pin_code",
                    "language", "theme", "notification_prefs"}
        if getattr(current_user, "auth_provider", "local") == "google":
            if "phone" in update_data and update_data["phone"] is None:
                update_data["phone"] = ""
        if "name" in update_data and "full_name" not in update_data:
            update_data["full_name"] = update_data["name"]
    else:
        editable = {"name", "department", "language", "theme", "notification_prefs"}
        if "full_name" in update_data and "name" not in update_data:
            update_data["name"] = update_data["full_name"]

    for key, val in update_data.items():
        if key in editable:
            setattr(current_user, key, val)

    db.commit()
    db.refresh(current_user)
    return serialize_account(current_user)


@router.get("/admin/all-users")
async def get_all_users(
    role: str = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user=Depends(require_permission("users.view_all")),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    users = query.offset(offset).limit(limit).all()
    return {"total": total, "users": [serialize_account(u) for u in users]}



@router.patch("/admin/{user_id}/role")
async def change_user_role(
    user_id: int,
    data: UserRoleChange,
    request: Request,
    current_user=Depends(require_permission("users.change_role")),
    db: Session = Depends(get_db),
):
    """super_admin only: set a user's role (e.g. grant government_authority). Audit-logged."""
    if data.role.value not in ASSIGNABLE_USER_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(sorted(ASSIGNABLE_USER_ROLES))}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    before = {"role": user.role.value}
    user.role = UserRole(data.role.value)
    log_action(db, current_user, "USER_ROLE_CHANGE", resource="users", resource_id=user_id,
               before=before, after={"role": user.role.value},
               ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(user)
    return serialize_account(user)
