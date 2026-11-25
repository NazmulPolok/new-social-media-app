from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_claims
from app.core.uploads import save_upload_file
from app.db.postgres import get_db
from app.db.redis_cache import cache_get, cache_invalidate_prefix, cache_set
from app.models.sql_models import Coupon, Order, OrderItem, Product, Shop, User
from app.services.webhook_service import dispatch_webhook_event

router = APIRouter(prefix="/api/shops", tags=["E-Commerce"])


class ShopCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-zA-Z0-9-]+$")
    motto: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=5, max_length=1000)
    logo_url: str = Field(min_length=1, max_length=500)
    contact_number: str = Field(min_length=5, max_length=40)
    category: str = Field(min_length=2, max_length=60)
    theme_color: str = Field(default="#6366f1", max_length=20)


class ProductCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    description: str = Field(default="", max_length=1500)
    price_dollars: float = Field(gt=0)
    stock: int = Field(ge=0, default=20)
    category: str = Field(default="General", max_length=60)
    image_url: str = Field(default="", max_length=500)


class OrderItemInput(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=100)


class OrderCreateRequest(BaseModel):
    shop_id: int
    shipping_address: str = Field(min_length=4, max_length=500)
    coupon_code: str = Field(default="", max_length=40)
    payment_method: str = Field(default="cod", pattern=r"^(cod|bkash_sandbox|nagad_sandbox|card_sandbox)$")
    items: list[OrderItemInput] = Field(min_length=1)


class CouponCreateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    discount_type: str = Field(default="percent", pattern=r"^(percent|fixed)$")
    discount_value: int = Field(gt=0)


class StockAdjustmentRequest(BaseModel):
    stock: int = Field(ge=0)


class OrderStatusUpdateRequest(BaseModel):
    status: str = Field(pattern=r"^(pending|accepted|confirmed|processing|packed|shipped|delivered|completed|cancelled|refunded)$")


def _serialize_product(p: Product) -> dict:
    return {
        "id": p.id,
        "shop_id": p.shop_id,
        "name": p.name,
        "description": p.description,
        "price_cents": p.price_cents,
        "price_dollars": round(p.price_cents / 100, 2),
        "stock": p.stock,
        "category": p.category,
        "image_url": p.image_url,
        "created_at": p.created_at.isoformat(),
    }


def _serialize_shop(s: Shop) -> dict:
    return {
        "id": s.id,
        "owner_id": s.owner_id,
        "name": s.name,
        "slug": s.slug,
        "motto": s.motto,
        "description": s.description,
        "logo_url": s.logo_url,
        "contact_number": s.contact_number,
        "category": s.category,
        "theme_color": s.theme_color,
        "products_count": len(s.products),
        "created_at": s.created_at.isoformat(),
    }


@router.get("")
async def list_shops(db: Session = Depends(get_db)):
    cached = await cache_get("shops:list")
    if cached is not None:
        return cached
    shops = db.scalars(select(Shop).order_by(Shop.id.desc())).all()
    data = [_serialize_shop(s) for s in shops]
    await cache_set("shops:list", data, ttl_seconds=45)
    return data


