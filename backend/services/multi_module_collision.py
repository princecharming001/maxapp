"""Deterministic multi-module collision pass.

Runs AFTER each module generates its own schedule, BEFORE persistence.
Walks every active schedule for the user and applies these passes:

  1. Identical-task dedupe (skinmax_spf vs another module's spf duplicate)
  2. Adjacent same-time push (5-min separation between any two tasks across modules)
  3. Cross-module antagonism split (microneedle + dermastamp → different days)
  4. Daily total cap enforcement (≤ HARD_CAP across all modules — demote lowest-intensity)

The LLM never reasons about this. Cheap and predictable.

Inputs are a dict of module schedules, e.g.:
    { "skinmax": [day, day, ...], "hairmax": [day, ...], "heightmax": [day, ...] }
Outputs the same shape, mutated.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from services.schedule_validator import MIN_TASK_GAP_MIN
from services.schedule_dsl import from_minutes

# Cross-module daily ceiling — a humane SOFT target for the total number of
# tasks summed across all active maxxes. A committed 3-maxx user genuinely has
# a non-negotiable hygiene+training floor (~7 essentials on a training day), so
# a hard "6 and drop the rest" rule would delete their face cleanse to hit an
# arbitrary number. Instead we KEEP every essential and trim only the
# lowest-value OPTIONAL extras down toward this target — never below a small
# allowance, so a busy day still keeps its best non-essential habits.
TARGET_DAILY_TOTAL = 8
# Always keep at least this many high-value optional tasks on a day, even when
# the essential floor alone already meets/exceeds the target — so a heavy day
# isn't reduced to nothing but chores (e.g. keep the retinoid + workout fuel).
MIN_OPTIONAL_KEEP = 2
# Absolute hard ceiling — a real notification-storm guard. Even an all-essential
# day never shows more than this many tasks.
HARD_DAILY_TASK_CAP = 11

logger = logging.getLogger(__name__)


# Cross-module pairs that should never share a day.
_CROSS_ANTAGONISM = {
    frozenset({"skin.dermastamp_pm", "hair.microneedle_pm"}),
    frozenset({"skin.retinoid_pm", "hair.microneedle_pm"}),
}

# (catalog_id_a, catalog_id_b) → keep_a (drop b). For dedup of redundant tasks.
_DEDUP_PAIRS = [
    # If both modules add SPF tasks (e.g. future bonemax/heightmax outdoor), keep skin's.
    ("skin.spf", "height.spf_outdoor"),
]


def reconcile_schedules(schedules: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """Apply all collision passes. Returns a new dict — does not mutate input."""
    if not schedules or len(schedules) < 2:
        return schedules

    # Normalize day count across modules — assume all schedules share length.
    day_count = max(len(d) for d in schedules.values())

    # Index every task by day for cross-module visibility.
    # Per-day list of (maxx_id, task_dict_ref).
    by_day: list[list[tuple[str, dict]]] = [[] for _ in range(day_count)]
    for maxx_id, days in schedules.items():
        for di, day in enumerate(days):
            for t in day.get("tasks") or []:
                by_day[di].append((maxx_id, t))

    # 1) Dedupe identical (catalog_id) across modules — keep the first.
    for di, items in enumerate(by_day):
        seen_ids: set[str] = set()
        for maxx_id, task in list(items):
            cid = task.get("catalog_id")
            if not cid:
                continue
            if cid in seen_ids:
                _remove_task(schedules, maxx_id, di, task)
                continue
            seen_ids.add(cid)
        for keep_a, drop_b in _DEDUP_PAIRS:
            cids = {t.get("catalog_id"): (m, t) for m, t in items}
            if keep_a in cids and drop_b in cids:
                m, t = cids[drop_b]
                _remove_task(schedules, m, di, t)

    # Recompute by_day after dedupe.
    by_day = _reindex(schedules, day_count)

    # 2) Cross-module antagonism: split to different days.
    for di in range(day_count):
        ids_today = {t.get("catalog_id") for _, t in by_day[di]}
        for pair in _CROSS_ANTAGONISM:
            if pair.issubset(ids_today):
                # Move the second task (alphabetically by id) to next available day.
                second = sorted(pair)[1]
                for maxx_id, task in by_day[di]:
                    if task.get("catalog_id") == second:
                        target_day = _find_safe_day(by_day, second, start_after=di)
                        if target_day is not None and target_day != di:
                            _move_task(schedules, maxx_id, di, target_day, task)
                        break
    by_day = _reindex(schedules, day_count)

    # 3) Time-gap enforcement across modules.
    for di in range(day_count):
        items = sorted(by_day[di], key=lambda x: _time_to_min(x[1].get("time")))
        last_end = -1
        for maxx_id, task in items:
            t_min = _time_to_min(task.get("time"))
            dur = int(task.get("duration_min") or 1)
            if t_min < last_end + MIN_TASK_GAP_MIN:
                new_t = last_end + MIN_TASK_GAP_MIN
                task["time"] = from_minutes(new_t).strftime("%H:%M")
                t_min = new_t
            last_end = t_min + dur

    # 4) Daily total ceiling — keep every essential, trim only low-value
    # optionals toward TARGET_DAILY_TOTAL. The earlier bug deleted low-intensity
    # ESSENTIALS (e.g. a user's AM face cleanse) whenever a 3-maxx training day
    # pushed the essential count over the cap, AND left every optional in place
    # — so the day stayed huge *and* lost its hygiene floor. We never drop a
    # hygiene/training essential now; we trim the most-skippable extras instead.
    from services.schedule_validator import _ESSENTIAL_TAGS

    def _is_essential(t: dict) -> bool:
        return bool(set(t.get("tags") or []) & _ESSENTIAL_TAGS)

    for di in range(day_count):
        items = list(by_day[di])
        if len(items) <= TARGET_DAILY_TOTAL:
            continue
        essentials = [(m, t) for (m, t) in items if _is_essential(t)]
        optionals = [(m, t) for (m, t) in items if not _is_essential(t)]

        # How many optionals may stay: enough to reach the target on top of the
        # essential floor, but always at least MIN_OPTIONAL_KEEP so a heavy day
        # keeps its best extras (retinoid, workout fuel) rather than only chores.
        optional_slots = max(MIN_OPTIONAL_KEEP, TARGET_DAILY_TOTAL - len(essentials))
        # Rank optionals by value (intensity desc), tie-break earliest first so
        # a kept extra lands at a sensible time.
        optionals.sort(key=lambda x: (-float(x[1].get("intensity") or 0.0),
                                      _time_to_min(x[1].get("time"))))
        for maxx_id, task in optionals[optional_slots:]:
            _remove_task(schedules, maxx_id, di, task)
            items.remove((maxx_id, task))

        # Absolute storm guard: if the essential floor itself is implausibly
        # large (pathological multi-maxx overlap), trim the lowest-intensity
        # essentials down to the hard ceiling — but only as a last resort.
        if len(items) > HARD_DAILY_TASK_CAP:
            ess_now = [(m, t) for (m, t) in items if _is_essential(t)]
            ess_now.sort(key=lambda x: float(x[1].get("intensity") or 0.0))
            for maxx_id, task in ess_now[:len(items) - HARD_DAILY_TASK_CAP]:
                _remove_task(schedules, maxx_id, di, task)
                items.remove((maxx_id, task))

    return schedules


def _reindex(schedules: dict[str, list[dict]], day_count: int) -> list[list[tuple[str, dict]]]:
    by_day: list[list[tuple[str, dict]]] = [[] for _ in range(day_count)]
    for maxx_id, days in schedules.items():
        for di, day in enumerate(days):
            for t in day.get("tasks") or []:
                by_day[di].append((maxx_id, t))
    return by_day


def _remove_task(schedules: dict[str, list[dict]], maxx_id: str, di: int, task: dict) -> None:
    days = schedules.get(maxx_id) or []
    if di >= len(days):
        return
    tasks = days[di].get("tasks") or []
    days[di]["tasks"] = [t for t in tasks if t is not task]


def _move_task(schedules: dict[str, list[dict]], maxx_id: str, from_di: int, to_di: int, task: dict) -> None:
    days = schedules.get(maxx_id) or []
    if from_di >= len(days) or to_di >= len(days):
        return
    days[from_di]["tasks"] = [t for t in (days[from_di].get("tasks") or []) if t is not task]
    days[to_di].setdefault("tasks", []).append(task)


def _find_safe_day(by_day: list[list], catalog_id: str, *, start_after: int) -> int | None:
    """Find the next day index where catalog_id is NOT already present."""
    for di in range(start_after + 1, len(by_day)):
        ids = {t.get("catalog_id") for _, t in by_day[di]}
        if catalog_id not in ids:
            return di
    return None


def _time_to_min(s: Any) -> int:
    if not isinstance(s, str) or ":" not in s:
        return 0
    h, m = s.split(":", 1)
    try:
        return int(h) * 60 + int(m)
    except ValueError:
        return 0
