from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_claims, get_optional_user_claims
from app.db.mongo import get_mongo_db
from app.db.postgres import get_db
from app.models.sql_models import Group, GroupMember, Page, PageMember, User
from app.routers.social import MediaItem, _serialize_post

router = APIRouter(prefix="/api/communities", tags=["Pages & Groups"])


class PageCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    handle: str = Field(min_length=2, max_length=60, pattern=r"^[a-zA-Z0-9_-]+$")
    category: str = Field(default="Business", max_length=60)
    about: str = Field(default="", max_length=1000)
    website: str = Field(default="", max_length=255)


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    privacy: str = Field(default="public", pattern=r"^(public|private)$")
    description: str = Field(default="", max_length=1000)
    rules: str = Field(default="", max_length=1000)


class CommunityPostRequest(BaseModel):
    content: str = Field(default="", max_length=2000)
    image_url: str = Field(default="", max_length=500)
    video_url: str = Field(default="", max_length=500)
    media: list[MediaItem] = Field(default_factory=list)
    post_type: str = Field(default="text", pattern=r"^(text|image|video|media|shared)$")


@router.get("/pages")
def list_pages(db: Session = Depends(get_db)):
    pages = db.scalars(select(Page).order_by(Page.id.desc())).all()
    out = []
    for p in pages:
        followers = db.scalar(select(func.count(PageMember.id)).where(PageMember.page_id == p.id)) or 0
        out.append(
            {
                "id": p.id,
                "owner_id": p.owner_id,
                "name": p.name,
                "handle": p.handle,
                "category": p.category,
                "about": p.about,
                "website": p.website,
                "is_verified": p.is_verified,
                "followers_count": followers,
                "created_at": p.created_at.isoformat(),
            }
        )
    return out


