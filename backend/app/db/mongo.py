from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGO_URL)
    return _client


def get_mongo_db() -> AsyncIOMotorDatabase:
    return get_mongo_client()[settings.MONGO_DB_NAME]


async def init_mongo_indexes() -> None:
    db = get_mongo_db()
    await db.posts.create_index([("created_at", -1)])
    await db.stories.create_index([("expires_at", 1)], expireAfterSeconds=0)
    await db.conversations.create_index([("participants", 1), ("updated_at", -1)])
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.video_engagements.create_index([("video_id", 1)], unique=True)
    await db.webhook_subscriptions.create_index([("owner_id", 1)])
    await db.webhook_deliveries.create_index([("delivered_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.saved_items.create_index([("user_id", 1), ("created_at", -1)])
    await db.saved_items.create_index([("user_id", 1), ("target_type", 1), ("target_id", 1)], unique=True)
