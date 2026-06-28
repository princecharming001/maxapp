"""
Life Model (spec 4.1) - the per-user model of a real day.

Every field carries {value, confidence 0-1, provenance stated|inferred|
confirmed, freshness}. The hierarchy of truth:
  stated    - the user told us (onboarding / edits). confidence 1.0.
  confirmed - inferred, then user said [Yep] in a review. confidence 0.95.
  inferred  - the Learner derived it from behavior. NEVER mutates the plan
              on its own (confirm-first); shown as a suggestion only.

Degraded-mode honest: with under 3 days of behavior the model says so
("still getting to know you") instead of pretending.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import (
    CalendarEvent,
    User,
    UserLearnedPrefs,
    UserPlace,
    UserSchedule,
)

logger = logging.getLogger(__name__)

MIN_BEHAVIOR_DAYS = 3


def _field(value: Any, confidence: float, provenance: str, freshness: str | None = None) -> dict:
    return {
        "value": value,
        "confidence": round(confidence, 2),
        "provenance": provenance,
        "freshness": freshness,
    }


def _completion_stats(
    schedules: list[UserSchedule], days_back: int = 14, ob: dict | None = None
) -> dict:
    """Behavioral profile from real completion data: per-window completion
    rates and active behavior days."""
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    windows = {"morning": [0, 0], "midday": [0, 0], "evening": [0, 0]}  # [done, total]
    behavior_days: set[str] = set()
    completion_clock: list[int] = []  # minutes-of-day of completed_at stamps

    for sched in schedules:
        for d in sched.days or []:
            diso = str(d.get("date") or "")
            if not diso or diso < cutoff or diso > date.today().isoformat():
                continue
            for t in d.get("tasks") or []:
                hhmm = str(t.get("time") or "12:00")
                try:
                    h, m = hhmm.split(":", 1)
                    minutes = int(h) * 60 + int(m[:2])
                except ValueError:
                    minutes = 12 * 60
                window = (
                    "morning" if minutes < 12 * 60
                    else "midday" if minutes < 17 * 60
                    else "evening"
                )
                windows[window][1] += 1
                if (t.get("status") or "") == "completed":
                    windows[window][0] += 1
                    behavior_days.add(diso)
                    ca = t.get("completed_at")
                    if ca:
                        # Server stamps are UTC; read the USER'S clock.
                        from services.learner import _local_minutes
                        minutes = _local_minutes(ca, ob or {})
                        if minutes is not None:
                            completion_clock.append(minutes)

    rates = {
        w: round(done / total, 2) if total else None
        for w, (done, total) in windows.items()
    }
    return {
        "rates_by_window": rates,
        "behavior_days": len(behavior_days),
        "completion_clock": completion_clock,
    }


async def build_life_model(user: User, db: AsyncSession) -> dict[str, Any]:
    """Assemble the full Life Model for a user. Cheap (a few indexed reads);
    safe to call per-request."""
    ob = dict(user.onboarding or {})
    uid = user.id

    prefs = (await db.execute(
        select(UserLearnedPrefs).where(UserLearnedPrefs.user_id == uid)
    )).scalars().first()
    confirmed = dict(ob.get("confirmed_facts") or {})

    schedules = list((await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == uid) & (UserSchedule.is_active.is_(True))
        )
    )).scalars().all())
    behavior = _completion_stats(schedules, ob=ob)
    degraded = behavior["behavior_days"] < MIN_BEHAVIOR_DAYS

    # --- time skeleton -------------------------------------------------------
    def _skeleton_field(stated_key: str, learned_attr: str, fact_id: str) -> dict:
        stated = ob.get(stated_key)
        learned = getattr(prefs, learned_attr, None) if prefs else None
        fact = confirmed.get(fact_id) or {}
        if learned and fact.get("accepted"):
            return _field(learned, 0.95, "confirmed")
        if stated:
            out = _field(stated, 1.0, "stated")
            if learned and learned != stated:
                out["inferred_alternative"] = learned
            return out
        if learned:
            return _field(learned, 0.6, "inferred")
        return _field(None, 0.0, "unknown")

    time_skeleton = {
        "wake": _skeleton_field("wake_time", "learned_wake", "learned_wake"),
        "sleep": _skeleton_field("sleep_time", "learned_sleep", "learned_sleep"),
        # When the user usually showers — anchors skin/hygiene routines to the AM
        # get-ready window, the PM wind-down, or both. One of morning|night|both.
        "shower_time": _field(ob.get("shower_time"), 1.0, "stated"),
        "weekly_overrides": _field(
            ob.get("weekly_timings") or {}, 1.0, "stated"
        ),
    }

    # --- fixed commitments ---------------------------------------------------
    # Calendar events are stored as WALL-CLOCK tagged UTC; compare with the
    # user's wall clock in the same space, not a true-UTC instant.
    from zoneinfo import ZoneInfo
    from datetime import timezone as _tz
    try:
        user_zone = ZoneInfo(str(ob.get("timezone") or "UTC"))
    except Exception:
        user_zone = ZoneInfo("UTC")
    now_wall = datetime.now(user_zone).replace(tzinfo=_tz.utc)
    week_ahead = now_wall + timedelta(days=7)
    cal_count = len((await db.execute(
        select(CalendarEvent.id).where(
            (CalendarEvent.user_id == uid)
            & (CalendarEvent.starts_at < week_ahead)
            & (CalendarEvent.ends_at > now_wall - timedelta(days=1))
        )
    )).all())
    commitments = {
        "obligations": _field(ob.get("obligations") or [], 1.0, "stated"),
        "calendar_events_next_7d": _field(cal_count, 1.0, "stated"),
    }

    # --- places + anchors ----------------------------------------------------
    places = (await db.execute(
        select(UserPlace).where(
            (UserPlace.user_id == uid) & (UserPlace.is_active.is_(True))
        )
    )).scalars().all()
    place_fields = [
        {"name": p.name, "kind": p.kind, **_field(p.kind, p.confidence or 1.0, p.source)}
        for p in places
    ]
    anchors = _field(ob.get("anchor_cues") or [], 1.0, "stated")

    # --- behavioral profile --------------------------------------------------
    best_window = None
    rates = behavior["rates_by_window"]
    scored = [(w, r) for w, r in rates.items() if r is not None]
    if scored:
        best_window = max(scored, key=lambda x: x[1])[0]
    # A stated chronotype is a day-one prior: until we have real behavior the
    # user telling us when they're sharpest beats a guess. Real behavior
    # overrides it once we actually have signal (not degraded).
    chrono_map = {"morning": "morning", "afternoon": "midday", "evening": "evening"}
    stated_peak = chrono_map.get(str(ob.get("chronotype") or "").strip().lower())
    if stated_peak and (degraded or best_window is None):
        best_window_field = _field(stated_peak, 1.0, "stated")
    else:
        best_window_field = _field(best_window, 0.0 if degraded else 0.7, "inferred")
    behavioral = {
        "completion_rates_by_window": _field(
            rates, 0.0 if degraded else 0.7, "inferred"
        ),
        "best_window": best_window_field,
        "behavior_days": behavior["behavior_days"],
    }

    # --- live state ----------------------------------------------------------
    from services.schedule_streak import local_today_date
    today_iso = local_today_date(ob).isoformat()
    done_today = 0
    total_today = 0
    for sched in schedules:
        for d in sched.days or []:
            if d.get("date") == today_iso:
                for t in d.get("tasks") or []:
                    total_today += 1
                    if (t.get("status") or "") == "completed":
                        done_today += 1
    live = {
        "done_today": done_today,
        "total_today": total_today,
        "locked_in_today": bool((ob.get("lock_ins") or {}).get(today_iso)),
    }

    return {
        "degraded": degraded,
        "degraded_line": (
            "Still getting to know you. The model fills in as you use Max."
            if degraded else None
        ),
        "time_skeleton": time_skeleton,
        "commitments": commitments,
        "places": place_fields,
        "anchors": anchors,
        "behavioral": behavioral,
        "live": live,
        "motivation": _field(ob.get("motivation"), 1.0, "stated"),
        "timezone": _field(ob.get("timezone") or "UTC", 1.0, "stated"),
    }
