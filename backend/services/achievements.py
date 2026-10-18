"""Achievements / badges — earned-once retention rewards.

The catalog (titles, criteria, tiers, icons) lives here in code; per-user earned
state lives in the ``user_achievements`` table. ``evaluate()`` computes the
user's current stats from data already on hand at the day-state endpoint (the
streak payload + active schedules) plus one cheap count (profile facts),
awards any newly-met achievements, and returns the freshly-earned ones so the
client can fire a celebration.

Ethics: every badge rewards SHOWING UP and real progress — consistency,
accumulated work, letting the coach know you — never appearance, never
ranking against other people. The "comeback" badge explicitly rewards
returning after a miss: the opposite of shaming a broken streak.
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import UserAchievement, UserMemory
from services.schedule_streak import lock_user_row, write_profile_keys

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class Achievement:
    code: str
    title: str
    description: str
    tier: str          # bronze | silver | gold
    category: str      # consistency | milestones | discovery
    icon: str          # key the client maps to a custom SVG badge
    check: Callable[[dict], bool]
    # Optional (current, target) for showing progress on a still-locked badge.
    target: Optional[Callable[[dict], tuple[int, int]]] = None


# --- the catalog ------------------------------------------------------------

CATALOG: list[Achievement] = [
    # ── Consistency — showing up, the core loop ───────────────────────────
    # Earned on the first COMPLETED task, not on starting a plan: a badge that
    # pops before you've done anything reads as noise (BETA1 C7 / F43). Users
    # who earned it under the old rule keep it — earned rows are never revoked.
    Achievement("first_routine", "First Steps", "You finished your first task.",
                "bronze", "consistency", "spark",
                lambda s: s["tasks_completed"] >= 1),
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
    Achievement("two_maxxes", "Stacking", "Two maxes running at once.",
                "silver", "milestones", "layers",
                lambda s: s["active_count"] >= 2),
    # (The face-scan "progress" badges first_scan / three_scans were retired
    # with the scan in the biohacking pivot. Earned rows stay in
    # user_achievements; codes outside the catalog are ignored on read.)
    # ── Discovery — investing in the coaching relationship ────────────────
    Achievement("knows_me", "Open Book", "Superpower knows three things about you, and counting.",
                "bronze", "discovery", "book",
                lambda s: s["facts"] >= 3, lambda s: (min(s["facts"], 3), 3)),
    Achievement("well_known", "Hyper-Personal", "Superpower knows eight-plus things about your life.",
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
    one cheap count. Pure-ish — only reads."""
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
    try:
        from services.gamification import achievement_xp
        xp = achievement_xp(a.code, a.tier)
    except Exception:  # pragma: no cover
        xp = None
    return {
        "code": a.code, "title": a.title, "description": a.description,
        "tier": a.tier, "category": a.category, "icon": a.icon,
        "earned": earned, "seen": seen, "progress": progress,
        # The XP this badge actually pays (tiered since 2026-09-24) — the
        # celebration used to hardcode +50 for every badge.
        "xp": xp,
    }


# --- evaluation memo ----------------------------------------------------------
#
# /schedules/active/full runs on every Home open, every tab switch and after
# every chat turn, and almost every one of those calls changes nothing a badge
# depends on. The memo remembers, per user and per process, the inputs of the
# last FULL evaluation that found nothing to award and nothing unseen; the same
# inputs again skip the earned-badges read, the fact count and the checks.
#
# Safe because:
#   * it is only written when that evaluation returned [] (no unseen badge, no
#     new award), so it can never swallow a celebration — a badge earned and
#     not yet seen keeps being handed back on every call until marked seen;
#   * every input a check reads is in the fingerprint except the fact count
#     (chat-learned facts), which the TTL bounds: a "knows_me" badge lands at
#     most _EVAL_MEMO_TTL_S late;
#   * a new completion, a new day, a streak/freeze change or an added/removed
#     plan changes the fingerprint and forces a full evaluation, so the first
#     call after a badge's condition becomes true always evaluates it.
_EVAL_MEMO_TTL_S = 600.0
_EVAL_MEMO_MAX = 5000
_eval_memo: "OrderedDict[str, tuple[tuple, float]]" = OrderedDict()


def _eval_fingerprint(streak: dict, schedules: list[dict]) -> tuple:
    st = streak or {}
    today = str(st.get("today_date") or "")
    completed_today = 0
    for sch in schedules or []:
        for day in (sch.get("days") or []):
            if str(day.get("date") or "") != today:
                continue
            for t in (day.get("tasks") or []):
                if isinstance(t, dict) and str(t.get("status") or "").lower() == "completed":
                    completed_today += 1
    return (
        today,
        int(st.get("current") or 0),
        int(st.get("armed_freezes") or 0),
        bool(st.get("fresh_start_today")),
        str(st.get("last_perfect_date") or ""),
        _active_count(schedules),
        _count_completed_tasks(schedules),
        completed_today,
        tuple(sorted(str(s.get("id") or s.get("maxx_id") or "") for s in (schedules or []))),
    )


def _memo_hit(user_key: str, fp: tuple) -> bool:
    hit = _eval_memo.get(user_key)
    if hit is None:
        return False
    if hit[0] != fp or time.monotonic() - hit[1] > _EVAL_MEMO_TTL_S:
        _eval_memo.pop(user_key, None)
        return False
    return True


def _memo_store(user_key: str, fp: tuple) -> None:
    _eval_memo[user_key] = (fp, time.monotonic())
    _eval_memo.move_to_end(user_key)
    while len(_eval_memo) > _EVAL_MEMO_MAX:
        _eval_memo.popitem(last=False)


def _memo_forget(user_key: str) -> None:
    _eval_memo.pop(user_key, None)


