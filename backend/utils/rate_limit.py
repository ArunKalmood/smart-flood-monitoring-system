"""
Per-IP rate limiting (slowapi). Limits are configured in .env:
RATE_LIMIT_AUTH, RATE_LIMIT_SUBMIT, RATE_LIMIT_PUBLIC, RATE_LIMIT_ENABLED.

Storage is in-process memory, which is correct for a single uvicorn worker.
With several workers, point slowapi at Redis (storage_uri="redis://...").
"""
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from utils.config import settings

limiter = Limiter(key_func=get_remote_address, enabled=settings.RATE_LIMIT_ENABLED)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Please wait a minute and try again."},
        headers={"Retry-After": "60"},
    )
