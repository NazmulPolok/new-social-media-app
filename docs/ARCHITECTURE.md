# VibeLink — System Architecture

## Modular Monolith Architecture
- **Frontend**: Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS) with Light/Dark theme and EN/BN localization.
- **Backend**: FastAPI (Python 3.12) organized by domain routers under `/api/v1/...` (with `/api/...` compatibility aliases).
- **Relational Database (PostgreSQL 16)**: System of record for Users, Sessions, Friendships, Follows, Pages, Groups, Channels, Playlists, Videos, Shops, Products, Coupons, Orders, Digital Projects, Purchase Entitlements, and Audit Logs.
- **Document Store (MongoDB 7)**: High-volume social Posts, multi-type Reactions, Comments, 24h Stories, Messenger Conversations/Messages, Video Engagements, Webhook Deliveries, and Notifications.
- **Cache & Rate Limiting (Redis 7)**: API read-through caching with write invalidation, login rate limiting, and short-lived download/session state.
- **Event Bus**: HMAC-SHA256 signed Webhooks + Server-Sent Events (SSE) for real-time Messenger and Notification delivery.
