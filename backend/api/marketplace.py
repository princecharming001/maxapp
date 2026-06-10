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
        "id": "course_glowup_30", "title": "30-Day Glow Up", "category": "skinmax",
        "creator": {"name": "Dr. Lena Park", "handle": "drlenapark", "verified": True},
        "price_cents": 2499, "price_model": "flat", "weeks": 4,
        "rating": 4.8, "participants": 12400, "completion_rate": 0.82,
        "blurb": "A dermatologist's full skin reset, fit to your real day.",
        "icon": "sparkles-outline", "color": "#8B5CF6",
    },
    {
        "id": "course_lift101", "title": "Lift 101: Your First 8 Weeks", "category": "fitmax",
        "creator": {"name": "Marcus Reed", "handle": "coachmreed", "verified": True},
        "price_cents": 399, "price_model": "weekly", "weeks": 8,
        "rating": 4.9, "participants": 30100, "completion_rate": 0.74,
        "blurb": "Beginner strength that slots into the gaps you actually have.",
        "icon": "barbell-outline", "color": "#10B981",
    },
    {
        "id": "course_posture_reset", "title": "Posture Reset", "category": "heightmax",
        "creator": {"name": "Aria Vance", "handle": "ariamoves", "verified": False},
        "price_cents": 1499, "price_model": "flat", "weeks": 3,
        "rating": 4.6, "participants": 5300, "completion_rate": 0.79,
        "blurb": "Stand taller in three weeks. Two minutes, a few times a day.",
        "icon": "resize-outline", "color": "#6366F1",
    },
    {
        "id": "course_jaw_basics", "title": "Jaw + Tongue Basics", "category": "bonemax",
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


@router.post("/enter/{item_id}")
async def enter(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant the entitlement for a maxx or course and persist it. (Payment
    capture is the next slice; this unblocks the end-to-end marketplace flow.)"""
    is_course = item_id.startswith("course_")
    if not is_course and item_id not in _MAXX_DISPLAY:
        raise HTTPException(status_code=404, detail="Unknown item")
    if is_course and not any(c["id"] == item_id for c in _SEED_COURSES):
        raise HTTPException(status_code=404, detail="Unknown course")

    user, _ = await _load_entered(db, _uid(current_user))
    ob = dict(user.onboarding or {})
    key = "entered_courses" if is_course else "entered_maxxes"
    lst = list(ob.get(key) or [])
    if item_id not in lst:
        lst.append(item_id)
    ob[key] = lst
    user.onboarding = ob  # reassign so SQLAlchemy flushes the JSON change
    await db.commit()
    return {"entered": True, "item_id": item_id, "kind": "course" if is_course else "maxx"}
