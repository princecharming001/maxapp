"""
Products tab — the catalog arranged for one person.

GET /products/for-me returns every program's products, the person's active
programs first. Inside a program, products that serve a habit in their current
plan come first and say which habit ("For your wind-down routine").

Supplements are the exception: Suppmax products are only listed when they match
a supplement in the person's own Suppmax plan, which already went through its
safety screen (pregnancy, medications, conditions). Without Suppmax there is
nothing to list there, only the program's own explanation.

Pure in-process (catalog YAML + the person's plans): no network, ~10 ms.
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware import get_current_user
from services.ai_programs import AI_PROGRAMS, SUPP_PROGRAM, _user_state, is_ai_program
from services.product_catalog import Product, _passes_user_facts, active_catalog

router = APIRouter(prefix="/products", tags=["Products"])

# Program order when the person runs none of them (and for the rest after theirs).
_ORDER = ["sleepmax", "energymax", "focusmax", "calmmax", "trainmax", "longevitymax",
          "skinhairmax", "suppmax", "peptidemax"]

# Skin plans are two routines (am/pm) whose steps name the product kinds.
_SKIN_WORDS = ("cleanser", "moisturiz", "sunscreen", "spf", "adapalene", "retinoid", "shampoo",
               "ketoconazole", "lip", "silk", "scalp")


def _image(url: str) -> str:
    """Amazon serves any size from the same key; ask for a 500 px square."""
    return re.sub(r"\._[^/]*_\.(jpg|png)$", r"._AC_SL500_.\1", url) if url else ""


def _score(p: Product) -> float:
    """Well rated AND widely rated: 4.7 from 50k beats 4.9 from 40."""
    if not p.rating:
        return 0.0
    return p.rating * math.log10(10 + (p.rating_count or 0))


def _plan_matches(p: Product, plan: Optional[dict]) -> Optional[str]:
    """The title of the habit in this plan the product serves, else None."""
    habits = (plan or {}).get("habits") or []
    concerns = set(p.concerns)
    for h in habits:
        if h.get("habit_id") in concerns:
            return str(h.get("title") or "").strip() or None
    if p.module == "skinhairmax":
        text = " ".join(
            " ".join(str(h.get(k) or "") for k in ("title", "how"))
            + " " + " ".join(str((v or {}).get("how") or "") for v in (h.get("variants") or {}).values())
            for h in habits
        ).lower()
        for c in p.concerns:
            word = c.replace("_", " ")
            if any(w in word for w in _SKIN_WORDS) and word in text:
                return "your skin routine"
    return None


def _card(p: Product, match: Optional[str]) -> dict[str, Any]:
    return {
        "id": p.id,
        "asin": p.asin,
        "name": p.name,
        "brand": p.brand,
        "image": _image(p.image),
        "price_usd": p.price_usd,
        "rating": p.rating,
        "rating_count": p.rating_count,
        "url": f"https://www.amazon.com/dp/{p.asin}" if p.asin else p.url,
        "why": p.rationale,
        "for_habit": match,
    }


async def _active_plans(user_id: str, db: AsyncSession) -> list[tuple[str, dict]]:
    """(program, its plan) for each active AI program, oldest first."""
    from models.sqlalchemy_models import UserSchedule
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))
        ).order_by(UserSchedule.created_at.asc())
    )
    out: list[tuple[str, dict]] = []
    seen: set[str] = set()
    for s in res.scalars().all():
        if is_ai_program(s.maxx_id) and s.maxx_id not in seen:
            seen.add(s.maxx_id)
            out.append((s.maxx_id, (s.schedule_context or {}).get("ai_plan") or {}))
    return out


def build_sections(active: list[tuple[str, dict]], facts: Optional[dict]) -> list[dict[str, Any]]:
    plans = dict(active)
    order = [m for m, _ in active] + [m for m in _ORDER if m not in plans]
    by_program: dict[str, list[Product]] = {}
    for p in active_catalog():
        if p.module in AI_PROGRAMS and _passes_user_facts(p, facts):
            by_program.setdefault(p.module, []).append(p)
    sections = []
    for mid in order:
        meta = AI_PROGRAMS.get(mid) or {}
        cards = []
        for p in by_program.get(mid, []):
            match = _plan_matches(p, plans.get(mid))
            if mid == SUPP_PROGRAM and not match:
                continue  # supplements: only what their own screened plan holds
            cards.append((0 if match else 1, -_score(p), _card(p, match)))
        cards.sort(key=lambda t: (t[0], t[1]))
        note = ""
        if mid == SUPP_PROGRAM and not cards:
            note = ("Supplements are matched to you after Suppmax's safety questions. "
                    "Start Suppmax to see yours here.")
        sections.append({
            "program": mid,
            "label": meta.get("label") or mid,
            "color": meta.get("color") or "",
            "active": mid in plans,
            "note": note,
            "products": [c for _, _, c in cards],
        })
    return sections


@router.get("/for-me")
async def products_for_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = str(current_user["id"])
    _, onboarding, _state = await _user_state(uid, db)
    facts = onboarding.get("user_facts") if isinstance(onboarding.get("user_facts"), dict) else None
    active = await _active_plans(uid, db)
    sections = build_sections(active, facts)
    checked = max((p.checked for p in active_catalog() if p.checked), default="")
    return {"sections": sections, "checked": checked}
