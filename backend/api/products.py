"""
Products tab — what to buy for the routine on YOUR schedule, nothing else.

The list is computed from the person's current plans every time:

  * only programs they run, in the order they started them;
  * only NEEDS their current habits have. A need is what a product is for
    ("dark_room", "creatine", "face_cleanser"); each catalog product has one,
    and products sharing a need are alternatives to each other;
  * ONE product per need: their own pick if they made one ("Other options"),
    else the best fit (skin type, the routine's wording, ratings);
  * Skin & Hair needs come from the steps of their routine ("A light gel
    moisturizer", "Mineral SPF 30+"), so they match their skin;
  * supplements only from their Suppmax plan, which passed its safety screen.

Change programs or tweak a plan and the next load reflects it.

GET  /products/for-me                 the list
GET  /products/alternatives?need=...  every product for one of THEIR needs
POST /products/pick {need, product_id} remember which one they want
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from middleware import get_current_user
from services.ai_programs import AI_PROGRAMS, _user_state, is_ai_program
from services.product_catalog import Product, _passes_user_facts, active_catalog

router = APIRouter(prefix="/products", tags=["Products"])

PICKS_KEY = "product_picks"     # user context: {need: product_id}
SKIN = "skinhairmax"

NEED_LABELS = {
    "dark_room": "Darker bedroom", "quiet_room": "Quieter bedroom", "wake_light": "Wake-up light",
    "water_bottle": "Water bottle", "light_therapy": "Light therapy", "electrolytes": "Electrolytes",
    "protein_breakfast": "Protein breakfast", "green_tea": "Green tea", "co2_monitor": "CO2 monitor",
    "bp_monitor": "Blood pressure cuff",
    "focus_earplugs": "Focus earplugs", "everyday_earplugs": "Earplugs",
    "analog_alarm": "Alarm clock", "weights": "Weights", "resistance_bands": "Resistance bands",
    "pull_up_bar": "Pull-up bar", "recovery_roller": "Recovery roller", "exercise_mat": "Exercise mat",
    "jump_rope": "Jump rope", "workout_log": "Workout log", "walking_pad": "Walking pad",
    "step_tracker": "Step tracker", "fiber": "Fiber", "balance_pad": "Balance pad",
    "face_cleanser": "Cleanser", "moisturizer": "Moisturizer", "sunscreen": "Sunscreen",
    "sunscreen_stick": "Sunscreen stick", "lip_spf": "Lip SPF", "adapalene": "Adapalene",
    "retinol_serum": "Retinol", "niacinamide_serum": "Niacinamide", "vitamin_c_serum": "Vitamin C",
    "azelaic_acid": "Azelaic acid", "bha_exfoliant": "BHA exfoliant", "aha_exfoliant": "Gentle acid",
    "hyaluronic_serum": "Hydrating serum", "clay_mask": "Clay mask", "ointment": "Night seal",
    "ketoconazole_shampoo": "Scalp shampoo", "scalp_brush": "Scalp brush", "silk_pillowcase": "Silk pillowcase",
    "melatonin": "Melatonin", "magnesium": "Magnesium", "l_theanine": "L-theanine", "creatine": "Creatine",
    "collagen": "Collagen", "vitamin_d3": "Vitamin D3", "omega3": "Omega-3", "glycine": "Glycine",
    "multivitamin": "Multivitamin", "b12": "B12", "protein_powder": "Protein powder",
    "sharps_container": "Sharps container", "travel_cooler": "Travel cooler", "alcohol_pads": "Alcohol pads",
    "fridge_thermometer": "Fridge thermometer",
}

# Skin & Hair: what a routine step asks for → the need it creates. Order matters
# only for display (cleanse → treat → moisturize → protect).
_SKIN_STEPS: list[tuple[str, str]] = [
    (r"ketoconazole", "ketoconazole_shampoo"),
    (r"scalp brush", "scalp_brush"),
    (r"gentle cleanser|wash with a .*cleanser", "face_cleanser"),
    (r"adapalene", "adapalene"),
    (r"\bretinol\b", "retinol_serum"),
    (r"niacinamide", "niacinamide_serum"),
    (r"vitamin c", "vitamin_c_serum"),
    (r"azelaic", "azelaic_acid"),
    (r"\bbha\b|salicylic", "bha_exfoliant"),
    (r"lactic|\bpha\b|\baha\b|glycolic", "aha_exfoliant"),
    (r"hyaluronic|hydrating serum", "hyaluronic_serum"),
    (r"moisturizer", "moisturizer"),
    (r"clay mask", "clay_mask"),
    (r"petroleum jelly", "ointment"),
    (r"spf 30\+", "sunscreen"),
]
# routine wording that says which kind fits ("a light gel moisturizer")
_STEP_WORDS = ("gel", "lotion", "cream", "ceramide", "fragrance-free", "mineral", "broad-spectrum", "light", "rich")


def _image(url: str) -> str:
    """Amazon serves any size from the same key; ask for a 500 px square."""
    return re.sub(r"\._[^/]*_\.(jpg|png)$", r"._AC_SL500_.\1", url) if url else ""


def _score(p: Product) -> float:
    """Well rated AND widely rated: 4.7 from 50k beats 4.9 from 40."""
    if not p.rating:
        return 0.0
    return p.rating * math.log10(10 + (p.rating_count or 0))


def _card(p: Product) -> dict[str, Any]:
    return {
        "id": p.id, "asin": p.asin, "name": p.name, "brand": p.brand, "image": _image(p.image),
        "price_usd": p.price_usd, "rating": p.rating, "rating_count": p.rating_count,
        "url": f"https://www.amazon.com/dp/{p.asin}" if p.asin else p.url, "why": p.rationale,
        "need": p.need, "strength": p.strength or None,
    }


# Needs whose product is used up (taken, applied, mixed in). Everything else is
# gear: bought once, never listed under "What you'll use" in a task guide.
CONSUMABLE_NEEDS = frozenset({
    "electrolytes", "protein_breakfast", "fiber", "alcohol_pads", "green_tea",
    "melatonin", "magnesium", "l_theanine", "creatine", "collagen", "vitamin_d3", "omega3",
    "glycine", "multivitamin", "b12", "protein_powder",
    "face_cleanser", "moisturizer", "sunscreen", "sunscreen_stick", "lip_spf", "adapalene",
    "retinol_serum", "niacinamide_serum", "vitamin_c_serum", "azelaic_acid", "bha_exfoliant",
    "aha_exfoliant", "hyaluronic_serum", "clay_mask", "ointment", "ketoconazole_shampoo",
})


def is_gear(need: str) -> bool:
    return bool(need) and need not in CONSUMABLE_NEEDS


def _dose_rank(p: Product) -> int:
    """1 = labelled strength outside the library's dose range for this need,
    else 0 (inside, or unknown: a product without a strength on its name is not
    pushed under one that has it). Supplements only."""
    if not p.strength or p.need not in CONSUMABLE_NEEDS:
        return 0
    try:
        from services.habit_library import need_range, parse_strength
        rng = need_range(p.need)
        got = parse_strength(p.strength)
        if not rng or not got:
            return 0
        inside = rng.contains(*got)
    except Exception:
        return 0
    return 1 if inside is False else 0


def _skin_text(h: dict) -> str:
    parts = [str(h.get("how") or "")]
    parts += [str((v or {}).get("how") or "") for v in (h.get("variants") or {}).values()]
    return " ".join(parts).lower()


def plan_needs(active: list[tuple[str, dict]]) -> list[dict[str, Any]]:
    """Every need the person's current plans have, in plan order, deduped.
    Each: {need, program, habits: [titles], hints: {words that say which kind fits}}."""
    by_need: dict[str, dict] = {}
    order: list[str] = []
    catalog = active_catalog()

    def add(need: str, program: str, title: str, hints: set[str]):
        if need not in by_need:
            by_need[need] = {"need": need, "program": program, "habits": [], "hints": set()}
            order.append(need)
        n = by_need[need]
        if title and title not in n["habits"]:
            n["habits"].append(title)
        n["hints"] |= hints

    for program, plan in active:
        habits = (plan or {}).get("habits") or []
        if program == SKIN:
            prof = (plan or {}).get("skin_profile") or {}
            base = {str(prof.get("skin") or ""), str(prof.get("goal") or "")} | {str(f) for f in prof.get("flags") or []}
            for h in habits:
                text = _skin_text(h)
                title = str(h.get("title") or "").strip()
                for pattern, need in _SKIN_STEPS:
                    if re.search(pattern, text):
                        words = {w for w in _STEP_WORDS if w in text} if need in ("moisturizer", "sunscreen") else set()
                        add(need, program, title, (base | words) - {""})
            continue
        hints = _supp_hints(plan) if program == "suppmax" else set()
        for h in habits:
            hid = h.get("habit_id")
            title = str(h.get("title") or "").strip()
            for p in catalog:
                # a program's own products only: supplements never ride in on a
                # sleep habit, they come from the (screened) Suppmax plan
                if p.module == program and p.need and hid in p.concerns:
                    add(p.need, program, title, hints)
    return [by_need[n] for n in order]


def _supp_hints(plan: dict) -> set[str]:
    """Sex and diet from the Suppmax quiz pick the right multivitamin / protein."""
    a = (plan or {}).get("answers") or {}
    out = set()
    sex = str(a.get("sex") or "").lower()
    if sex in ("male", "female"):
        out.add(sex)
    if re.search(r"vegan|vegetarian", str(a.get("supp_diet") or "").lower()):
        out.add("vegan")
    return out


# Words that show a step uses a need (guides attach each product to the step
# that mentions it; anything unmatched goes on the first step).
NEED_WORDS: dict[str, tuple[str, ...]] = {
    "dark_room": ("dark", "mask", "blackout", "curtain"), "quiet_room": ("quiet", "noise", "earplug"),
    "wake_light": ("light", "sunrise", "alarm"), "water_bottle": ("water", "bottle", "glass", "refill"),
    "light_therapy": ("light", "lamp"), "electrolytes": ("electrolyte", "salt", "sodium"),
    "protein_breakfast": ("protein", "shake", "breakfast"), "green_tea": ("green tea", "matcha", "tea"),
    "co2_monitor": ("co2", "window", "air"), "bp_monitor": ("blood pressure", "cuff"),
    "focus_earplugs": ("noise", "earplug", "quiet"),
    "everyday_earplugs": ("noise", "earplug"), "analog_alarm": ("alarm", "phone", "clock"),
    "weights": ("dumbbell", "weight", "kettlebell", "squat", "press", "row"),
    "resistance_bands": ("band",), "pull_up_bar": ("pull", "hang"), "recovery_roller": ("roll", "foam"),
    "exercise_mat": ("floor", "mat", "stretch", "plank"), "jump_rope": ("rope", "jump"),
    "workout_log": ("log", "write", "track"), "walking_pad": ("walk", "steps"), "step_tracker": ("steps", "track"),
    "fiber": ("fiber", "psyllium"), "balance_pad": ("balance", "one leg", "stand"),
    "face_cleanser": ("cleanser", "cleanse", "wash"), "moisturizer": ("moisturizer",),
    "sunscreen": ("spf", "sunscreen"), "adapalene": ("adapalene",), "retinol_serum": ("retinol",),
    "niacinamide_serum": ("niacinamide",), "vitamin_c_serum": ("vitamin c",), "azelaic_acid": ("azelaic",),
    "bha_exfoliant": ("bha", "salicylic"), "aha_exfoliant": ("lactic", "pha", "aha", "glycolic"),
    "hyaluronic_serum": ("hyaluronic", "hydrating serum"), "clay_mask": ("clay",), "ointment": ("petroleum",),
    "ketoconazole_shampoo": ("shampoo", "ketoconazole"), "scalp_brush": ("brush", "scalp"),
    "melatonin": ("melatonin",), "magnesium": ("magnesium",), "l_theanine": ("theanine",),
    "creatine": ("creatine",), "collagen": ("collagen",), "vitamin_d3": ("vitamin d", "d3"),
    "omega3": ("omega", "fish oil", "algae"), "glycine": ("glycine",), "multivitamin": ("multivitamin", "multi"),
    "b12": ("b12",), "protein_powder": ("protein",),
    "sharps_container": ("sharps", "needle"), "travel_cooler": ("cool", "travel"),
    "alcohol_pads": ("alcohol", "swab", "wipe"), "fridge_thermometer": ("fridge", "temperature"),
}


def task_needs(active: list[tuple[str, dict]], maxx_id: str, habit_id: str, text: str) -> list[dict[str, Any]]:
    """The needs of ONE task in the person's plan (the same ones the Products tab
    shows for it). Folded supplement rows ("creatine + L-theanine") and skin
    routine steps are matched by the words in the task's own text."""
    t = (text or "").lower()
    mine = [n for n in plan_needs(active) if n["program"] == maxx_id]
    if maxx_id == SKIN:
        found = {need for pattern, need in _SKIN_STEPS if re.search(pattern, t)}
        return [n for n in mine if n["need"] in found]
    if maxx_id == "suppmax":
        hits = [n for n in mine if any(w in t for w in NEED_WORDS.get(n["need"], ()))]
        if hits:
            return hits
    ids = {p.need for p in active_catalog() if p.module == maxx_id and habit_id in p.concerns}
    return [n for n in mine if n["need"] in ids]


