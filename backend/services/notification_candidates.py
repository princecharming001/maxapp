"""Build the day's notification candidates for one user — pure + testable.

Takes already-extracted plain signals (the scheduler does the DB reads) and
returns ``list[Candidate]`` for the planner to select from. This is where the
per-category TRIGGERS and EMPTY-STATE / PLAN-RELEVANCE guards live (review items
7 & 8): a brand-new user with no streak never gets "don't break your streak"; a
fitmax-only user never gets a skincare tip.
"""

from __future__ import annotations

from typing import Optional

from services.notification_copy import (
    CAT_TASK_DUE,
    CAT_MORNING_PREVIEW,
    CAT_EVENING_RECAP,
    CAT_STREAK,
    CAT_REENGAGE,
    CAT_TIP,
    compose,
)
from services.notification_planner import Candidate

# Natural local minute-of-day anchors for the broad categories.
_TIP_MIN = 13 * 60          # midday quick win
_STREAK_MIN = 16 * 60       # late-afternoon momentum nudge
_TIP_WEEKDAYS = frozenset({0, 2, 4})  # occasional: Mon/Wed/Fri only


def build_candidates(
    *,
    tasks: list[dict],          # [{uuid, title, time_min, maxx, pending}]
    now_min: int,
    wake_min: int,
    sleep_min: int,
    weekday: int,               # 0=Mon .. 6=Sun
    name: Optional[str],
    why: Optional[str],
    streak: int,
    active_plans: set,
    rotation: int = 0,
    lapsed: bool = False,
) -> list[Candidate]:
    pending = [t for t in tasks if t.get("pending")]
    pending_count = len(pending)
    cands: list[Candidate] = []

    # 0. Re-engagement — ONLY for a genuinely lapsed user (prior activity, no
    # recent opens). Fires once near wake; replaces the daily flow that day so
    # we don't pile reminders on someone who's away (review items 5, 8).
    if lapsed:
        copy = compose(CAT_REENGAGE, name=name, why=why, rotation=rotation)
        return [_broad(CAT_REENGAGE, min(wake_min + 30, sleep_min - 1), copy)]

    # 1. Task-due — names the task; one per pending task (plan-relevant by
    # construction, since the task comes from an active schedule).
    for t in pending:
        tmin = t.get("time_min")
        if tmin is None:
            continue
        title = (t.get("title") or "your routine").strip()
        copy = compose(
            CAT_TASK_DUE,
            name=name,
            task=title,
            streak=streak,
            why=why,
            rotation=rotation,
            route_params={"task_uuid": t.get("uuid"), "maxx": t.get("maxx"), "title": title},
        )
        cands.append(
            Candidate(
                category=CAT_TASK_DUE,
                at_min=int(tmin),
                title=copy["title"],
                body=copy["body"],
                route=copy["route"],
                params=copy["params"],
                task_uuid=str(t.get("uuid") or "") or None,
                template_id=copy["template_id"],
            )
        )

    # 2. Morning preview — once at wake; only if there's a day to preview.
    if tasks:
        copy = compose(
            CAT_MORNING_PREVIEW, name=name, count=len(tasks), why=why, rotation=rotation
        )
        cands.append(_broad(CAT_MORNING_PREVIEW, min(wake_min + 15, sleep_min - 1), copy))

    # 3. Evening recap — before sleep, ONLY if tasks are still pending today.
    if pending_count >= 1:
        copy = compose(
            CAT_EVENING_RECAP, name=name, count=pending_count, streak=streak, rotation=rotation
        )
        cands.append(_broad(CAT_EVENING_RECAP, max(sleep_min - 90, wake_min + 1), copy))

    # 4. Streak protection — only a REAL streak (>= 2) that isn't secured yet
    # (pending tasks remain). Never to a streak-0 new user (review item 8).
    if streak >= 2 and pending_count >= 1:
        copy = compose(CAT_STREAK, name=name, streak=streak, rotation=rotation)
        cands.append(_broad(CAT_STREAK, _STREAK_MIN, copy))

    # 5. Tip — occasional midday quick win, only for users with an active plan
    # (review item 7). Tips here are general (not plan-specific) so they're safe
    # for any plan mix.
    if active_plans and weekday in _TIP_WEEKDAYS:
        copy = compose(CAT_TIP, name=name, rotation=rotation)
        cands.append(_broad(CAT_TIP, _TIP_MIN, copy))

    return cands


def _broad(category: str, at_min: int, copy: dict) -> Candidate:
    return Candidate(
        category=category,
        at_min=int(at_min),
        title=copy["title"],
        body=copy["body"],
        route=copy["route"],
        params=copy["params"],
        template_id=copy["template_id"],
    )
