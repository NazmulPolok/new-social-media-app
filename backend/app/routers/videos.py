import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user_claims, get_optional_user_claims
from app.core.uploads import save_upload_file
from app.db.mongo import get_mongo_db
from app.db.postgres import get_db
from app.db.redis_cache import cache_get, cache_invalidate_prefix, cache_set
from app.models.sql_models import Channel, ChannelSubscription, Playlist, PlaylistItem, User, Video
from app.services.webhook_service import dispatch_webhook_event

router = APIRouter(prefix="/api/videos", tags=["Videos"])


class ChannelCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    handle: str = Field(min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str = Field(min_length=5, max_length=1000)
    image_url: str = Field(min_length=1, max_length=500)


class VideoCommentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)


class VideoUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    visibility: str | None = Field(default=None, pattern=r"^(public|unlisted|private)$")
    category: str | None = Field(default=None, max_length=50)


@router.get("/channels")
async def list_channels(db: Session = Depends(get_db)):
    cached = await cache_get("videos:channels")
    if cached is not None:
        return cached
    channels = db.scalars(select(Channel).order_by(Channel.id.desc())).all()
    results = []
    for ch in channels:
        sub_count = db.scalar(
            select(func.count(ChannelSubscription.id)).where(ChannelSubscription.channel_id == ch.id)
        )
        results.append(
            {
                "id": ch.id,
                "owner_id": ch.owner_id,
                "name": ch.name,
                "handle": ch.handle,
                "description": ch.description,
                "image_url": ch.image_url,
                "subscribers_count": sub_count or 0,
                "created_at": ch.created_at.isoformat(),
            }
        )
    await cache_set("videos:channels", results, ttl_seconds=45)
    return results


@router.post("/channels/upload-image")
async def upload_channel_image(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
):
    url, _ = await save_upload_file(file, subdir="channels", allow_video=False)
    return {"url": url}


