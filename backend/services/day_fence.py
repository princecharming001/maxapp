"""Day fence — the last placement pass before a plan is persisted.

Guarantees, for every task on every day:
  * it starts no earlier than that weekday's wake,
  * it ends no later than that weekday's bedtime,
  * it does not sit inside a work block (stated work hours, or any commitment
    of WORK_MIN_BLOCK_MIN or longer) — except during the lunch break, which
    stays open,
  * it has a clock time at all (a task that reached us without one lands an
    hour after wake instead of the collision pass's 00:14).

Why a separate pass: validate_and_fix evicts from busy time but its ceiling is
23:59; humanize_days re-spaces with no bedtime and no idea where work is;
apply_calendar_busy and the collision gap pass only ever push LATER. Each one
can undo the others' work, and none of them runs last on every persist path.
This does, and it is pure and idempotent: a day already inside the fence is
returned byte-identical.

Night owls: the day frame is minutes-since-wake, so a 14:00 riser's 01:30 task
is 690 minutes into the day, not "before wake".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from services.schedule_validator import (
    MIN_TASK_GAP_MIN,
    _merge_intervals,
    _obligations_for_weekday,
    _parse_time_field,
)

_DAY = 24 * 60
WORK_MIN_BLOCK_MIN = 180          # a commitment this long is "work" (users.py uses the same bar)
WORKDAY_MIN = 360                 # a block this long has a lunch break inside it
LUNCH_MIN = 45
DEFAULT_LUNCH_START = 12 * 60 + 30
MISSING_TIME_OFFSET_MIN = 60      # no clock time → wake + 60
_MAX_SETTLE = 8                   # bounded, like the validator / calendar passes

_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


@dataclass(frozen=True)
class DayFence:
    wake: int                              # clock minutes
    length: int                            # minutes from wake to bedtime
    work: tuple[tuple[int, int], ...]      # busy spans, in minutes-from-wake, lunch already carved out

    def frame(self, clock: int) -> int:
        return (clock - self.wake) % _DAY

    def clock(self, framed: int) -> int:
        return (self.wake + framed) % _DAY


def _hhmm(clock: int) -> str:
    clock %= _DAY
    return f"{clock // 60:02d}:{clock % 60:02d}"


def _weekday_for(day: dict) -> str | None:
    raw = day.get("date")
    if not isinstance(raw, str):
        return None
    try:
        return _WEEKDAYS[date.fromisoformat(raw).weekday()]
    except ValueError:
        return None


def _pick(state: dict, weekday: str | None, key: str) -> Any:
    """A weekday override (planner weekly_timings) beats the global value."""
    wt = state.get("weekly_timings") if isinstance(state, dict) else None
    if weekday and isinstance(wt, dict) and isinstance(wt.get(weekday), dict):
        v = wt[weekday].get(key)
        if v not in (None, ""):
            return v
    return state.get(key)


def _lunch(state: dict) -> tuple[int, int] | None:
    skipped = {str(x).strip().lower() for x in (state.get("meals_skipped") or [])}
    if "lunch" in skipped:
        return None
    start = _parse_time_field(state.get("lunch_time"))
    if start is None:
        start = DEFAULT_LUNCH_START
    return start, start + LUNCH_MIN


def day_fence_for(state: dict, weekday: str | None = None) -> DayFence:
    """Resolve one weekday's fence from onboarding-shaped state."""
    state = state if isinstance(state, dict) else {}
    wake = _parse_time_field(_pick(state, weekday, "wake_time"))
    bed = _parse_time_field(_pick(state, weekday, "sleep_time"))
    wake = 7 * 60 if wake is None else wake
    bed = 23 * 60 if bed is None else bed
    length = (bed - wake) % _DAY or _DAY  # bed == wake: a full day, never a zero-length one

    blocks: list[tuple[int, int]] = []
    ws = _parse_time_field(_pick(state, weekday, "work_start"))
    we = _parse_time_field(_pick(state, weekday, "work_end"))
    if ws is not None and we is not None and we > ws:
        blocks.append((ws, we))
    obligations = state.get("obligations")
    if weekday:
        obligations = _obligations_for_weekday(obligations, weekday)
    for ob in obligations if isinstance(obligations, list) else []:
        if not isinstance(ob, dict):
            continue
        s, e = _parse_time_field(ob.get("start")), _parse_time_field(ob.get("end"))
        if s is None or e is None or e - s < WORK_MIN_BLOCK_MIN:
            continue
        blocks.append((s, e))

    lunch = _lunch(state)
    framed: list[tuple[int, int]] = []
    for s, e in _merge_intervals(blocks):
        parts = [(s, e)]
        # A full workday keeps its lunch break open; a 3-hour class does not.
        if lunch and e - s >= WORKDAY_MIN and s < lunch[0] and lunch[1] < e:
            parts = [(s, lunch[0]), (lunch[1], e)]
        for ps, pe in parts:
            fs, fe = (ps - wake) % _DAY, (pe - wake) % _DAY
            if fe <= fs:            # the block wraps past midnight in the frame — clamp to the day
                fe = _DAY
            framed.append((min(fs, length), min(fe, length)))
    work = tuple((s, e) for s, e in _merge_intervals(framed) if e > s)
    return DayFence(wake=wake, length=length, work=work)


