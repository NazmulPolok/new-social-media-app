import io
import uuid
from fastapi.testclient import TestClient

from app.main import app


def test_full_unified_platform_workflows():
    with TestClient(app) as client:
        # 1. Health check
        h = client.get("/health")
        assert h.status_code == 200
        assert h.json()["status"] == "ok"

        # 2. Register two users (Argon2id + HMAC-SHA256 email + HttpOnly cookies)
        suffix = uuid.uuid4().hex[:6]
        r1 = client.post(
            "/api/auth/register",
            json={
                "username": f"alice_{suffix}",
                "display_name": "Alice Dev",
                "email": f"alice_{suffix}@example.com",
                "password": "strongpassword123",
            },
        )
        assert r1.status_code == 201
        tok1 = r1.json()["access_token"]
        uid1 = r1.json()["user"]["id"]
        assert "vl_access_token" in r1.cookies

        r2 = client.post(
            "/api/auth/register",
            json={
                "username": f"bob_{suffix}",
                "display_name": "Bob Buyer",
                "email": f"bob_{suffix}@example.com",
                "password": "strongpassword123",
            },
        )
        assert r2.status_code == 201
        tok2 = r2.json()["access_token"]
        h1 = {"Authorization": f"Bearer {tok1}"}
        h2 = {"Authorization": f"Bearer {tok2}"}

        # 3. Social: post, multi-reaction, story, friend request + accept, Page, Group
        post = client.post("/api/social/posts", json={"content": "Hello Unified Platform!"}, headers=h1)
        assert post.status_code == 201
        pid = post.json()["id"]

        react = client.post(f"/api/social/posts/{pid}/react", json={"reaction": "love"}, headers=h2)
        assert react.status_code == 200
        assert react.json()["reaction_counts"]["love"] == 1

        # Test Saved Items
        saved = client.post(
            "/api/social/saved",
            json={"target_type": "post", "target_id": pid, "title": "Saved Hello Post"},
            headers=h2,
        )
        assert saved.status_code == 200
        saved_list = client.get("/api/social/saved", headers=h2)
        assert saved_list.status_code == 200
        assert len(saved_list.json()) >= 1

        # Test Memories
        memories = client.get("/api/social/memories", headers=h1)
        assert memories.status_code == 200
        assert "memories" in memories.json()

        # Test Activity Log
        act = client.get("/api/social/activity-log", headers=h1)
        assert act.status_code == 200
        assert act.json()["total_activities"] >= 1

        story = client.post("/api/social/stories", json={"text": "24h story!"}, headers=h1)
        assert story.status_code == 201

        fr = client.post(f"/api/social/friends/request/{uid1}", headers=h2)
        assert fr.status_code == 201
        req_id = fr.json()["id"]
        acc = client.post(f"/api/social/friends/accept/{req_id}", headers=h1)
        assert acc.status_code == 200

        page = client.post("/api/communities/pages", json={"name": "Tech Page", "handle": f"tech_{suffix}"}, headers=h1)
        assert page.status_code == 201
        grp = client.post("/api/communities/groups", json={"name": f"Builders {suffix}", "privacy": "public"}, headers=h1)
        assert grp.status_code == 201

        # 4. Creator: channel, playlist, studio analytics
        ch = client.post(
            "/api/videos/channels",
            json={
                "name": "Alice Tube",
                "handle": f"alicech_{suffix}",
                "description": "Tech tutorials and reviews",
                "image_url": "/uploads/channels/alice.png",
            },
            headers=h1,
        )
        assert ch.status_code == 201
        pl = client.post("/api/videos/playlists", json={"title": "Tutorials"}, headers=h1)
        assert pl.status_code == 201
        studio = client.get("/api/videos/studio/analytics", headers=h1)
        assert studio.status_code == 200
        assert studio.json()["channels_count"] >= 1

        # 5. Commerce: shop, product, coupon, server-side discounted order
        shop = client.post(
            "/api/shops",
            json={
                "name": "Alice Store",
                "slug": f"shop-{suffix}",
                "motto": "Best quality tech accessories",
                "description": "Official electronics store with warranty.",
                "logo_url": "/uploads/shops/logo.png",
                "contact_number": "+8801700000000",
                "category": "Electronics",
                "theme_color": "#1877f2",
            },
            headers=h1,
        )
        assert shop.status_code == 201
        sid = shop.json()["id"]
        prod = client.post(f"/api/shops/{sid}/products", json={"name": "Keyboard", "price_dollars": 100.0, "stock": 10}, headers=h1)
        assert prod.status_code == 201
        prid = prod.json()["id"]

        # Stock adjustment
        adj = client.patch(f"/api/shops/products/{prid}/stock", json={"stock": 15}, headers=h1)
        assert adj.status_code == 200
        assert adj.json()["stock"] == 15

        coup = client.post(f"/api/shops/{sid}/coupons", json={"code": "SAVE20", "discount_type": "percent", "discount_value": 20}, headers=h1)
        assert coup.status_code == 201

        order = client.post(
            "/api/shops/orders",
            json={
                "shop_id": sid,
                "shipping_address": "Dhaka, Bangladesh",
                "coupon_code": "SAVE20",
                "payment_method": "bkash_sandbox",
                "items": [{"product_id": prid, "quantity": 1}],
            },
            headers=h2,
        )
        assert order.status_code == 201
        assert order.json()["total_dollars"] == 80.0
        assert order.json()["discount_dollars"] == 20.0

        # 6. Messenger Group Chat + Invite Link + Admin Approval
        grp_chat = client.post("/api/messenger/groups", json={"name": f"Dev Squad {suffix}"}, headers=h1)
        assert grp_chat.status_code == 201
        cid = grp_chat.json()["id"]
        code = grp_chat.json()["invite_code"]

        req_join = client.post(f"/api/messenger/groups/join/{code}", headers=h2)
        assert req_join.status_code == 200
        assert req_join.json()["status"] == "pending_admin_approval"

        uid2 = r2.json()["user"]["id"]
        app_join = client.post(f"/api/messenger/groups/{cid}/approve/{uid2}", headers=h1)
        assert app_join.status_code == 200

        grp_msg = client.post(f"/api/messenger/conversations/{cid}/messages", json={"text": "Welcome Bob!"}, headers=h2)
        assert grp_msg.status_code == 201

        # 7. Unified Search & Non-admin RBAC check
        srch = client.get(f"/api/search?q={suffix}")
        assert srch.status_code == 200
        assert len(srch.json()["shops"]) >= 1

        # Bob is not admin -> 403
        adm = client.get("/api/admin/overview", headers=h2)
        assert adm.status_code == 403
