"""
Conductor (spec 4.4) - the receptivity-based notification brain.

Three load-bearing rules, enforced by construction:
  P1  THE SERVER OWNS NUDGE TIMING. The timeline is precomputed here;
      the device's only upstream trigger is a geofence POST (Phase 2).
  P2  Hard gates are PURE FUNCTIONS of deterministic inputs. No LLM value
      appears anywhere in their inputs, so no LLM value can flip them.
      The LLM (when it joins) may only LOWER receptivity: min(rule, llm).
  P3  Asymmetric ladder: bias toward firing for high-importance, silence
      for low-stakes; sustained non-response DE-ESCALATES (never nags) and
      eventually routes the task to the weekly review.

State lives in user_schedules.jitai_state:
  {"budget": {"2026-06-10": {"nudges": 2, "checkins": 0}},
   "last_nudge_at": "2026-06-10T14:05:00",
   "ignores": {"<task_uuid>": 3}}
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)

DAILY_NUDGE_BUDGET = 3        # 2-3 smart nudges per day
DAILY_CHECKIN_BUDGET = 1      # plus one check-in
MIN_INTERVAL_MIN = 45         # never two nudges closer than this
IGNORE_FLOOR = 3              # ignored this many times -> stop nudging the task
HIGH_IMPORTANCE = 4           # importance >= this biases toward firing


@dataclass(frozen=True)
class GateContext:
    """Deterministic inputs only. There is intentionally NO field an LLM
    could populate - that is the enforcement of P2."""
    now_min: int                    # minutes of day, device-local tz
    wake_min: int
    sleep_min: int
    nudges_sent_today: int
    checkins_sent_today: int
    minutes_since_last_nudge: int | None
    task_already_nudged: bool
    task_ignore_count: int
    is_checkin: bool = False


def hard_gates(ctx: GateContext) -> tuple[bool, str]:
    """Server-authoritative hard ANDs. Pure; unit-tested; every gate must
    pass. Returns (allowed, reason_code) - the reason is for logs only."""
    # Quiet hours: nothing between sleep and wake (handles overnight sleep).
    if ctx.sleep_min > ctx.wake_min:
        awake = ctx.wake_min <= ctx.now_min < ctx.sleep_min
    else:  # sleep crosses midnight (e.g. wake 07:00, sleep 01:00)
        awake = ctx.now_min >= ctx.wake_min or ctx.now_min < ctx.sleep_min
    if not awake:
        return False, "quiet_hours"

    if ctx.is_checkin:
        if ctx.checkins_sent_today >= DAILY_CHECKIN_BUDGET:
            return False, "checkin_budget"
    else:
        if ctx.nudges_sent_today >= DAILY_NUDGE_BUDGET:
            return False, "nudge_budget"

    if (
        ctx.minutes_since_last_nudge is not None
        and ctx.minutes_since_last_nudge < MIN_INTERVAL_MIN
    ):
        return False, "min_interval"

    if ctx.task_already_nudged:
        return False, "already_nudged"

    if ctx.task_ignore_count >= IGNORE_FLOOR:
        return False, "ignore_floor"

    return True, "ok"


def receptivity(
    *,
    in_free_window: bool,
    minutes_to_slot: int,
    recent_app_activity: bool,
    llm_advisory: float | None = None,
) -> float:
    """Deterministic weighted blend in [0, 1]. The LLM advisory can only
    LOWER the score: final = min(rule, llm). It can never raise it."""
    score = 0.3
    if in_free_window:
        score += 0.35
    if abs(minutes_to_slot) <= 20:
        score += 0.25
    elif abs(minutes_to_slot) <= 60:
        score += 0.1
    if recent_app_activity:
        score += 0.1
    score = min(1.0, score)
    if llm_advisory is not None:
        score = min(score, max(0.0, float(llm_advisory)))
    return round(score, 2)


RECEPTIVITY_FIRE_THRESHOLD = 0.5


def select_nudge(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    """At most ONE nudge per decision point. Asymmetric: high-importance
    tasks fire at a lower receptivity bar; low-stakes tasks need a clearly
    good moment. Silence is normal."""
    best: dict[str, Any] | None = None
    best_key: tuple[float, float, str] | None = None
    for c in candidates:
        importance = int(c.get("importance") or 3)
        r = float(c.get("receptivity") or 0.0)
        threshold = (
            RECEPTIVITY_FIRE_THRESHOLD - 0.15
            if importance >= HIGH_IMPORTANCE
            else RECEPTIVITY_FIRE_THRESHOLD
        )
        if r < threshold:
            continue
        key = (float(importance), r, str(c.get("task_uuid") or ""))
        if best_key is None or key > best_key:
            best, best_key = c, key
    return best


# ---------------------------------------------------------------------------
# jitai_state bookkeeping (pure dict transforms; caller persists)
# ---------------------------------------------------------------------------

def budget_for(jitai_state: dict, day: date) -> tuple[int, int]:
    b = ((jitai_state or {}).get("budget") or {}).get(day.isoformat()) or {}
    return int(b.get("nudges") or 0), int(b.get("checkins") or 0)


def record_send(jitai_state: dict, day: date, *, is_checkin: bool, now: datetime) -> dict:
    out = dict(jitai_state or {})
    budget = dict(out.get("budget") or {})
    today = dict(budget.get(day.isoformat()) or {})
    key = "checkins" if is_checkin else "nudges"
    today[key] = int(today.get(key) or 0) + 1
    budget[day.isoformat()] = today
    # Keep only the last 3 days of budget history.
    for k in sorted(budget)[:-3]:
        budget.pop(k, None)
    out["budget"] = budget
    out["last_nudge_at"] = now.isoformat()
    return out


def minutes_since_last(jitai_state: dict, now: datetime) -> int | None:
    raw = (jitai_state or {}).get("last_nudge_at")
    if not raw:
        return None
    try:
        last = datetime.fromisoformat(str(raw))
    except (TypeError, ValueError):
        return None
    return max(0, int((now - last).total_seconds() // 60))


def record_ignore(jitai_state: dict, task_uuid: str) -> dict:
    """Sustained non-response de-escalates: bump the per-task ignore count.
    At IGNORE_FLOOR the hard gate routes the task to the weekly review."""
    out = dict(jitai_state or {})
    ignores = dict(out.get("ignores") or {})
    ignores[task_uuid] = int(ignores.get(task_uuid) or 0) + 1
    out["ignores"] = ignores
    return out


def ignore_count(jitai_state: dict, task_uuid: str) -> int:
    return int(((jitai_state or {}).get("ignores") or {}).get(task_uuid) or 0)