@router.post("/pages", status_code=status.HTTP_201_CREATED)
def create_page(
    payload: PageCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    handle_clean = payload.handle.strip().lower()
    if db.scalar(select(Page).where(Page.handle == handle_clean)):
        raise HTTPException(status_code=400, detail="Page handle already taken")

    page = Page(
        owner_id=uid,
        name=payload.name.strip(),
        handle=handle_clean,
        category=payload.category.strip(),
        about=payload.about.strip(),
        website=payload.website.strip(),
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    db.add(PageMember(page_id=page.id, user_id=uid, role="owner"))
    db.commit()
    return {
        "id": page.id,
        "owner_id": page.owner_id,
        "name": page.name,
        "handle": page.handle,
        "category": page.category,
        "about": page.about,
        "website": page.website,
        "followers_count": 1,
    }


@router.post("/pages/{page_id}/follow")
def toggle_follow_page(
    page_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if not db.get(Page, page_id):
        raise HTTPException(status_code=404, detail="Page not found")
    existing = db.scalar(select(PageMember).where(PageMember.page_id == page_id, PageMember.user_id == uid))
    if existing:
        if existing.role == "owner":
            return {"following": True}
        db.delete(existing)
        db.commit()
        return {"following": False}
    db.add(PageMember(page_id=page_id, user_id=uid, role="follower"))
    db.commit()
    return {"following": True}


@router.get("/pages/{handle}")
def get_page_by_handle(
    handle: str,
    claims: dict | None = Depends(get_optional_user_claims),
    db: Session = Depends(get_db),
):
    handle_clean = handle.strip().lower()
    page = db.scalar(select(Page).where(Page.handle == handle_clean))
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    uid = int(claims["sub"]) if claims else None
    followers = db.scalar(select(func.count(PageMember.id)).where(PageMember.page_id == page.id)) or 0
    member = (
        db.scalar(select(PageMember).where(PageMember.page_id == page.id, PageMember.user_id == uid))
        if uid
        else None
    )
    is_admin = bool(uid and (page.owner_id == uid or (member and member.role in {"owner", "admin"})))
    is_following = bool(member is not None)
    return {
        "id": page.id,
        "owner_id": page.owner_id,
        "name": page.name,
        "handle": page.handle,
        "category": page.category,
        "about": page.about,
        "website": page.website,
        "is_verified": page.is_verified,
        "followers_count": followers,
        "is_admin": is_admin,
        "is_following": is_following,
        "created_at": page.created_at.isoformat(),
    }


@router.get("/pages/{page_id}/posts")
async def list_page_posts(
    page_id: int,
    claims: dict | None = Depends(get_optional_user_claims),
):
    uid = int(claims["sub"]) if claims else None
    mongo = get_mongo_db()
    docs = await mongo.posts.find({"page_id": page_id}).sort("created_at", -1).limit(50).to_list(50)
    return [_serialize_post(d, uid) for d in docs]


@router.post("/pages/{page_id}/posts", status_code=status.HTTP_201_CREATED)
async def create_page_post(
    page_id: int,
    payload: CommunityPostRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    page = db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    member = db.scalar(select(PageMember).where(PageMember.page_id == page_id, PageMember.user_id == uid))
    if page.owner_id != uid and (not member or member.role not in {"owner", "admin"}):
        raise HTTPException(status_code=403, detail="Only Page admins can post or share on this Page")

    content_clean = payload.content.strip()
    image_clean = payload.image_url.strip()
    video_clean = payload.video_url.strip()
    media_items = [m.model_dump() for m in payload.media]
    if not content_clean and not image_clean and not video_clean and not media_items:
        raise HTTPException(status_code=400, detail="Post cannot be empty")

    mongo = get_mongo_db()
    doc = {
        "author_id": uid,
        "author_username": page.handle,
        "author_display_name": page.name,
        "content": content_clean,
        "image_url": image_clean,
        "video_url": video_clean,
        "media": media_items,
        "post_type": payload.post_type,
        "page_id": page.id,
        "group_id": None,
        "reactions": {},
        "comments": [],
        "created_at": datetime.now(timezone.utc),
    }
    res = await mongo.posts.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_post(doc, uid)


@router.get("/groups")
def list_groups(claims: dict | None = Depends(get_optional_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"]) if claims else None
    groups = db.scalars(select(Group).order_by(Group.id.desc())).all()
    out = []
    for g in groups:
        members_count = db.scalar(select(func.count(GroupMember.id)).where(GroupMember.group_id == g.id)) or 0
        joined = False
        if uid:
            joined = db.scalar(select(GroupMember).where(GroupMember.group_id == g.id, GroupMember.user_id == uid)) is not None
        out.append(
            {
                "id": g.id,
                "owner_id": g.owner_id,
                "name": g.name,
                "privacy": g.privacy,
                "description": g.description,
                "rules": g.rules,
                "members_count": members_count,
                "joined": joined,
                "created_at": g.created_at.isoformat(),
            }
        )
    return out


@router.post("/groups", status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    group = Group(
        owner_id=uid,
        name=payload.name.strip(),
        privacy=payload.privacy,
        description=payload.description.strip(),
        rules=payload.rules.strip(),
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    db.add(GroupMember(group_id=group.id, user_id=uid, role="admin"))
    db.commit()
    return {
        "id": group.id,
        "owner_id": group.owner_id,
        "name": group.name,
        "privacy": group.privacy,
        "description": group.description,
        "members_count": 1,
        "joined": True,
    }


@router.post("/groups/{group_id}/join")
def toggle_join_group(
    group_id: int,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if not db.get(Group, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
    existing = db.scalar(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == uid))
    if existing:
        if existing.role == "admin":
            return {"joined": True}
        db.delete(existing)
        db.commit()
        return {"joined": False}
    db.add(GroupMember(group_id=group_id, user_id=uid, role="member"))
    db.commit()
    return {"joined": True}


@router.get("/groups/{group_id}/posts")
async def list_group_posts(group_id: int):
    mongo = get_mongo_db()
    docs = await mongo.posts.find({"group_id": group_id}).sort("created_at", -1).limit(30).to_list(30)
    return [
        {
            "id": str(d["_id"]),
            "author_username": d["author_username"],
            "author_display_name": d["author_display_name"],
            "content": d["content"],
            "created_at": d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/groups/{group_id}/posts", status_code=status.HTTP_201_CREATED)
async def create_group_post(
    group_id: int,
    payload: CommunityPostRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if not db.scalar(select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == uid)):
        raise HTTPException(status_code=403, detail="Join the group before posting")
    user = db.get(User, uid)
    mongo = get_mongo_db()
    doc = {
        "author_id": uid,
        "author_username": user.username if user else claims["username"],
        "author_display_name": user.display_name if user else claims["username"],
        "content": payload.content.strip(),
        "page_id": None,
        "group_id": group_id,
        "reactions": {},
        "comments": [],
        "created_at": datetime.now(timezone.utc),
    }
    res = await mongo.posts.insert_one(doc)
    return {"id": str(res.inserted_id), "content": doc["content"], "author_display_name": doc["author_display_name"]}
