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