def task_products(active: list[tuple[str, dict]], facts: Optional[dict], picks: dict,
                  maxx_id: str, habit_id: str, text: str) -> list[tuple[str, dict[str, Any]]]:
    """(need, product card) for one task: the person's pick for each need."""
    out = []
    for n in task_needs(active, maxx_id, habit_id, text):
        opts = options_for(n, facts, picks)
        if opts:
            out.append((n["need"], {**_card(opts[0]), "need": n["need"],
                                    "need_label": NEED_LABELS.get(n["need"], n["need"])}))
    return out


def _fit(p: Product, hints: set[str]) -> int:
    # a men's or women's formula only for that person; "prefer not to say" gets neither
    wrong_sex = (set(p.suits) & {"male", "female"}) - hints
    return len(set(p.suits) & hints) - len(wrong_sex)


def options_for(need: dict, facts: Optional[dict], picks: dict) -> list[Product]:
    """Every product for this need, best first: their pick, then a strength
    inside the library's dose range, then fit, then the researched pick ahead of
    its alternatives, then ratings."""
    pool = [p for p in active_catalog() if p.need == need["need"] and _passes_user_facts(p, facts)]
    pick = picks.get(need["need"])
    return sorted(pool, key=lambda p: (p.id != pick, _dose_rank(p), -_fit(p, need["hints"]), p.alternative,
                                       -_score(p)))


