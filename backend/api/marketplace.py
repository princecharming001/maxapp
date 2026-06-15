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
from models.sqlalchemy_models import UserSchedule as _PurchaseProbe
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


# Creator headshots, stable per handle (real portraits so Explore + the detail
# pages read like a creator marketplace, not an icon grid).
_AVATARS: dict[str, str] = {
    "drlenapark": "https://i.pravatar.cc/240?img=47",
    "coachmreed": "https://i.pravatar.cc/240?img=12",
    "ariamoves": "https://i.pravatar.cc/240?img=44",
    "samcole": "https://i.pravatar.cc/240?img=33",
}


def _avatar(handle: str) -> "str | None":
    return _AVATARS.get(handle)


def _img(photo_id: str, w: int = 1200) -> str:
    return f"https://images.unsplash.com/photo-{photo_id}?auto=format&fit=crop&w={w}&q=70"


# Curated, verified-stable media — real creators replace these. Photography
# leads (the Apple/Craft register); an optional hero video gracefully falls
# back to the cover image on the client if it ever fails to load.
_VID_SAMPLE = "https://download.samplelib.com/mp4/sample-5s.mp4"
_VID_PEXELS = "https://videos.pexels.com/video-files/4761426/4761426-uhd_2732_1440_25fps.mp4"
# Creator-filmed "look inside" clip. A poster (the cover) shows through if it
# ever fails to load, so the section is never broken.
_VID_LOOK = "https://download.samplelib.com/mp4/sample-10s.mp4"

_MAXX_MEDIA: dict[str, dict[str, Any]] = {
    "skinmax":   {"cover": _img("1556228578-8c89e6adf883"), "video": _VID_SAMPLE},
    "fitmax":    {"cover": _img("1571019613454-1cb2f99b2d8b"), "inside": _VID_PEXELS},
    "hairmax":   {"cover": _img("1522337660859-02fbefca4702")},
    "heightmax": {"cover": _img("1512290923902-8a9f81dc236c")},
    "bonemax":   {"cover": _img("1620916566398-39f1143ab7be")},
}
_COURSE_MEDIA: dict[str, dict[str, Any]] = {
    "course_glowup_30":     {"cover": _img("1598440947619-2c35fc9aa908"), "video": _VID_PEXELS},
    "course_lift101":       {"cover": _img("1517836357463-d25dfeac3438"), "inside": _VID_PEXELS},
    "course_posture_reset": {"cover": _img("1532012197267-da84d127e765")},
    "course_jaw_basics":    {"cover": _img("1611672585731-fa10603fb9e0")},
}
_GALLERY_POOL: list[str] = [
    _img(p) for p in (
        "1556228578-8c89e6adf883", "1571019613454-1cb2f99b2d8b",
        "1522337660859-02fbefca4702", "1512290923902-8a9f81dc236c",
        "1620916566398-39f1143ab7be", "1598440947619-2c35fc9aa908",
        "1517836357463-d25dfeac3438", "1532012197267-da84d127e765",
        "1611672585731-fa10603fb9e0", "1526506118085-60ce8714f8c5",
    )
]


def _cover_for(item_id: str, is_course: bool) -> str:
    m = (_COURSE_MEDIA if is_course else _MAXX_MEDIA).get(item_id, {})
    return m.get("cover") or _GALLERY_POOL[0]


def _detail_media(item_id: str, is_course: bool) -> dict[str, Any]:
    """Gallery + optional hero video for the full detail page."""
    m = (_COURSE_MEDIA if is_course else _MAXX_MEDIA).get(item_id, {})
    cover = m.get("cover") or _GALLERY_POOL[0]
    gallery = [cover] + [g for g in _GALLERY_POOL if g != cover][:3]
    out: dict[str, Any] = {"gallery": gallery, "inside_video": m.get("inside") or _VID_LOOK}
    if m.get("video"):
        out["video_url"] = m["video"]
    return out


def _rev(name: str, img: int, rating: int, text: str) -> dict[str, Any]:
    return {"name": name, "avatar": f"https://i.pravatar.cc/120?img={img}", "rating": rating, "text": text}


