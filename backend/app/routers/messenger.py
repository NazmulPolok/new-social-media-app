import secrets
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_claims
from app.core.uploads import save_upload_file
from app.db.mongo import get_mongo_db
from app.db.postgres import get_db
from app.models.sql_models import Friendship, User
from app.services.webhook_service import _push_sse, dispatch_webhook_event

router = APIRouter(prefix="/api/messenger", tags=["Messenger"])


class ConversationStartRequest(BaseModel):
    recipient_id: int


class GroupChatCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class MessageSendRequest(BaseModel):
    text: str = Field(default="", max_length=2000)
    media_url: str = Field(default="", max_length=500)
    media_type: str = Field(default="", pattern=r"^(|image|video|audio)$")


class MessageEditRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.get("/conversations")
async def list_conversations(
    folder: str = "inbox",
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    docs = await mongo.conversations.find({"participants": uid}).sort("updated_at", -1).to_list(100)

    # User friendships to distinguish friend chats from stranger requests
    fships = db.scalars(
        select(Friendship).where(or_(Friendship.user_a_id == uid, Friendship.user_b_id == uid))
    ).all()
    friend_ids = {f.user_b_id if f.user_a_id == uid else f.user_a_id for f in fships}

    other_ids = {pid for d in docs if not d.get("is_group") for pid in d["participants"] if pid != uid}
    users = db.scalars(select(User).where(User.id.in_(other_ids))).all() if other_ids else []
    user_map = {u.id: {"id": u.id, "username": u.username, "display_name": u.display_name} for u in users}

    result = []
    for d in docs:
        is_group = bool(d.get("is_group", False))
        peers = (
            []
            if is_group
            else [
                user_map.get(pid, {"id": pid, "username": f"user{pid}", "display_name": f"User {pid}"})
                for pid in d["participants"]
                if pid != uid
            ]
        )
        is_archived = uid in d.get("archived_by", [])
        is_request = (not is_group) and bool(peers) and (peers[0]["id"] not in friend_ids)

        if folder == "archived" and not is_archived:
            continue
        if folder == "requests" and (is_archived or not is_request):
            continue
        if folder == "inbox" and (is_archived or is_request):
            continue

        result.append(
            {
                "id": str(d["_id"]),
                "is_group": is_group,
                "name": d.get("name", ""),
                "admin_id": d.get("admin_id"),
                "invite_code": d.get("invite_code", "") if d.get("admin_id") == uid or is_group else "",
                "pending_count": len(d.get("pending_requests", [])) if d.get("admin_id") == uid else 0,
                "participants": d["participants"],
                "peer": peers[0] if peers else None,
                "last_message": d.get("last_message", ""),
                "is_archived": is_archived,
                "is_request": is_request,
                "updated_at": d["updated_at"].isoformat(),
            }
        )
    return result


@router.post("/conversations/{conversation_id}/archive")
async def toggle_archive_conversation(
    conversation_id: str,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "participants": uid})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    archived_by = convo.get("archived_by", [])
    if uid in archived_by:
        await mongo.conversations.update_one({"_id": oid}, {"$pull": {"archived_by": uid}})
        return {"archived": False}
    else:
        await mongo.conversations.update_one({"_id": oid}, {"$addToSet": {"archived_by": uid}})
        return {"archived": True}


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def start_or_get_conversation(
    payload: ConversationStartRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    if uid == payload.recipient_id:
        raise HTTPException(status_code=400, detail="Cannot start conversation with yourself")

    recipient = db.get(User, payload.recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found")

    participants = sorted([uid, payload.recipient_id])
    mongo = get_mongo_db()
    existing = await mongo.conversations.find_one({"participants": participants, "is_group": {"$ne": True}})
    if existing:
        return {
            "id": str(existing["_id"]),
            "is_group": False,
            "participants": existing["participants"],
            "peer": {"id": recipient.id, "username": recipient.username, "display_name": recipient.display_name},
            "last_message": existing.get("last_message", ""),
            "updated_at": existing["updated_at"].isoformat(),
        }

    now = datetime.now(timezone.utc)
    doc = {
        "is_group": False,
        "participants": participants,
        "last_message": "",
        "created_at": now,
        "updated_at": now,
    }
    res = await mongo.conversations.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "is_group": False,
        "participants": participants,
        "peer": {"id": recipient.id, "username": recipient.username, "display_name": recipient.display_name},
        "last_message": "",
        "updated_at": now.isoformat(),
    }


@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_group_chat(
    payload: GroupChatCreateRequest,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    now = datetime.now(timezone.utc)
    invite_code = secrets.token_urlsafe(8)
    doc = {
        "is_group": True,
        "name": payload.name.strip(),
        "admin_id": uid,
        "invite_code": invite_code,
        "participants": [uid],
        "pending_requests": [],
        "last_message": "Group created",
        "created_at": now,
        "updated_at": now,
    }
    res = await mongo.conversations.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "is_group": True,
        "name": doc["name"],
        "admin_id": uid,
        "invite_code": invite_code,
        "pending_count": 0,
        "participants": [uid],
        "last_message": doc["last_message"],
        "updated_at": now.isoformat(),
    }


@router.post("/groups/join/{invite_code}")
async def request_join_group(
    invite_code: str,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    username = claims["username"]
    mongo = get_mongo_db()
    convo = await mongo.conversations.find_one({"is_group": True, "invite_code": invite_code.strip()})
    if not convo:
        raise HTTPException(status_code=404, detail="Invalid group invite link")

    if uid in convo.get("participants", []):
        return {"status": "already_member", "conversation_id": str(convo["_id"]), "name": convo["name"]}

    await mongo.conversations.update_one(
        {"_id": convo["_id"]},
        {"$addToSet": {"pending_requests": uid}},
    )

    await dispatch_webhook_event(
        event_type="group.join_request",
        payload={"conversation_id": str(convo["_id"]), "group_name": convo["name"], "user_id": uid},
        notify_user_ids=[convo["admin_id"]],
        notification_title=f"Group Join Request: {convo['name']}",
        notification_body=f"@{username} requested to join your group chat",
    )
    return {"status": "pending_admin_approval", "group_name": convo["name"]}


@router.get("/groups/{conversation_id}/requests")
async def list_group_join_requests(
    conversation_id: str,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "is_group": True})
    if not convo or convo.get("admin_id") != uid:
        raise HTTPException(status_code=403, detail="Only the group admin can view join requests")

    pending_ids = convo.get("pending_requests", [])
    if not pending_ids:
        return []
    users = db.scalars(select(User).where(User.id.in_(pending_ids))).all()
    return [{"id": u.id, "username": u.username, "display_name": u.display_name} for u in users]


@router.post("/groups/{conversation_id}/approve/{target_user_id}")
async def approve_group_member(
    conversation_id: str,
    target_user_id: int,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "is_group": True})
    if not convo or convo.get("admin_id") != uid:
        raise HTTPException(status_code=403, detail="Only the group admin can approve members")

    await mongo.conversations.update_one(
        {"_id": oid},
        {
            "$pull": {"pending_requests": target_user_id},
            "$addToSet": {"participants": target_user_id},
        },
    )

    await dispatch_webhook_event(
        event_type="group.member_approved",
        payload={"conversation_id": conversation_id, "group_name": convo["name"], "user_id": target_user_id},
        notify_user_ids=[target_user_id],
        notification_title=f"Approved to join {convo['name']}",
        notification_body="Group admin approved your join request. You can now chat!",
    )
    return {"approved": True}


