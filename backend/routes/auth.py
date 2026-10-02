from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from database.connection import get_db
from models.user import User
from models.admin import Admin
from schemas.user_schema import (
    UserRegister, UserLogin, TokenResponse, AdminRegister,
    AdminLogin, ForgotPassword, PasswordChange
)
from auth.jwt_handler import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, get_current_user
)
from utils.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=hash_password(data.password),
        address=data.address,
        city=data.city,
        state=data.state,
        pin_code=data.pin_code,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
    refresh_token = create_refresh_token({"sub": str(user.id), "user_type": "user"})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id, "full_name": user.full_name, "email": user.email,
            "phone": user.phone, "role": user.role.value,
            "city": user.city, "state": user.state,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    )


@router.post("/login", response_model=TokenResponse)
async def login_user(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.last_login = datetime.utcnow()
    db.commit()

    expire_mins = 60 * 24 * 7 if data.remember_me else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    from datetime import timedelta
    access_token = create_access_token(
        {"sub": str(user.id), "user_type": "user", "role": user.role.value},
        expires_delta=timedelta(minutes=expire_mins)
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "user_type": "user"})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id, "full_name": user.full_name, "email": user.email,
            "phone": user.phone, "role": user.role.value,
            "city": user.city, "state": user.state,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    )


@router.post("/verify-admin-token")
async def verify_admin_token(data: dict):
    token = data.get("token", "")
    if token != settings.ADMIN_REGISTRATION_TOKEN:
        raise HTTPException(status_code=400, detail="Invalid Admin Registration Token")
    return {"valid": True, "message": "Token verified successfully"}


@router.post("/admin/register", status_code=status.HTTP_201_CREATED)
async def register_admin(data: AdminRegister, db: Session = Depends(get_db)):
    if data.registration_token != settings.ADMIN_REGISTRATION_TOKEN:
        raise HTTPException(status_code=400, detail="Invalid Admin Registration Token")

    existing = db.query(Admin).filter(Admin.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    admin = Admin(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        department=data.department,
        role=data.role,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    access_token = create_access_token({"sub": str(admin.id), "user_type": "admin", "role": admin.role.value})
    refresh_token = create_refresh_token({"sub": str(admin.id), "user_type": "admin"})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "admin": {
            "id": admin.id, "name": admin.name, "email": admin.email,
            "department": admin.department, "role": admin.role.value
        }
    }


@router.post("/admin/login")
async def login_admin(data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == data.email).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    admin.last_login = datetime.utcnow()
    db.commit()

    access_token = create_access_token({"sub": str(admin.id), "user_type": "admin", "role": admin.role.value})
    refresh_token = create_refresh_token({"sub": str(admin.id), "user_type": "admin"})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "admin": {
            "id": admin.id, "name": admin.name, "email": admin.email,
            "department": admin.department, "role": admin.role.value
        }
    }


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    if hasattr(current_user, 'full_name'):
        return {
            "id": current_user.id, "name": current_user.full_name,
            "email": current_user.email, "role": current_user.role.value,
            "user_type": "user"
        }
    return {
        "id": current_user.id, "name": current_user.name,
        "email": current_user.email, "role": current_user.role.value,
        "user_type": "admin"
    }


@router.post("/forgot-password")
async def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)):
    # Future: generate reset token, send email
    user = db.query(User).filter(User.email == data.email).first()
    return {"message": "If this email exists, a reset link has been sent"}


@router.post("/change-password")
async def change_password(data: PasswordChange, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
