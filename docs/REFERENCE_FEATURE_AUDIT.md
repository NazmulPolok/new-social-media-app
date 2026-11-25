# VIBELINK — REFERENCE FEATURE AUDIT & REVERSE ENGINEERING SPECIFICATION

> **Document Version:** 2.0.0  
> **Author:** Principal Software Architect & Senior Engineering Organization  
> **Classification:** Engineering & Product Architecture Reference  
> **Status:** Active / Production Audit  

---

## 1. Executive Summary & Audit Methodology

This document outlines the systematic reverse-engineered feature audit conducted across the four primary reference platforms—**Facebook**, **Facebook Messenger**, **YouTube**, and **Shopify**—along with the integrated **Digital Project & Software Marketplace**.

Every functional module is audited through eleven strict engineering criteria:
1. **Platform Origin** (Reference platform workflow and interaction model)
2. **Module & Subsystem**
3. **Feature Description**
4. **Interface Location** (Route, tab, modal, context menu)
5. **Actor & Role Permissions**
6. **Preconditions**
7. **User Interaction Vector**
8. **System Behavior & State Transition**
9. **Data Persistence & Mutated Entities** (PostgreSQL relational entities + MongoDB document collections)
10. **Notification & Event Dispatch** (SSE broadcast, Webhooks, Push notifications)
11. **Edge Cases, Error Boundaries & Guardrails**

---

## 2. Comprehensive Reference Feature Inventory

### 2.1 Facebook Social Ecosystem

| Platform | Module | Feature | Location | User Role | Preconditions | User Interaction | System Behavior | Data Changes | Notifications | Permissions & RBAC | Edge Cases & Guardrails | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Facebook** | User Identity | Avatar & Cover PC Upload | `/profile` | Authenticated Owner | Valid image file (`.png`, `.jpg`, `.webp`) | Click camera icon on avatar/cover; select file via file dialog | File stream uploaded via multipart form, validated (magic bytes + size <= 10MB), stored in `/uploads/avatars` or `/uploads/covers`, user record updated | PostgreSQL `users.avatar_url`, `users.cover_url` | None | User may only mutate their own profile | Non-image files rejected (400), oversized files rejected (413), rate limited | **Implemented & Tested** |
| **Facebook** | Social Feed | Post Creation with Media Upload | Feed (`/`), Profile (`/profile`) | Authenticated User | Text content or media payload | Enter text, click photo/video attachment button, submit | Media uploaded via `/api/social/upload`, post document inserted into MongoDB with media attachments array | MongoDB `posts` collection | SSE event to active followers | Owner only for creation | Max 50MB video, max 10MB images; unsupported mime types sanitized | **Implemented & Tested** |
| **Facebook** | Social Feed | Post Reactions & Comments | Feed (`/`), Profile (`/profile`) | Authenticated User | Post exists | Click Like/Love/Care/Haha/Wow/Sad/Angry reaction or submit comment | Reaction upserted or toggled in MongoDB document; comment appended with timestamp | MongoDB `posts.reactions`, `posts.comments` | SSE notification to post author | Any authenticated viewer | Self-reaction allowed; multiple reactions by same user replace existing reaction | **Implemented & Tested** |
| **Facebook** | Pages | Page Creation Hub | `/settings` -> "Create a Page" | Authenticated User | Unique alphanumeric handle, valid name | Fill Name, Handle, Category, About, submit | Validates handle uniqueness; creates Page with owner as Admin | PostgreSQL `pages`, `page_members` (role: `admin`) | Creator confirmation | System verified | Handle collision (409); reserved handles rejected | **Implemented & Tested** |
| **Facebook** | Pages | Page Admin Only Posting & Member Engagement | `/pages/[handle]` | Page Admin vs Follower | Page exists | Admin sees Post Creator form; followers see React, Comment, Share to Profile | Only admin role can insert posts with `page_id`; followers can interact and share | MongoDB `posts` (with `page_id`), `page_members` | Page admins notified of follower comments | RBAC enforced via backend router `/pages/{handle}/posts` | Non-admin post submission rejected with 403 Forbidden | **Implemented & Tested** |
| **Facebook** | Groups & Communities | Group Creation & Membership | `/settings` -> "Create Group" & `/communities` | Group Admin, Member | Group exists | Request to join or invite; post inside group | Group membership record created; posts scoped to group | PostgreSQL `groups`, `group_members`; MongoDB `posts` | Group admin notified of new member | Privacy rules (public vs private) enforced | Private group hides posts from non-members | **Implemented & Tested** |
| **Facebook** | Saved | Saved Items & Custom Collections | `/saved`, Post/Video/Product menus | Authenticated User | Target entity exists | Click "Save to Saved Items" in dropdown menu; manage collections | Entity reference saved to user's saved items document with collection tag | MongoDB `saved_items`, `saved_collections` | None | Owner only | Deletion of source entity marks saved item as archived | **Implemented** |
| **Facebook** | Memories | Memories ("On This Day") | `/memories` | Authenticated User | User has posts created in previous periods | Navigate to `/memories` | Query posts authored by current user where month and day match past milestones | MongoDB `posts` query aggregation | Daily memory badge | Owner only | Empty state rendered gracefully when no historical posts match | **Implemented** |
| **Facebook** | Activity Log | User Activity Timeline | `/activity-log` | Authenticated User | User session active | Browse timeline filtered by category (Posts, Comments, Likes, Logins) | Queries relational audit logs and MongoDB social interactions chronologically | PostgreSQL `audit_logs`, MongoDB activity records | None | Strictly user's own data | Filtering by date range and action type | **Implemented** |

