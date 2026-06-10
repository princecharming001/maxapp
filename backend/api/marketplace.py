"""
Marketplace API - browse + enter native maxes and creator courses.

Pricing model (v1):
  - native maxes  -> $3.99 / week each (the user enters as many as they want)
  - creator courses -> a price preset by the creator (one-time flat, or weekly)

Browse is open to any logged-in user; the paywall is at "enter"/"buy", which is
why this router uses get_current_user (logged-in) rather than require_paid_user.

v1 scope: native maxes are real (sourced from the maxx guidelines); creator
courses are a seeded set until the creator-publishing flow ships. "Enter" grants
the entitlement directly and persists it on the user's onboarding record - real
payment capture (Stripe / Apple IAP per item) is the next slice, intentionally
not wired here so the marketplace is runnable end-to-end first.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware.auth_middleware import get_current_user
from models.sqlalchemy_models import User
from services.maxx_guidelines import get_maxx_guideline

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])

MAXX_PRICE_CENTS = 399  # $3.99 / week per maxx

# Display copy for the native maxes (voice-safe: outcome-first, no body-threat).
_MAXX_DISPLAY: dict[str, dict[str, str]] = {
    "skinmax":   {"label": "Skinmax",   "icon": "sparkles-outline", "color": "#8B5CF6", "tagline": "clearer, calmer skin"},
    "fitmax":    {"label": "Fitmax",    "icon": "fitness-outline",  "color": "#10B981", "tagline": "build your best body"},
    "hairmax":   {"label": "Hairmax",   "icon": "cut-outline",      "color": "#3B82F6", "tagline": "fuller, healthier hair"},
    "heightmax": {"label": "Heightmax", "icon": "resize-outline",   "color": "#6366F1", "tagline": "posture, height, presence"},
    "bonemax":   {"label": "Bonemax",   "icon": "body-outline",     "color": "#F59E0B", "tagline": "a sharper jaw and frame"},
}

# Seeded creator courses (single-player supply so Explore isn't empty at launch).
# Creator-set price + cadence. Replaced by real creator listings later.
_SEED_COURSES: list[dict[str, Any]] = [
    {
        "id": "course_glowup_30", "schedule_hints": {"sessions_per_week": 7, "minutes": 15, "window": "evening"}, "title": "30-Day Glow Up", "category": "skinmax",
        "creator": {"name": "Dr. Lena Park", "handle": "drlenapark", "verified": True},
        "price_cents": 2499, "price_model": "flat", "weeks": 4,
        "rating": 4.8, "participants": 12400, "completion_rate": 0.82,
        "blurb": "A dermatologist's full skin reset, fit to your real day.",
        "icon": "sparkles-outline", "color": "#8B5CF6",
    },
    {
        "id": "course_lift101", "schedule_hints": {"sessions_per_week": 3, "minutes": 40, "window": "any"}, "title": "Lift 101: Your First 8 Weeks", "category": "fitmax",
        "creator": {"name": "Marcus Reed", "handle": "coachmreed", "verified": True},
        "price_cents": 399, "price_model": "weekly", "weeks": 8,
        "rating": 4.9, "participants": 30100, "completion_rate": 0.74,
        "blurb": "Beginner strength that slots into the gaps you actually have.",
        "icon": "barbell-outline", "color": "#10B981",
    },
    {
        "id": "course_posture_reset", "schedule_hints": {"sessions_per_week": 7, "minutes": 10, "window": "any"}, "title": "Posture Reset", "category": "heightmax",
        "creator": {"name": "Aria Vance", "handle": "ariamoves", "verified": False},
        "price_cents": 1499, "price_model": "flat", "weeks": 3,
        "rating": 4.6, "participants": 5300, "completion_rate": 0.79,
        "blurb": "Stand taller in three weeks. Two minutes, a few times a day.",
        "icon": "resize-outline", "color": "#6366F1",
    },
    {
        "id": "course_jaw_basics", "schedule_hints": {"sessions_per_week": 5, "minutes": 10, "window": "any"}, "title": "Jaw + Tongue Basics", "category": "bonemax",
        "creator": {"name": "Sam Cole", "handle": "samcole", "verified": False},
        "price_cents": 999, "price_model": "flat", "weeks": 6,
        "rating": 4.4, "participants": 8800, "completion_rate": 0.71,
        "blurb": "The fundamentals, done safely and consistently.",
        "icon": "body-outline", "color": "#F59E0B",
    },
]


def _uid(current_user: dict) -> UUID:
    raw = current_user.get("id") or current_user.get("user_id") or current_user.get("sub")
    if raw is None:
        raise HTTPException(status_code=401, detail="No user id on token")
    try:
        return UUID(str(raw))
    except ValueError:
        raise HTTPException(status_code=401, detail="Bad user id")


def _price_label(price_cents: int, price_model: str, weeks: int | None) -> str:
    dollars = price_cents / 100
    if price_model == "weekly":
        return f"${dollars:.2f} / week"
    wk = f" · {weeks} wks" if weeks else ""
    return f"${dollars:.2f}{wk}"


def _maxx_card(maxx_id: str, entered: set[str]) -> dict[str, Any]:
    d = _MAXX_DISPLAY.get(maxx_id, {})
    g = get_maxx_guideline(maxx_id) or {}
    return {
        "type": "maxx",
        "id": maxx_id,
        "title": d.get("label") or maxx_id,
        "tagline": d.get("tagline") or (g.get("description") or ""),
        "icon": d.get("icon"),
        "color": d.get("color"),
        "price_cents": MAXX_PRICE_CENTS,
        "price_model": "weekly",
        "price_label": _price_label(MAXX_PRICE_CENTS, "weekly", None),
        "creator": {"name": "Max", "handle": "max", "verified": True},
        "native": True,
        "entered": maxx_id in entered,
    }


def _course_card(c: dict[str, Any], entered: set[str]) -> dict[str, Any]:
    return {
        "type": "course",
        "id": c["id"],
        "title": c["title"],
        "tagline": c["blurb"],
        "category": c["category"],
        "icon": c["icon"],
        "color": c["color"],
        "creator": c["creator"],
        "price_cents": c["price_cents"],
        "price_model": c["price_model"],
        "weeks": c["weeks"],
        "price_label": _price_label(c["price_cents"], c["price_model"], c["weeks"]),
        "rating": c["rating"],
        "participants": c["participants"],
        "completion_rate": c["completion_rate"],
        "native": False,
        "entered": c["id"] in entered,
    }


async def _load_entered(db: AsyncSession, uid: UUID) -> tuple[User, set[str]]:
    user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    ob = dict(user.onboarding or {})
    entered = set(ob.get("entered_maxxes") or []) | set(ob.get("entered_courses") or [])
    return user, entered


@router.get("")
async def browse(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse the marketplace: native maxes + creator courses, with prices and
    whether the user has already entered each. Open to any logged-in user."""
    _, entered = await _load_entered(db, _uid(current_user))
    return {
        "maxxes": [_maxx_card(mid, entered) for mid in _MAXX_DISPLAY],
        "courses": [_course_card(c, entered) for c in _SEED_COURSES],
    }


