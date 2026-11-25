import json
from typing import Any

import redis.asyncio as redis

from app.core.config import settings

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def ping_redis() -> bool:
    try:
        client = get_redis()
        return bool(await client.ping())
    except Exception:
        return False


async def cache_get(key: str) -> Any | None:
    try:
        raw = await get_redis().get(key)
        return json.loads(raw) if raw is not None else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    try:
        ttl = ttl_seconds or settings.CACHE_TTL_SECONDS
        await get_redis().set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:
        pass


async def cache_invalidate_prefix(prefix: str) -> None:
    try:
        client = get_redis()
        keys = [k async for k in client.scan_iter(match=f"{prefix}*")]
        if keys:
            await client.delete(*keys)
    except Exception:
        pass


async def check_rate_limit(key: str, max_requests: int = 10, window_seconds: int = 60) -> bool:
    """Return True if request is allowed, False if rate limit exceeded."""
    try:
        client = get_redis()
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, window_seconds)
        return count <= max_requests
    except Exception:
        return True