@router.post("/groups/{conversation_id}/reject/{target_user_id}")
async def reject_group_member(
    conversation_id: str,
    target_user_id: int,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "is_group": True})
    if not convo or convo.get("admin_id") != uid:
        raise HTTPException(status_code=403, detail="Only the group admin can reject members")

    await mongo.conversations.update_one(
        {"_id": oid},
        {"$pull": {"pending_requests": target_user_id}},
    )
    return {"rejected": True}


@router.post("/conversations/{conversation_id}/typing")
async def send_typing_indicator(
    conversation_id: str,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    username = claims["username"]
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "participants": uid})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    recipients = [pid for pid in convo["participants"] if pid != uid]
    _push_sse(
        recipients,
        {
            "event": "typing",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {"conversation_id": conversation_id, "user_id": uid, "username": username},
        },
    )
    return {"ok": True}


@router.get("/conversations/{conversation_id}/members")
async def get_conversation_members(
    conversation_id: str,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "participants": uid})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    users = db.scalars(select(User).where(User.id.in_(convo["participants"]))).all()
    return [{"id": u.id, "username": u.username, "display_name": u.display_name} for u in users]


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, claims: dict = Depends(get_current_user_claims)):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "participants": uid})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msgs = await mongo.messages.find({"conversation_id": conversation_id}).sort("created_at", 1).limit(200).to_list(200)
    return [
        {
            "id": str(m["_id"]),
            "conversation_id": m["conversation_id"],
            "sender_id": m["sender_id"],
            "sender_username": m["sender_username"],
            "text": m.get("text", ""),
            "media_url": m.get("media_url", ""),
            "media_type": m.get("media_type", ""),
            "edited": bool(m.get("edited", False)),
            "created_at": m["created_at"].isoformat(),
        }
        for m in msgs
    ]


