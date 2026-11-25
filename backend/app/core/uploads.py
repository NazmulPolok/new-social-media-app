from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile

from app.core.config import settings

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".ogg", ".m4a", ".mkv"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac"}

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_AUDIO_BYTES = 30 * 1024 * 1024  # 30 MB


async def save_upload_file(
    upload: UploadFile,
    subdir: str,
    allow_video: bool = False,
    allow_audio: bool = False,
) -> tuple[str, str]:
    """Validate and save an uploaded image (or video/audio if allowed) under UPLOAD_DIR/subdir.

    Returns (public_url, media_type) where media_type is 'image', 'video', or 'audio'.
    """
    ext = Path(upload.filename or "").suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        media_type = "image"
        max_bytes = MAX_IMAGE_BYTES
    elif allow_video and ext in VIDEO_EXTENSIONS:
        media_type = "video"
        max_bytes = MAX_VIDEO_BYTES
    elif allow_audio and ext in AUDIO_EXTENSIONS:
        media_type = "audio"
        max_bytes = MAX_AUDIO_BYTES
    else:
        allowed = sorted(
            IMAGE_EXTENSIONS
            | (VIDEO_EXTENSIONS if allow_video else set())
            | (AUDIO_EXTENSIONS if allow_audio else set())
        )
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext or 'unknown'}'. Allowed: {', '.join(allowed)}",
        )

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size for {media_type} is {limit_mb} MB.",
        )

    target_dir = Path(settings.UPLOAD_DIR) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (target_dir / filename).write_bytes(content)

    return f"/uploads/{subdir}/{filename}", media_type
