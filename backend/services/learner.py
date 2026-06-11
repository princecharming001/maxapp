"""
Learner (spec 4.5) - deterministic inference over real behavior.

Three jobs in Phase 0 form (no LLM anywhere):
  1. recompute_learned_prefs: derive learned wake / best windows from real
     completion + lock-in timestamps into user_learned_prefs (DERIVED only).
     Inferred values NEVER mutate the plan - they surface as confirm-first
     facts in the weekly review.
  2. detect_slips + suggest_reflow: a pending task whose time is well past
     becomes a visible, streak-safe reschedule suggestion into the next
     viable free slot (never silently moved, never guilt).
  3. insight ledger: dated, true, used-once facts that feed the day-2/3
     "Max learned" cards and the weekly review.
"""

from __future__ import annotations

import logging
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import User, UserLearnedPrefs, UserSchedule
from services.schedule_streak import _user_tz

logger = logging.getLogger(__name__)

SLIP_GRACE_MIN = 60          # pending + this far past its slot = slipped
MIN_SAMPLES_FOR_LEARNING = 4


def _hm(minutes: int) -> str:
    minutes = minutes % (24 * 60)  # wrap past-midnight times, never clamp
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _local_minutes(ts: str, ob: dict) -> int | None:
    """Server timestamps are UTC (often naive). Convert to the USER'S local
    wall clock before reading hour/minute - a PST 07:00 lock-in is 14:00/15:00
    UTC, and learning from the UTC clock corrupts everything downstream."""
    try:
        dt = datetime.fromisoformat(str(ts))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(_user_tz(ob))
    return local.hour * 60 + local.minute


def _work_min(clock_min: int, wake_min: int, overnight: bool) -> int:
    """Minutes-since-wake space for overnight sleepers (sleep crosses
    midnight): a 00:30 task sorts AFTER 23:55, not before 07:00."""
    if not overnight:
        return clock_min
    return (clock_min - wake_min) % (24 * 60)


def _to_min(hhmm: str | None, default: int = 0) -> int:
    try:
        h, m = str(hhmm).split(":", 1)
        return int(h) * 60 + int(m[:2])
    except (ValueError, AttributeError):
        return default


# ---------------------------------------------------------------------------
# 1. Learned prefs recompute
# ---------------------------------------------------------------------------