@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def create_channel(
    payload: ChannelCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    handle_clean = payload.handle.strip().lower()
    if db.scalar(select(Channel).where(Channel.handle == handle_clean)):
        raise HTTPException(status_code=400, detail="Channel handle already taken")

    ch = Channel(
        owner_id=uid,
        name=payload.name.strip(),
        handle=handle_clean,
        description=payload.description.strip(),
        image_url=payload.image_url.strip(),
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    await cache_invalidate_prefix("videos:")
    return {
        "id": ch.id,
        "owner_id": ch.owner_id,
        "name": ch.name,
        "handle": ch.handle,
        "description": ch.description,
        "image_url": ch.image_url,
        "subscribers_count": 0,
        "created_at": ch.created_at.isoformat(),
    }


@router.post("/channels/{channel_id}/subscribe")
def toggle_subscribe(
    channel_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    ch = db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    existing = db.scalar(
        select(ChannelSubscription).where(
            ChannelSubscription.channel_id == channel_id,
            ChannelSubscription.user_id == uid,
        )
    )
    if existing:
        db.delete(existing)
        db.commit()
        subscribed = False
    else:
        db.add(ChannelSubscription(channel_id=channel_id, user_id=uid))
        db.commit()
        subscribed = True

    count = db.scalar(
        select(func.count(ChannelSubscription.id)).where(ChannelSubscription.channel_id == channel_id)
    )
    return {"subscribed": subscribed, "subscribers_count": count or 0}


@router.get("")
async def list_videos(db: Session = Depends(get_db)):
    cached = await cache_get("videos:list")
    if cached is not None:
        return cached
    videos = db.scalars(select(Video).order_by(Video.created_at.desc()).limit(60)).all()
    mongo = get_mongo_db()
    engagements = await mongo.video_engagements.find({"video_id": {"$in": [v.id for v in videos]}}).to_list(100)
    eng_map = {e["video_id"]: e for e in engagements}

    out = []
    for v in videos:
        eng = eng_map.get(v.id, {})
        out.append(
            {
                "id": v.id,
                "channel_id": v.channel_id,
                "channel_name": v.channel.name if v.channel else "Channel",
                "channel_handle": v.channel.handle if v.channel else "channel",
                "channel_image_url": v.channel.image_url if v.channel else "",
                "owner_id": v.owner_id,
                "title": v.title,
                "description": v.description,
                "video_url": v.video_url,
                "thumbnail_url": v.thumbnail_url,
                "views_count": v.views_count,
                "likes_count": len(eng.get("likes", [])),
                "comments": eng.get("comments", []),
                "created_at": v.created_at.isoformat(),
            }
        )
    await cache_set("videos:list", out, ttl_seconds=45)
    return out


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_video(
    channel_id: int = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    video_file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    ch = db.get(Channel, channel_id)
    if not ch or ch.owner_id != uid:
        raise HTTPException(status_code=403, detail="Channel not found or you do not own it")

    ext = Path(video_file.filename or "video.mp4").suffix.lower() or ".mp4"
    if ext not in {".mp4", ".webm", ".mov", ".ogg", ".mkv"}:
        raise HTTPException(status_code=400, detail="Unsupported video format. Use mp4, webm, mov, ogg, or mkv.")

    videos_dir = Path(settings.UPLOAD_DIR) / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = videos_dir / filename

    content = await video_file.read()
    dest.write_bytes(content)

    video = Video(
        channel_id=ch.id,
        owner_id=uid,
        title=title.strip(),
        description=description.strip(),
        video_url=f"/uploads/videos/{filename}",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    mongo = get_mongo_db()
    await mongo.video_engagements.insert_one({"video_id": video.id, "likes": [], "comments": [], "tags": []})
    await cache_invalidate_prefix("videos:")

    await dispatch_webhook_event(
        event_type="video.uploaded",
        payload={"video_id": video.id, "channel": ch.handle, "title": video.title},
        notify_user_ids=[uid],
        notification_title="Video Uploaded",
        notification_body=f"'{video.title}' is now live on @{ch.handle}",
    )
    return {
        "id": video.id,
        "channel_id": video.channel_id,
        "channel_name": ch.name,
        "channel_handle": ch.handle,
        "channel_image_url": ch.image_url,
        "title": video.title,
        "description": video.description,
        "video_url": video.video_url,
        "views_count": video.views_count,
        "likes_count": 0,
        "comments": [],
        "created_at": video.created_at.isoformat(),
    }


@router.post("/{video_id}/view")
async def record_view(
    video_id: int,
    claims: dict | None = Depends(get_optional_user_claims),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.views_count += 1
    db.commit()

    if claims:
        uid = int(claims["sub"])
        mongo = get_mongo_db()
        await mongo.watch_history.update_one(
            {"user_id": uid, "video_id": video_id},
            {"$set": {"watched_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    return {"views_count": video.views_count}


@router.post("/{video_id}/like")
async def toggle_video_like(
    video_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    if not db.get(Video, video_id):
        raise HTTPException(status_code=404, detail="Video not found")
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    eng = await mongo.video_engagements.find_one({"video_id": video_id})
    if not eng:
        await mongo.video_engagements.insert_one({"video_id": video_id, "likes": [uid], "comments": []})
        return {"liked": True, "likes_count": 1}

    if uid in eng.get("likes", []):
        await mongo.video_engagements.update_one({"video_id": video_id}, {"$pull": {"likes": uid}})
        liked = False
    else:
        await mongo.video_engagements.update_one({"video_id": video_id}, {"$addToSet": {"likes": uid}})
        liked = True
    updated = await mongo.video_engagements.find_one({"video_id": video_id})
    await cache_invalidate_prefix("videos:")
    return {"liked": liked, "likes_count": len(updated.get("likes", []))}


@router.post("/{video_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_video_comment(
    video_id: int,
    payload: VideoCommentRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    if not db.get(Video, video_id):
        raise HTTPException(status_code=404, detail="Video not found")
    uid = int(claims["sub"])
    user = db.get(User, uid)
    comment = {
        "id": str(ObjectId()),
        "author_id": uid,
        "author_username": user.username if user else claims["username"],
        "text": payload.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    mongo = get_mongo_db()
    await mongo.video_engagements.update_one(
        {"video_id": video_id},
        {"$push": {"comments": comment}},
        upsert=True,
    )
    await cache_invalidate_prefix("videos:")
    return comment


# --- Creator Studio Analytics & Playlists ---

class PlaylistCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=500)
    visibility: str = Field(default="public", pattern=r"^(public|unlisted|private)$")


@router.get("/studio/analytics")
async def creator_studio_analytics(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    my_channels = db.scalars(select(Channel).where(Channel.owner_id == uid)).all()
    ch_ids = [c.id for c in my_channels]
    total_subs = (
        db.scalar(select(func.count(ChannelSubscription.id)).where(ChannelSubscription.channel_id.in_(ch_ids)))
        if ch_ids
        else 0
    )
    my_videos = db.scalars(select(Video).where(Video.owner_id == uid).order_by(Video.views_count.desc())).all()
    total_views = sum(v.views_count for v in my_videos)

    mongo = get_mongo_db()
    engs = await mongo.video_engagements.find({"video_id": {"$in": [v.id for v in my_videos]}}).to_list(100)
    total_likes = sum(len(e.get("likes", [])) for e in engs)
    total_comments = sum(len(e.get("comments", [])) for e in engs)

    return {
        "channels_count": len(my_channels),
        "total_subscribers": total_subs or 0,
        "total_videos": len(my_videos),
        "total_views": total_views,
        "total_likes": total_likes,
        "total_comments": total_comments,
        "top_videos": [
            {"id": v.id, "title": v.title, "views_count": v.views_count, "created_at": v.created_at.isoformat()}
            for v in my_videos[:10]
        ],
    }


@router.get("/playlists")
def list_playlists(claims: dict | None = Depends(get_optional_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"]) if claims else None
    pls = db.scalars(select(Playlist).order_by(Playlist.id.desc())).all()
    out = []
    for p in pls:
        if p.visibility == "private" and p.owner_id != uid:
            continue
        count = db.scalar(select(func.count(PlaylistItem.id)).where(PlaylistItem.playlist_id == p.id)) or 0
        out.append(
            {
                "id": p.id,
                "owner_id": p.owner_id,
                "title": p.title,
                "description": p.description,
                "visibility": p.visibility,
                "videos_count": count,
            }
        )
    return out


@router.post("/playlists", status_code=status.HTTP_201_CREATED)
def create_playlist(
    payload: PlaylistCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    pl = Playlist(
        owner_id=uid,
        title=payload.title.strip(),
        description=payload.description.strip(),
        visibility=payload.visibility,
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    return {"id": pl.id, "title": pl.title, "visibility": pl.visibility, "videos_count": 0}


@router.post("/playlists/{playlist_id}/items/{video_id}")
def add_to_playlist(
    playlist_id: int,
    video_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    pl = db.get(Playlist, playlist_id)
    if not pl or pl.owner_id != uid:
        raise HTTPException(status_code=403, detail="Playlist not found or not owned by you")
    if not db.get(Video, video_id):
        raise HTTPException(status_code=404, detail="Video not found")
    existing = db.scalar(
        select(PlaylistItem).where(PlaylistItem.playlist_id == playlist_id, PlaylistItem.video_id == video_id)
    )
    if not existing:
        db.add(PlaylistItem(playlist_id=playlist_id, video_id=video_id))
        db.commit()
    return {"added": True}


@router.get("/my-videos")
def list_my_videos(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    videos = db.scalars(select(Video).where(Video.owner_id == uid).order_by(Video.created_at.desc())).all()
    return [
        {
            "id": v.id,
            "channel_id": v.channel_id,
            "channel_name": v.channel.name if v.channel else "Channel",
            "title": v.title,
            "description": v.description,
            "category": v.category,
            "visibility": v.visibility,
            "video_url": v.video_url,
            "views_count": v.views_count,
            "created_at": v.created_at.isoformat(),
        }
        for v in videos
    ]


@router.patch("/{video_id}")
async def update_video(
    video_id: int,
    payload: VideoUpdateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    video = db.get(Video, video_id)
    if not video or video.owner_id != uid:
        raise HTTPException(status_code=403, detail="Video not found or you do not have permission")
    if payload.title is not None:
        video.title = payload.title.strip()
    if payload.description is not None:
        video.description = payload.description.strip()
    if payload.visibility is not None:
        video.visibility = payload.visibility
    if payload.category is not None:
        video.category = payload.category.strip()
    db.commit()
    db.refresh(video)
    await cache_invalidate_prefix("videos:")
    return {
        "id": video.id,
        "title": video.title,
        "description": video.description,
        "visibility": video.visibility,
        "category": video.category,
    }


@router.delete("/{video_id}")
async def delete_video(
    video_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    video = db.get(Video, video_id)
    if not video or video.owner_id != uid:
        raise HTTPException(status_code=403, detail="Video not found or you do not have permission")
    db.delete(video)
    db.commit()
    mongo = get_mongo_db()
    await mongo.video_engagements.delete_one({"video_id": video_id})
    await cache_invalidate_prefix("videos:")
    return {"deleted": True}


@router.get("/history")
async def get_watch_history(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    docs = await mongo.watch_history.find({"user_id": uid}).sort("watched_at", -1).limit(50).to_list(50)
    if not docs:
        return []
    v_ids = [d["video_id"] for d in docs]
    videos = db.scalars(select(Video).where(Video.id.in_(v_ids))).all()
    v_map = {v.id: v for v in videos}
    out = []
    for d in docs:
        vid = v_map.get(d["video_id"])
        if vid:
            out.append({
                "id": vid.id,
                "title": vid.title,
                "video_url": vid.video_url,
                "views_count": vid.views_count,
                "channel_name": vid.channel.name if vid.channel else "Channel",
                "channel_handle": vid.channel.handle if vid.channel else "channel",
                "watched_at": d["watched_at"].isoformat() if isinstance(d.get("watched_at"), datetime) else str(d.get("watched_at")),
            })
    return out


@router.post("/watch-later/{video_id}")
async def toggle_watch_later(
    video_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if not db.get(Video, video_id):
        raise HTTPException(status_code=404, detail="Video not found")
    mongo = get_mongo_db()
    existing = await mongo.watch_later.find_one({"user_id": uid, "video_id": video_id})
    if existing:
        await mongo.watch_later.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    else:
        await mongo.watch_later.insert_one({"user_id": uid, "video_id": video_id, "saved_at": datetime.now(timezone.utc)})
        return {"saved": True}


@router.get("/watch-later")
async def get_watch_later(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    docs = await mongo.watch_later.find({"user_id": uid}).sort("saved_at", -1).limit(50).to_list(50)
    if not docs:
        return []
    v_ids = [d["video_id"] for d in docs]
    videos = db.scalars(select(Video).where(Video.id.in_(v_ids))).all()
    v_map = {v.id: v for v in videos}
    out = []
    for d in docs:
        vid = v_map.get(d["video_id"])
        if vid:
            out.append({
                "id": vid.id,
                "title": vid.title,
                "video_url": vid.video_url,
                "views_count": vid.views_count,
                "channel_name": vid.channel.name if vid.channel else "Channel",
                "channel_handle": vid.channel.handle if vid.channel else "channel",
                "saved_at": d["saved_at"].isoformat() if isinstance(d.get("saved_at"), datetime) else str(d.get("saved_at")),
            })
    return out
