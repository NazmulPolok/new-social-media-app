import asyncio
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.security import sign_webhook_payload
from app.db.mongo import get_mongo_db

# In-memory SSE subscriber queues keyed by user_id (0 = global broadcast)
_sse_subscribers: dict[int, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)


def subscribe_sse(user_id: int) -> asyncio.Queue[dict[str, Any]]:
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
    _sse_subscribers[user_id].add(q)
    return q


def unsubscribe_sse(user_id: int, q: asyncio.Queue[dict[str, Any]]) -> None:
    _sse_subscribers[user_id].discard(q)


def _push_sse(user_ids: list[int], event: dict[str, Any]) -> None:
    for uid in set(user_ids):
        for q in list(_sse_subscribers.get(uid, set())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


async def dispatch_webhook_event(
    event_type: str,
    payload: dict[str, Any],
    notify_user_ids: list[int] | None = None,
    notification_title: str | None = None,
    notification_body: str | None = None,
) -> None:
    """
    Dispatch a signed webhook event to all matching MongoDB webhook subscriptions,
    record delivery logs in MongoDB, store user notifications, and push live SSE updates.
    """
    mongo = get_mongo_db()
    now = datetime.now(timezone.utc)

    envelope = {
        "event": event_type,
        "timestamp": now.isoformat(),
        "data": payload,
    }
    raw_bytes = json.dumps(envelope, default=str).encode("utf-8")

    # 1. Persist user notifications & push real-time SSE
    target_users = notify_user_ids or []
    if target_users and notification_title:
        docs = [
            {
                "user_id": uid,
                "event_type": event_type,
                "title": notification_title,
                "body": notification_body or "",
                "payload": payload,
                "read": False,
                "created_at": now,
            }
            for uid in set(target_users)
        ]
        if docs:
            await mongo.notifications.insert_many(docs)

    _push_sse(
        target_users + [0],
        {
            "event": event_type,
            "timestamp": now.isoformat(),
            "title": notification_title,
            "body": notification_body,
            "data": payload,
        },
    )

    # 2. Deliver to registered webhook subscriptions
    cursor = mongo.webhook_subscriptions.find(
        {
            "active": True,
            "$or": [{"events": event_type}, {"events": "*"}],
        }
    )
    subscriptions = await cursor.to_list(length=50)

    if not subscriptions:
        # Still record internal bus event for observability in the Webhook Console
        sig = sign_webhook_payload(raw_bytes)
        await mongo.webhook_deliveries.insert_one(
            {
                "subscription_id": "internal-bus",
                "event_type": event_type,
                "target_url": "internal://nexushub-event-bus",
                "status_code": 200,
                "signature": sig,
                "payload": envelope,
                "response_body": "Dispatched to internal SSE & Notification channel",
                "delivered_at": now,
            }
        )
        return

    async with httpx.AsyncClient(timeout=5.0) as client:
        for sub in subscriptions:
            target_url = sub["target_url"]
            secret = sub.get("secret") or None
            sig = sign_webhook_payload(raw_bytes, secret)
            status_code = 0
            resp_text = ""
            try:
                resp = await client.post(
                    target_url,
                    content=raw_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "X-Nexus-Event": event_type,
                        "X-Nexus-Signature": sig,
                    },
                )
                status_code = resp.status_code
                resp_text = resp.text[:300]
            except Exception as exc:
                status_code = 502
                resp_text = str(exc)[:300]

            await mongo.webhook_deliveries.insert_one(
                {
                    "subscription_id": str(sub["_id"]),
                    "event_type": event_type,
                    "target_url": target_url,
                    "status_code": status_code,
                    "signature": sig,
                    "payload": envelope,
                    "response_body": resp_text,
                    "delivered_at": datetime.now(timezone.utc),
                }
            )