# Rich "browse before you buy" content for each creator course — what's inside,
# who's teaching, and proof — surfaced on the full detail page.
_COURSE_DETAIL: dict[str, dict[str, Any]] = {
    "course_glowup_30": {
        "long_description": (
            "A board-certified dermatologist's 30-day reset. We strip your routine "
            "back to what actually works, rebuild your barrier first, then layer in "
            "one active at a time so your skin never gets overwhelmed. Every step is "
            "fit into your real evenings by Max."
        ),
        "outcomes": [
            "Calmer, clearer skin in four weeks",
            "A simple morning + evening routine you'll actually keep",
            "Know exactly which products your skin needs (and which to skip)",
            "Introduce actives without irritation or purging",
        ],
        "for_you_if": [
            "You own ten products and your skin is still angry",
            "You want a dermatologist's plan, not another TikTok routine",
        ],
        "curriculum": [
            {"title": "Week 1 · Barrier first", "lessons": ["Strip back to three steps", "Pick a cleanser + moisturizer for your skin", "The 60-second rule"]},
            {"title": "Week 2 · Your first active", "lessons": ["Vitamin C in the AM", "Easing in a retinoid", "Reading your skin's signals"]},
            {"title": "Week 3 · Target your concern", "lessons": ["Acne, texture or tone", "Spot-treating safely", "When to add exfoliation"]},
            {"title": "Week 4 · Lock it in", "lessons": ["Your keeper routine", "Weekly extras that pay off", "Tracking real progress"]},
        ],
        "bio": (
            "Dr. Lena Park is a board-certified dermatologist who's spent a decade "
            "untangling overcomplicated routines. She's known for barrier-first, "
            "minimal protocols that hold up in real life."
        ),
        "credentials": ["Board-certified dermatologist", "12 years clinical practice", "150k+ on Instagram"],
        "reviews": [
            _rev("Maya R.", 32, 5, "My skin calmed down in the first week. I finally threw out the 9 products that were wrecking my barrier."),
            _rev("Devon T.", 15, 5, "Simple, no fluff, and Max put each step right when I'm already in the bathroom. Stuck with it the whole month."),
            _rev("Priya S.", 45, 4, "Wish week 3 went deeper on hyperpigmentation, but my texture is noticeably smoother."),
        ],
        "faqs": [
            {"q": "Do I need to buy specific products?", "a": "No. Each step tells you what TYPE of product to use for your skin — use what you have or any drugstore option."},
            {"q": "Will this work for sensitive skin?", "a": "Yes — it's barrier-first by design and eases actives in slowly. You can flag sensitive skin and it adjusts."},
            {"q": "What if I miss a day?", "a": "Max reflows the plan around your real days. Missing one night won't break anything."},
        ],
        "guarantee": "Not feeling it in the first week? Cancel in two taps, no questions.",
    },
    "course_lift101": {
        "long_description": (
            "Eight weeks of beginner strength built around the gaps you actually "
            "have. Three sessions a week, real progression, and form you can trust — "
            "Max slots each one into your week so you never have to plan it."
        ),
        "outcomes": [
            "Confident barbell basics — squat, hinge, press, pull",
            "A repeatable 3-day week that fits your schedule",
            "Visible strength gains by week 8",
            "Form cues that keep you injury-free",
        ],
        "for_you_if": [
            "You're new to lifting and the gym feels intimidating",
            "You've tried programs that assumed you had 6 days free",
        ],
        "curriculum": [
            {"title": "Weeks 1-2 · Movement basics", "lessons": ["The four big lifts", "Warm-ups that matter", "Finding your starting weights"]},
            {"title": "Weeks 3-4 · Build the base", "lessons": ["Progressive overload, simply", "Accessory work", "Recovery + sleep"]},
            {"title": "Weeks 5-6 · Add intensity", "lessons": ["Heavier sets, safely", "Reading fatigue", "Nutrition basics for strength"]},
            {"title": "Weeks 7-8 · Put it together", "lessons": ["Testing your numbers", "Your next 8 weeks", "Staying consistent"]},
        ],
        "bio": (
            "Marcus Reed is a strength coach who's taken 10,000+ total beginners from "
            "their first squat to a confident barbell. His whole thing: keep it boring, "
            "keep it consistent, watch it work."
        ),
        "credentials": ["CSCS certified", "10+ years coaching beginners", "Former collegiate athlete"],
        "reviews": [
            _rev("Jordan K.", 13, 5, "First program that didn't assume I had endless time. Three days, in and out, and I'm actually getting stronger."),
            _rev("Sam W.", 60, 5, "The form cues are gold. I finally trust my squat."),
            _rev("Riley P.", 25, 5, "Eight weeks in and I added 60lbs to my deadlift from zero."),
        ],
        "faqs": [
            {"q": "Do I need a full gym?", "a": "A barbell, rack and some plates cover everything. There's a dumbbell substitution for each lift if that's what you have."},
            {"q": "I've never lifted — is this safe?", "a": "It's built for total beginners. Every lift starts with form before load, and the cues keep you safe."},
            {"q": "What if I can only do 2 days some weeks?", "a": "Max reflows the week. Two solid days beats a missed three every time."},
        ],
        "guarantee": "Cancel anytime — it's weekly. Stay as long as it's working.",
    },
    "course_posture_reset": {
        "long_description": (
            "Stand taller in three weeks with two-minute resets a few times a day. "
            "Gentle mobility and strength for the upper back and neck, dropped into "
            "your day so you actually do them."
        ),
        "outcomes": [
            "Noticeably taller, more open posture",
            "Less neck + upper-back tension",
            "Two-minute resets that fit between tasks",
            "Habits that hold after the three weeks",
        ],
        "for_you_if": [
            "You're hunched at a desk all day",
            "You want presence without a gym",
        ],
        "curriculum": [
            {"title": "Week 1 · Open up", "lessons": ["Where your posture actually breaks", "Chest + hip openers", "The desk reset"]},
            {"title": "Week 2 · Build support", "lessons": ["Upper-back strength", "Neck + chin tucks", "Standing tall on autopilot"]},
            {"title": "Week 3 · Make it stick", "lessons": ["Stacking resets onto habits", "Walking tall", "Your keeper set"]},
        ],
        "bio": (
            "Aria Vance is a movement coach focused on posture and mobility for desk-"
            "bound people. Her resets are short on purpose — the ones you'll actually do."
        ),
        "credentials": ["Movement + mobility coach", "Worked with 5k+ desk workers"],
        "reviews": [
            _rev("Chris M.", 11, 5, "Two minutes a few times a day and my neck stopped killing me by week two."),
            _rev("Tasha L.", 49, 4, "Subtle but real. Friends asked if I'd been working out."),
        ],
        "faqs": [
            {"q": "Do I need equipment?", "a": "No — everything is bodyweight and fits in a hallway."},
            {"q": "How long each day?", "a": "About 6-8 minutes total, split into two-minute resets you barely notice."},
        ],
        "guarantee": "One flat payment, yours to keep. Refund in the first week if it's not for you.",
    },
    "course_jaw_basics": {
        "long_description": (
            "The fundamentals of jaw and tongue training, done safely and "
            "consistently. No gimmicks — just the basics that matter, spaced through "
            "your day by Max."
        ),
        "outcomes": [
            "Correct tongue posture, on autopilot",
            "A safe, sustainable jaw routine",
            "Consistency without overdoing it",
            "The fundamentals before any advanced work",
        ],
        "for_you_if": [
            "You've seen the trend and want to do it right",
            "You'd rather build a safe habit than chase a hack",
        ],
        "curriculum": [
            {"title": "Weeks 1-2 · Foundations", "lessons": ["Proper tongue posture", "Nasal breathing basics", "What's safe vs hype"]},
            {"title": "Weeks 3-4 · Build the habit", "lessons": ["Daily cues", "Chewing + jaw work", "Avoiding strain"]},
            {"title": "Weeks 5-6 · Consistency", "lessons": ["Spacing it through your day", "Tracking", "Where to go next"]},
        ],
        "bio": (
            "Sam Cole breaks down jaw and posture fundamentals without the hype, "
            "focused on what's safe and what actually compounds over months."
        ),
        "credentials": ["Posture + breathing educator"],
        "reviews": [
            _rev("Alex D.", 8, 4, "Finally a no-nonsense take. I know what I'm doing and why now."),
            _rev("Noah B.", 52, 5, "The reminders make it stick. That's the whole battle."),
        ],
        "faqs": [
            {"q": "Is this safe?", "a": "Yes — it's deliberately conservative. The course is mostly about correct posture and breathing, not forceful exercises."},
            {"q": "How fast are results?", "a": "This is a fundamentals + consistency course. The honest answer is months, not weeks — done safely."},
        ],
        "guarantee": "One payment, yours forever. First-week refund if it's not a fit.",
    },
}

