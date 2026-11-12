import bcrypt
from jose import JWTError, jwt
from datetime import timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database.connection import get_db
from utils.config import settings
from utils.timeutil import utc_now

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# ── Password hashing (bcrypt directly, no passlib) ──────────

def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    pw_bytes = password.encode("utf-8")[:72]   # bcrypt max 72 bytes
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        pw_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pw_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


# ── JWT ──────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = utc_now()
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": int(now.timestamp()), "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    now = utc_now()
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": int(now.timestamp()), "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _account_from_payload(payload: dict, db: Session, expected_type: str = "access"):
    sub = payload.get("sub")
    if sub is None or payload.get("type") != expected_type:
        return None

    if payload.get("user_type", "user") == "admin":
        from models.admin import Admin
        user = db.query(Admin).filter(Admin.id == int(sub)).first()
    else:
        from models.user import User
        user = db.query(User).filter(User.id == int(sub)).first()
        if user and user.tokens_valid_after is not None:
            iat = payload.get("iat")
            if iat is None:
                return None
            valid_after = user.tokens_valid_after
            if valid_after.tzinfo is None:
                from datetime import timezone
                valid_after = valid_after.replace(tzinfo=timezone.utc)
            if iat < int(valid_after.timestamp()):
                return None

    if user is None or not user.is_active:
        return None
    return user


def _user_from_token(token: str, db: Session):
    """Return the account for a valid *access* token, or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    return _account_from_payload(payload, db, expected_type="access")


def verify_refresh_token(token: str, db: Session):
    """Return the account for a valid *refresh* token, or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    return _account_from_payload(payload, db, expected_type="refresh")


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    user = _user_from_token(token, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)
):
    """Like get_current_user, but returns None instead of raising when no valid token is sent."""
    if not token:
        return None
    return _user_from_token(token, db)
