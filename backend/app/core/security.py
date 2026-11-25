import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)
_argon2 = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)

ACCESS_COOKIE_NAME = "vl_access_token"
REFRESH_COOKIE_NAME = "vl_refresh_token"


def hash_password(plain_password: str) -> str:
    """Hash a user password using Argon2id."""
    return _argon2.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a password against Argon2id (or legacy bcrypt) hash."""
    try:
        if password_hash.startswith("$argon2"):
            return _argon2.verify(password_hash, plain_password)
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except (VerifyMismatchError, Exception):
        return False


def hash_email(email: str) -> str:
    """Deterministically hash an email address with HMAC-SHA256."""
    normalized = email.strip().lower().encode("utf-8")
    return hmac.new(
        settings.EMAIL_HMAC_SECRET.encode("utf-8"),
        normalized,
        hashlib.sha256,
    ).hexdigest()


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def sign_webhook_payload(payload_bytes: bytes, secret: str | None = None) -> str:
    key = (secret or settings.WEBHOOK_SIGNING_SECRET).encode("utf-8")
    digest = hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_webhook_signature(payload_bytes: bytes, signature_header: str, secret: str | None = None) -> bool:
    expected = sign_webhook_payload(payload_bytes, secret)
    return hmac.compare_digest(expected, signature_header or "")


def create_access_token(user_id: int, username: str, role: str = "user") -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=30)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_download_token(user_id: int, project_id: int, expires_minutes: int = 10) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "project_id": project_id,
        "type": "download",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_download_token(token: str) -> dict[str, Any]:
    try:
        data = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if data.get("type") != "download":
            raise HTTPException(status_code=403, detail="Invalid download token")
        return data
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=403, detail="Expired or invalid download link") from exc


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set True behind HTTPS in production
        max_age=30 * 60,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=14 * 24 * 3600,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="JWT token has expired. Please log in again.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid JWT authentication token",
        ) from exc


def _extract_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.credentials:
        return credentials.credentials
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return request.cookies.get(ACCESS_COOKIE_NAME)


def get_current_user_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    token = _extract_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return decode_access_token(token)


def get_optional_user_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any] | None:
    token = _extract_token(request, credentials)
    if not token:
        return None
    try:
        return decode_access_token(token)
    except HTTPException:
        return None


def require_admin(claims: dict[str, Any] = Depends(get_current_user_claims)) -> dict[str, Any]:
    if claims.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return claims