---

### 2.2 Facebook Messenger Real-Time Subsystem

| Platform | Module | Feature | Location | User Role | Preconditions | User Interaction | System Behavior | Data Changes | Notifications | Permissions & RBAC | Edge Cases & Guardrails | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Messenger** | Direct & Group Chat | Real-Time Message Exchange | `/messenger` | Chat Participant | Active conversation | Type message and send | Message inserted into MongoDB; SSE event dispatched to all participants | MongoDB `messages`, `conversations.last_message` | Real-time SSE dispatch to participant client channels | Participant must be in `conversation.participants` | Blocked users cannot message each other (403) | **Implemented & Tested** |
| **Messenger** | Direct & Group Chat | PC Media Upload (Photos & Videos) | `/messenger` | Chat Participant | Image/video file selected | Click attachment paperclip, select file, upload | File uploaded via `/api/messenger/upload`, attachment metadata appended to message | File saved to `/uploads/messenger/`, MongoDB `messages.media_urls` | SSE event includes media payload | Participant only | Size limits enforced (video <= 50MB, photo <= 10MB) | **Implemented & Tested** |
| **Messenger** | Direct & Group Chat | Message Editing | `/messenger` | Message Author | Message sent by current user | Click Edit button, modify content, save | Backend validates author, updates message text, sets `is_edited: true` and `edited_at` | MongoDB `messages.content`, `messages.is_edited`, `messages.edited_at` | SSE event notifies other participants of edit | Strictly message sender | Non-author edit rejected with 403 Forbidden | **Implemented & Tested** |
| **Messenger** | Direct & Group Chat | Categorized Emoji Picker | `/messenger` | Chat Participant | Conversation open | Click Emoji icon, browse categories (Smileys, Gestures, Nature, Food, Symbols) | Clicking emoji appends character to input textarea at caret position | Client-side reactive input state | None | Any participant | Keyboard navigation and accessibility tags | **Implemented & Tested** |
| **Messenger** | Audio Messaging | Voice Notes & Audio Attachments | `/messenger` | Chat Participant | Conversation open, audio file / recording | Record or select audio file (`.mp3`, `.wav`, `.ogg`, `.m4a`), send | Audio file uploaded to `/uploads/audio/`, rendered with playable audio widget in chat | File stored on disk, MongoDB `messages.audio_url` | SSE message dispatch | Participant only | Audio duration and size capped (max 25MB) | **Implemented** |
| **Messenger** | Folders | Inbox, Requests & Archived | `/messenger` | Authenticated User | Multiple conversations exist | Toggle tab between "All Chats", "Message Requests", "Archived" | Filters conversations based on participant friendship status and archive flag | MongoDB `conversations.folder`, `conversations.archived_by` | Unread badge counts | User specific | Conversations from non-friends route to "Requests" | **Implemented** |

---

### 2.3 YouTube Video & Creator Studio Subsystem

| Platform | Module | Feature | Location | User Role | Preconditions | User Interaction | System Behavior | Data Changes | Notifications | Permissions & RBAC | Edge Cases & Guardrails | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **YouTube** | Channels | Channel Creation Hub | `/settings` -> "Create a Channel" | Authenticated User | Channel name, handle, description, image | Fill required fields, upload channel image via `/api/videos/channels/upload-image`, submit | Validates unique handle, persists channel record linked to user | PostgreSQL `channels` table | Success confirmation | Authenticated user | Duplicate handle rejected (409) | **Implemented & Tested** |
| **YouTube** | Player & Watch | Video Playback, Likes, Comments | `/tube` | Viewer, Creator | Video published | Click video card, open video player, react, comment | Increment view counter via Redis buffer; append comment to MongoDB video engagements | PostgreSQL `videos.views_count`, MongoDB `video_engagements` | Creator notified of new comments | Public videos open to all | Private videos accessible only by creator | **Implemented & Tested** |
| **YouTube** | Studio | Video Management (Edit / Delete / Visibility) | `/studio` | Channel Owner | Video exists in user's channel | Edit title, description, category, visibility (public/unlisted/private), or delete | Validates ownership in PostgreSQL; updates record or cascades deletion | PostgreSQL `videos` | None | Channel owner only | Non-owner modification rejected with 403 | **Implemented** |
| **YouTube** | History & Playlists | Watch History & Watch Later | `/tube` -> Library / History | Authenticated User | Videos viewed or saved | Click "Add to Watch Later" or browse watched videos | Upserts video into user's watch history array or "Watch Later" system playlist | PostgreSQL `playlists`, `playlist_items` | None | User private | Deduplicated history entries sorted by most recent | **Implemented** |