async def recompute_learned_prefs(user: User, db: AsyncSession) -> dict[str, Any]:
    """Derive learned values from the last 14 days of behavior. Stores into
    user_learned_prefs with per-field confidence; returns what changed."""
    ob = dict(user.onboarding or {})
    uid = user.id

    schedules = list((await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )).scalars().all())

    cutoff = (date.today() - timedelta(days=14)).isoformat()
    morning_marks: list[int] = []   # earliest activity per day (wake proxy)
    window_hits: dict[str, int] = {"morning": 0, "midday": 0, "evening": 0}
    per_day_first: dict[str, int] = {}

    # Lock-ins are a strong wake proxy: the user is up and looking at the day.
    # Timestamps are server-UTC; convert to the user's local clock first.
    for diso, ts in (ob.get("lock_ins") or {}).items():
        if diso < cutoff:
            continue
        minutes = _local_minutes(ts, ob)
        if minutes is None:
            continue
        per_day_first[diso] = min(per_day_first.get(diso, 24 * 60), minutes)

    # Per-window [done, total]: completion RATES, not raw counts. The skeleton
    # schedules far more morning tasks by design, so raw counts make morning
    # win by construction regardless of where the user actually shows up.
    window_stats: dict[str, list[int]] = {
        "morning": [0, 0], "midday": [0, 0], "evening": [0, 0],
    }
    today_iso = date.today().isoformat()
    for sched in schedules:
        for d in sched.days or []:
            diso = str(d.get("date") or "")
            if not diso or diso < cutoff or diso > today_iso:
                continue
            for t in d.get("tasks") or []:
                slot = _to_min(t.get("time"), 12 * 60)
                window = (
                    "morning" if slot < 12 * 60
                    else "midday" if slot < 17 * 60
                    else "evening"
                )
                window_stats[window][1] += 1
                if (t.get("status") or "") != "completed":
                    continue
                window_stats[window][0] += 1
                window_hits[window] += 1
                ca = t.get("completed_at")
                if ca:
                    minutes = _local_minutes(ca, ob)
                    if minutes is not None:
                        per_day_first[diso] = min(
                            per_day_first.get(diso, 24 * 60), minutes
                        )

    morning_marks = [m for m in per_day_first.values() if m < 14 * 60]

    prefs = (await db.execute(
        select(UserLearnedPrefs).where(UserLearnedPrefs.user_id == uid)
    )).scalars().first()
    if prefs is None:
        prefs = UserLearnedPrefs(user_id=uid)
        db.add(prefs)

    changed: dict[str, Any] = {}
    confidences = dict(prefs.confidences or {})

    if len(morning_marks) >= MIN_SAMPLES_FOR_LEARNING:
        learned_wake = _hm(int(statistics.median(morning_marks)))
        if learned_wake != prefs.learned_wake:
            prefs.learned_wake = learned_wake
            changed["learned_wake"] = learned_wake
        confidences["learned_wake"] = min(1.0, len(morning_marks) / 10)

    # Rate-based pick: only windows with enough scheduled tasks compete, the
    # winner is the best completion RATE, and confidence comes from the gap
    # to the runner-up (a 90%-vs-30% split is trustworthy; 55%-vs-50% isn't).
    rated = [
        (w, done / total)
        for w, (done, total) in window_stats.items()
        if total >= MIN_SAMPLES_FOR_LEARNING
    ]
    if rated:
        rated.sort(key=lambda x: -x[1])
        best, best_rate = rated[0]
        runner_rate = rated[1][1] if len(rated) > 1 else 0.0
        if best != prefs.learned_workout_window:
            prefs.learned_workout_window = best
            changed["learned_workout_window"] = best
        confidences["learned_workout_window"] = round(
            min(1.0, (best_rate - runner_rate) * 2 + 0.5), 2
        )

    prefs.confidences = confidences
    prefs.last_recomputed = datetime.utcnow()
    await db.commit()
    return changed


# ---------------------------------------------------------------------------
# 2. Slip detection + reflow suggestion
# ---------------------------------------------------------------------------

def detect_slips(
    tasks: list[dict], now_min: int, *, wake_min: int = 7 * 60, overnight: bool = False
) -> list[dict]:
    """Pending tasks more than SLIP_GRACE_MIN past their slot. Resolved
    statuses (completed AND skipped) never slip. For overnight sleepers the
    comparison runs in minutes-since-wake space so tonight's 00:30 wind-down
    is not 'missed' all afternoon."""
    out = []
    now_w = _work_min(now_min, wake_min, overnight)
    for t in tasks:
        if (t.get("status") or "pending") in ("completed", "skipped"):
            continue
        slot = _to_min(t.get("time"), 0)
        if not slot:
            continue
        slot_w = _work_min(slot, wake_min, overnight)
        if slot_w + SLIP_GRACE_MIN <= now_w:
            out.append(t)
    return out