def build_list(active: list[tuple[str, dict]], facts: Optional[dict], picks: dict) -> list[dict[str, Any]]:
    sections: dict[str, dict] = {}
    for need in plan_needs(active):
        opts = options_for(need, facts, picks)
        if not opts:
            continue
        prog = need["program"]
        meta = AI_PROGRAMS.get(prog) or {}
        sec = sections.setdefault(prog, {"program": prog, "label": meta.get("label") or prog,
                                         "color": meta.get("color") or "", "items": []})
        sec["items"].append({
            "need": need["need"],
            "need_label": NEED_LABELS.get(need["need"], need["need"].replace("_", " ").capitalize()),
            "for": need["habits"],
            "product": _card(opts[0]),
            "options": len(opts),
            "picked": picks.get(need["need"]) == opts[0].id,
        })
    order = [m for m, _ in active]
    return sorted(sections.values(), key=lambda s: order.index(s["program"]))


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


async def _context(uid: str, db: AsyncSession) -> tuple[list, Optional[dict], dict]:
    from services.user_context_service import get_context
    _, onboarding, _state = await _user_state(uid, db)
    facts = onboarding.get("user_facts") if isinstance(onboarding.get("user_facts"), dict) else None
    ctx = await get_context(uid, db)
    picks = ctx.get(PICKS_KEY) if isinstance(ctx.get(PICKS_KEY), dict) else {}
    return await _active_plans(uid, db), facts, picks


