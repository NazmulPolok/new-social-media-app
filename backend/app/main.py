from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.db.mongo import init_mongo_indexes
from app.db.postgres import init_postgres_tables
from app.db.redis_cache import close_redis, ping_redis
from app.routers import auth, communities, messenger, platform, shops, social, videos, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.UPLOAD_DIR, "videos").mkdir(parents=True, exist_ok=True)
    init_postgres_tables()
    await init_mongo_indexes()
    yield
    await close_redis()


app = FastAPI(title="VibeLink Unified API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_path = Path(settings.UPLOAD_DIR)
upload_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_path)), name="uploads")

for r in [auth.router, social.router, communities.router, messenger.router, videos.router, shops.router, platform.router, webhooks.router]:
    app.include_router(r)


@app.get("/api/health")
@app.get("/health")
async def health_check():
    redis_ok = await ping_redis()
    return {
        "status": "ok",
        "databases": {
            "relational": "PostgreSQL (Identity, Social Graph, Pages, Groups, Channels, Videos, Shops, Orders, Digital Projects)",
            "non_relational": "MongoDB (Posts, Reactions, Stories, Messenger, Video Engagements, Webhooks, Notifications)",
            "cache": f"Redis ({'connected' if redis_ok else 'unavailable'})",
        },
        "communication": "HMAC-SHA256 Webhooks + SSE Event Stream",
    }


@app.get("/ready")
async def readiness_check():
    return {"ready": True}
