"""Deterministic skeleton-based schedule expander.

Replaces the LLM call in the schedule generator. Reads the `skeleton:`
block from a max-doc (already parsed into `MaxDoc.schedule_design`),
filters blocks by user state, distributes tasks across `cadence_days`,
and emits a fully-formed schedule the validator can finish.

A skeleton is a list of "blocks". Each block describes WHEN tasks land
(by slot + cadence) and WHICH tasks (static list or dynamic picker).

Block schema:
    id: str                     # unique within max
    slot: str                   # named window: am_open, am_active, midday,
                                # pm_active, pm_close, flexible
    cadence: str | dict         # daily | n_per_week=N | every_n_days=N | dynamic
    if: str (optional)          # DSL expression — block is dropped if false
    tasks: [catalog_id]         # static list (most blocks)
    pick_from: [{id, days_per_week, requires?, not_with?}]
                                # used when cadence == dynamic
    replaces: [block_id]        # remove these block ids before placement
    not_with_same_day: [catalog_id]
                                # cross-block: don't place same-day with these
                                # catalog_ids that are already on the day

Output: list of `cadence_days` day dicts, each with `tasks` array. Every
task has the shape the validator expects: catalog_id, time, title,
description, duration_min, tags, status, intensity. Then the validator
runs and may bump times for collisions / fix titles.

Performance: pure Python, no I/O. Typical 14-day skinmax schedule:
~2-5 ms expansion. The whole generate path becomes <100ms (warm catalog
+ DSL filter + skeleton expand + validate).
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import time as dtime
from typing import Any, Optional
from uuid import uuid4

from services.schedule_dsl import (
    build_anchor_overrides,
    crosses_midnight,
    evaluate,
    evaluate_all,
    from_minutes,
    order_minutes,
    parse_clock,
    referenced_fields,
    resolve_window,
    to_minutes,
)
from services.task_catalog_service import get_doc, get_task

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Block + schedule containers                                                #
# --------------------------------------------------------------------------- #

@dataclass
class _Block:
    id: str
    slot: str
    cadence: str          # "daily" | "n_per_week=N" | "every_n_days=N" | "dynamic"
    if_expr: Optional[str]
    tasks: list[str]
    pick_from: list[dict] = field(default_factory=list)
    replaces: list[str] = field(default_factory=list)
    not_with_same_day: list[str] = field(default_factory=list)


def _block_referenced_fields(b: "_Block") -> set[str]:
    """Context fields whose VALUE this block's placement depends on: its `if`
    gate, a field-valued cadence (e.g. `n_per_week=days_per_week`), and any
    pick_from requires/not_with conditions. Used by `exclude_fields` so a
    starter routine can drop blocks that hinge on an answer we don't have yet
    (an unknown answer flips `!=` / `not in` gates TRUE, which would otherwise
    surface a task we shouldn't show blind)."""
    out: set[str] = set()
    if b.if_expr:
        out |= referenced_fields([b.if_expr])
    if "=" in b.cadence:
        rhs = b.cadence.split("=", 1)[1].strip()
        if rhs and not re.fullmatch(r"-?\d+", rhs):
            out.add(rhs)
    for pf in b.pick_from:
        out |= referenced_fields(list(pf.get("requires") or []))
        out |= referenced_fields(list(pf.get("not_with") or []))
    return out


def _parse_block(raw: dict) -> _Block:
    if not isinstance(raw, dict):
        raise ValueError(f"skeleton block must be dict, got {type(raw).__name__}")
    bid = str(raw.get("id") or "").strip()
    if not bid:
        raise ValueError(f"skeleton block missing id: {raw}")
    slot = str(raw.get("slot") or "flexible")
    cadence = raw.get("cadence", "daily")
    if isinstance(cadence, dict):
        cadence = f"{cadence.get('type','daily')}={cadence.get('n', 1)}"
    cadence = str(cadence).strip().lower()

    return _Block(
        id=bid,
        slot=slot,
        cadence=cadence,
        if_expr=str(raw.get("if")) if raw.get("if") else None,
        tasks=[str(t) for t in (raw.get("tasks") or [])],
        pick_from=list(raw.get("pick_from") or []),
        replaces=[str(r) for r in (raw.get("replaces") or [])],
        not_with_same_day=[str(t) for t in (raw.get("not_with_same_day") or [])],
    )


# --------------------------------------------------------------------------- #
#  Load-spreading                                                             #
# --------------------------------------------------------------------------- #

def _phase(*parts: str, mod: int) -> int:
    """Deterministic 0..mod-1 offset from a stable hash of the parts.

    Used to DECORRELATE periodic ("N-times-a-week", "every-N-days") blocks so
    they don't all land on day 0. The hash includes the maxx_id, so a 3-maxx
    user's weekly skin / hair / fit habits spread across DIFFERENT weekdays
    instead of stacking into one 15-task Monday. Stable across regenerations
    (the same user always gets the same layout) — important because the regen
    merge is positional and must not reshuffle a user's plan on every edit.
    """
    if mod <= 1:
        return 0
    h = hashlib.md5(("|".join(parts)).encode("utf-8")).hexdigest()
    return int(h[:8], 16) % mod


# --------------------------------------------------------------------------- #
#  Public API                                                                 #
# --------------------------------------------------------------------------- #

def expand_skeleton(
    *,
    maxx_id: str,
    user_state: dict,
    wake: str,
    sleep: str,
    cadence_days: int = 14,
    exclude_fields: Optional[set[str]] = None,
) -> list[dict]:
    """Return a `cadence_days`-long list of day dicts.

    Each day looks like:
        { "day_index": 0, "tasks": [ {catalog_id, time, title, ...}, ... ] }

    Tasks within the same slot are ordered by their declaration order in
    the block, and stamped with sequential times starting at the slot's
    window start. The validator handles collision-bumps if anything still
    overlaps after this pass.
    """
    doc = get_doc(maxx_id)
    if doc is None:
        raise ValueError(f"unknown max: {maxx_id}")
    sd = doc.schedule_design or {}
    raw_skeleton = sd.get("skeleton") or {}
    raw_blocks = raw_skeleton.get("blocks") or []
    if not raw_blocks:
        raise ValueError(f"max {maxx_id!r} has no skeleton.blocks defined")

    # 1) Parse + filter by `if`.
    blocks: list[_Block] = []
    for raw in raw_blocks:
        b = _parse_block(raw)
        # Starter mode: drop any block whose placement hinges on an answer we
        # don't have yet, so we never schedule a task blind off a flipped gate.
        if exclude_fields and (_block_referenced_fields(b) & exclude_fields):
            continue
        if b.if_expr and not evaluate(b.if_expr, user_state):
            continue
        blocks.append(b)

    # 2) Honor `replaces` — later blocks remove earlier ones by id.
    removed: set[str] = set()
    for b in blocks:
        for rep in b.replaces:
            removed.add(rep)
    blocks = [b for b in blocks if b.id not in removed]

    # 3) Build `cadence_days` empty days.
    wake_t = parse_clock(wake, "07:00")
    sleep_t = parse_clock(sleep, "23:00")
    win_overrides = {
        "am_window": sd.get("am_window"),
        "pm_window": sd.get("pm_window"),
    }
    win_overrides_resolved: dict[str, list[str]] = {}
    if win_overrides["am_window"]:
        win_overrides_resolved["am_active"] = list(win_overrides["am_window"])
    if win_overrides["pm_window"]:
        win_overrides_resolved["pm_active"] = list(win_overrides["pm_window"])

    # User's explicit precise timings (workout time, get-ready/shower time)
    # win over both the doc-level am/pm windows AND the biology defaults —
    # they pin the workout + morning windows so every block in those slots,
    # across every active maxx, lands on the user's real day.
    win_overrides_resolved.update(build_anchor_overrides(user_state, maxx_id=maxx_id))

    days: list[dict] = [
        {"day_index": i, "tasks": []}
        for i in range(cadence_days)
    ]

    # 4) Walk each block, distribute its tasks.
    for b in blocks:
        _place_block(
            block=b,
            user_state=user_state,
            days=days,
            maxx_id=maxx_id,
            wake=wake_t,
            sleep=sleep_t,
            window_overrides=win_overrides_resolved,
        )

    # 5) Sort tasks within each day by time so the validator gets a clean list.
    #    For an overnight (wake>sleep) window, order by minutes-SINCE-WAKE so a
    #    "before bed" task that lands at 03:30am sorts to the END of that user's
    #    day, not the top. Day-schedule users keep plain clock order (no-op).
    overnight = crosses_midnight(wake_t, sleep_t)
    wake_min = to_minutes(wake_t)
    for d in days:
        if overnight:
            d["tasks"].sort(
                key=lambda t: order_minutes(_time_to_minutes(t.get("time", "00:00")), wake_min)
            )
        else:
            d["tasks"].sort(key=lambda t: _time_to_minutes(t.get("time", "00:00")))

    return days


# --------------------------------------------------------------------------- #
#  Block placement                                                            #
# --------------------------------------------------------------------------- #

def _place_block(
    *,
    block: _Block,
    user_state: dict,
    days: list[dict],
    maxx_id: str,
    wake: dtime,
    sleep: dtime,
    window_overrides: dict[str, list[str]],
) -> None:
    """Mutate `days` to add this block's tasks at the right cadence."""
    n_days = len(days)
    cadence = block.cadence

    # Decide which day-indices receive this block.
    if cadence == "daily":
        day_indices = list(range(n_days))
    elif cadence == "dynamic":
        day_indices = list(range(n_days))   # picker decides per-day below
    elif cadence.startswith("n_per_week="):
        raw_n = cadence.split("=", 1)[1].strip()
        # Allow either a literal int (`n_per_week=4`) OR a user_state field
        # name (`n_per_week=days_per_week`) — interpolate at runtime so
        # docs don't need to hardcode N. Falls back to 1 if neither
        # resolves to a usable int.
        n_val: Optional[int] = None
        try:
            n_val = int(raw_n)
        except ValueError:
            field_val = user_state.get(raw_n)
            if isinstance(field_val, bool):
                n_val = 1 if field_val else 0
            elif isinstance(field_val, (int, float)):
                n_val = int(field_val)
            elif isinstance(field_val, str) and field_val.strip().isdigit():
                n_val = int(field_val.strip())
            else:
                logger.warning(
                    "schedule_skeleton: cadence n_per_week=%s could not be resolved "
                    "from user_state for block %s; defaulting to 1/wk",
                    raw_n, block.id,
                )
                n_val = 1
        n = max(1, min(7, int(n_val or 1)))
        # Spread evenly across each 7-day window, then PHASE-SHIFT the whole
        # set by a per-(maxx,block) offset so weekly habits don't all clump on
        # day 0. Without the shift every `n_per_week=1` block (pillowcase,
        # exfoliation, mask, weekly review...) across every active maxx lands
        # on Monday — the 15-task-Monday problem. The shift wraps inside each
        # 7-day window so the per-week count is preserved exactly.
        ph = _phase(maxx_id, block.id, mod=7)
        day_indices = []
        for week_start in range(0, n_days, 7):
            base = [round(i * 7 / n) for i in range(n)]
            picks = [week_start + ((b + ph) % 7) for b in base]
            day_indices.extend(p for p in picks if p < n_days)
        day_indices = sorted(set(day_indices))
    elif cadence.startswith("every_n_days="):
        try:
            n = max(1, int(cadence.split("=", 1)[1]))
        except ValueError:
            n = 7
        # Phase-shift the start day (bounded by the period) so two every-N
        # blocks from different maxxes don't perfectly overlap.
        start = _phase(maxx_id, block.id, mod=n)
        day_indices = list(range(start, n_days, n))
    elif cadence.startswith("weekly_on="):
        # Pin to a canonical weekday — e.g. weekly_on=sunday for the
        # weekly review. Fires every Sunday inside the window. Defaults to
        # Sunday if the weekday name isn't recognized.
        from datetime import date as _date
        wd_map = {
            "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6,
        }
        target_wd = wd_map.get(cadence.split("=", 1)[1].strip().lower(), 6)
        today_wd = _date.today().weekday()
        # Day offset from today to the next target weekday (could be 0).
        first_offset = (target_wd - today_wd) % 7
        day_indices = list(range(first_offset, n_days, 7))
    elif cadence.startswith("monthly_on="):
        # Pin to a calendar day-of-month (e.g. monthly_on=1 = the 1st of
        # every month). Computes which day_index inside the window falls
        # on that day-of-month.
        from datetime import date as _date, timedelta as _td
        try:
            target_dom = max(1, min(28, int(cadence.split("=", 1)[1].strip())))
        except ValueError:
            target_dom = 1
        today = _date.today()
        day_indices = []
        for i in range(n_days):
            if (today + _td(days=i)).day == target_dom:
                day_indices.append(i)
    elif cadence.startswith("rotation_per_week="):
        # Workout-split rotation. block.tasks is a LIST of variants (e.g.
        # [upper_a, lower_a, upper_b, lower_b]). Cycle through them on
        # the N training days each week. RHS may be an int literal or a
        # user_state field name (matches n_per_week= behavior).
        raw_n = cadence.split("=", 1)[1].strip()
        n_val: Optional[int] = None
        try:
            n_val = int(raw_n)
        except ValueError:
            field_val = user_state.get(raw_n)
            if isinstance(field_val, (int, float)):
                n_val = int(field_val)
            elif isinstance(field_val, str) and field_val.strip().isdigit():
                n_val = int(field_val.strip())
        n = max(1, min(7, int(n_val or 1)))
        # Same even-spread as n_per_week=, but the index INSIDE the
        # block.tasks list is (training_day_count % len(tasks)) so the
        # rotation cycles cleanly.
        day_indices = []
        for week_start in range(0, n_days, 7):
            picks = [week_start + round(i * 7 / n) for i in range(n)]
            day_indices.extend(p for p in picks if p < n_days)
        # Place each rotation slot one task at a time (handled below in
        # the dispatch). We tag the block so _emit_tasks knows to pick
        # the right variant per occurrence.
        if not block.tasks:
            return
        rotation_tasks = list(block.tasks)
        for slot_idx, di in enumerate(day_indices):
            variant = rotation_tasks[slot_idx % len(rotation_tasks)]
            _emit_tasks(
                catalog_ids=[variant],
                day=days[di],
                maxx_id=maxx_id,
                user_state=user_state,
                start_minute=resolve_window(
                    block.slot, wake=wake, sleep=sleep, overrides=window_overrides,
                )[0],
                block_id=block.id,
                not_with_same_day=block.not_with_same_day,
            )
        return  # short-circuit — we already emitted
    else:
        logger.warning("unknown cadence %r in block %s, defaulting to daily", cadence, block.id)
        day_indices = list(range(n_days))

    # Resolve slot → minute window.
    win_start, win_end = resolve_window(
        block.slot, wake=wake, sleep=sleep, overrides=window_overrides,
    )

    # Picker (`pick_from`) vs static task list. A block carries `pick_from`
    # whenever it should choose ONE task per eligible day (am_active's
    # azelaic/centella, pm_active's retinoid/dermastamp/rest) — regardless of
    # whether its cadence is literally "dynamic" or "daily". Both want the
    # per-day picker; they differ only in WHICH days are eligible, which is
    # already encoded in `day_indices` above. (Routing on `pick_from` rather
    # than cadence=="dynamic" is what makes the `daily` am_active picker fire
    # at all — previously it emitted block.tasks, which was empty.)
    if block.pick_from:
        _place_dynamic(
            block=block,
            user_state=user_state,
            days=days,
            day_indices=day_indices,
            maxx_id=maxx_id,
            win_start=win_start,
        )
        return

    # Static task list. Blocks with `not_with_same_day` (e.g. weekly
    # exfoliation, which must not share a night with a retinoid or dermastamp)
    # get a displacement search: if the phase-chosen day is already blocked,
    # slide to the nearest compatible, not-yet-used day in the SAME 7-day
    # window so the weekly habit still lands instead of silently vanishing.
    # Without it, a standalone block sharing a slot with a saturating picker
    # can never place.
    nws = set(block.not_with_same_day or [])
    used: set[int] = set()
    for di in day_indices:
        target: Optional[int] = di
        if nws and (di in used or not _day_compatible(days, di, nws)):
            target = _find_compatible_day(days, di, nws, used, n_days)
        if target is None:
            continue
        used.add(target)
        _emit_tasks(
            catalog_ids=block.tasks,
            day=days[target],
            maxx_id=maxx_id,
            user_state=user_state,
            start_minute=win_start,
            block_id=block.id,
            not_with_same_day=block.not_with_same_day,
            win_end=win_end,
        )


def _place_dynamic(
    *,
    block: _Block,
    user_state: dict,
    days: list[dict],
    day_indices: list[int],
    maxx_id: str,
    win_start: int,
) -> None:
    """Per-day picker over `pick_from`, filled one 7-day window at a time so
    the weekly mix is exact and spread out (not front-loaded across the whole
    horizon, which used to clump 4 retinoid nights in a row and leave every
    rest night at the very end).

    Two tiers, by `days_per_week`:

      * targeted (days_per_week < 7): items that should appear a SPECIFIC
        number of days each week (retinoid 4x, dermastamp 2x). Placed evenly
        across each window via a deadline/stride scheduler so they interleave
        rather than bunch up, and so each week keeps its leftover "rest"
        night(s) open.
      * fallback (days_per_week >= 7): "available every day" items
        (rest-night serum, the azelaic/centella morning active) that fill
        whatever days the targeted tier leaves open, in `pick_from` priority
        order. Keeps the rest-night serum a true fallback instead of
        out-competing the actives for early days.

    `requires` is evaluated once (it depends only on user_state, not the day);
    `not_with` and the block's own `not_with_same_day` are still enforced
    per-day inside the loops / `_emit_tasks`.
    """
    if not block.pick_from:
        return

    # Resolve which items are eligible for THIS user (requires is day-stable).
    eligible: list[dict] = []
    for item in block.pick_from:
        cid = str(item.get("id") or "")
        if not cid:
            continue
        requires = list(item.get("requires") or [])
        if requires and not evaluate_all(requires, user_state):
            continue
        eligible.append({
            "id": cid,
            "per_week": int(item.get("days_per_week", 7)),
            "not_with": set(item.get("not_with") or []),
        })
    if not eligible:
        return

    targeted = [it for it in eligible if it["per_week"] < 7]
    fallback = [it for it in eligible if it["per_week"] >= 7]

    def _emit(cid: str, di: int) -> None:
        _emit_tasks(
            catalog_ids=[cid],
            day=days[di],
            maxx_id=maxx_id,
            user_state=user_state,
            start_minute=win_start,
            block_id=block.id,
            not_with_same_day=block.not_with_same_day,
        )

    # Group the eligible days into 7-day windows and fill each independently.
    windows: dict[int, list[int]] = {}
    for di in day_indices:
        windows.setdefault(di // 7, []).append(di)

    for _, win_days in sorted(windows.items()):
        win_days.sort()
        n_slots = len(win_days)
        if not n_slots:
            continue

        # --- Tier 1: spread targeted items by an even "deadline" stride. ---
        # next_due starts at stride/2 so the first placement lands mid-stride
        # (centered), then advances by stride each time it's used. Each day we
        # place the eligible targeted item that is most "due" (smallest
        # next_due), breaking ties by pick_from priority.
        prio = {it["id"]: i for i, it in enumerate(targeted)}
        quota: dict[str, int] = {}
        stride: dict[str, float] = {}
        next_due: dict[str, float] = {}
        for it in targeted:
            q = min(n_slots, max(0, round(it["per_week"] * n_slots / 7)))
            quota[it["id"]] = q
            stride[it["id"]] = (n_slots / q) if q else float("inf")
            next_due[it["id"]] = stride[it["id"]] / 2.0

        for di in win_days:
            day_ids = {t.get("catalog_id") for t in (days[di].get("tasks") or [])}
            best: Optional[dict] = None
            best_key: Optional[tuple] = None
            for it in targeted:
                cid = it["id"]
                if quota.get(cid, 0) <= 0 or (it["not_with"] & day_ids):
                    continue
                key = (next_due[cid], prio[cid])
                if best_key is None or key < best_key:
                    best_key, best = key, it
            if best is None:
                continue
            cid = best["id"]
            quota[cid] -= 1
            next_due[cid] += stride[cid]
            _emit(cid, di)

        # --- Tier 2: fill days with no pick_from task yet using fallbacks. ---
        if not fallback:
            continue
        elig_ids = {it["id"] for it in eligible}
        for di in win_days:
            day_ids = {t.get("catalog_id") for t in (days[di].get("tasks") or [])}
            if elig_ids & day_ids:
                continue  # a targeted (or already-placed) pick already here
            for it in fallback:
                if it["not_with"] & day_ids:
                    continue
                _emit(it["id"], di)
                break


def _day_compatible(days: list[dict], di: int, not_with: set[str]) -> bool:
    """True if day `di` holds none of the `not_with` catalog_ids."""
    ids = {t.get("catalog_id") for t in (days[di].get("tasks") or [])}
    return not (not_with & ids)


def _find_compatible_day(
    days: list[dict], di: int, not_with: set[str], used: set[int], n_days: int
) -> Optional[int]:
    """Nearest day to `di` inside the SAME 7-day window that is unused by this
    block and free of any `not_with` catalog_id. Searches forward from `di`
    first (keeps a weekly habit near its phase slot), then the earlier days of
    the window. Returns None if every day in the window is blocked."""
    win_start = (di // 7) * 7
    win_end = min(win_start + 7, n_days)
    order = list(range(di, win_end)) + list(range(win_start, di))
    for d in order:
        if d in used:
            continue
        if _day_compatible(days, d, not_with):
            return d
    return None


def _emit_tasks(
    *,
    catalog_ids: list[str],
    day: dict,
    maxx_id: str,
    user_state: dict,
    start_minute: int,
    block_id: str,
    not_with_same_day: list[str],
    win_end: int | None = None,
) -> None:
    """Append catalog_ids to day.tasks at sequential minutes.
    Drops a task if its catalog applies_when fails or contraindicated_when fires.
    Drops the WHOLE block for the day if any not_with_same_day task is already
    present.

    When `win_end` is given and a multi-task block would overrun it under the
    calm 15-min cadence, the inter-task gap is COMPRESSED so the last task still
    starts within the window. The start never moves later than `start_minute`,
    so a morning block stays in the morning (the slot's AM/PM half is preserved)
    instead of stamping past the window end and getting cascaded later by the
    validator's separation pass.
    """
    existing_ids = {t.get("catalog_id") for t in (day.get("tasks") or [])}
    if not_with_same_day and any(c in existing_ids for c in not_with_same_day):
        return

    # Resolve which catalog_ids actually emit (the rest are gated out), so the
    # window-fit math sees the real task count.
    resolved = []
    for cid in catalog_ids:
        cat = get_task(maxx_id, cid)
        if cat is None:
            logger.warning("skeleton: %s references unknown catalog_id %s", block_id, cid)
            continue
        # Catalog-level applies_when (defensive — block-level usually handles it).
        if cat.applies_when and not evaluate_all(list(cat.applies_when), user_state):
            continue
        if cat.contraindicated_when and any(
            evaluate(e, user_state) for e in cat.contraindicated_when
        ):
            continue
        resolved.append(cat)
    if not resolved:
        return

    # Per-task advance. Default keeps a calm 15-minute minimum cadence (was 5 —
    # too aggressive, produced 4-task notification storms in the 7-7:25am
    # window). If the run would overrun `win_end`, shrink the gap uniformly so
    # the whole block fits, pulling tasks earlier rather than past the window.
    durs = [max(1, int(cat.duration_min)) for cat in resolved]
    n = len(resolved)
    steps = [max(int(cat.duration_min) + 1, 15) for cat in resolved]
    if win_end is not None and n > 1:
        natural_span = sum(steps[:-1])  # first start -> last start
        if start_minute + natural_span > win_end:
            room = max(0, win_end - start_minute)
            body = sum(durs[:-1])  # back-to-back minimum (last-start floor)
            g = (room - body) // (n - 1) if body <= room else 0
            g = max(0, g)
            steps = [durs[i] + g for i in range(n)]

    cur = start_minute
    for i, cat in enumerate(resolved):
        time_str = from_minutes(cur).strftime("%H:%M")
        # Emit BOTH duration_min and duration_minutes — mobile reads
        # `duration_minutes` (legacy LLM-path key); skeleton/validator
        # internals use `duration_min`. Without both, doc-driven
        # schedules render with no duration suffix in the UI.
        day.setdefault("tasks", []).append({
            "task_id": str(uuid4()),
            "catalog_id": cat.id,
            "title": cat.title,
            "description": cat.description,
            "time": time_str,
            "duration_min": cat.duration_min,
            "duration_minutes": cat.duration_min,
            "tags": list(cat.tags),
            "status": "pending",
            "intensity": float(cat.intensity),
        })
        cur += steps[i]


# --------------------------------------------------------------------------- #
#  Helpers                                                                    #
# --------------------------------------------------------------------------- #

def _time_to_minutes(s: str) -> int:
    if not isinstance(s, str) or ":" not in s:
        return 0
    try:
        h, m = s.split(":", 1)
        return int(h) * 60 + int(m)
    except ValueError:
        return 0


def has_skeleton(maxx_id: str) -> bool:
    """True if the doc has a skeleton.blocks block (used by the generator
    to choose the LLM-free path vs falling back)."""
    doc = get_doc(maxx_id)
    if doc is None:
        return False
    sd = doc.schedule_design or {}
    sk = sd.get("skeleton") or {}
    return bool(sk.get("blocks"))