@router.get("/item/{item_id}")
async def get_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full detail for one marketplace item (browse-before-buy)."""
    _, entered = await _load_entered(db, _uid(current_user))
    if item_id in _MAXX_DISPLAY:
        return _maxx_card(item_id, entered)
    for c in _SEED_COURSES:
        if c["id"] == item_id:
            return _course_card(c, entered)
    raise HTTPException(status_code=404, detail="Item not found")


def _item_meta(item_id: str) -> tuple[bool, int, str, "int | None", str]:
    """(is_course, price_cents, price_model, weeks, title) or raises 404."""
    if item_id in _MAXX_DISPLAY:
        return False, MAXX_PRICE_CENTS, "weekly", None, _MAXX_DISPLAY[item_id]["label"]
    for c in _SEED_COURSES:
        if c["id"] == item_id:
            return True, int(c["price_cents"]), str(c["price_model"]), c.get("weeks"), c["title"]
    raise HTTPException(status_code=404, detail="Unknown item")


def _set_entitlement(user: User, item_id: str, is_course: bool, granted: bool) -> None:
    ob = dict(user.onboarding or {})
    key = "entered_courses" if is_course else "entered_maxxes"
    lst = [x for x in (ob.get(key) or []) if x != item_id]
    if granted:
        lst.append(item_id)
    ob[key] = lst
    user.onboarding = ob  # reassign so SQLAlchemy flushes the JSON change


async def fulfill_marketplace_purchase(
    db: AsyncSession, user_id: str, item_id: str, provider: str, provider_ref: "str | None",
) -> None:
    """Capture fulfillment (webhook or stub): record the purchase + grant the
    entitlement. Idempotent on (user, item, active/pending)."""
    from datetime import datetime, timedelta
    from models.sqlalchemy_models import Purchase

    user = (await db.execute(select(User).where(User.id == UUID(user_id)))).scalar_one_or_none()
    if user is None:
        return
    is_course, price_cents, price_model, weeks, _title = _item_meta(item_id)
    existing = (await db.execute(
        select(Purchase).where(
            (Purchase.user_id == user.id)
            & (Purchase.item_id == item_id)
            & (Purchase.status.in_(("active", "pending")))
        )
    )).scalars().first()
    period_end = None
    if price_model == "weekly":
        period_end = datetime.utcnow() + timedelta(days=7)
    elif weeks:
        period_end = datetime.utcnow() + timedelta(weeks=int(weeks))
    if existing:
        existing.status = "active"
        existing.provider = provider
        existing.provider_ref = provider_ref or existing.provider_ref
        existing.period_end = existing.period_end or period_end
        existing.updated_at = datetime.utcnow()
    else:
        db.add(Purchase(
            user_id=user.id, item_id=item_id,
            kind="course" if is_course else "maxx",
            price_cents=price_cents, price_model=price_model,
            provider=provider, provider_ref=provider_ref,
            status="active", period_end=period_end,
        ))
    _set_entitlement(user, item_id, is_course, granted=True)
    await db.commit()


@router.post("/enter/{item_id}")
async def enter(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enter/buy an item. With Stripe configured this returns a hosted
    Checkout url (capture-first; the webhook grants the entitlement). Without
    Stripe (local dev / pre-launch) it grants directly with a stub purchase
    row so the marketplace stays runnable end-to-end."""
    from config import settings

    is_course, price_cents, price_model, weeks, title = _item_meta(item_id)
    uid = _uid(current_user)
    user, entered = await _load_entered(db, uid)
    if item_id in entered:
        return {"entered": True, "item_id": item_id, "kind": "course" if is_course else "maxx"}

    if settings.stripe_secret_key:
        import stripe
        from models.sqlalchemy_models import Purchase
        price_data: dict[str, Any] = {
            "currency": "usd",
            "product_data": {"name": f"Max - {title}"},
            "unit_amount": price_cents,
        }
        mode = "payment"
        if price_model == "weekly":
            price_data["recurring"] = {"interval": "week"}
            mode = "subscription"
        base = getattr(settings, "frontend_url", "") or "https://usemaxapp.com"
        session = stripe.checkout.Session.create(
            mode=mode,
            line_items=[{"price_data": price_data, "quantity": 1}],
            success_url=f"{base}/purchase-complete?item={item_id}",
            cancel_url=f"{base}/explore",
            metadata={"user_id": str(uid), "marketplace_item_id": item_id},
        )
        db.add(Purchase(
            user_id=uid, item_id=item_id,
            kind="course" if is_course else "maxx",
            price_cents=price_cents, price_model=price_model,
            provider="stripe", provider_ref=session.id, status="pending",
        ))
        await db.commit()
        return {"entered": False, "checkout_url": session.url, "item_id": item_id}

    # Stub capture (no Stripe configured): grant directly, record the purchase.
    await fulfill_marketplace_purchase(db, str(uid), item_id, "stub", None)
    return {"entered": True, "item_id": item_id, "kind": "course" if is_course else "maxx"}


