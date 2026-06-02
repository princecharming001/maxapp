"""Deterministic multi-module collision pass.

Runs AFTER each module generates its own schedule, BEFORE persistence.
Walks every active schedule for the user and applies these passes:

  1. Identical-task dedupe (skinmax_spf vs another module's spf duplicate)
  2. Adjacent same-time push (5-min separation between any two tasks across modules)
  3. Cross-module antagonism split (microneedle + dermastamp → different days)
  4. Daily total cap enforcement (≤ HARD_CAP across all modules — demote lowest-intensity)
  5. Busy-window eviction (opt-in via user_ctx) — re-place the merged day into
     its FREE intervals so nothing sits inside the user's real work/commitments

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

# Declared-priority → maxx_id. `priority_order` (onboarding) ranks the user's
# focus areas first→last using these tokens; we map each to the maxx module it
# drives so collision passes can favor the user's top maxx. Mirror of the
# frontend PRIORITY_KEYS (mobile/constants/profileLifestyleQuestionnaire.ts).
_PRIORITY_TOKEN_TO_MAXX = {
    "face_structure": "bonemax",
    "skin": "skinmax",
    "hair": "hairmax",
    "body": "fitmax",
    "height": "heightmax",
}
# Rank for any maxx the user didn't rank (or when no priority is declared): sort
# last, so an unranked module yields to a ranked one but ties stay deterministic.
_NO_PRIORITY_RANK = 999


def _priority_declared(user_ctx: dict | None) -> bool:
    """True when the user has a usable declared maxx priority order."""
    return (
        isinstance(user_ctx, dict)
        and isinstance(user_ctx.get("priority_order"), list)
        and len(user_ctx["priority_order"]) > 0
    )


def _maxx_priority_rank(maxx_id: str, user_ctx: dict | None) -> int:
    """Position of `maxx_id` in the user's declared priority (0 = highest).

    Unranked maxxes — or any call with no declared priority — return
    `_NO_PRIORITY_RANK` so callers fall back to their legacy tie-break.
    """
    if not _priority_declared(user_ctx):
        return _NO_PRIORITY_RANK
    for i, tok in enumerate(user_ctx["priority_order"]):  # type: ignore[index]
        if _PRIORITY_TOKEN_TO_MAXX.get(str(tok).strip().lower()) == maxx_id:
            return i
    return _NO_PRIORITY_RANK


def _select_optionals_to_keep(
    optionals: list[tuple[str, dict]], slots: int, user_ctx: dict | None
) -> set[int]:
    """Pick which optional tasks survive the daily-cap trim → set of id()s to keep.

    No declared priority → legacy behavior: keep the highest-intensity optionals
    (earliest-first tie-break), identical to the old global sort.

    Declared priority → round-robin across maxxes in priority order, each maxx
    contributing its highest-intensity optional in turn. This keeps the scarce
    slots from being monopolized by whichever maxx happens to own the most
    intense extras, so the user's #1 maxx always gets first pick and a secondary
    maxx still keeps its best habit instead of being wiped out.
    """
    if slots <= 0:
        return set()
    if slots >= len(optionals):
        return {id(t) for _, t in optionals}

    def _intensity_key(item: tuple[str, dict]):
        return (-float(item[1].get("intensity") or 0.0), _time_to_min(item[1].get("time")))

    if not _priority_declared(user_ctx):
        ranked = sorted(optionals, key=_intensity_key)
        return {id(t) for _, t in ranked[:slots]}

    by_maxx: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for m, t in optionals:
        by_maxx[m].append((m, t))
    for m in by_maxx:
        by_maxx[m].sort(key=_intensity_key)
    ordered = sorted(by_maxx.keys(), key=lambda m: (_maxx_priority_rank(m, user_ctx), m))

    keep: set[int] = set()
    cursors = {m: 0 for m in ordered}
    while len(keep) < slots:
        progressed = False
        for m in ordered:
            if len(keep) >= slots:
                break
            if cursors[m] < len(by_maxx[m]):
                keep.add(id(by_maxx[m][cursors[m]][1]))
                cursors[m] += 1
                progressed = True
        if not progressed:
            break
    return keep


def reconcile_schedules(
    schedules: dict[str, list[dict]],
    *,
    user_ctx: dict | None = None,
    start_date: Any = None,
) -> dict[str, list[dict]]:
    """Apply all collision passes. Returns a new dict — does not mutate input.

    When `user_ctx` + `start_date` are supplied, a FINAL busy-window eviction
    runs after the cross-module gap-pack: step 3 densifies the merged morning
    and can shove a routine task (e.g. SPF) one minute into a fixed obligation
    (the 8:15 commute). The per-module validator already cleared obligations,
    but the merge re-packs without that knowledge. The eviction restores it —
    preferring to PULL a spilled task back flush before the obligation (you
    apply SPF *before* leaving) rather than dumping it after work. Omitted args
    → no-op, so the master-view merge and unit tests are unaffected.
    """
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

    # 2) Cross-module antagonism: split to different days. The LOWER-priority
    # maxx yields its task to another day so the user's top maxx keeps its
    # planned slot. With no declared priority, fall back to moving the
    # alphabetically-second id (legacy, deterministic).
    for di in range(day_count):
        present: dict[str, tuple[str, dict]] = {}
        for maxx_id, t in by_day[di]:
            cid = t.get("catalog_id")
            if cid and cid not in present:
                present[cid] = (maxx_id, t)
        for pair in _CROSS_ANTAGONISM:
            if not pair.issubset(present.keys()):
                continue
            a, b = sorted(pair)
            ma, _ta = present[a]
            mb, tb = present[b]
            ra, rb = _maxx_priority_rank(ma, user_ctx), _maxx_priority_rank(mb, user_ctx)
            # Default (tie / no priority): move b (alphabetically second). If a's
            # maxx outranks b's, that's already what we want; if b's outranks a's,
            # move a instead so the higher-priority maxx keeps its day.
            if rb < ra:
                mover_cid, mover_m, mover_t = a, present[a][0], present[a][1]
            else:
                mover_cid, mover_m, mover_t = b, mb, tb
            target_day = _find_safe_day(by_day, mover_cid, start_after=di)
            if target_day is not None and target_day != di:
                _move_task(schedules, mover_m, di, target_day, mover_t)
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
        # Choose which optionals survive. With a declared maxx priority this is a
        # round-robin so the user's top maxx gets first pick and no single maxx
        # monopolizes the slots; without one it's the legacy highest-intensity cut.
        keep_ids = _select_optionals_to_keep(optionals, optional_slots, user_ctx)
        for maxx_id, task in optionals:
            if id(task) in keep_ids:
                continue
            _remove_task(schedules, maxx_id, di, task)
            items.remove((maxx_id, task))

        # Absolute storm guard: if the essential floor itself is implausibly
        # large (pathological multi-maxx overlap), trim essentials down to the
        # hard ceiling — but only as a last resort. Drop the lowest-priority
        # maxx's lowest-intensity essentials first; with no declared priority
        # this collapses to the legacy lowest-intensity-first cut.
        if len(items) > HARD_DAILY_TASK_CAP:
            ess_now = [(m, t) for (m, t) in items if _is_essential(t)]
            ess_now.sort(key=lambda x: (-_maxx_priority_rank(x[0], user_ctx),
                                        float(x[1].get("intensity") or 0.0)))
            for maxx_id, task in ess_now[:len(items) - HARD_DAILY_TASK_CAP]:
                _remove_task(schedules, maxx_id, di, task)
                items.remove((maxx_id, task))

    # 5) Final cross-module busy-window eviction (opt-in via user_ctx).
    if isinstance(user_ctx, dict) and start_date is not None:
        _evict_busy_windows(schedules, user_ctx, start_date, day_count)

    return schedules


def _evict_busy_windows(
    schedules: dict[str, list[dict]],
    user_ctx: dict,
    start_date: Any,
    day_count: int,
) -> None:
    """Re-place the merged task list into the day's FREE intervals.

    Per day, resolves that weekday's busy windows (override → global), subtracts
    them from the waking day to get the free gaps, then assigns every
    cross-module task to the free interval it currently sits nearest and packs
    each interval in time order. A roomy interval (e.g. the whole evening) keeps
    its tasks at their natural, spread-out times; a squeezed one (the morning
    before a commute) compacts toward back-to-back so the WHOLE run — SPF
    included — still lands before the obligation instead of spilling its last
    step past the workday. Overflow from a full interval carries into the next.
    Strict no-op for any day with no busy windows. Mutates tasks in place.
    """
    from datetime import timedelta as _td

    from services.schedule_validator import (
        _WEEKDAY_NAMES,
        _busy_intervals_from_ctx,
        _effective_day_ctx,
        _sleep_minutes_normalized,
    )
    from services.schedule_dsl import (
        crosses_midnight,
        from_minutes,
        order_minutes,
        parse_clock,
        to_minutes,
    )

    g_wake = str(user_ctx.get("wake_time") or "07:00")
    g_sleep = str(user_ctx.get("sleep_time") or "23:00")

    cache: dict[str, tuple] = {}

    def _params(wd: str):
        if wd in cache:
            return cache[wd]
        eff = _effective_day_ctx(user_ctx, wd, global_wake=g_wake, global_sleep=g_sleep)
        wake_dt = parse_clock(eff["wake_time"], "07:00")
        sleep_dt = parse_clock(eff["sleep_time"], "23:00")
        busy = _busy_intervals_from_ctx(eff)
        overnight = crosses_midnight(wake_dt, sleep_dt)
        wake_min = to_minutes(wake_dt)
        sleep_rel = _sleep_minutes_normalized(wake_dt, sleep_dt) - wake_min
        cache[wd] = (wake_min, sleep_rel, busy, overnight)
        return cache[wd]

    for di in range(day_count):
        wd = _WEEKDAY_NAMES[(start_date + _td(days=di)).weekday()]
        wake_min, sleep_rel, busy, overnight = _params(wd)
        if not busy:
            continue

        # Working-minute space: minutes-since-wake when overnight, else clock.
        def _to_work(clock: int) -> int:
            return order_minutes(clock, wake_min) if overnight else clock

        def _to_clock_str(work: int) -> str:
            return from_minutes((wake_min + work) if overnight else work).strftime("%H:%M")

        busy_w = sorted((_to_work(s), _to_work(e)) for s, e in busy)

        # Free space = the waking day minus the merged busy windows. Tasks are
        # placed INTO these gaps rather than walked forward and patched, so a
        # crowded morning compacts to fit before the commute instead of spilling
        # its last step past the workday.
        day_start_w = 0 if overnight else wake_min
        day_end_w = sleep_rel if overnight else (wake_min + sleep_rel)
        free = _free_intervals(busy_w, day_start_w, day_end_w)
        if not free:
            continue  # fully busy day (pathological) — leave tasks untouched

        items: list[dict] = []
        for days in schedules.values():
            if di < len(days):
                items.extend(days[di].get("tasks") or [])
        if not items:
            continue

        # Assign every cross-module task to the free interval it's nearest to,
        # carrying its current time as the placement anchor.
        groups: list[list[tuple[int, int, dict]]] = [[] for _ in free]
        for t in items:
            dur = max(1, int(t.get("duration_min") or t.get("duration_minutes") or 1))
            start_w = _to_work(_time_to_min(t.get("time")))
            groups[_nearest_free(start_w, free)].append((start_w, dur, t))

        # Pack each interval in time order. Anything that can't fit even when
        # compacted overflows into the NEXT interval (a too-full morning sheds
        # its lowest-priority extra into the afternoon, never into the commute).
        carry: list[tuple[int, int, dict]] = []
        for gi, (S, E) in enumerate(free):
            entries = carry + groups[gi]
            # Clamp anchors into [S, E] so the forward walk starts sensibly, then
            # order by anchor to preserve each task's relative time-of-day.
            entries = [(min(max(a, S), E), d, ref) for (a, d, ref) in entries]
            entries.sort(key=lambda x: x[0])
            placed, carry = _pack_interval(entries, S, E, MIN_TASK_GAP_MIN)
            for start_w, ref in placed:
                new_clock = _to_clock_str(start_w)
                if new_clock != ref.get("time"):
                    ref["time"] = new_clock
        # Leftover carry (couldn't fit any interval) keeps its original time —
        # safer than stacking at the day's end. The upstream daily-cap pass makes
        # this practically unreachable for real users.


def _free_intervals(
    busy_w: list[tuple[int, int]], day_start: int, day_end: int
) -> list[tuple[int, int]]:
    """[day_start, day_end] minus the busy windows → the free gaps to place in.

    All inputs are in the day's working-minute space (clock for a day schedule,
    minutes-since-wake for an overnight one). Returns [] if the day is fully
    busy; the caller then leaves that day's tasks where they are.
    """
    free: list[tuple[int, int]] = []
    cursor = day_start
    for bs, be in sorted(busy_w):
        bs = max(bs, day_start)
        be = min(be, day_end)
        if be <= bs:
            continue
        if bs > cursor:
            free.append((cursor, bs))
        cursor = max(cursor, be)
    if cursor < day_end:
        free.append((cursor, day_end))
    return free


def _nearest_free(cur: int, free: list[tuple[int, int]]) -> int:
    """Index of the free interval holding `cur`, else the nearest by distance.

    A task that currently sits INSIDE a busy window (a routine step the merge
    shoved into the commute) gets assigned to the free interval whose edge it is
    closest to — so a task that spilled just past the morning's end comes back
    to the morning, while one near the window's far end flows to the evening.
    """
    best, best_d = 0, None
    for i, (s, e) in enumerate(free):
        if s <= cur < e:
            return i
        d = min(abs(cur - s), abs(cur - e))
        if best_d is None or d < best_d:
            best, best_d = i, d
    return best


def _pack_interval(
    entries: list[tuple[int, int, dict]], S: int, E: int, gap: int
) -> tuple[list[tuple[int, dict]], list[tuple[int, int, dict]]]:
    """Place `entries` (each (anchor_start, dur, task_ref), sorted by anchor)
    inside the free interval [S, E].

    Two passes:
      1. Natural forward walk anchored to each task's current time. If the run
         already fits (last task ends by E), keep those times — a roomy interval
         (e.g. the whole evening) stays at its real, spread-out times.
      2. If the run overruns E, the interval is squeezed by the next busy window
         (the classic crowded-morning-before-the-commute case). Compact: shrink
         the inter-task gap toward back-to-back as needed, then left-align from
         the natural earliest start, pulling tasks earlier toward S only as far
         as required so the WHOLE run lands before E. This is what keeps a
         squeezed morning routine — SPF included — before the commute instead of
         dumping the last step past the workday.

    Returns (placed, overflow): placed = [(start, ref)]; overflow = entries that
    don't fit even compressed (handed to the next interval by the caller).
    """
    if not entries:
        return [], []
    durs = [d for _, d, _ in entries]
    n = len(entries)

    # Pass 1: natural forward walk.
    walk: list[int] = []
    cursor: int | None = None
    for anchor, d, _ref in entries:
        s = anchor if cursor is None else max(anchor, cursor + gap)
        walk.append(s)
        cursor = s + d
    if walk[-1] + durs[-1] <= E:
        return [(walk[i], entries[i][2]) for i in range(n)], []

    # Pass 2: compact to fit before E.
    total = sum(durs)
    room = E - S
    if n > 1:
        max_gap = (room - total) // (n - 1)
        g = gap if max_gap >= gap else max(0, max_gap)
    else:
        g = 0
    span = total + g * (n - 1)
    earliest = entries[0][0]
    if span <= room:
        start0 = max(S, min(earliest, E - span))
    else:
        start0 = S  # cannot fit even back-to-back; place what we can, overflow rest

    placed: list[tuple[int, dict]] = []
    overflow: list[tuple[int, int, dict]] = []
    cursor = start0
    for i, (anchor, d, ref) in enumerate(entries):
        if cursor + d <= E:
            placed.append((cursor, ref))
            cursor += d + g
        else:
            overflow.append(entries[i])
    return placed, overflow


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
