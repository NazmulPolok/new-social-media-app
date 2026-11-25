# VibeLink — Product Requirements Document (PRD)

## 1. Vision
VibeLink is a unified, modular social networking, video sharing, creator economy, e-commerce, and digital project marketplace platform built with one shared identity system.

## 2. Core Modules
1. **Unified Identity & Auth**: Single account with Argon2id password hashing, HMAC-SHA256 email lookup, HttpOnly cookie sessions, refresh token rotation, and Redis rate limiting.
2. **Social Network**: Public profiles (`/u/[username]`), separate Friends & Followers graphs, multi-type Reactions, nested Comments, 24-hour Stories, Business Pages (`/pages`), and Communities/Groups (`/groups`).
3. **Creator & Video Platform**: Channels (`/tube`), video uploads, Playlists, Subscriptions, and Creator Studio (`/studio`) with real database-derived analytics.
4. **E-Commerce & Store Builder**: Storefronts (`/shop/[slug]`), product catalog, atomic inventory checkout, server-side Coupon validation, payment adapters (COD, bKash, Nagad, Card sandbox), and Seller Dashboard (`/seller`).
5. **Digital Project Marketplace**: Software/source-code listings (`/projects`), license selection, purchase entitlements, and time-limited signed download URLs.
6. **Communication & Discovery**: Messenger, live Webhook/SSE notifications, Unified Search (`/search`), Super Admin (`/admin`), and English/Bangla localization with BDT/USD currency support.