@router.post("/cancel/{item_id}")
async def cancel(
    item_id: str,
    payload: "dict | None" = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Period-end cancel (spec 4.6): access continues to period_end, never an
    instant cut-off. pause=true instead pauses one month, keeping the
    entitlement and the streak (the ONE deflection offer; 'Cancel anyway'
    stays visible in the UI)."""
    from datetime import datetime, timedelta
    from models.sqlalchemy_models import Purchase

    pause = bool((payload or {}).get("pause"))
    uid = _uid(current_user)
    user, _ = await _load_entered(db, uid)
    is_course = _item_meta(item_id)[0]

    purchase = (await db.execute(
        select(Purchase).where(
            (Purchase.user_id == uid)
            & (Purchase.item_id == item_id)
            & (Purchase.status.in_(("active", "paused")))
        )
    )).scalars().first()
    if purchase is None:
        raise HTTPException(status_code=404, detail="No active purchase for this item")

    if pause:
        purchase.status = "paused"
        purchase.paused_until = datetime.utcnow() + timedelta(days=30)
        purchase.updated_at = datetime.utcnow()
        await db.commit()
        return {"status": "paused", "until": purchase.paused_until.isoformat()}

    purchase.status = "canceled"
    purchase.updated_at = datetime.utcnow()
    if purchase.provider == "stripe" and purchase.provider_ref:
        try:
            from services.stripe_service import stripe_service
            await stripe_service.cancel_subscription(purchase.provider_ref, at_period_end=True)
        except Exception:
            pass  # provider_ref may be a checkout session id for flat purchases
    # Entitlement survives until period_end; stub/expired revoke now.
    from datetime import timezone as _tz
    pe = purchase.period_end
    if pe is not None and pe.tzinfo is None:
        pe = pe.replace(tzinfo=_tz.utc)
    if pe is None or pe <= datetime.now(_tz.utc):
        _set_entitlement(user, item_id, is_course, granted=False)
    await db.commit()
    return {
        "status": "canceled",
        "access_until": purchase.period_end.isoformat() if purchase.period_end else None,
    }
