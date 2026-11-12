from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Annotated, Literal, Optional

from schemas.validators import OptionalPhone, Password, Phone, PinCode, optional_text
from models.user import UserRole
from models.admin import AdminRole


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone: Phone
    password: Password
    confirm_password: str
    address: optional_text(300) = None
    city: optional_text(100) = None
    state: optional_text(100) = None
    pin_code: PinCode = None
    role: UserRole = UserRole.PUBLIC

    @field_validator("role")
    @classmethod
    def role_self_assignable(cls, v: UserRole) -> UserRole:
        # Elevated roles are granted by a super_admin, never self-selected.
        if v not in (UserRole.PUBLIC, UserRole.VOLUNTEER):
            raise ValueError("Only 'public_user' or 'volunteer' can be chosen at registration")
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> "UserRegister":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class AdminRegister(BaseModel):
    # The invite decides the role; any client-sent "role" is ignored.
    registration_token: str
    name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    password: Password
    confirm_password: str
    department: optional_text(150) = None

    @model_validator(mode="after")
    def passwords_match(self) -> "AdminRegister":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class ForgotPassword(BaseModel):
    email: EmailStr


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password


class NotificationPrefs(BaseModel):
    flood_warnings: bool = True
    sos_updates: bool = True
    volunteer_updates: bool = True
    weather_alerts: bool = True
    system_messages: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[Annotated[str, Field(min_length=2, max_length=150)]] = None
    name: Optional[Annotated[str, Field(min_length=2, max_length=150)]] = None
    department: optional_text(150) = None
    phone: OptionalPhone = None
    address: optional_text(300) = None
    city: optional_text(100) = None
    state: optional_text(100) = None
    pin_code: PinCode = None
    language: Optional[Literal["en", "hi", "mr", "te", "ta", "kn"]] = None
    theme: Optional[Literal["light", "dark", "system"]] = None
    notification_prefs: Optional[NotificationPrefs] = None


class VerifyAdminToken(BaseModel):
    token: str


class AdminInviteCreate(BaseModel):
    role: AdminRole
    email: Optional[EmailStr] = None
    expires_hours: Optional[int] = Field(None, ge=1, le=24 * 30)


class UserRoleChange(BaseModel):
    role: UserRole


class GoogleAuthRequest(BaseModel):
    credential: str