---

### 2.4 Shopify E-Commerce Subsystem

| Platform | Module | Feature | Location | User Role | Preconditions | User Interaction | System Behavior | Data Changes | Notifications | Permissions & RBAC | Edge Cases & Guardrails | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Shopify** | Merchant | Open a Shop Hub | `/settings` -> "Open a Shop" | Authenticated User | Shop name, slug, motto, description, logo, contact, category, theme | Fill form, upload logo via `/api/shops/upload-logo`, submit | Verifies slug uniqueness, creates Shop linked to owner | PostgreSQL `shops` | Owner confirmation | Authenticated user | Slug conflicts rejected (409) | **Implemented & Tested** |
| **Shopify** | Storefront | Brand Storefront Header & Catalog | `/shop/[slug]` | Customer, Merchant | Shop exists | Visit shop URL, browse products, view contact & motto banner | Loads shop theme color, logo, description, motto, and active products | PostgreSQL read query | None | Public | Inactive or unpublished shop returns 404 | **Implemented & Tested** |
| **Shopify** | Catalog & Inventory | Product Management & Stock Control | `/seller` | Merchant | User owns shop | Add product, adjust stock count, price, description, images | Inserts or updates product in PostgreSQL; verifies non-negative stock | PostgreSQL `products` | Merchant low-stock alerts | Shop owner only | Out of stock products cannot be purchased | **Implemented** |
| **Shopify** | Checkout | Cart, Coupon & Cash-on-Delivery Checkout | `/shop` -> Checkout modal | Customer | Cart has items with stock > 0 | Enter shipping address, apply coupon code, confirm order | Atomically creates order, decrements product stock, records order items | PostgreSQL `orders`, `order_items`, `products.stock` | Merchant order notification via SSE | Authenticated buyer | Insufficient stock aborts transaction | **Implemented & Tested** |

---

### 2.5 Digital Software Project Marketplace

| Platform | Module | Feature | Location | User Role | Preconditions | User Interaction | System Behavior | Data Changes | Notifications | Permissions & RBAC | Edge Cases & Guardrails | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Marketplace** | Seller | Publish Digital Code / Template Project | `/seller` | Developer / Seller | Source zip package, metadata, price | Upload archive, specify title, summary, tech stack, license, price | Validates package archive, stores binary in `/uploads/projects/`, registers project | PostgreSQL `digital_projects` | New listing notification | Authenticated seller | Non-zip files rejected | **Implemented & Tested** |
| **Marketplace** | Buyer | Purchase & Instant Download License | `/shop` -> Projects | Buyer | Project published | Purchase project, obtain commercial entitlement, trigger secure download | Validates payment/entitlement, logs download record, streams zip binary | PostgreSQL `project_entitlements`, `download_records` | Seller royalty notification | Entitlement verification required before download | Unauthorized download returns 403 Forbidden | **Implemented & Tested** |

---

## 3. Architecture & Security Invariants

1. **Relational vs Non-Relational Division of Concern:**
   - **PostgreSQL 16:** Financial transactions, user identities, roles, friendships, shop products, orders, channels, and videos.
   - **MongoDB 7:** Unstructured social feed posts, polymorphic reactions, recursive comments, real-time messenger threads, ephemeral stories, and notification feeds.
   - **Redis 7:** Session invalidation, rate limiting, and cached queries.
2. **Access Control & Multi-Tenancy:**
   - Unified JWT authentication (`access_token` and `refresh_token` stored in secure HttpOnly cookies / headers).
   - Workspace context switching without multiple logins.
   - Strict RBAC: Users cannot manipulate assets (channels, shops, pages, posts) they do not own or administer.
3. **Storage Pipeline:**
   - Local persistent volume `/app/uploads` partitioned into `avatars/`, `covers/`, `feed/`, `messenger/`, `audio/`, `channels/`, `shops/`, `videos/`, and `projects/`.