def suggest_reflow(
    slipped: dict,
    tasks: list[dict],
    structure: list[dict],
    now_min: int,
    sleep_min: int,
    *,
    wake_min: int = 7 * 60,
) -> str | None:
    """Next viable slot after now: avoids busy structure rows and existing
    tasks (15-min spacing), stays before sleep. Returns HH:MM or None
    (= tomorrow; the close-out backstops it). Runs in minutes-since-wake
    space so an overnight sleeper (sleep 01:00) still gets tonight's slots
    instead of an unconditional 'tomorrow'."""
    overnight = sleep_min <= wake_min
    w = lambda m: _work_min(m, wake_min, overnight)  # noqa: E731
    sleep_w = w(sleep_min) if overnight else sleep_min
    if overnight and sleep_w == 0:
        sleep_w = 24 * 60

    busy: list[tuple[int, int]] = []
    for s in structure:
        start = _to_min(s.get("time"), -1)
        end = _to_min(s.get("end"), -1) if s.get("end") else start + 1
        if 0 <= start < end and s.get("label") not in ("Wake", "Sleep"):
            busy.append((w(start), w(start) + (end - start)))
    for t in tasks:
        if t is slipped or (t.get("status") or "") in ("completed", "skipped"):
            continue
        slot = _to_min(t.get("time"), -1)
        if slot >= 0:
            dur = int(t.get("duration_min") or 10)
            busy.append((w(slot), w(slot) + dur))
    busy.sort()

    dur = int(slipped.get("duration_min") or 10)
    cursor = w(now_min) + 15  # a beat of breathing room, never "right now"
    while cursor + dur <= sleep_w:
        conflict = next((b for b in busy if b[0] < cursor + dur and b[1] > cursor), None)
        if conflict is None:
            # Convert back to clock space (wraps past midnight cleanly).
            return _hm((wake_min + cursor) if overnight else cursor)
        cursor = conflict[1] + 5
    return None


# ---------------------------------------------------------------------------
# 3. Insight ledger (dated, true, used once)
# ---------------------------------------------------------------------------

async def fresh_insights(user: User, db: AsyncSession, limit: int = 2) -> list[dict]:
    """T1/T2 insights derived from real data that the user hasn't seen yet.
    Marked seen by the caller via mark_insight_seen."""
    ob = dict(user.onboarding or {})
    seen = set(ob.get("insights_seen") or [])
    prefs = (await db.execute(
        select(UserLearnedPrefs).where(UserLearnedPrefs.user_id == user.id)
    )).scalars().first()

    out: list[dict] = []
    stated_wake = ob.get("wake_time")
    if (
        prefs
        and prefs.learned_wake
        and stated_wake
        and "wake_drift" not in seen
        and abs(_to_min(prefs.learned_wake) - _to_min(stated_wake)) >= 30
    ):
        out.append({
            "id": "wake_drift",
            "text": (
                f"Your real mornings start around {prefs.learned_wake}, "
                f"not {stated_wake}. Want the plan to follow?"
            ),
            "kind": "t1",
        })
    if prefs and prefs.learned_workout_window and "best_window" not in seen:
        label = {
            "morning": "mornings", "midday": "midday", "evening": "evenings",
        }[prefs.learned_workout_window]
        out.append({
            "id": "best_window",
            "text": f"You get the most done in the {label}. That is your slot.",
            "kind": "t2",
        })
    return out[:limit]


async def mark_insight_seen(user: User, db: AsyncSession, insight_id: str) -> None:
    ob = dict(user.onboarding or {})
    seen = list(ob.get("insights_seen") or [])
    if insight_id not in seen:
        seen.append(insight_id)
        ob["insights_seen"] = seen
        user.onboarding = ob
        await db.commit()


# ---------------------------------------------------------------------------
# Welcome-back mode (spec 3.7)
# ---------------------------------------------------------------------------

def welcome_back_state(profile: dict, today: date) -> dict | None:
    """Absence >= 4 days -> welcome-back: ramp reset, gap quarantined from
    learning, no backlog dump. Returns the card payload or None."""
    from services.schedule_streak import LAST_PERFECT_KEY

    last_s = profile.get(LAST_PERFECT_KEY)
    if not last_s:
        return None
    try:
        last_d = date.fromisoformat(str(last_s))
    except (TypeError, ValueError):
        return None
    gap = (today - last_d).days - 1
    if gap >= 4:
        return {
            "gap_days": gap,
            "line": "Welcome back. Just today.",
            "sub": "Your plan picks up from here. Nothing piled up.",
        }
    return None
