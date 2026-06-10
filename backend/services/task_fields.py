"""
Canonical task field dictionary (additive JSON, no DDL).

One task shape for native maxes AND creator courses. Every key here is
additive on UserSchedule.days[].tasks[] with a default when absent, so legacy
rows keep working untouched. These names and ranges are THE dictionary; do not
invent parallel keys elsewhere.

  task_kind        'fixed' | 'flexible' | 'habit'          (default 'flexible')
  importance       1-5, rank-normalized within a program   (default 3)
  skippable_today  bool                                    (default True)
  anchor_cue       str | None  ("after brushing teeth")
  zone             str | None  ("morning" | "midday" | "evening")
  why              str | None  (the one-line reason shown under the title)
  locked           bool        (user pinned it; re-solves must not move it)
  provenance       {program_id, creator_handle} | None
  task_uuid        stable id used for deterministic tiebreaks
  deferral_age     int, rises each time the merge defers the task (ages it up)

PROTECTION TIERS (platform-assigned; creators cannot game them):
  2  purchased/required  - task of a program the user entered/paid for
  1  native-essential    - essential-tagged task (the daily hygiene floor)
  0  optional            - everything else
Native maxes get NO advantage over paid creator courses: an entered native
maxx and an entered creator course are both tier 2 for their required tasks.
"""

from __future__ import annotations

import uuid
from typing import Any

from services.schedule_validator import _ESSENTIAL_TAGS

# Stable namespace for deterministic per-task UUIDs (never change this).
_TASK_NS = uuid.UUID("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")

TIER_PURCHASED = 2
TIER_ESSENTIAL = 1
TIER_OPTIONAL = 0

CANONICAL_TASK_DEFAULTS: dict[str, Any] = {
    "task_kind": "flexible",
    "importance": 3,
    "skippable_today": True,
    "anchor_cue": None,
    "zone": None,
    "why": None,
    "locked": False,
    "provenance": None,
    "deferral_age": 0,
}


def entered_programs(user_ctx: dict | None) -> set[str]:
    """Programs the user has entered/purchased (native maxes + creator courses)."""
    if not isinstance(user_ctx, dict):
        return set()
    out: set[str] = set()
    for key in ("entered_maxxes", "entered_courses"):
        vals = user_ctx.get(key)
        if isinstance(vals, list):
            out |= {str(v).strip().lower() for v in vals if str(v).strip()}
    return out


def is_essential(task: dict) -> bool:
    return bool(set(task.get("tags") or []) & _ESSENTIAL_TAGS)


def protection_tier(maxx_id: str, task: dict, user_ctx: dict | None) -> int:
    """Platform-assigned protection tier. Purchased programs protect their
    essential/high-importance tasks at the top tier regardless of whether the
    program is a native maxx or a creator course (fixes the old behavior where
    unranked creator courses were trimmed first)."""
    purchased = str(maxx_id).strip().lower() in entered_programs(user_ctx)
    importance = _coerce_importance(task.get("importance"))
    required = is_essential(task) or importance >= 4 or task.get("task_kind") == "fixed"
    if purchased and required:
        return TIER_PURCHASED
    if is_essential(task):
        return TIER_ESSENTIAL
    return TIER_OPTIONAL


def stable_task_uuid(maxx_id: str, task: dict, day_index: int) -> str:
    """Deterministic per-task UUID for tiebreaks - stable across re-solves of
    the same (program, catalog identity, day)."""
    cid = task.get("catalog_id") or task.get("title") or "task"
    return str(uuid.uuid5(_TASK_NS, f"{maxx_id}:{cid}:{day_index}"))


def normalize_task(task: dict, maxx_id: str, day_index: int) -> dict:
    """Fill canonical defaults in place (additive; never overwrites a value
    that's already present). Returns the same dict for chaining."""
    for key, default in CANONICAL_TASK_DEFAULTS.items():
        if key not in task or (task[key] is None and default is not None):
            task[key] = default
    if not task.get("task_uuid"):
        task["task_uuid"] = stable_task_uuid(maxx_id, task, day_index)
    if not task.get("provenance"):
        task["provenance"] = {"program_id": maxx_id, "creator_handle": None}
    task["importance"] = _coerce_importance(task.get("importance"))
    return task


def normalize_days(days: list[dict], maxx_id: str) -> list[dict]:
    """Normalize every task in a program's day list (in place)."""
    for di, day in enumerate(days or []):
        for t in day.get("tasks") or []:
            normalize_task(t, maxx_id, di)
    return days


def _coerce_importance(v: Any) -> int:
    try:
        return max(1, min(5, int(v)))
    except (TypeError, ValueError):
        return 3
