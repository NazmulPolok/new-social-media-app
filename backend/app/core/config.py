from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "NexusHub API"
    DATABASE_URL: str = "postgresql+psycopg://nexushub:nexushub_secret_password@localhost:5432/nexushub_db"
    MONGO_URL: str = "mongodb://nexushub:nexushub_mongo_password@localhost:27017/?authSource=admin"
    MONGO_DB_NAME: str = "nexushub_mongo"
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 60

    JWT_SECRET: str = "nexushub-dev-jwt-secret-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 72

    # Dedicated server-side secret for deterministic HMAC-SHA256 email hashing.
    # Emails are NEVER stored in plaintext in PostgreSQL or MongoDB.
    EMAIL_HMAC_SECRET: str = "nexushub-dev-email-hmac-secret-change-me"
    WEBHOOK_SIGNING_SECRET: str = "nexushub-dev-webhook-signing-secret-change-me"

    FRONTEND_ORIGIN: str = "http://localhost:3000"
    UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent.parent / "uploads")


settings = Settings()
