import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from database.connection import get_db
from models.user import User, UserRole
from models.admin import Admin
from schemas.user_schema import (
    UserRegister, UserLogin, TokenResponse, AdminRegister,
    AdminLogin, ForgotPassword, PasswordChange, VerifyAdminToken, AdminInviteCreate,
    GoogleAuthRequest
)
from auth.jwt_handler import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, get_current_user
)
from auth.permissions import require_permission
from auth.invites import create_invite, find_valid_invite, consume_invite, invite_to_dict
from models.admin_invite import AdminInvite
from services.accounts import serialize_account
from utils.audit import log_action
from utils.config import settings
from utils.rate_limit import limiter
from utils.timeutil import utc_now

INVALID_INVITE = "Invalid or expired admin invite"

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register_user(request: Request, data: UserRegister, db: Session = Depends(get_db)):
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
        user=serialize_account(user)
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login_user(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    email_clean = data.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if user and user.auth_provider == "google":
        raise HTTPException(
            status_code=400,
            detail="This account is registered with Google. Please use Continue with Google"
        )
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.last_login = utc_now()
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
        user=serialize_account(user)
    )


@router.post("/google", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def google_auth(request: Request, data: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured"
        )

    try:
        id_info = id_token.verify_oauth2_token(
            data.credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not verify Google token"
        )

    sub = id_info.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token claims: missing sub"
        )

    email = id_info.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account does not provide an email address"
        )
    email = email.strip().lower()

    if not id_info.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified"
        )

    # Reject if an administrator account has this email
    admin = db.query(Admin).filter(func.lower(Admin.email) == email).first()
    if admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is registered to an administrator account. Google Sign-In is only available for citizen accounts."
        )

    picture = (id_info.get("picture") or "")[:300] or None
    ip_addr = request.client.host if request.client else None

    # Case a: Existing user by google_sub
    user = db.query(User).filter(User.google_sub == sub).first()
    if user:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        user.last_login = utc_now()
        if not user.profile_photo and picture:
            user.profile_photo = picture
        db.commit()
        db.refresh(user)
        access_token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
        refresh_token = create_refresh_token({"sub": str(user.id), "user_type": "user"})
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=serialize_account(user)
        )

    # Case b: Existing user by email (case-insensitive)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        if user.auth_provider == "google":
            if user.google_sub and user.google_sub != sub:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An account with this email is already linked to a different Google account"
                )
            user.google_sub = sub
        else:
            # Link local account:
            user.google_sub = sub
            user.auth_provider = "google"
            user.password_hash = hash_password(secrets.token_urlsafe(32))
            user.tokens_valid_after = utc_now()
            log_action(db, user, "USER_GOOGLE_LINKED", resource="users", resource_id=user.id,
                       ip_address=ip_addr)
        user.is_verified = True
        user.last_login = utc_now()
        if not user.profile_photo and picture:
            user.profile_photo = picture
        db.commit()
        db.refresh(user)
        access_token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
        refresh_token = create_refresh_token({"sub": str(user.id), "user_type": "user"})
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=serialize_account(user)
        )

    # Case d: Create new citizen user
    name = (id_info.get("name") or "").strip()
    if not name:
        name = email.split("@")[0]

    new_user = User(
        full_name=name,
        email=email,
        phone="",
        password_hash=hash_password(secrets.token_urlsafe(32)),
        google_sub=sub,
        auth_provider="google",
        is_verified=True,
        profile_photo=picture,
        last_login=utc_now(),
        role=UserRole.PUBLIC,
    )
    db.add(new_user)
    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        # Retry lookup once in case of concurrent first sign-in race
        user = db.query(User).filter(
            (User.google_sub == sub) | (func.lower(User.email) == email)
        ).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create user account")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
        user.last_login = utc_now()
        db.commit()
        db.refresh(user)
        access_token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
        refresh_token = create_refresh_token({"sub": str(user.id), "user_type": "user"})
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=serialize_account(user)
        )

    log_action(db, new_user, "USER_REGISTER_GOOGLE", resource="users", resource_id=new_user.id,
               ip_address=ip_addr)
    db.commit()

    access_token = create_access_token({"sub": str(new_user.id), "user_type": "user", "role": new_user.role.value})
    refresh_token = create_refresh_token({"sub": str(new_user.id), "user_type": "user"})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=serialize_account(new_user)
    )



