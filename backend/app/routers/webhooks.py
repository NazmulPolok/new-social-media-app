import asyncio
import json
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.security import get_current_user_claims, get_optional_user_claims, verify_webhook_signature
from app.db.mongo import get_mongo_db
from app.services.webhook_service import dispatch_webhook_event, subscribe_sse, unsubscribe_sse

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


class WebhookCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    target_url: str = Field(min_length=8, max_length=500)
    events: list[str] = Field(default_factory=lambda: ["*"])
    secret: str = Field(default="", max_length=128)


class WebhookTestRequest(BaseModel):
    event_type: str = "webhook.test"
    message: str = "Test event from NexusHub Webhook Console"


@router.get("/subscriptions")
async def list_subscriptions(claims: dict = Depends(get_current_user_claims)):
    mongo = get_mongo_db()
    docs = await mongo.webhook_subscriptions.find({"owner_id": int(claims["sub"])}).sort("created_at", -1).to_list(50)
    return [
        {
            "id": str(d["_id"]),
            "name": d["name"],
            "target_url": d["target_url"],
            "events": d["events"],
            "active": d["active"],
            "created_at": d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(payload: WebhookCreateRequest, claims: dict = Depends(get_current_user_claims)):
    mongo = get_mongo_db()
    doc = {
        "owner_id": int(claims["sub"]),
        "name": payload.name.strip(),
        "target_url": payload.target_url.strip(),
        "events": payload.events or ["*"],
        "secret": payload.secret.strip(),
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    res = await mongo.webhook_subscriptions.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "name": doc["name"],
        "target_url": doc["target_url"],
        "events": doc["events"],
        "active": doc["active"],
        "created_at": doc["created_at"].isoformat(),
    }


@router.delete("/subscriptions/{sub_id}")
async def delete_subscription(sub_id: str, claims: dict = Depends(get_current_user_claims)):
    mongo = get_mongo_db()
    try:
        oid = ObjectId(sub_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid subscription id") from exc
    res = await mongo.webhook_subscriptions.delete_one({"_id": oid, "owner_id": int(claims["sub"])})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook subscription not found")
    return {"deleted": True}


@router.get("/deliveries")
async def list_deliveries():
    mongo = get_mongo_db()
    docs = await mongo.webhook_deliveries.find().sort("delivered_at", -1).limit(40).to_list(40)
    return [
        {
            "id": str(d["_id"]),
            "event_type": d["event_type"],
            "target_url": d["target_url"],
            "status_code": d["status_code"],
            "signature": d["signature"],
            "payload": d["payload"],
            "response_body": d.get("response_body", ""),
            "delivered_at": d["delivered_at"].isoformat(),
        }
        for d in docs
    ]


@router.post("/test")
async def trigger_test_webhook(payload: WebhookTestRequest, claims: dict = Depends(get_current_user_claims)):
    user_id = int(claims["sub"])
    await dispatch_webhook_event(
        event_type=payload.event_type,
        payload={"triggered_by": claims["username"], "message": payload.message},
        notify_user_ids=[user_id],
        notification_title="Webhook Test Fired",
        notification_body=payload.message,
    )
    return {"ok": True}


@router.post("/receive")
async def receive_webhook(
    request: Request,
    x_nexus_signature: str = Header(default=""),
    x_nexus_event: str = Header(default="external.event"),
):
    """Built-in webhook receiver endpoint that verifies HMAC-SHA256 signatures."""
    raw = await request.body()
    if x_nexus_signature and not verify_webhook_signature(raw, x_nexus_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        body = {"raw": raw.decode("utf-8", errors="ignore")}

    mongo = get_mongo_db()
    await mongo.webhook_deliveries.insert_one(
        {
            "subscription_id": "inbound-receiver",
            "event_type": x_nexus_event,
            "target_url": "/api/webhooks/receive",
            "status_code": 200,
            "signature": x_nexus_signature or "unsigned",
            "payload": body,
            "response_body": "Accepted by NexusHub Webhook Receiver",
            "delivered_at": datetime.now(timezone.utc),
        }
    )
    return {"received": True, "event": x_nexus_event}


@router.get("/notifications")
async def get_notifications(claims: dict = Depends(get_current_user_claims)):
    mongo = get_mongo_db()
    uid = int(claims["sub"])
    docs = await mongo.notifications.find({"user_id": uid}).sort("created_at", -1).limit(30).to_list(30)
    return [
        {
            "id": str(d["_id"]),
            "event_type": d["event_type"],
            "title": d["title"],
            "body": d["body"],
            "read": d["read"],
            "created_at": d["created_at"].isoformat(),
        }
        for d in docs
    ]


@router.get("/stream")
async def webhook_sse_stream(claims: dict | None = Depends(get_optional_user_claims), user_id: int = 0):
    """Real-time SSE stream fed by the webhook communication channel."""
    target_uid = int(claims["sub"]) if claims else user_id
    queue = subscribe_sse(target_uid)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'event': 'connected', 'user_id': target_uid})}\n\n"
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(item, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            unsubscribe_sse(target_uid, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
