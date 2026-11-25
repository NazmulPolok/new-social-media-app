from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_claims, get_optional_user_claims
from app.core.uploads import save_upload_file
from app.db.mongo import get_mongo_db
from app.db.postgres import get_db
from app.db.redis_cache import cache_get, cache_invalidate_prefix, cache_set
from app.models.sql_models import AuditLog, Follow, FriendRequest, Friendship, User, UserBlock
from app.services.webhook_service import dispatch_webhook_event

router = APIRouter(prefix="/api/social", tags=["Social"])

REACTION_TYPES = {"like", "love", "care", "haha", "wow", "sad", "angry"}


class MediaItem(BaseModel):
    url: str = Field(max_length=500)
    media_type: str = Field(pattern=r"^(image|video)$")


class PostCreateRequest(BaseModel):
    content: str = Field(default="", max_length=3000)
    image_url: str = Field(default="", max_length=500)
    video_url: str = Field(default="", max_length=500)
    media: list[MediaItem] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    audience: str = Field(default="public", pattern=r"^(public|friends|only_me)$")
    post_type: str = Field(default="text", pattern=r"^(text|image|video|media|poll|shared)$")
    poll_options: list[str] = Field(default_factory=list)


class ReactRequest(BaseModel):
    reaction: str = Field(default="like", pattern=r"^(like|love|care|haha|wow|sad|angry)$")


class CommentCreateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    parent_id: str | None = None


class StoryCreateRequest(BaseModel):
    text: str = Field(default="", max_length=300)
    image_url: str = Field(default="", max_length=500)
    bg_color: str = Field(default="#DE4018", max_length=20)


class SaveItemRequest(BaseModel):
    target_type: str = Field(default="post", pattern=r"^(post|video|product|project)$")
    target_id: str = Field(min_length=1, max_length=100)
    collection_name: str = Field(default="All Items", max_length=60)
    title: str = Field(default="", max_length=200)
    image_url: str = Field(default="", max_length=500)
    snippet: str = Field(default="", max_length=500)


def _serialize_post(doc: dict, current_uid: int | None, avatar_map: dict[int, str] | None = None) -> dict:
    reactions_map: dict[str, str] = doc.get("reactions", {})
    # Backwards compatibility with legacy `likes` array
    for uid_int in doc.get("likes", []):
        reactions_map.setdefault(str(uid_int), "like")

    counts: dict[str, int] = {}
    for rtype in reactions_map.values():
        counts[rtype] = counts.get(rtype, 0) + 1

    my_reaction = reactions_map.get(str(current_uid)) if current_uid else None
    total_reactions = len(reactions_map)

    return {
        "id": str(doc["_id"]),
        "author_id": doc["author_id"],
        "author_username": doc["author_username"],
        "author_display_name": doc["author_display_name"],
        "author_avatar_url": (avatar_map or {}).get(doc["author_id"], doc.get("author_avatar_url", "")),
        "content": doc["content"],
        "image_url": doc.get("image_url", ""),
        "video_url": doc.get("video_url", ""),
        "media": doc.get("media", []),
        "tags": doc.get("tags", []),
        "audience": doc.get("audience", "public"),
        "post_type": doc.get("post_type", "text"),
        "poll_options": doc.get("poll_options", []),
        "page_id": doc.get("page_id"),
        "group_id": doc.get("group_id"),
        "likes_count": total_reactions,
        "liked_by_me": my_reaction is not None,
        "my_reaction": my_reaction,
        "reaction_counts": counts,
        "comments": doc.get("comments", []),
        "created_at": doc["created_at"].isoformat(),
    }