@router.post("/verify-admin-token")
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def verify_admin_token(request: Request, data: VerifyAdminToken, db: Session = Depends(get_db)):
    """Pre-check an invite so the UI can show the role. /admin/register re-validates it."""
    invite = find_valid_invite(db, data.token.strip())
    if not invite:
        raise HTTPException(status_code=400, detail=INVALID_INVITE)
    return {"valid": True, "role": invite.role.value, "email": invite.email,
            "message": "Invite verified successfully"}


@router.post("/admin/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register_admin(request: Request, data: AdminRegister, db: Session = Depends(get_db)):
    invite = find_valid_invite(db, data.registration_token.strip())
    if not invite:
        raise HTTPException(status_code=400, detail=INVALID_INVITE)
    if invite.email and invite.email != data.email.lower():
        raise HTTPException(status_code=400, detail="This invite was issued for a different email address")

    existing = db.query(Admin).filter(Admin.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    admin = Admin(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        department=data.department,
        role=invite.role,
    )
    db.add(admin)
    db.flush()
    if not consume_invite(db, invite, admin.id):
        db.rollback()
        raise HTTPException(status_code=400, detail=INVALID_INVITE)
    db.commit()
    db.refresh(admin)

    access_token = create_access_token({"sub": str(admin.id), "user_type": "admin", "role": admin.role.value})
    refresh_token = create_refresh_token({"sub": str(admin.id), "user_type": "admin"})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "admin": serialize_account(admin)
    }


@router.post("/admin/invites", status_code=status.HTTP_201_CREATED)
async def create_admin_invite(
    data: AdminInviteCreate,
    request: Request,
    current_user=Depends(require_permission("admin.invite")),
    db: Session = Depends(get_db),
):
    """Create a single-use admin invite. The token is returned once and never stored in plain text."""
    token, invite = create_invite(db, data.role, data.email, data.expires_hours, created_by_admin_id=current_user.id)
    log_action(db, current_user, "ADMIN_INVITE_CREATE", resource="admin_invites", resource_id=invite.id,
               after={"role": invite.role.value, "email": invite.email},
               ip_address=request.client.host if request.client else None)
    db.commit()
    return {"token": token, **invite_to_dict(invite)}


@router.get("/admin/invites")
async def list_admin_invites(
    current_user=Depends(require_permission("admin.invite")),
    db: Session = Depends(get_db),
):
    invites = db.query(AdminInvite).order_by(AdminInvite.created_at.desc()).limit(100).all()
    return [invite_to_dict(i) for i in invites]


@router.post("/admin/login")
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login_admin(request: Request, data: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == data.email).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not admin.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    admin.last_login = utc_now()
    db.commit()

    access_token = create_access_token({"sub": str(admin.id), "user_type": "admin", "role": admin.role.value})
    refresh_token = create_refresh_token({"sub": str(admin.id), "user_type": "admin"})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "admin": serialize_account(admin)
    }


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return serialize_account(current_user)


@router.post("/forgot-password")
async def forgot_password(data: ForgotPassword, db: Session = Depends(get_db)):
    # Same response whether or not the email exists, so accounts can't be enumerated.
    # Sending reset emails needs SMTP configuration (SMTP_* in .env).
    return {"message": "If this email exists, a reset link has been sent"}


@router.post("/change-password")
async def change_password(data: PasswordChange, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if getattr(current_user, "auth_provider", "local") == "google":
        raise HTTPException(status_code=400, detail="Accounts registered with Google cannot change password")
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
