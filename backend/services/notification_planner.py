"""Daily notification planner — the single governor for all push sends.

One clean planner decides, per user per day, WHICH notifications go out and
WHEN. It is pure + deterministic so it can be unit-tested exhaustively:

  plan_day(ctx, candidates) -> [selected candidates with assigned send_min]

Locked rules it enforces (spec B + review pass):
  * only within the user's wake-to-sleep window (LOCAL minutes-of-day)
  * a minimum interval between pushes (default >= 90 min)
  * a daily ceiling (4-6, default 5) — adaptive backoff can lower it
  * dedup: never two with the same dedup_key (no duplicate singleton category,
    no task nudged twice)
  * locked priority when the day fills: time-sensitive task > streak/recap >
    morning preview > re-engagement > tips. Milestones are event-driven (top
    priority) but STILL obey cap + interval (review item 5).
  * suppress entirely while the app is foregrounded / just used (review item 2)

Empty-state guards, per-category mute, plan-relevance, and timezone math are the
CALLER's job when building candidates; this module is the conflict resolver. All
time math here is minutes-of-day in the user's local timezone.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from config import settings
from services.notification_copy import (
    CAT_TASK_DUE,
    CAT_STREAK,
    CAT_EVENING_RECAP,
    CAT_MORNING_PREVIEW,
    CAT_REENGAGE,
    CAT_TIP,
    CAT_MILESTONE,
    CAT_BROADCAST,
)

logger = logging.getLogger(__name__)

# Locked priority — lower number wins when the day fills. Milestones are
# event-driven and ride at the top, but still pass cap + min-interval gates.
PRIORITY: dict[str, int] = {
    CAT_MILESTONE: 0,
    CAT_TASK_DUE: 10,
    CAT_STREAK: 20,
    CAT_EVENING_RECAP: 20,
    CAT_MORNING_PREVIEW: 30,
    CAT_REENGAGE: 35,
    CAT_BROADCAST: 38,
    CAT_TIP: 40,
}


@dataclass
class PlannerConfig:
    cap: int = 5
    min_interval_min: int = 90
    foreground_suppress_min: int = 5

    @classmethod
    def from_settings(cls) -> "PlannerConfig":
        cap = int(getattr(settings, "notif_daily_cap", 5) or 5)
        cap = max(4, min(6, cap))  # cap is configurable 4-6
        return cls(
            cap=cap,
            min_interval_min=int(getattr(settings, "notif_min_interval_min", 90) or 90),
            foreground_suppress_min=int(getattr(settings, "notif_foreground_suppress_min", 5) or 5),
        )


@dataclass(frozen=True)
class Candidate:
    """One notification the user could receive today."""

    category: str
    at_min: int                         # natural local minute-of-day to fire
    title: str = ""
    body: str = ""
    route: str = ""
    params: dict = field(default_factory=dict)
    task_uuid: Optional[str] = None
    template_id: str = ""

    @property
    def priority(self) -> int:
        return PRIORITY.get(self.category, 50)

    @property
    def dedup_key(self) -> str:
        # task-due dedups per task; everything else is a singleton per day.
        if self.category == CAT_TASK_DUE and self.task_uuid:
            return f"task:{self.task_uuid}"
        return f"cat:{self.category}"


@dataclass
class PlannerContext:
    now_min: int                        # local minute-of-day, "now"
    wake_min: int
    sleep_min: int
    cap: int
    min_interval_min: int
    muted_categories: frozenset = frozenset()
    already_nudged_tasks: frozenset = frozenset()   # task_uuids already pushed
    already_sent_keys: frozenset = frozenset()      # dedup_keys already sent today
    foreground_recent: bool = False                 # app foregrounded / just used


def in_window(minute: int, wake_min: int, sleep_min: int) -> bool:
    """True if `minute` (minute-of-day) falls in the awake window. Handles a
    sleep time that crosses midnight (e.g. wake 07:00, sleep 01:00)."""
    if sleep_min > wake_min:
        return wake_min <= minute < sleep_min
    return minute >= wake_min or minute < sleep_min


def next_in_window_min(now_min: int, wake_min: int, sleep_min: int) -> int:
    """The next minute-of-day at/after `now` that is inside the awake window.
    Used to QUEUE a send (e.g. broadcast) instead of firing while asleep."""
    if in_window(now_min, wake_min, sleep_min):
        return now_min
    return wake_min


def effective_cap(
    base_cap: int,
    *,
    recent_delivered: int = 0,
    recent_opened: int = 0,
    returning_lapsed: bool = False,
) -> int:
    """Adaptive backoff (review item 3). 4-6 is a ceiling, never a forced quota.

    * A returning lapsed user ramps UP gently — start at 2, not 6.
    * A user who ignores pushes (low open-rate over a meaningful sample) gets
      stepped DOWN toward 1-2 automatically until they re-engage.
    """
    base_cap = max(1, int(base_cap))
    if returning_lapsed:
        return min(base_cap, 2)
    min_sample = int(getattr(settings, "notif_backoff_min_delivered", 6) or 6)
    if recent_delivered >= min_sample:
        rate = (recent_opened or 0) / float(recent_delivered)
        if rate <= 0.0:
            return 1
        if rate <= 0.10:
            return min(base_cap, 2)
        if rate < 0.25:
            return min(base_cap, 3)
    return base_cap


def plan_day(ctx: PlannerContext, candidates: list[Candidate]) -> list[Candidate]:
    """Select & time the day's pushes. Returns the chosen candidates, each with
    its assigned ``params['send_min']`` set, in send-time order.

    Pure: identical inputs always yield identical output.
    """
    # Hard suppression: never push while the user is in / just left the app.
    if ctx.foreground_recent:
        return []

    # 1. Eligibility filter.
    elig: list[Candidate] = []
    for c in candidates:
        if c.category in ctx.muted_categories:
            continue
        if c.dedup_key in ctx.already_sent_keys:
            continue
        if c.task_uuid and c.task_uuid in ctx.already_nudged_tasks:
            continue
        if not in_window(c.at_min, ctx.wake_min, ctx.sleep_min):
            continue
        elig.append(c)

    # 2. Collapse duplicate dedup_keys — keep the best (lowest) priority, then
    #    earliest. Guarantees no task twice and no duplicate singleton category.
    by_key: dict[str, Candidate] = {}
    for c in elig:
        cur = by_key.get(c.dedup_key)
        if cur is None or (c.priority, c.at_min) < (cur.priority, cur.at_min):
            by_key[c.dedup_key] = c
    deduped = list(by_key.values())

    # 3. Inclusion by locked priority, capped. (Priority asc, then time asc.)
    ranked = sorted(deduped, key=lambda c: (c.priority, c.at_min))
    chosen = ranked[: max(0, ctx.cap)]

    # 4. Time-order the chosen set and space them by min-interval; anything that
    #    can't fit before sleep is dropped (a strict ceiling, never crammed).
    chosen_by_time = sorted(chosen, key=lambda c: c.at_min)
    out: list[Candidate] = []
    last_send: Optional[int] = None
    for c in chosen_by_time:
        send_min = c.at_min
        if last_send is not None and send_min < last_send + ctx.min_interval_min:
            send_min = last_send + ctx.min_interval_min
        if not in_window(send_min, ctx.wake_min, ctx.sleep_min):
            continue  # pushed past the window — drop rather than send while asleep
        params = dict(c.params or {})
        params["send_min"] = send_min
        out.append(
            Candidate(
                category=c.category,
                at_min=c.at_min,
                title=c.title,
                body=c.body,
                route=c.route,
                params=params,
                task_uuid=c.task_uuid,
                template_id=c.template_id,
            )
        )
        last_send = send_min
    return out


def due_now(
    selected: list[Candidate], now_min: int, *, slack_min: int = 5
) -> list[Candidate]:
    """From a planned day, the candidates whose assigned send_min is due at
    `now` (within +/- slack). The live scheduler calls this each tick."""
    out = []
    for c in selected:
        send_min = int((c.params or {}).get("send_min", c.at_min))
        if abs(send_min - now_min) <= slack_min or (0 <= now_min - send_min <= 120):
            out.append(c)
    return out