def _duration(task: dict) -> int:
    try:
        return max(1, int(task.get("duration_min") or task.get("duration_minutes") or 1))
    except (TypeError, ValueError):
        return 1


def _overlaps(start: int, dur: int, spans: tuple[tuple[int, int], ...]) -> tuple[int, int] | None:
    for s, e in spans:
        if start < e and s < start + dur:
            return s, e
    return None


def fence_day(tasks: list[dict], fence: DayFence) -> int:
    """Fence one day's tasks in place. Returns how many task times changed."""
    if not tasks:
        return 0
    placed: list[tuple[int, int, dict]] = []   # (framed start, duration, task)
    for t in tasks:
        clock = _parse_time_field(t.get("time"))
        framed = MISSING_TIME_OFFSET_MIN if clock is None else fence.frame(clock)
        # A time in the sleep gap is either "before wake" (06:40 for a 07:00
        # riser) or "past bedtime" (23:25 for a 23:00 sleeper): whichever
        # edge it is nearer. Before-wake lands on wake; past-bed is pulled
        # back by the ceiling pass below.
        if framed > fence.length and (_DAY - framed) <= (framed - fence.length):
            framed = 0
        placed.append((framed, _duration(t), t))
    placed.sort(key=lambda p: p[0])

    starts = [p[0] for p in placed]
    # Forward: wake floor, work blocks, and a running gap after each task.
    floor = 0
    for i, (_, dur, _t) in enumerate(placed):
        start = max(starts[i], 0)
        for _ in range(_MAX_SETTLE):
            moved = False
            if start < floor:
                start, moved = floor, True
            hit = _overlaps(start, dur, fence.work)
            if hit is not None:
                start, moved = hit[1], True
            if not moved:
                break
        starts[i] = start
        floor = start + dur + MIN_TASK_GAP_MIN

    # Backward: bedtime ceiling, pulling earlier tasks back only as far as needed.
    limit = fence.length
    for i in range(len(placed) - 1, -1, -1):
        dur = placed[i][1]
        start = starts[i]
        if start + dur > limit:
            start = max(0, limit - dur)
            for _ in range(_MAX_SETTLE):
                hit = _overlaps(start, dur, fence.work)
                if hit is None:
                    break
                start = max(0, hit[0] - dur)
        starts[i] = start
        limit = start - MIN_TASK_GAP_MIN

    changed = 0
    for i, (orig, _dur, t) in enumerate(placed):
        new_time = _hhmm(fence.clock(starts[i]))
        if t.get("time") != new_time:
            t["time"] = new_time
            changed += 1
        elif orig != starts[i]:
            changed += 1
    return changed


def fence_days(days: list[dict], state: dict) -> list[dict]:
    """Fence every day (weekday resolved from its date). Mutates in place, returns `days`."""
    if not days:
        return days
    cache: dict[str | None, DayFence] = {}
    for day in days:
        tasks = day.get("tasks") or []
        if not tasks:
            continue
        weekday = _weekday_for(day)
        fence = cache.get(weekday)
        if fence is None:
            fence = cache[weekday] = day_fence_for(state, weekday)
        if fence_day(tasks, fence):
            tasks.sort(key=lambda t: _parse_time_field(t.get("time")) or 0)
            day["tasks"] = tasks
    return days


def fence_violations(days: list[dict], state: dict) -> list[dict]:
    """Read-only audit: the tasks the fence WOULD move, with their reason."""
    out: list[dict] = []
    for day in days or []:
        weekday = _weekday_for(day)
        fence = day_fence_for(state, weekday)
        for t in day.get("tasks") or []:
            clock = _parse_time_field(t.get("time"))
            if clock is None:
                out.append({"date": day.get("date"), "title": t.get("title"), "time": t.get("time"), "why": "no time"})
                continue
            start, dur = fence.frame(clock), _duration(t)
            if start + dur > fence.length:
                why = "after bedtime"
            elif _overlaps(start, dur, fence.work):
                why = "inside work"
            else:
                continue
            out.append({"date": day.get("date"), "title": t.get("title"), "time": t.get("time"), "why": why})
    return out
