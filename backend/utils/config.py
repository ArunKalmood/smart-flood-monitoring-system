from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    APP_NAME: str = "FloodMonitor"
    APP_VERSION: str = "1.0.0"

    DATABASE_URL: str = "sqlite:///./floodmonitor.db"

    SECRET_KEY: str = "change-this-super-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    ADMIN_REGISTRATION_TOKEN: str = "1758"

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

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "allow"


settings = Settings()
