from pydantic import field_validator
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "FloodMonitor"
    APP_VERSION: str = "1.0.0"

    DATABASE_URL: str = "sqlite:///./floodmonitor.db"

    # Required. Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Admin onboarding uses single-use invites (see scripts/create_admin_invite.py)
    ADMIN_INVITE_EXPIRE_HOURS: int = 72

    # Sensors are shown offline when nothing was received for this long
    SENSOR_OFFLINE_AFTER_MINUTES: int = 5
    # Readings older than this are not used for live predictions
    LIVE_READING_WINDOW_MINUTES: int = 60

    # Uploads (SOS / feedback photos)
    MAX_UPLOAD_MB: int = 5

    # Rate limiting (slowapi syntax, per client IP)
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_SUBMIT: str = "10/minute"
    RATE_LIMIT_PUBLIC: str = "60/minute"

    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Future integrations
    OPENAI_API_KEY: str = ""
    WATSON_API_KEY: str = ""
    WEATHER_API_KEY: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    TWILIO_SID: str = ""
    TWILIO_TOKEN: str = ""
    TWILIO_FROM: str = ""
    FCM_SERVER_KEY: str = ""
    GOOGLE_MAPS_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_strong(cls, v: str) -> str:
        weak_markers = ("change-this", "your-super-secret", "changeme", "secret-key")
        if len(v) < 32 or any(m in v.lower() for m in weak_markers):
            raise ValueError(
                "SECRET_KEY is missing, too short (<32 chars) or a placeholder. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