# Native maxes are ongoing programs (not week courses), so their detail is
# outcomes + how-it-works + proof rather than a fixed syllabus.
_MAXX_DETAIL: dict[str, dict[str, Any]] = {
    "skinmax": {
        "long_description": "Your skin, handled. A dermatology-grounded routine that adapts to your concern, skin type and barrier — fit into your real mornings and evenings by Max.",
        "outcomes": ["A personalized AM + PM routine", "The right cleanser, serum, moisturizer and SPF for you", "Actives introduced without irritation", "Progress you can see in your photos"],
        "reviews": [_rev("Ivy R.", 47, 5, "It just tells me what to do each morning and night. My skin's the best it's been."), _rev("Leo M.", 14, 4, "Cleared my forehead in a month.")],
    },
    "fitmax": {
        "long_description": "Build your best body with training that fits the time you actually have. Max programs the sessions and slots them into your week.",
        "outcomes": ["A plan matched to your goal and schedule", "Progression that keeps working", "Sessions that fit real life", "Strength + composition you can track"],
        "reviews": [_rev("Dre K.", 13, 5, "Three days a week and I'm finally consistent."), _rev("Mara P.", 25, 5, "The plan flexes when my week blows up.")],
    },
    "hairmax": {
        "long_description": "Fuller, healthier hair through a consistent, evidence-based routine — scalp care, the right actives, and habits that compound.",
        "outcomes": ["A scalp + hair routine that fits your day", "The right actives for your situation", "Consistency that actually compounds", "Track shedding and regrowth honestly"],
        "reviews": [_rev("Theo S.", 33, 4, "Less shedding within weeks. The reminders are everything."), _rev("Quinn L.", 44, 5, "Simple and consistent. Finally.")],
    },
    "heightmax": {
        "long_description": "Posture, height and presence — daily mobility and strength that help you stand taller and carry yourself with confidence.",
        "outcomes": ["Taller, more open posture", "Less stiffness and tension", "Short daily resets that fit your day", "Presence you can feel"],
        "reviews": [_rev("Owen R.", 12, 5, "Stand straighter without thinking about it now."), _rev("Bea T.", 49, 4, "Subtle but people noticed.")],
    },
    "bonemax": {
        "long_description": "A sharper jaw and frame through safe, consistent fundamentals — posture, breathing and the basics that compound over months.",
        "outcomes": ["Correct tongue + jaw posture", "A safe, sustainable routine", "Consistency without overdoing it", "Fundamentals before anything advanced"],
        "reviews": [_rev("Cy D.", 8, 4, "Done right, not the hype version."), _rev("Nia B.", 52, 5, "The cues make it a habit.")],
    },
}