@router.get("/posts")
async def list_posts(
    section: str = "home",
    username: str | None = None,
    claims: dict | None = Depends(get_optional_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"]) if claims else None
    cache_key = f"social:posts:{uid or 'anon'}:{section}:{username or 'all'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    mongo = get_mongo_db()
    query: dict = {"page_id": None, "group_id": None}
    if username:
        query["author_username"] = username.strip().lower()

    if uid:
        blocked = db.scalars(select(UserBlock.blocked_id).where(UserBlock.blocker_id == uid)).all()
        if blocked:
            query["author_id"] = {"$nin": list(blocked)}

    docs = await mongo.posts.find(query).sort("created_at", -1).limit(50).to_list(50)

    # Filter audience permissions
    friend_ids: set[int] = set()
    if uid:
        fships = db.scalars(
            select(Friendship).where((Friendship.user_a_id == uid) | (Friendship.user_b_id == uid))
        ).all()
        for f in fships:
            friend_ids.add(f.user_b_id if f.user_a_id == uid else f.user_a_id)

    visible_docs = []
    for d in docs:
        aud = d.get("audience", "public")
        aid = d["author_id"]
        if aud == "only_me" and aid != uid:
            continue
        if aud == "friends" and aid != uid and aid not in friend_ids:
            continue
        visible_docs.append(d)

    author_ids = list({d["author_id"] for d in visible_docs})
    avatar_map: dict[int, str] = {}
    if author_ids:
        rows = db.execute(select(User.id, User.avatar_url).where(User.id.in_(author_ids))).all()
        avatar_map = {row[0]: row[1] for row in rows}

    data = [_serialize_post(d, uid, avatar_map) for d in visible_docs]
    await cache_set(cache_key, data, ttl_seconds=20)
    return data


@router.post("/upload")
async def upload_post_media(
    files: list[UploadFile] = File(...),
    claims: dict = Depends(get_current_user_claims),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    items = []
    for f in files:
        url, media_type = await save_upload_file(f, subdir="posts", allow_video=True)
        items.append({"url": url, "media_type": media_type})
    return {"items": items}


@router.post("/posts", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    content_clean = payload.content.strip()
    image_clean = payload.image_url.strip()
    video_clean = payload.video_url.strip()
    media_items = [m.model_dump() for m in payload.media]

    if not content_clean and not image_clean and not video_clean and not media_items:
        raise HTTPException(status_code=400, detail="Post must include text, a photo, or a video")

    post_type = payload.post_type
    if post_type == "text" and media_items:
        post_type = "media"
    elif post_type == "text" and video_clean:
        post_type = "video"
    elif post_type == "text" and image_clean:
        post_type = "image"

    mongo = get_mongo_db()
    poll_opts = [{"text": opt.strip(), "votes": []} for opt in payload.poll_options if opt.strip()]
    doc = {
        "author_id": user.id,
        "author_username": user.username,
        "author_display_name": user.display_name,
        "author_avatar_url": user.avatar_url,
        "content": content_clean,
        "image_url": image_clean,
        "video_url": video_clean,
        "media": media_items,
        "tags": [t.strip().lstrip("#") for t in payload.tags if t.strip()],
        "audience": payload.audience,
        "post_type": post_type,
        "poll_options": poll_opts,
        "page_id": None,
        "group_id": None,
        "reactions": {},
        "comments": [],
        "created_at": datetime.now(timezone.utc),
    }
    res = await mongo.posts.insert_one(doc)
    doc["_id"] = res.inserted_id

    await cache_invalidate_prefix("social:posts:")
    await dispatch_webhook_event(
        event_type="post.created",
        payload={"post_id": str(res.inserted_id), "author": user.username},
    )
    return _serialize_post(doc, uid)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, claims: dict = Depends(get_current_user_claims)):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(post_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid post id") from exc

    doc = await mongo.posts.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")
    if doc["author_id"] != uid and claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    await mongo.posts.delete_one({"_id": oid})
    await cache_invalidate_prefix("social:posts:")
    return {"deleted": True}


@router.post("/posts/{post_id}/react")
async def react_to_post(
    post_id: str,
    payload: ReactRequest,
    claims: dict = Depends(get_current_user_claims),
):
    mongo = get_mongo_db()
    uid_str = str(int(claims["sub"]))
    try:
        oid = ObjectId(post_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid post id") from exc

    doc = await mongo.posts.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")

    reactions = doc.get("reactions", {})
    current = reactions.get(uid_str)
    if current == payload.reaction:
        await mongo.posts.update_one({"_id": oid}, {"$unset": {f"reactions.{uid_str}": ""}})
        my_reaction = None
    else:
        await mongo.posts.update_one({"_id": oid}, {"$set": {f"reactions.{uid_str}": payload.reaction}})
        my_reaction = payload.reaction

    updated = await mongo.posts.find_one({"_id": oid})
    await cache_invalidate_prefix("social:posts:")
    serialized = _serialize_post(updated, int(claims["sub"]))
    return {
        "my_reaction": my_reaction,
        "liked": my_reaction is not None,
        "likes_count": serialized["likes_count"],
        "reaction_counts": serialized["reaction_counts"],
    }


@router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, claims: dict = Depends(get_current_user_claims)):
    return await react_to_post(post_id, ReactRequest(reaction="like"), claims)


@router.post("/posts/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    post_id: str,
    payload: CommentCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    mongo = get_mongo_db()
    uid = int(claims["sub"])
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        oid = ObjectId(post_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid post id") from exc

    comment = {
        "id": str(ObjectId()),
        "parent_id": payload.parent_id,
        "author_id": user.id,
        "author_username": user.username,
        "author_display_name": user.display_name,
        "text": payload.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await mongo.posts.update_one({"_id": oid}, {"$push": {"comments": comment}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    await cache_invalidate_prefix("social:posts:")
    return comment


# --- Stories (24h expiring) ---

@router.get("/stories")
async def list_stories():
    mongo = get_mongo_db()
    now = datetime.now(timezone.utc)
    docs = await mongo.stories.find({"expires_at": {"$gt": now}}).sort("created_at", -1).limit(30).to_list(30)
    return [
        {
            "id": str(d["_id"]),
            "author_id": d["author_id"],
            "author_username": d["author_username"],
            "author_display_name": d["author_display_name"],
            "text": d.get("text", ""),
            "image_url": d.get("image_url", ""),
            "bg_color": d.get("bg_color", "#DE4018"),
            "viewers_count": len(d.get("viewers", [])),
            "expires_at": d["expires_at"].isoformat(),
            "created_at": d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/stories", status_code=status.HTTP_201_CREATED)
async def create_story(
    payload: StoryCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    if not payload.text.strip() and not payload.image_url.strip():
        raise HTTPException(status_code=400, detail="Story must have text or an image")
    uid = int(claims["sub"])
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    doc = {
        "author_id": user.id,
        "author_username": user.username,
        "author_display_name": user.display_name,
        "text": payload.text.strip(),
        "image_url": payload.image_url.strip(),
        "bg_color": payload.bg_color.strip() or "#DE4018",
        "viewers": [],
        "created_at": now,
        "expires_at": now + timedelta(hours=24),
    }
    mongo = get_mongo_db()
    res = await mongo.stories.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "author_id": user.id,
        "author_username": user.username,
        "author_display_name": user.display_name,
        "text": doc["text"],
        "image_url": doc["image_url"],
        "bg_color": doc["bg_color"],
        "viewers_count": 0,
        "expires_at": doc["expires_at"].isoformat(),
        "created_at": now.isoformat(),
    }


# --- Friends & Followers (separate relationships) ---

@router.post("/follow/{target_user_id}")
def toggle_follow(
    target_user_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if uid == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    existing = db.scalar(
        select(Follow).where(Follow.follower_id == uid, Follow.following_id == target_user_id)
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"following": False}

    db.add(Follow(follower_id=uid, following_id=target_user_id))
    db.commit()
    return {"following": True}


@router.post("/friends/request/{target_user_id}", status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    target_user_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if uid == target_user_id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as friend")
    if not db.get(User, target_user_id):
        raise HTTPException(status_code=404, detail="User not found")

    a, b = sorted([uid, target_user_id])
    if db.scalar(select(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)):
        return {"status": "already_friends"}

    existing = db.scalar(
        select(FriendRequest).where(
            FriendRequest.sender_id == uid,
            FriendRequest.receiver_id == target_user_id,
            FriendRequest.status == "pending",
        )
    )
    if existing:
        return {"id": existing.id, "status": "pending"}

    req = FriendRequest(sender_id=uid, receiver_id=target_user_id, status="pending")
    db.add(req)
    db.commit()
    db.refresh(req)

    await dispatch_webhook_event(
        event_type="friend.request",
        payload={"request_id": req.id, "sender_id": uid, "receiver_id": target_user_id},
        notify_user_ids=[target_user_id],
        notification_title="New Friend Request",
        notification_body=f"@{claims['username']} sent you a friend request",
    )
    return {"id": req.id, "status": "pending"}


@router.get("/friends/requests")
def list_friend_requests(claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"])
    reqs = db.scalars(
        select(FriendRequest).where(FriendRequest.receiver_id == uid, FriendRequest.status == "pending")
    ).all()
    out = []
    for r in reqs:
        sender = db.get(User, r.sender_id)
        if sender:
            out.append(
                {
                    "id": r.id,
                    "sender_id": sender.id,
                    "sender_username": sender.username,
                    "sender_display_name": sender.display_name,
                    "created_at": r.created_at.isoformat(),
                }
            )
    return out


@router.post("/friends/accept/{request_id}")
async def accept_friend_request(
    request_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    req = db.get(FriendRequest, request_id)
    if not req or req.receiver_id != uid or req.status != "pending":
        raise HTTPException(status_code=404, detail="Friend request not found")

    req.status = "accepted"
    a, b = sorted([req.sender_id, req.receiver_id])
    if not db.scalar(select(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)):
        db.add(Friendship(user_a_id=a, user_b_id=b))
    db.commit()

    await dispatch_webhook_event(
        event_type="friend.accepted",
        payload={"user_id": uid, "friend_id": req.sender_id},
        notify_user_ids=[req.sender_id],
        notification_title="Friend Request Accepted",
        notification_body=f"@{claims['username']} accepted your friend request",
    )
    return {"accepted": True}


@router.get("/friends")
def list_friends(claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"])
    fships = db.scalars(
        select(Friendship).where(or_(Friendship.user_a_id == uid, Friendship.user_b_id == uid))
    ).all()
    friend_ids = [f.user_b_id if f.user_a_id == uid else f.user_a_id for f in fships]
    if not friend_ids:
        return []
    users = db.scalars(select(User).where(User.id.in_(friend_ids))).all()
    return [{"id": u.id, "username": u.username, "display_name": u.display_name} for u in users]


@router.post("/block/{target_user_id}")
def toggle_block(
    target_user_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    existing = db.scalar(
        select(UserBlock).where(UserBlock.blocker_id == uid, UserBlock.blocked_id == target_user_id)
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"blocked": False}
    db.add(UserBlock(blocker_id=uid, blocked_id=target_user_id))
    db.commit()
    return {"blocked": True}


@router.post("/saved")
async def save_item(
    req: SaveItemRequest,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    db = get_mongo_db()
    existing = await db.saved_items.find_one({"user_id": uid, "target_type": req.target_type, "target_id": req.target_id})
    if existing:
        await db.saved_items.update_one(
            {"_id": existing["_id"]},
            {"$set": {"collection_name": req.collection_name, "updated_at": datetime.now(timezone.utc)}}
        )
        return {"saved": True, "id": str(existing["_id"]), "updated": True}

    res = await db.saved_items.insert_one({
        "user_id": uid,
        "target_type": req.target_type,
        "target_id": req.target_id,
        "collection_name": req.collection_name or "All Items",
        "title": req.title,
        "image_url": req.image_url,
        "snippet": req.snippet,
        "created_at": datetime.now(timezone.utc),
    })
    return {"saved": True, "id": str(res.inserted_id), "updated": False}


@router.get("/saved")
async def list_saved_items(
    collection: str | None = None,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    db = get_mongo_db()
    q: dict = {"user_id": uid}
    if collection and collection != "All Items":
        q["collection_name"] = collection
    cursor = db.saved_items.find(q).sort("created_at", -1).limit(100)
    docs = await cursor.to_list(length=100)
    return [
        {
            "id": str(d["_id"]),
            "target_type": d["target_type"],
            "target_id": d["target_id"],
            "collection_name": d.get("collection_name", "All Items"),
            "title": d.get("title", ""),
            "image_url": d.get("image_url", ""),
            "snippet": d.get("snippet", ""),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else str(d.get("created_at", "")),
        }
        for d in docs
    ]


@router.delete("/saved/{item_id}")
async def delete_saved_item(
    item_id: str,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    db = get_mongo_db()
    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid item ID")
    res = await db.saved_items.delete_one({"_id": oid, "user_id": uid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Saved item not found")
    return {"deleted": True}


@router.get("/saved/collections")
async def list_saved_collections(
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    db = get_mongo_db()
    cols = await db.saved_items.distinct("collection_name", {"user_id": uid})
    all_cols = sorted(list(set(["All Items"] + [c for c in cols if c])))
    return all_cols


@router.get("/memories")
async def get_memories(
    claims: dict = Depends(get_current_user_claims),
    db_sql: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    db = get_mongo_db()
    now = datetime.now(timezone.utc)

    cursor = db.posts.find({"author_id": uid}).sort("created_at", -1).limit(200)
    posts = await cursor.to_list(length=200)

    matched = []
    for p in posts:
        cat = p.get("created_at")
        if not isinstance(cat, datetime):
            continue
        if cat.tzinfo is None:
            cat = cat.replace(tzinfo=timezone.utc)
        diff_years = now.year - cat.year
        diff_days = (now - cat).days
        if (diff_years >= 1 and cat.month == now.month and cat.day == now.day) or (diff_days in [7, 30, 60, 90, 180, 365]):
            label = f"{diff_years} year{'s' if diff_years > 1 else ''} ago" if diff_years >= 1 else f"{diff_days} days ago"
            serialized = _serialize_post(p, uid)
            serialized["memory_label"] = label
            matched.append(serialized)

    if not matched and posts:
        for p in posts[:3]:
            p_cat = p.get("created_at")
            if isinstance(p_cat, datetime):
                if p_cat.tzinfo is None:
                    p_cat = p_cat.replace(tzinfo=timezone.utc)
                diff_days = max(1, (now - p_cat).days)
            else:
                diff_days = 1
            label = f"{diff_days} day{'s' if diff_days > 1 else ''} ago milestone"
            serialized = _serialize_post(p, uid)
            serialized["memory_label"] = label
            matched.append(serialized)

    return {
        "title": "On This Day",
        "description": "Look back at the moments and posts you shared.",
        "memories": matched,
    }


@router.get("/activity-log")
async def get_activity_log(
    action_type: str | None = None,
    claims: dict = Depends(get_current_user_claims),
    db_sql: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    db_mongo = get_mongo_db()

    activities = []

    # 1. Audit logs from SQL
    audit_q = select(AuditLog).where(AuditLog.actor_id == uid).order_by(AuditLog.created_at.desc()).limit(50)
    audit_rows = db_sql.scalars(audit_q).all()
    for row in audit_rows:
        activities.append({
            "id": f"audit_{row.id}",
            "type": "security",
            "action": row.action,
            "target": row.target,
            "details": row.details,
            "created_at": row.created_at.isoformat(),
        })

    # 2. Posts created by user
    post_cursor = db_mongo.posts.find({"author_id": uid}).sort("created_at", -1).limit(30)
    user_posts = await post_cursor.to_list(length=30)
    for p in user_posts:
        cat = p.get("created_at")
        activities.append({
            "id": f"post_{p['_id']}",
            "type": "post",
            "action": "Created a post",
            "target": p.get("content", "")[:60] or "Media post",
            "details": f"Post type: {p.get('post_type', 'text')}",
            "created_at": cat.isoformat() if isinstance(cat, datetime) else str(cat),
        })

    activities.sort(key=lambda x: x["created_at"], reverse=True)
    if action_type:
        activities = [a for a in activities if a["type"] == action_type or action_type in a["action"].lower()]

    return {
        "user_id": uid,
        "total_activities": len(activities),
        "activities": activities[:60],
    }
