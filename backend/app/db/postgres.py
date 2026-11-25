from collections.abc import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_postgres_tables() -> None:
    from app.models import sql_models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Safe idempotent column upgrades for existing tables in persistent volumes
    alter_statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(120) NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BDT'",
        "ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255)",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'General'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE videos ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'General'",
        "ALTER TABLE videos ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public'",
        "ALTER TABLE shops ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BDT'",
        "ALTER TABLE shops ADD COLUMN IF NOT EXISTS motto VARCHAR(160) NOT NULL DEFAULT ''",
        "ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE shops ADD COLUMN IF NOT EXISTS contact_number VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE shops ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'General'",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(30) NOT NULL DEFAULT 'physical'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40) NOT NULL DEFAULT ''",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'cod'",
    ]
    with engine.begin() as conn:
        for stmt in alter_statements:
            conn.execute(text(stmt))