def _detail_for(item_id: str) -> dict[str, Any]:
    """The rich detail payload for the full page (curriculum/bio/reviews/etc.)."""
    if item_id in _MAXX_DETAIL:
        return _MAXX_DETAIL[item_id]
    return _COURSE_DETAIL.get(item_id, {})


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
        "image_url": _cover_for(maxx_id, False),
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
        "creator": {**c["creator"], "avatar": _avatar(c["creator"]["handle"])},
        "price_cents": c["price_cents"],
        "price_model": c["price_model"],
        "weeks": c["weeks"],
        "price_label": _price_label(c["price_cents"], c["price_model"], c["weeks"]),
        "rating": c["rating"],
        "participants": c["participants"],
        "completion_rate": c["completion_rate"],
        "native": False,
        "entered": c["id"] in entered,
        "image_url": _cover_for(c["id"], True),
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
    """Full detail for one marketplace item (browse-before-buy), including the
    rich page content: outcomes, curriculum, instructor bio, reviews and FAQ."""
    _, entered = await _load_entered(db, _uid(current_user))
    if item_id in _MAXX_DISPLAY:
        return {**_maxx_card(item_id, entered), "detail": {**_detail_for(item_id), **_detail_media(item_id, False)}}
    for c in _SEED_COURSES:
        if c["id"] == item_id:
            return {**_course_card(c, entered), "detail": {**_detail_for(item_id), **_detail_media(item_id, True)}}
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


