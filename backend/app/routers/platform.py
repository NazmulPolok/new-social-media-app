from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import get_current_user_claims, require_admin
from app.db.postgres import get_db
from app.models.sql_models import (
    AuditLog,
    Channel,
    DigitalProject,
    Group,
    Order,
    Page,
    Product,
    Report,
    Shop,
    User,
    Video,
)

router = APIRouter(tags=["Search, Moderation & Admin"])


class ReportCreateRequest(BaseModel):
    target_type: str = Field(pattern=r"^(post|user|video|product|project|comment)$")
    target_id: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=4, max_length=1000)


@router.get("/api/search")
def unified_search(q: str = "", db: Session = Depends(get_db)):
    term = q.strip()
    if not term:
        return {"users": [], "pages": [], "groups": [], "channels": [], "videos": [], "shops": [], "products": [], "projects": []}

    like = f"%{term}%"
    users = db.scalars(select(User).where(User.username.ilike(like) | User.display_name.ilike(like)).limit(10)).all()
    pages = db.scalars(select(Page).where(Page.name.ilike(like) | Page.handle.ilike(like)).limit(10)).all()
    groups = db.scalars(select(Group).where(Group.name.ilike(like)).limit(10)).all()
    channels = db.scalars(select(Channel).where(Channel.name.ilike(like) | Channel.handle.ilike(like)).limit(10)).all()
    videos = db.scalars(select(Video).where(Video.title.ilike(like)).limit(10)).all()
    shops = db.scalars(select(Shop).where(Shop.name.ilike(like) | Shop.slug.ilike(like)).limit(10)).all()
    products = db.scalars(select(Product).where(Product.name.ilike(like) | Product.category.ilike(like)).limit(10)).all()
    projects = db.scalars(select(DigitalProject).where(DigitalProject.title.ilike(like) | DigitalProject.tech_stack.ilike(like)).limit(10)).all()

    return {
        "users": [{"id": u.id, "username": u.username, "display_name": u.display_name} for u in users],
        "pages": [{"id": p.id, "name": p.name, "handle": p.handle, "category": p.category} for p in pages],
        "groups": [{"id": g.id, "name": g.name, "privacy": g.privacy} for g in groups],
        "channels": [{"id": c.id, "name": c.name, "handle": c.handle} for c in channels],
        "videos": [{"id": v.id, "title": v.title, "views_count": v.views_count} for v in videos],
        "shops": [{"id": s.id, "name": s.name, "slug": s.slug} for s in shops],
        "products": [{"id": p.id, "name": p.name, "price_dollars": round(p.price_cents / 100, 2), "shop_slug": p.shop.slug} for p in products],
        "projects": [{"id": pr.id, "title": pr.title, "slug": pr.slug, "price_dollars": round(pr.price_cents / 100, 2)} for pr in projects],
    }


@router.post("/api/reports", status_code=status.HTTP_201_CREATED)
def submit_report(
    payload: ReportCreateRequest,
    claims: dict = Depends(get_current_user_claims),
    db: Session = Depends(get_db),
):
    rep = Report(
        reporter_id=int(claims["sub"]),
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason.strip(),
    )
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return {"id": rep.id, "status": rep.status}


@router.get("/api/admin/overview")
def admin_overview(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    revenue_cents = db.scalar(select(func.sum(Order.total_cents))) or 0
    return {
        "total_users": db.scalar(select(func.count(User.id))) or 0,
        "total_pages": db.scalar(select(func.count(Page.id))) or 0,
        "total_groups": db.scalar(select(func.count(Group.id))) or 0,
        "total_channels": db.scalar(select(func.count(Channel.id))) or 0,
        "total_videos": db.scalar(select(func.count(Video.id))) or 0,
        "total_shops": db.scalar(select(func.count(Shop.id))) or 0,
        "total_products": db.scalar(select(func.count(Product.id))) or 0,
        "total_projects": db.scalar(select(func.count(DigitalProject.id))) or 0,
        "total_orders": db.scalar(select(func.count(Order.id))) or 0,
        "total_revenue_dollars": round(revenue_cents / 100, 2),
        "open_reports": db.scalar(select(func.count(Report.id)).where(Report.status == "open")) or 0,
    }


@router.get("/api/admin/users")
def admin_list_users(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.id.desc()).limit(100)).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role,
            "is_verified": u.is_verified,
            "is_suspended": u.is_suspended,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/api/admin/users/{user_id}/suspend")
def admin_toggle_suspend(
    user_id: int,
    claims: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_suspended = not u.is_suspended
    db.add(AuditLog(actor_id=int(claims["sub"]), action="user.suspend_toggle", target=f"user:{u.id}", details=f"suspended={u.is_suspended}"))
    db.commit()
    return {"id": u.id, "is_suspended": u.is_suspended}


@router.post("/api/admin/users/{user_id}/verify")
def admin_toggle_verify(
    user_id: int,
    claims: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_verified = not u.is_verified
    db.add(AuditLog(actor_id=int(claims["sub"]), action="user.verify_toggle", target=f"user:{u.id}", details=f"verified={u.is_verified}"))
    db.commit()
    return {"id": u.id, "is_verified": u.is_verified}


@router.get("/api/admin/reports")
def admin_list_reports(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    reps = db.scalars(select(Report).order_by(Report.id.desc()).limit(50)).all()
    return [
        {
            "id": r.id,
            "reporter_id": r.reporter_id,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in reps
    ]


@router.get("/api/admin/audit-logs")
def admin_audit_logs(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(50)).all()
    return [
        {
            "id": l.id,
            "actor_id": l.actor_id,
            "action": l.action,
            "target": l.target,
            "details": l.details,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