@router.post("/upload")
async def upload_messenger_media(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
):
    url, media_type = await save_upload_file(file, subdir="messenger", allow_video=True, allow_audio=True)
    return {"url": url, "media_type": media_type}


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str,
    payload: MessageSendRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    username = claims["username"]
    mongo = get_mongo_db()

    try:
        oid = ObjectId(conversation_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from exc

    convo = await mongo.conversations.find_one({"_id": oid, "participants": uid})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    text_clean = payload.text.strip()
    media_url_clean = payload.media_url.strip()
    media_type_clean = payload.media_type.strip()
    if not text_clean and not media_url_clean:
        raise HTTPException(status_code=400, detail="Message must include text or media")

    now = datetime.now(timezone.utc)
    msg_doc = {
        "conversation_id": conversation_id,
        "sender_id": uid,
        "sender_username": username,
        "text": text_clean,
        "media_url": media_url_clean,
        "media_type": media_type_clean,
        "edited": False,
        "created_at": now,
    }
    res = await mongo.messages.insert_one(msg_doc)
    last_preview = text_clean or (
        "Sent an audio note"
        if media_type_clean == "audio"
        else ("Sent a video" if media_type_clean == "video" else "Sent a photo")
    )
    await mongo.conversations.update_one(
        {"_id": oid},
        {"$set": {"last_message": last_preview, "updated_at": now}},
    )

    # Detect @mentions in group chat
    import re
    mentioned_usernames = {m.lower() for m in re.findall(r"@([a-zA-Z0-9_]+)", msg_doc["text"])}
    mentioned_ids: list[int] = []
    if mentioned_usernames:
        mentioned_users = db.scalars(
            select(User).where(User.username.in_(mentioned_usernames), User.id.in_(convo["participants"]))
        ).all()
        mentioned_ids = [u.id for u in mentioned_users if u.id != uid]

    recipients = [pid for pid in convo["participants"] if pid != uid]
    serialized = {
        "id": str(res.inserted_id),
        "conversation_id": conversation_id,
        "sender_id": uid,
        "sender_username": username,
        "text": msg_doc["text"],
        "media_url": msg_doc["media_url"],
        "media_type": msg_doc["media_type"],
        "edited": False,
        "created_at": now.isoformat(),
    }

    await dispatch_webhook_event(
        event_type="message.created",
        payload=serialized,
        notify_user_ids=recipients + [uid],
        notification_title=f"New message from @{username}",
        notification_body=last_preview[:100],
    )
    if mentioned_ids and convo.get("is_group"):
        await dispatch_webhook_event(
            event_type="group.mention",
            payload={"conversation_id": conversation_id, "group_name": convo.get("name", ""), "from": username},
            notify_user_ids=mentioned_ids,
            notification_title=f"@{username} mentioned you in {convo.get('name', 'Group')}",
            notification_body=last_preview[:100],
        )
    return serialized


@router.patch("/messages/{message_id}")
async def edit_group_message(
    message_id: str,
    payload: MessageEditRequest,
    claims: dict = Depends(get_current_user_claims),
):
    uid = int(claims["sub"])
    mongo = get_mongo_db()
    try:
        mid = ObjectId(message_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid message id") from exc

    msg = await mongo.messages.find_one({"_id": mid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg["sender_id"] != uid:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    convo = await mongo.conversations.find_one({"_id": ObjectId(msg["conversation_id"]), "participants": uid})
    if not convo or not convo.get("is_group"):
        raise HTTPException(status_code=403, detail="Editing messages is only enabled in group chats")

    new_text = payload.text.strip()
    now = datetime.now(timezone.utc)
    await mongo.messages.update_one(
        {"_id": mid},
        {"$set": {"text": new_text, "edited": True, "edited_at": now}},
    )

    updated = {
        "id": str(msg["_id"]),
        "conversation_id": msg["conversation_id"],
        "sender_id": msg["sender_id"],
        "sender_username": msg["sender_username"],
        "text": new_text,
        "media_url": msg.get("media_url", ""),
        "media_type": msg.get("media_type", ""),
        "edited": True,
        "created_at": msg["created_at"].isoformat(),
    }
    recipients = [pid for pid in convo["participants"] if pid != uid]
    _push_sse(
        recipients,
        {
            "event": "message.edited",
            "timestamp": now.isoformat(),
            "data": updated,
        },
    )
    return updated