@router.post("/upload-logo")
async def upload_shop_logo(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_user_claims),
):
    url, _ = await save_upload_file(file, subdir="shops", allow_video=False)
    return {"url": url}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_shop(
    payload: ShopCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    slug_clean = payload.slug.strip().lower()
    if db.scalar(select(Shop).where(Shop.slug == slug_clean)):
        raise HTTPException(status_code=400, detail="Shop slug is already taken")

    shop = Shop(
        owner_id=uid,
        name=payload.name.strip(),
        slug=slug_clean,
        motto=payload.motto.strip(),
        description=payload.description.strip(),
        logo_url=payload.logo_url.strip(),
        contact_number=payload.contact_number.strip(),
        category=payload.category.strip(),
        theme_color=payload.theme_color.strip() or "#6366f1",
    )
    db.add(shop)
    db.commit()
    db.refresh(shop)
    await cache_invalidate_prefix("shops:")
    return _serialize_shop(shop)


@router.get("/products/all")
async def list_all_products(db: Session = Depends(get_db)):
    cached = await cache_get("shops:products:all")
    if cached is not None:
        return cached
    products = db.scalars(select(Product).order_by(Product.id.desc()).limit(100)).all()
    data = [
        {**_serialize_product(p), "shop_name": p.shop.name, "shop_slug": p.shop.slug}
        for p in products
    ]
    await cache_set("shops:products:all", data, ttl_seconds=45)
    return data


@router.get("/{slug}")
async def get_shop_by_slug(slug: str, db: Session = Depends(get_db)):
    slug_clean = slug.strip().lower()
    cache_key = f"shops:slug:{slug_clean}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    shop = db.scalar(select(Shop).where(Shop.slug == slug_clean))
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    coupons = db.scalars(select(Coupon).where(Coupon.shop_id == shop.id, Coupon.active == True).order_by(Coupon.id.desc())).all()
    data = {
        **_serialize_shop(shop),
        "products": [_serialize_product(p) for p in shop.products],
        "active_coupons": [
            {"id": c.id, "code": c.code, "discount_type": c.discount_type, "discount_value": c.discount_value}
            for c in coupons
        ],
    }
    await cache_set(cache_key, data, ttl_seconds=45)
    return data


@router.post("/{shop_id}/products", status_code=status.HTTP_201_CREATED)
async def add_product(
    shop_id: int,
    payload: ProductCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    shop = db.get(Shop, shop_id)
    if not shop or shop.owner_id != uid:
        raise HTTPException(status_code=403, detail="Shop not found or you are not the owner")

    product = Product(
        shop_id=shop.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        price_cents=int(round(payload.price_dollars * 100)),
        stock=payload.stock,
        category=payload.category.strip() or "General",
        image_url=payload.image_url.strip(),
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    await cache_invalidate_prefix("shops:")
    return _serialize_product(product)


@router.post("/orders", status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    shop = db.get(Shop, payload.shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    total_cents = 0
    order_items: list[OrderItem] = []
    for item in payload.items:
        prod = db.get(Product, item.product_id)
        if not prod or prod.shop_id != shop.id:
            raise HTTPException(status_code=400, detail=f"Invalid product {item.product_id} for this shop")
        if prod.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {prod.name}")
        prod.stock -= item.quantity
        total_cents += prod.price_cents * item.quantity
        order_items.append(
            OrderItem(product_id=prod.id, quantity=item.quantity, unit_price_cents=prod.price_cents)
        )

    discount_cents = 0
    applied_coupon = ""
    if payload.coupon_code.strip():
        coupon = db.scalar(
            select(Coupon).where(
                Coupon.shop_id == shop.id,
                Coupon.code == payload.coupon_code.strip().upper(),
                Coupon.active == True,
            )
        )
        if not coupon:
            raise HTTPException(status_code=400, detail="Invalid or inactive coupon code")
        applied_coupon = coupon.code
        if coupon.discount_type == "percent":
            discount_cents = int(round(total_cents * min(coupon.discount_value, 90) / 100))
        else:
            discount_cents = min(total_cents, coupon.discount_value * 100)

    final_total_cents = max(0, total_cents - discount_cents)

    order = Order(
        buyer_id=uid,
        shop_id=shop.id,
        total_cents=final_total_cents,
        discount_cents=discount_cents,
        coupon_code=applied_coupon,
        payment_method=payload.payment_method,
        status="confirmed",
        shipping_address=payload.shipping_address.strip(),
        items=order_items,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    await cache_invalidate_prefix("shops:")

    await dispatch_webhook_event(
        event_type="order.created",
        payload={
            "order_id": order.id,
            "shop_id": shop.id,
            "shop_name": shop.name,
            "buyer_id": uid,
            "total_dollars": round(final_total_cents / 100, 2),
        },
        notify_user_ids=[shop.owner_id, uid],
        notification_title=f"New Order #{order.id} in {shop.name}",
        notification_body=f"Total: ${final_total_cents / 100:.2f} ({payload.payment_method})",
    )

    return {
        "id": order.id,
        "shop_id": order.shop_id,
        "total_dollars": round(order.total_cents / 100, 2),
        "discount_dollars": round(order.discount_cents / 100, 2),
        "payment_method": order.payment_method,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
    }


@router.post("/{shop_id}/coupons", status_code=status.HTTP_201_CREATED)
async def create_coupon(
    shop_id: int,
    payload: CouponCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    shop = db.get(Shop, shop_id)
    if not shop or shop.owner_id != uid:
        raise HTTPException(status_code=403, detail="Shop not found or not owned by you")
    c = Coupon(
        shop_id=shop_id,
        code=payload.code.strip().upper(),
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    await cache_invalidate_prefix("shops:")
    return {"id": c.id, "code": c.code, "discount_type": c.discount_type, "discount_value": c.discount_value}


@router.get("/seller/overview")
def seller_dashboard_overview(
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    my_shops = db.scalars(select(Shop).where(Shop.owner_id == uid)).all()
    shop_ids = [s.id for s in my_shops]
    if not shop_ids:
        return {
            "shops_count": 0,
            "products_count": 0,
            "orders_count": 0,
            "total_revenue_dollars": 0.0,
            "low_stock_products": [],
            "product_sales": [],
            "coupons": [],
            "recent_orders": [],
        }

    shop_map = {s.id: s.name for s in my_shops}
    products = db.scalars(select(Product).where(Product.shop_id.in_(shop_ids))).all()
    prod_map = {p.id: p for p in products}
    orders = db.scalars(select(Order).where(Order.shop_id.in_(shop_ids)).order_by(Order.created_at.desc())).all()
    coupons = db.scalars(select(Coupon).where(Coupon.shop_id.in_(shop_ids), Coupon.active == True).order_by(Coupon.id.desc())).all()

    buyer_ids = {o.buyer_id for o in orders}
    buyers = {u.id: u for u in db.scalars(select(User).where(User.id.in_(buyer_ids))).all()} if buyer_ids else {}

    sales_qty: dict[int, int] = {}
    sales_rev_cents: dict[int, int] = {}
    serialized_orders = []
    for o in orders[:30]:
        buyer = buyers.get(o.buyer_id)
        item_list = []
        for it in o.items:
            p = prod_map.get(it.product_id)
            if o.status not in {"cancelled", "refunded"}:
                sales_qty[it.product_id] = sales_qty.get(it.product_id, 0) + it.quantity
                sales_rev_cents[it.product_id] = sales_rev_cents.get(it.product_id, 0) + (it.unit_price_cents * it.quantity)
            item_list.append(
                {
                    "product_id": it.product_id,
                    "product_name": p.name if p else f"Product #{it.product_id}",
                    "quantity": it.quantity,
                    "unit_price_dollars": round(it.unit_price_cents / 100, 2),
                }
            )
        serialized_orders.append(
            {
                "id": o.id,
                "shop_id": o.shop_id,
                "shop_name": shop_map.get(o.shop_id, ""),
                "buyer_username": buyer.username if buyer else f"user{o.buyer_id}",
                "buyer_display_name": buyer.display_name if buyer else f"Customer #{o.buyer_id}",
                "total_dollars": round(o.total_cents / 100, 2),
                "payment_method": o.payment_method,
                "coupon_code": o.coupon_code,
                "status": o.status,
                "shipping_address": o.shipping_address,
                "items": item_list,
                "created_at": o.created_at.isoformat(),
            }
        )

    revenue_cents = sum(o.total_cents for o in orders if o.status not in {"cancelled", "refunded"})
    low_stock = [p.name for p in products if p.stock <= 5]

    product_sales = [
        {
            "product_id": p.id,
            "name": p.name,
            "sold_quantity": sales_qty.get(p.id, 0),
            "stock": p.stock,
            "revenue_dollars": round(sales_rev_cents.get(p.id, 0) / 100, 2),
        }
        for p in products
    ]
    product_sales.sort(key=lambda x: x["sold_quantity"], reverse=True)

    return {
        "shops_count": len(my_shops),
        "products_count": len(products),
        "orders_count": len(orders),
        "total_revenue_dollars": round(revenue_cents / 100, 2),
        "low_stock_products": low_stock,
        "product_sales": product_sales,
        "coupons": [
            {
                "id": c.id,
                "shop_id": c.shop_id,
                "shop_name": shop_map.get(c.shop_id, ""),
                "code": c.code,
                "discount_type": c.discount_type,
                "discount_value": c.discount_value,
            }
            for c in coupons
        ],
        "recent_orders": serialized_orders,
    }


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    shop = db.get(Shop, order.shop_id)
    if not shop or shop.owner_id != uid:
        raise HTTPException(status_code=403, detail="Only the store owner can update order status")
    order.status = payload.status
    db.commit()
    return {"id": order.id, "status": order.status}


@router.get("/orders/my")
def list_my_orders(claims: dict = Depends(get_current_user_claims), db: Session = Depends(get_db)):
    uid = int(claims["sub"])
    orders = db.scalars(select(Order).where(Order.buyer_id == uid).order_by(Order.created_at.desc())).all()
    return [
        {
            "id": o.id,
            "shop_id": o.shop_id,
            "total_dollars": round(o.total_cents / 100, 2),
            "status": o.status,
            "shipping_address": o.shipping_address,
            "created_at": o.created_at.isoformat(),
        }
        for o in orders
    ]


@router.patch("/products/{product_id}/stock")
def adjust_product_stock(
    product_id: int,
    payload: StockAdjustmentRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    uid = int(claims["sub"])
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    shop = db.get(Shop, p.shop_id)
    if not shop or shop.owner_id != uid:
        raise HTTPException(status_code=403, detail="Only the store owner can adjust inventory")
    p.stock = payload.stock
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "stock": p.stock}
