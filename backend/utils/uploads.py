"""Validated image uploads (SOS / feedback photos)."""
import os
import uuid
from typing import Optional

import aiofiles
from fastapi import HTTPException, UploadFile

from utils.config import settings

ALLOWED_IMAGE_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                       "gif": "image/gif", "webp": "image/webp"}


async def save_image(photo: Optional[UploadFile], subdir: str) -> Optional[str]:
    """Store an uploaded image under uploads/<subdir>/ and return its path; None if no file."""
    if photo is None or not photo.filename:
        return None
    ext = photo.filename.rsplit(".", 1)[-1].lower() if "." in photo.filename else ""
    if ext not in ALLOWED_IMAGE_TYPES or (photo.content_type and not photo.content_type.startswith("image/")):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: jpg, jpeg, png, gif, webp")
    content = await photo.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Photo is too large (max {settings.MAX_UPLOAD_MB} MB)")
    directory = os.path.join("uploads", subdir)
    os.makedirs(directory, exist_ok=True)
    path = f"{directory}/{uuid.uuid4()}.{ext}"
    async with aiofiles.open(path, "wb") as f:
        await f.write(content)
    return path
