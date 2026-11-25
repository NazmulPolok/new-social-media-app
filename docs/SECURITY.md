# VibeLink — Database & Security Design

## PostgreSQL (Relational Entities)
- `users`: `id`, `username`, `display_name`, `email_hash` (HMAC-SHA256), `password_hash` (Argon2id), `role` (`user`/`admin`), `is_suspended`, `is_verified`, `bio`, `location`, `website_url`, `language`, `currency`, `created_at`
- `user_sessions`: `id`, `user_id` (FK), `refresh_token_hash`, `user_agent`, `ip_address`, `revoked`, `expires_at`, `created_at`
- `friend_requests` & `friendships` & `follows` & `user_blocks`
- `pages`, `page_members`, `groups`, `group_members`
- `channels`, `channel_subscriptions`, `videos`, `playlists`, `playlist_items`
- `shops`, `products`, `coupons`, `orders`, `order_items`
- `digital_projects`, `project_entitlements`, `download_records`
- `reports`, `audit_logs`

## MongoDB (Non-Relational Collections)
- `posts` (includes `reactions` map `{uid: reaction_type}`, `comments`, `audience`, `page_id`, `group_id`)
- `stories` (24-hour expiring stories with `expires_at` TTL index and `viewers`)
- `conversations`, `messages`
- `video_engagements`
- `webhook_subscriptions`, `webhook_deliveries`, `notifications`

## Security Controls
1. **Argon2id** (`argon2-cffi`) for all new passwords (with `bcrypt` fallback for legacy hashes).
2. **HttpOnly + SameSite=Lax** cookies for access & refresh tokens, with refresh token rotation and `/api/v1/auth/logout-all`.
3. **Redis Rate Limiting** on login/register endpoints.
4. **Server-Side Recalculation** for all cart prices, coupon discounts, and inventory deductions inside DB transactions.
5. **Signed Time-Limited Download Tokens** for Digital Project Marketplace ZIP packages.