# --- award + read -----------------------------------------------------------

async def evaluate(db: AsyncSession, user, *, streak: dict, schedules: list[dict]) -> list[dict]:
    """Award any newly-met achievements; return every earned-but-uncelebrated
    badge (public shape) so the caller can hand them to the client for a
    celebration. Awards are idempotent (unique on user+code) and best-effort —
    never fatal to the day-state response that calls this.

    The return is "earned && !seen", NOT "inserted on this call": handing an
    award back exactly once meant a lost response (app backgrounded mid-request,
    network drop) or a fetch that bypassed the client's canonical cache consumed
    the celebration for good — the badge just appeared, silently, as earned.
    The client host dedupes by code and marks seen only when it actually shows
    the badge, so repeating an unseen one across calls is harmless."""
    if user is None:
        return []
    user_key = str(getattr(user, "id", "") or "")
    fp = _eval_fingerprint(streak, schedules)
    if user_key and _memo_hit(user_key, fp):
        return []
    try:
        # Read what's already earned FIRST — if everything is earned, skip the
        # count queries in compute_stats entirely (this runs on the hottest
        # endpoint, /schedules/active/full, on every load).
        rows = (await db.execute(
            select(UserAchievement.code, UserAchievement.seen)
            .where(UserAchievement.user_id == user.id)
            .order_by(UserAchievement.earned_at)
        )).all()
        earned = {code for code, _seen in rows}
        unseen: list[dict] = [
            _public(CATALOG_BY_CODE[code], earned=True, seen=False)
            for code, seen in rows
            if not seen and code in CATALOG_BY_CODE
        ]
        if len(earned & CATALOG_BY_CODE.keys()) >= len(CATALOG):
            if not unseen and user_key:
                _memo_store(user_key, fp)
            return unseen
        stats = await compute_stats(db, user, streak=streak, schedules=schedules)
        candidates: list[Achievement] = []
        for a in CATALOG:
            if a.code in earned:
                continue
            try:
                if a.check(stats):
                    candidates.append(a)
            except Exception as e:
                logger.debug("achievement check failed for %s: %s", a.code, e)
        if not candidates:
            if not unseen and user_key:
                _memo_store(user_key, fp)
            return unseen

        # Write phase. Lock the app_users row FIRST (lock discipline in
        # schedule_streak: single-table transaction, commit right after) and
        # re-read what's earned UNDER it: two /active/full in flight used to
        # both insert the same code — the loser hit the unique constraint and
        # rolled back its whole day-state write. Now it simply finds the badge
        # already there. Mock sessions (tests) can't take the lock; they keep
        # the pre-lock read and the unlocked fallback inside write_profile_keys.
        try:
            locked = await lock_user_row(db, user)
        except Exception as e:
            logger.debug("achievement lock path unavailable: %s", e)
            locked = None
        if locked is not None:
            earned = set((await db.execute(
                select(UserAchievement.code).where(UserAchievement.user_id == user.id)
            )).scalars().all())
            candidates = [a for a in candidates if a.code not in earned]
            if not candidates:
                await db.commit()  # nothing to write — just release the lock
                # Still hand back badges earned earlier whose celebration was
                # lost (response dropped) — that is the whole point of `unseen`.
                return unseen

        newly: list[dict] = []
        now = _utcnow()
        for a in candidates:
            db.add(UserAchievement(user_id=user.id, code=a.code, earned_at=now, seen=False))
            newly.append(_public(a, earned=True, seen=False))
        # Grant XP for the freshly-earned badges (scaled by tier, see
        # gamification.achievement_xp), awarded on the
        # FRESH profile under the same lock and merged as the XP keys only — so
        # the streak credit this very request just wrote, or a notification
        # tick landing now, keep their keys. Best-effort; a failure never
        # blocks the badge award.
        try:
            from services.gamification import achievement_xp, award_xp
            today_iso = str((streak or {}).get("today_date") or "")
            badge_xp = sum(achievement_xp(a.code, a.tier) for a in candidates)

            def _award(profile: dict) -> None:
                award_xp(profile, badge_xp, today_iso)
            await write_profile_keys(db, user, _award)
        except Exception as _xp_e:
            logger.debug("achievement XP award skipped: %s", _xp_e)
        await db.commit()
        try:
            await _send_milestone_push(db, user, streak)
        except Exception as e:
            logger.debug("milestone push skipped: %s", e)
        # Oldest first: a badge that was earned earlier but never celebrated
        # shows before the one that just landed.
        return unseen + newly
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
    # last_active_at is naive UTC — compare with UTC, not the local clock.
    if ns.foreground_recent(state, _dt.utcnow(), cfg.foreground_suppress_min):
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
        # Record on the FRESH row under the lock, merging only notif_state: the
        # streak/XP keys this same request just committed — and whatever the
        # 5-minute tick recorded meanwhile — must survive. The send already
        # happened, so this runs after the network call, never around it.
        def _record(profile: dict) -> None:
            st = ns.get_state(profile)
            st = ns.record_delivered(st, local_now)
            st = ns.record_sent(st, today_iso, "cat:milestone", local_now)
            profile["notif_state"] = st

        await write_profile_keys(db, user, _record)
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
        # Retired codes (e.g. the old scan badges) stay stored but never count.
        "earned_count": sum(1 for code in earned_map if code in CATALOG_BY_CODE),
        "total": len(CATALOG),
        "categories": ["consistency", "milestones", "discovery"],
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
    # Nothing memoized can be stale here (the memo only records empty results),
    # but drop it anyway so the next day-state call re-reads earned state.
    _memo_forget(str(getattr(user, "id", "") or ""))
    return n
