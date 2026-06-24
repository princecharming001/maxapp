"""Achievements / badges — earned-once retention rewards.

The catalog (titles, criteria, tiers, icons) lives here in code; per-user earned
state lives in the ``user_achievements`` table. ``evaluate()`` computes the
user's current stats from data already on hand at the day-state endpoint (the
streak payload + active schedules) plus two cheap counts (scans, profile facts),
awards any newly-met achievements, and returns the freshly-earned ones so the
client can fire a celebration.

Ethics: every badge rewards SHOWING UP and real progress — consistency,
accumulated work, tracking your own change, letting the coach know you — never
appearance, never ranking against other people. The "comeback" badge explicitly
rewards returning after a miss: the opposite of shaming a broken streak.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import Scan, UserAchievement, UserMemory

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class Achievement:
    code: str
    title: str
    description: str
    tier: str          # bronze | silver | gold
    category: str      # consistency | milestones | progress | discovery
    icon: str          # key the client maps to a custom SVG badge
    check: Callable[[dict], bool]
    # Optional (current, target) for showing progress on a still-locked badge.
    target: Optional[Callable[[dict], tuple[int, int]]] = None


# --- the catalog ------------------------------------------------------------

CATALOG: list[Achievement] = [
    # ── Consistency — showing up, the core loop ───────────────────────────
    Achievement("first_routine", "First Steps", "You started your first routine.",
                "bronze", "consistency", "spark",
                lambda s: s["active_count"] >= 1),
    Achievement("streak_3", "Rolling", "Three days straight. Momentum's real.",
                "bronze", "consistency", "flame",
                lambda s: s["streak"] >= 3, lambda s: (min(s["streak"], 3), 3)),
    Achievement("streak_7", "One Week Strong", "Seven in a row. You banked a freeze.",
                "silver", "consistency", "flame",
                lambda s: s["streak"] >= 7, lambda s: (min(s["streak"], 7), 7)),
    Achievement("streak_30", "Unbreakable", "Thirty days. This is just who you are now.",
                "gold", "consistency", "flame",
                lambda s: s["streak"] >= 30, lambda s: (min(s["streak"], 30), 30)),
    Achievement("streak_100", "Centurion", "One hundred days. Rarefied air.",
                "gold", "consistency", "crown",
                lambda s: s["streak"] >= 100, lambda s: (min(s["streak"], 100), 100)),
    Achievement("comeback", "Back at It", "You came back after a miss. That's the hard part.",
                "silver", "consistency", "phoenix",
                lambda s: s["fresh_start_today"]),
    Achievement("freeze_earned", "Insured", "You banked a streak freeze for a rainy day.",
                "bronze", "consistency", "shield",
                lambda s: s["armed_freezes"] >= 1),
    # ── Milestones — accumulated work ─────────────────────────────────────
    Achievement("perfect_day", "Clean Sweep", "Every task done in a single day.",
                "bronze", "milestones", "check",
                lambda s: s["perfect_day"]),
    Achievement("tasks_10", "Getting Going", "Ten tasks done and counting.",
                "bronze", "milestones", "leaf",
                lambda s: s["tasks_completed"] >= 10, lambda s: (min(s["tasks_completed"], 10), 10)),
    Achievement("tasks_50", "Dialed In", "Fifty tasks logged.",
                "silver", "milestones", "leaf",
                lambda s: s["tasks_completed"] >= 50, lambda s: (min(s["tasks_completed"], 50), 50)),
    Achievement("tasks_100", "Relentless", "One hundred tasks. Quiet, compounding work.",
                "gold", "milestones", "leaf",
                lambda s: s["tasks_completed"] >= 100, lambda s: (min(s["tasks_completed"], 100), 100)),
    Achievement("two_maxxes", "Stacking", "Two maxxes running at once.",
                "silver", "milestones", "layers",
                lambda s: s["active_count"] >= 2),
    # ── Progress — visible change ─────────────────────────────────────────
    Achievement("first_scan", "Baseline Set", "Your first scan. Now we can measure.",
                "bronze", "progress", "camera",
                lambda s: s["scans"] >= 1),
    Achievement("three_scans", "Receipts", "Three scans logged. The timeline tells the story.",
                "silver", "progress", "camera",
                lambda s: s["scans"] >= 3, lambda s: (min(s["scans"], 3), 3)),
    # ── Discovery — investing in the coaching relationship ────────────────
    Achievement("knows_me", "Open Book", "Max knows three things about you, and counting.",
                "bronze", "discovery", "book",
                lambda s: s["facts"] >= 3, lambda s: (min(s["facts"], 3), 3)),
    Achievement("well_known", "Hyper-Personal", "Max knows eight-plus things about your life.",
                "silver", "discovery", "book",
                lambda s: s["facts"] >= 8, lambda s: (min(s["facts"], 8), 8)),
]
CATALOG_BY_CODE: dict[str, Achievement] = {a.code: a for a in CATALOG}


# --- stat computation -------------------------------------------------------

def _count_completed_tasks(schedules: list[dict]) -> int:
    n = 0
    for sch in schedules or []:
        for day in (sch.get("days") or []):
            for t in (day.get("tasks") or []):
                if isinstance(t, dict) and str(t.get("status") or "").lower() == "completed":
                    n += 1
    return n


def _active_count(schedules: list[dict]) -> int:
    maxxes = {str(s.get("maxx_id")) for s in (schedules or []) if s.get("maxx_id")}
    return len(maxxes) if maxxes else (1 if schedules else 0)


async def _scan_count(db: AsyncSession, user_id: str) -> int:
    try:
        return int((await db.execute(
            select(func.count(Scan.id)).where(Scan.user_id == UUID(str(user_id)))
        )).scalar() or 0)
    except Exception as e:
        logger.debug("scan count failed: %s", e)
        return 0


async def _fact_count(db: AsyncSession, user_id: str) -> int:
    try:
        return int((await db.execute(
            select(func.count(UserMemory.id)).where(
                UserMemory.user_id == UUID(str(user_id)),
                UserMemory.status == "active",
            )
        )).scalar() or 0)
    except Exception as e:
        logger.debug("fact count failed: %s", e)
        return 0


async def compute_stats(db: AsyncSession, user, *, streak: dict, schedules: list[dict]) -> dict:
    """All achievement inputs, computed from the day-state already in hand plus
    two cheap counts. Pure-ish — only reads."""
    return {
        "streak": int((streak or {}).get("current") or 0),
        "armed_freezes": int((streak or {}).get("armed_freezes") or 0),
        "fresh_start_today": bool((streak or {}).get("fresh_start_today")),
        # today was credited iff the last perfect date is today.
        "perfect_day": bool(
            (streak or {}).get("last_perfect_date")
            and (streak or {}).get("last_perfect_date") == (streak or {}).get("today_date")
        ),
        "active_count": _active_count(schedules),
        "tasks_completed": _count_completed_tasks(schedules),
        "scans": await _scan_count(db, str(user.id)),
        "facts": await _fact_count(db, str(user.id)),
    }


# --- serialization ----------------------------------------------------------

def _public(a: Achievement, *, earned: bool, seen: bool, stats: Optional[dict] = None) -> dict[str, Any]:
    progress = None
    if a.target is not None and stats is not None and not earned:
        try:
            cur, tgt = a.target(stats)
            progress = {"current": int(cur), "target": int(tgt)}
        except Exception:
            progress = None
    return {
        "code": a.code, "title": a.title, "description": a.description,
        "tier": a.tier, "category": a.category, "icon": a.icon,
        "earned": earned, "seen": seen, "progress": progress,
    }


# --- award + read -----------------------------------------------------------

async def evaluate(db: AsyncSession, user, *, streak: dict, schedules: list[dict]) -> list[dict]:
    """Award any newly-met achievements; return the freshly-earned ones (public
    shape) so the caller can hand them to the client for a celebration. Awards
    are idempotent (unique on user+code) and best-effort — never fatal to the
    day-state response that calls this."""
    if user is None:
        return []
    try:
        stats = await compute_stats(db, user, streak=streak, schedules=schedules)
        earned = set((await db.execute(
            select(UserAchievement.code).where(UserAchievement.user_id == user.id)
        )).scalars().all())
        newly: list[dict] = []
        now = _utcnow()
        for a in CATALOG:
            if a.code in earned:
                continue
            try:
                if a.check(stats):
                    db.add(UserAchievement(user_id=user.id, code=a.code, earned_at=now, seen=False))
                    newly.append(_public(a, earned=True, seen=False))
            except Exception as e:
                logger.debug("achievement check failed for %s: %s", a.code, e)
        if newly:
            await db.commit()
            try:
                await _send_milestone_push(db, user, streak)
            except Exception as e:
                logger.debug("milestone push skipped: %s", e)
        return newly
    except Exception as e:
        # Unique-constraint race (concurrent evaluate) or any DB hiccup — never
        # break the day-state response over a badge.
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning("achievement evaluate failed (non-fatal): %s", e)
        return []


async def _send_milestone_push(db: AsyncSession, user, streak: dict) -> None:
    """Event-driven milestone push on achievement unlock. Respects the v2
    planner ceiling: window, per-user daily cap, min-interval, mute, foreground
    suppression, kill switch — never floods (review item 5)."""
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo
    from config import settings as _settings
    from sqlalchemy.orm.attributes import flag_modified
    from services.notification_prefs import user_allows_proactive_push
    from services.apns_service import send_apns_alert, apns_response_should_invalidate_token
    from services.notification_copy import CAT_MILESTONE, compose, build_push_custom
    from services.notification_planner import PlannerConfig, in_window
    import services.notification_state as ns

    if bool(getattr(_settings, "notif_kill_switch", False)):
        return
    ob = dict(user.onboarding or {})
    if not user_allows_proactive_push(ob, user.apns_device_token):
        return
    if CAT_MILESTONE in ns.muted_categories(ob):
        return
    cfg = PlannerConfig.from_settings()
    try:
        tz = ZoneInfo(ob.get("timezone") or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    local_now = _dt.now(ZoneInfo("UTC")).astimezone(tz)
    now_min = local_now.hour * 60 + local_now.minute

    def _hhmm(raw, d):
        try:
            s = str(raw).strip().upper()
            if "AM" in s or "PM" in s:
                t = _dt.strptime(s, "%I:%M %p").time()
                return t.hour * 60 + t.minute
            p = s.replace(".", ":").split(":")
            return int(p[0]) * 60 + int(p[1][:2])
        except Exception:
            return d
    wake_min = _hhmm(ob.get("wake_time"), 7 * 60)
    sleep_min = _hhmm(ob.get("sleep_time"), 23 * 60)
    if not in_window(now_min, wake_min, sleep_min):
        return  # asleep — skip (milestones don't wake people)

    state = ns.get_state(user.profile)
    if ns.foreground_recent(state, local_now.replace(tzinfo=None), cfg.foreground_suppress_min):
        return  # they're in the app and will see the celebration anyway
    today_iso = local_now.date().isoformat()
    if "cat:milestone" in ns.sent_keys_today(state, today_iso):
        return  # already sent a milestone push today
    if ns.sent_count_today(state, today_iso) >= cfg.cap:
        return  # at the daily ceiling — don't flood
    last = ns.last_send_min_today(state, today_iso)
    if last is not None and (now_min - last) < cfg.min_interval_min:
        return

    name = (user.first_name or ob.get("first_name") or "").strip() or None
    copy = compose(CAT_MILESTONE, name=name, streak=int((streak or {}).get("current") or 0))
    custom = build_push_custom(CAT_MILESTONE, copy["route"], copy["params"])
    ok, http_status = await send_apns_alert(
        (user.apns_device_token or "").strip(), copy["title"], copy["body"], custom=custom
    )
    if apns_response_should_invalidate_token(http_status):
        user.apns_device_token = None
        user.apns_token_updated_at = None
        await db.commit()
        return
    if ok:
        state = ns.record_delivered(state, local_now)
        state = ns.record_sent(state, today_iso, "cat:milestone", local_now)
        user.profile = ns.put_state(dict(user.profile or {}), state)
        flag_modified(user, "profile")
        await db.commit()


async def list_for_user(db: AsyncSession, user, *, streak: dict, schedules: list[dict]) -> dict[str, Any]:
    """Full catalog with per-user earned/seen state + locked-progress, for the
    Achievements screen."""
    stats = await compute_stats(db, user, streak=streak, schedules=schedules)
    rows = (await db.execute(
        select(UserAchievement).where(UserAchievement.user_id == user.id)
    )).scalars().all()
    earned_map = {r.code: r for r in rows}
    items = [
        _public(a, earned=(a.code in earned_map),
                seen=(earned_map[a.code].seen if a.code in earned_map else False),
                stats=stats)
        for a in CATALOG
    ]
    return {
        "achievements": items,
        "earned_count": len(earned_map),
        "total": len(CATALOG),
        "categories": ["consistency", "milestones", "progress", "discovery"],
    }


async def mark_seen(db: AsyncSession, user, codes: list[str]) -> int:
    """Mark earn-moments as celebrated so they don't re-fire. Returns count updated."""
    if user is None or not codes:
        return 0
    rows = (await db.execute(
        select(UserAchievement).where(
            UserAchievement.user_id == user.id,
            UserAchievement.code.in_(codes),
        )
    )).scalars().all()
    n = 0
    for r in rows:
        if not r.seen:
            r.seen = True
            n += 1
    if n:
        await db.commit()
    return n
