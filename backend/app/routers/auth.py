from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import (
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    create_access_token,
    generate_refresh_token,
    get_current_user_claims,
    hash_email,
    hash_password,
    hash_token,
    set_auth_cookies,
    verify_password,
)
from app.core.uploads import save_upload_file
from app.db.postgres import get_db
from app.db.redis_cache import cache_invalidate_prefix, check_rate_limit
from app.models.sql_models import Follow, Friendship, User, UserSession

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str | None = Field(default=None, max_length=120)
    username: str | None = Field(default=None, max_length=60)
    email_or_username: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=6, max_length=128)


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    bio: str | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=120)
    website_url: str | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, pattern=r"^(en|bn)$")
    currency: str | None = Field(default=None, pattern=r"^(BDT|USD)$")


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "is_verified": user.is_verified,
        "email_hash_preview": f"{user.email_hash[:12]}... (HMAC-SHA256)",
        "bio": user.bio,
        "location": user.location,
        "website_url": user.website_url,
        "avatar_url": user.avatar_url,
        "cover_url": user.cover_url,
        "language": user.language,
        "currency": user.currency,
        "created_at": user.created_at.isoformat(),
    }


def _issue_session(response: Response, request: Request, user: User, db: Session) -> str:
    access_token = create_access_token(user.id, user.username, user.role)
    raw_refresh = generate_refresh_token()
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_token(raw_refresh),
        user_agent=(request.headers.get("user-agent") or "")[:250],
        ip_address=request.client.host if request.client else "",
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db.add(session)
    db.commit()
    set_auth_cookies(response, access_token, raw_refresh)
    return access_token


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"rl:register:{ip}", max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Try again shortly.")

    email_digest = hash_email(payload.email)
    username_clean = payload.username.strip().lower()

    if db.scalar(select(User).where(User.email_hash == email_digest)):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    if db.scalar(select(User).where(User.username == username_clean)):
        raise HTTPException(status_code=400, detail="Username is already taken")

    # First registered user is promoted to platform admin for initial setup
    is_first = (db.scalar(select(func.count(User.id))) or 0) == 0

    user = User(
        username=username_clean,
        display_name=payload.display_name.strip(),
        email_hash=email_digest,
        password_hash=hash_password(payload.password),
        role="admin" if is_first else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = _issue_session(response, request, user, db)
    return {"access_token": token, "token_type": "bearer", "user": _serialize_user(user)}


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"rl:login:{ip}", max_requests=15, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait 1 minute.")

    identifier = (payload.email_or_username or payload.email or payload.username or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or username is required")

    # 1. Look up user by lowercase username
    user = db.scalar(select(User).where(User.username == identifier.lower()))
    # 2. If not found, look up by HMAC-SHA256 email hash
    if not user:
        email_digest = hash_email(identifier)
        user = db.scalar(select(User).where(User.email_hash == email_digest))

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    if user.is_suspended:
        raise HTTPException(status_code=403, detail="Account is suspended")

    token = _issue_session(response, request, user, db)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


@router.post("/token")
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Standard OAuth2 Password Flow for JWT tokens (Swagger UI / OpenAPI & CLI compatible)."""
    identifier = form_data.username.strip()
    user = db.scalar(select(User).where(User.username == identifier.lower()))
    if not user:
        email_digest = hash_email(identifier)
        user = db.scalar(select(User).where(User.email_hash == email_digest))

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if user.is_suspended:
        raise HTTPException(status_code=403, detail="Account is suspended")

    token = _issue_session(response, request, user, db)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/refresh")
def refresh_session(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    digest = hash_token(raw_refresh)
    sess = db.scalar(select(UserSession).where(UserSession.refresh_token_hash == digest))
    if not sess or sess.revoked or sess.expires_at < datetime.now(timezone.utc):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    user = db.get(User, sess.user_id)
    if not user or user.is_suspended:
        raise HTTPException(status_code=401, detail="User unavailable")

    # Rotate refresh token
    sess.revoked = True
    db.commit()
    token = _issue_session(response, request, user, db)
    return {"access_token": token, "user": _serialize_user(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_refresh:
        sess = db.scalar(select(UserSession).where(UserSession.refresh_token_hash == hash_token(raw_refresh)))
        if sess:
            sess.revoked = True
            db.commit()
    clear_auth_cookies(response)
    return {"logged_out": True}


@router.post("/logout-all")
def logout_all_devices(
    response: Response,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    sessions = db.scalars(select(UserSession).where(UserSession.user_id == uid, UserSession.revoked == False)).all()
    for s in sessions:
        s.revoked = True
    db.commit()
    clear_auth_cookies(response)
    return {"revoked_sessions": len(sessions)}


@router.get("/me")
def get_me(claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
    user = db.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user(user)


@router.patch("/me")
def update_me(
    payload: ProfileUpdateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    user = db.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(user, field, val.strip() if isinstance(val, str) else val)
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


async def _update_profile_image(
    field: str,
    file: UploadFile,
    claims: dict,
    db: Session,
) -> dict:
    user = db.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    url, _ = await save_upload_file(file, subdir="profiles", allow_video=False)
    setattr(user, field, url)
    db.commit()
    db.refresh(user)
    if field == "avatar_url":
        await cache_invalidate_prefix("social:posts:")
    return _serialize_user(user)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    return await _update_profile_image("avatar_url", file, claims, db)


@router.post("/me/cover")
async def upload_cover(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    return await _update_profile_image("cover_url", file, claims, db)


@router.get("/sessions")
def list_my_sessions(claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"])
    sessions = db.scalars(
        select(UserSession).where(UserSession.user_id == uid, UserSession.revoked == False).order_by(UserSession.id.desc())
    ).all()
    return [
        {
            "id": s.id,
            "user_agent": s.user_agent,
            "ip_address": s.ip_address,
            "created_at": s.created_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/u/{username}")
def get_public_profile(username: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == username.strip().lower()))
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    followers_count = db.scalar(select(func.count(Follow.id)).where(Follow.following_id == user.id)) or 0
    following_count = db.scalar(select(func.count(Follow.id)).where(Follow.follower_id == user.id)) or 0
    friends_count = (
        db.scalar(
            select(func.count(Friendship.id)).where(
                (Friendship.user_a_id == user.id) | (Friendship.user_b_id == user.id)
            )
        )
        or 0
    )
    return {
        **_serialize_user(user),
        "followers_count": followers_count,
        "following_count": following_count,
        "friends_count": friends_count,
    }


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.is_suspended == False).order_by(User.id.desc()).limit(50)).all()
    return [_serialize_user(u) for u in users]