# Under the marketplace model, admission control is the feasibility sim +
# the merge's paid floor - not the legacy 2/3 account-tier cap.
_MARKETPLACE_ACTIVE_CAP = 5


async def _build_course_schedule(
    db: AsyncSession, user: User, course: dict[str, Any]
) -> None:
    """A REAL schedule for a creator course, from its schedule_hints: the
    promised sessions actually land on the user's week (the mini-reveal must
    never over-promise). Sessions are placed into free time around stated
    wake/sleep/obligations; the cross-module merge then reconciles them
    against the user's other programs."""
    from datetime import timedelta
    from models.sqlalchemy_models import UserSchedule
    from services.multi_module_collision import reconcile_schedules
    from services.schedule_streak import local_today_date
    from services.schedule_validator import (
        _busy_intervals_from_ctx,
        _effective_day_ctx,
        _WEEKDAY_NAMES,
    )
    from services.task_fields import normalize_days
    from services.user_context_service import merged_user_state

    item_id = course["id"]
    hints = course.get("schedule_hints") or {}
    sessions_per_week = max(1, min(7, int(hints.get("sessions_per_week") or 3)))
    minutes = max(5, int(hints.get("minutes") or 20))

    ob = dict(user.onboarding or {})
    state = merged_user_state(ob, None)
    g_wake = str(state.get("wake_time") or "07:00")
    g_sleep = str(state.get("sleep_time") or "23:00")

    # Spread N sessions across the week deterministically (0=first day).
    stride = 7 / sessions_per_week
    session_offsets = sorted({int(i * stride) for i in range(sessions_per_week)})

    today = local_today_date(ob)
    days: list[dict[str, Any]] = []
    for i in range(14):
        d = today + timedelta(days=i)
        tasks: list[dict[str, Any]] = []
        if (i % 7) in session_offsets:
            wd = _WEEKDAY_NAMES[d.weekday()]
            eff = _effective_day_ctx(state, wd, global_wake=g_wake, global_sleep=g_sleep)
            def _hm_min(s, default):
                try:
                    h, m = str(s).split(":", 1)
                    return int(h) * 60 + int(m[:2])
                except (ValueError, AttributeError):
                    return default
            wake_min = _hm_min(eff.get("wake_time"), 7 * 60)
            sleep_min = _hm_min(eff.get("sleep_time"), 23 * 60)
            busy = sorted(_busy_intervals_from_ctx(eff))

            # WORKOUT-SHAPED sessions (40+ min, fitness-y category) go in the
            # user's stated workout window - never wedged into the morning
            # get-ready crunch just because a gap exists. Short habit
            # sessions still take the first sensible free gap, but skip the
            # crunch / settle-in / dinner buffers.
            from services.human_time import (
                friendly_time,
                life_windows,
                nudge_out_of_protected,
                resolve_workout_window,
            )
            day_state = {**state, **{k: v for k, v in eff.items() if v is not None}}
            w = life_windows(day_state)
            is_workout_shaped = minutes >= 40 or course.get("category") in (
                "fitmax", "heightmax",
            )
            slot = None
            if is_workout_shaped:
                win_lo, win_hi = resolve_workout_window(day_state)
                cursor = win_lo
                for bs, be in busy:
                    if be <= cursor:
                        continue
                    if bs - cursor >= minutes:
                        break
                    cursor = max(cursor, be + 10)
                if cursor + minutes <= win_hi:
                    slot = cursor
            if slot is None:
                cursor = wake_min + 30
                for bs, be in busy:
                    if bs - cursor >= minutes:
                        break
                    cursor = max(cursor, be + 10)
                cursor = nudge_out_of_protected(cursor, w, minutes)
                if cursor + minutes <= (sleep_min if sleep_min > wake_min else sleep_min + 1440) - 30:
                    slot = cursor
            if slot is not None:
                slot = friendly_time(slot)
            if slot is not None:
                handle = (course.get("creator") or {}).get("handle") or "creator"
                from services.human_time import why_line as _why
                tasks.append({
                    "task_id": f"{item_id}-{d.isoformat()}",
                    "catalog_id": f"{item_id}.session",
                    "title": f"{course['title']} session",
                    "why": _why(slot % 1440, w),
                    "description": f"Today's session. From {course['title']} by @{handle}.",
                    "time": f"{slot // 60:02d}:{slot % 60:02d}",
                    "duration_min": minutes,
                    "task_type": "routine",
                    "status": "pending",
                    "importance": 5,
                    "task_kind": "fixed",
                    "tags": ["workout"] if course.get("category") == "fitmax" else [],
                    "provenance": {"program_id": item_id, "creator_handle": handle},
                })
        days.append({"date": d.isoformat(), "day_index": i, "tasks": tasks})

    normalize_days(days, item_id)

    # Deactivate a prior schedule for this course, persist the new one.
    prior = (await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user.id)
            & (UserSchedule.maxx_id == item_id)
            & (UserSchedule.is_active.is_(True))
        )
    )).scalars().all()
    for p in prior:
        p.is_active = False

    row = UserSchedule(
        user_id=user.id,
        schedule_type="course",
        maxx_id=item_id,
        course_title=course["title"],
        days=days,
        preferences={"wake_time": g_wake, "sleep_time": g_sleep},
        schedule_context={"source": "marketplace_hints"},
        is_active=True,
        completion_stats={"completed": 0, "total": 0, "skipped": 0},
    )
    db.add(row)
    await db.flush()

    # Reconcile against the user's other active programs (paid floor etc.).
    others = (await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == user.id)
            & (UserSchedule.is_active.is_(True))
            & (UserSchedule.maxx_id != item_id)
        )
    )).scalars().all()
    if others:
        bundle = {item_id: list(days)}
        for s in others:
            if s.maxx_id and s.days:
                bundle[s.maxx_id] = list(s.days)
        bundle = reconcile_schedules(bundle, user_ctx=state, start_date=today)
        row.days = bundle.get(item_id, days)
        for s in others:
            if s.maxx_id in bundle:
                s.days = bundle[s.maxx_id]
    await db.commit()