@router.get("/for-me")
async def products_for_me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    active, facts, picks = await _context(str(current_user["id"]), db)
    sections = build_list(active, facts, picks)
    checked = max((p.checked for p in active_catalog() if p.checked), default="")
    return {"sections": sections, "has_programs": bool(active), "checked": checked}


def _their_need(active: list, need: str) -> dict:
    hit = next((n for n in plan_needs(active) if n["need"] == need), None)
    if hit is None:
        # only needs their own routine has (keeps screened-only items screened)
        raise HTTPException(status_code=404, detail="Not part of your routine")
    return hit


@router.get("/alternatives")
async def alternatives(need: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    active, facts, picks = await _context(str(current_user["id"]), db)
    n = _their_need(active, need)
    opts = options_for(n, facts, picks)
    return {
        "need": need,
        "need_label": NEED_LABELS.get(need, need),
        "for": n["habits"],
        "options": [{**_card(p), "current": i == 0} for i, p in enumerate(opts)],
    }


class PickIn(BaseModel):
    need: str
    product_id: str


@router.post("/pick")
async def pick(body: PickIn, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from services.user_context_service import merge_context
    uid = str(current_user["id"])
    active, facts, picks = await _context(uid, db)
    n = _their_need(active, body.need)
    if body.product_id not in {p.id for p in options_for(n, facts, picks)}:
        raise HTTPException(status_code=400, detail="Not an option for this")
    await merge_context(uid, {PICKS_KEY: {**picks, body.need: body.product_id}}, db)
    await db.commit()
    return {"ok": True}