async def _generate_program_schedule(
    db: AsyncSession, user: User, item_id: str, is_course: bool
) -> bool:
    """Make the entitlement REAL: build the program's schedule right away so
    'N things landed on your week' is true the moment the sheet says it.
    Best-effort - a generation failure never blocks the purchase."""
    try:
        if is_course:
            course = next((c for c in _SEED_COURSES if c["id"] == item_id), None)
            if course is None:
                return False
            await _build_course_schedule(db, user, course)
            return True
        from services.schedule_runtime import generate_and_persist
        await generate_and_persist(
            user_id=str(user.id), maxx_id=item_id, db=db,
            wake_time=str((user.onboarding or {}).get("wake_time") or "07:00"),
            sleep_time=str((user.onboarding or {}).get("sleep_time") or "23:00"),
            cap=_MARKETPLACE_ACTIVE_CAP,
        )
        await db.commit()
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "post-enter schedule generation failed for %s (non-fatal): %s", item_id, e
        )
        return False


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
    # Make it real: the program's tasks land on the week NOW.
    if (await db.execute(
        select(_PurchaseProbe.id).where(
            (_PurchaseProbe.user_id == user.id)
            & (_PurchaseProbe.maxx_id == item_id)
            & (_PurchaseProbe.is_active.is_(True))
        )
    )).first() is None:
        await _generate_program_schedule(db, user, item_id, is_course)


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
