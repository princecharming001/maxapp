"""
Human-time placement (the "fits your life" engine).

People do not live at 7:23a. They live in WINDOWS anchored to their real
day - the morning routine after waking, the get-ready crunch before work,
lunch, the settle-in hour after work, the evening, the wind-down before
bed. This module turns a user's stated anchors into those windows and
gives every placement pass three things:

  1. friendly_time()    - snap machine times to a human grid (:00/:15/:30/
                          :45 when close, else :05s). 7:23 -> 7:25, 9:48 ->
                          9:45. Nobody trusts a plan that says 7:23.
  2. life_windows()     - the windows + PROTECTED buffers (no optional task
                          in the get-ready crunch, the first ~45min after
                          work, or the dinner hour).
  3. why_line()         - the anchor-relative reason a slot was chosen
                          ("right after you wake", "on your lunch break",
                          "once you're home and settled", "before bed") -
                          the plan should read the way a person thinks.

Pure functions; unit-tested; no LLM anywhere.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# basics
# ---------------------------------------------------------------------------

def to_min(hhmm: Any, default: int = 0) -> int:
    try:
        h, m = str(hhmm).strip().split(":", 1)
        return int(h) * 60 + int(m[:2])
    except (ValueError, AttributeError):
        return default


def hm(minutes: int) -> str:
    minutes = minutes % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def friendly_time(minutes: int) -> int:
    """Snap to the human grid. Times already on a 5-minute mark are left
    alone (7:25 is a perfectly human time); off-grid times go to the nearest
    quarter-hour when it's close, else the nearest 5. Kills 7:23 / 9:48."""
    minutes = minutes % (24 * 60)
    if minutes % 5 == 0:
        return minutes
    quarter = round(minutes / 15) * 15
    if abs(quarter - minutes) <= 4:
        return quarter % (24 * 60)
    return (round(minutes / 5) * 5) % (24 * 60)


# ---------------------------------------------------------------------------
# life windows
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LifeWindows:
    wake: int
    sleep: int                      # may be < wake (overnight sleeper)
    work_start: int | None
    work_end: int | None
    morning_routine: tuple[int, int]    # wake .. wake+45 (skincare, hygiene)
    crunch: tuple[int, int] | None      # get-ready squeeze before work - PROTECTED
    lunch: tuple[int, int] | None       # midday breather inside the work block
    settle_in: tuple[int, int] | None   # commute + decompress after work - PROTECTED
    dinner: tuple[int, int]             # PROTECTED for optionals
    evening: tuple[int, int]            # free evening time
    wind_down: tuple[int, int]          # sleep-75 .. sleep-15 (PM routine)


def _first_work_block(ob_like: dict) -> tuple[int, int] | None:
    """The day's main fixed block (work/school) from obligations or legacy
    work_start/work_end. Returns clock minutes or None."""
    ws = ob_like.get("work_start")
    we = ob_like.get("work_end")
    s, e = to_min(ws, -1), to_min(we, -1)
    if 0 <= s < e:
        return (s, e)
    best: tuple[int, int] | None = None
    for o in ob_like.get("obligations") or []:
        if not isinstance(o, dict):
            continue
        s, e = to_min(o.get("start"), -1), to_min(o.get("end"), -1)
        if 0 <= s < e and (e - s) >= 3 * 60:  # a real block, not a meeting
            if best is None or (e - s) > (best[1] - best[0]):
                best = (s, e)
    return best


def life_windows(state: dict) -> LifeWindows:
    wake = to_min(state.get("wake_time"), 7 * 60)
    sleep = to_min(state.get("sleep_time"), 23 * 60)
    sleep_for_calc = sleep if sleep > wake else sleep + 24 * 60

    work = _first_work_block(state)
    work_start, work_end = (work if work else (None, None))

    morning_routine = (wake, min(wake + 45, (work_start - 30) if work_start else wake + 45))

    crunch = None
    if work_start is not None and work_start - wake > 45:
        crunch = (max(wake + 30, work_start - 45), work_start)

    lunch = None
    if work and (work_end - work_start) >= 5 * 60:
        mid = (work_start + work_end) // 2
        lunch = (max(work_start + 90, mid - 45), min(work_end - 60, mid + 45))
        if lunch[1] - lunch[0] < 20:
            lunch = None

    settle_in = None
    if work_end is not None:
        settle_in = (work_end, min(work_end + 45, sleep_for_calc - 90))

    # Dinner: honor a stated dinner time when the user gave one (a real
    # anchor we protect optionals around), else a daytime default of
    # 18:30-19:45. Either way it's scaled into the evening for shifted
    # schedules via the evening floor below.
    stated_dinner = to_min(state.get("dinner_time"), -1)
    if stated_dinner >= 0:
        default_dinner = (stated_dinner, stated_dinner + 60)
    else:
        default_dinner = (18 * 60 + 30, 19 * 60 + 45)
    evening_start_floor = (settle_in[1] if settle_in else max(wake + 9 * 60, 17 * 60))
    dinner = (
        max(default_dinner[0], evening_start_floor),
        max(default_dinner[1], evening_start_floor + 45),
    )
    if dinner[1] > sleep_for_calc - 60:
        dinner = (sleep_for_calc - 150, sleep_for_calc - 90)

    wind_down = (sleep_for_calc - 75, sleep_for_calc - 15)
    evening = (dinner[1] + 15, wind_down[0])
    if evening[1] <= evening[0]:
        evening = (dinner[1], wind_down[0])

    return LifeWindows(
        wake=wake,
        sleep=sleep,
        work_start=work_start,
        work_end=work_end,
        morning_routine=morning_routine,
        crunch=crunch,
        lunch=lunch,
        settle_in=settle_in,
        dinner=dinner,
        evening=evening,
        wind_down=wind_down,
    )


def protected_spans(w: LifeWindows) -> list[tuple[int, int]]:
    """Times where OPTIONAL tasks must never land: the get-ready crunch,
    the settle-in right after work, and dinner."""
    out: list[tuple[int, int]] = []
    if w.crunch:
        out.append(w.crunch)
    if w.settle_in:
        out.append(w.settle_in)
    out.append(w.dinner)
    return out


def nudge_out_of_protected(minutes: int, w: LifeWindows, duration: int = 10) -> int:
    """Shift a slot forward past any protected span it falls into (or that
    it would overrun into within `duration`)."""
    spans = sorted(protected_spans(w))
    m = minutes if minutes >= w.wake else minutes + 24 * 60
    for s, e in spans:
        if s < m + duration and m < e:
            m = e + 5
    return m % (24 * 60)


# ---------------------------------------------------------------------------
# workout window resolution
# ---------------------------------------------------------------------------

WORKOUT_CHOICES = ("before_work", "lunch", "after_work", "evening")


def resolve_workout_window(state: dict, choice: str | None = None) -> tuple[int, int]:
    """The user's answer to 'when would a workout ACTUALLY happen?' resolved
    against their real anchors. Falls back gracefully when the choice
    doesn't physically fit (e.g. before_work with a 7:00 wake and 8:00
    work start)."""
    w = life_windows(state)
    choice = (choice or str(state.get("workout_window_choice") or "")).strip() or "after_work"
    sleep_for_calc = w.sleep if w.sleep > w.wake else w.sleep + 24 * 60

    if choice == "before_work" and w.work_start is not None:
        start, end = w.wake + 15, (w.crunch[0] if w.crunch else w.work_start - 30)
        if end - start >= 40:
            return (start, end)
        choice = "after_work"  # not enough real room - be honest, move it
    if choice == "lunch" and w.lunch is not None:
        return w.lunch
    if choice == "after_work" and w.settle_in is not None:
        start = w.settle_in[1]  # settled in, THEN train
        end = min(w.dinner[0], start + 150)
        if end - start >= 40:
            return (start, end)
        choice = "evening"
    # evening (and every fallback): after dinner, before wind-down
    start, end = w.evening
    if end - start < 40:
        start, end = max(w.wake + 60, end - 90), end
    return (start, min(end, sleep_for_calc - 60))


# ---------------------------------------------------------------------------
# why-lines: the plan should read the way a person thinks
# ---------------------------------------------------------------------------

def why_line(slot_min: int, w: LifeWindows, anchors: list[str] | None = None) -> str:
    anchors = [str(a) for a in (anchors or [])]
    sleep_for_calc = w.sleep if w.sleep > w.wake else w.sleep + 24 * 60
    m = slot_min if slot_min >= w.wake else slot_min + 24 * 60

    if w.morning_routine[0] <= m < w.morning_routine[1]:
        if "coffee" in anchors and m >= w.wake + 15:
            return "with your morning coffee"
        return "right after you wake"
    if w.crunch and w.crunch[0] <= m < w.crunch[1]:
        return "before you head out"
    if w.lunch and w.lunch[0] <= m < w.lunch[1]:
        return "on your lunch break"
    if w.work_start is not None and w.work_end is not None and w.work_start <= m < w.work_end:
        return "a quick break in your day"
    if w.settle_in and w.settle_in[0] <= m < w.settle_in[1] + 30:
        return "once you're home and settled"
    if w.dinner[0] <= m < w.dinner[1]:
        return "around dinner"
    if m >= w.wind_down[0]:
        return "wind-down before bed"
    if w.evening[0] <= m < w.evening[1]:
        return "your evening, your time"
    if m < w.morning_routine[0] + 24 * 60 and m >= sleep_for_calc - 90:
        return "before bed"
    return "fits your day"


# ---------------------------------------------------------------------------
# the humanize pass - run over generated days
# ---------------------------------------------------------------------------

def humanize_days(days: list[dict], state: dict) -> list[dict]:
    """Final generation pass: snap times to the human grid, push optionals
    out of protected spans, keep ordering, and fill anchor-relative why
    lines for tasks that don't have one. Mutates in place; idempotent."""
    w = life_windows(state)
    anchors = state.get("anchor_cues") or []

    for day in days or []:
        tasks = day.get("tasks") or []
        placed: list[tuple[int, dict]] = []
        for t in tasks:
            m = to_min(t.get("time"), -1)
            if m < 0:
                continue
            essential_morning = m < w.morning_routine[1]
            if not essential_morning:
                m = nudge_out_of_protected(m, w, int(t.get("duration_min") or 10))
            m = friendly_time(m)
            placed.append((m, t))

        # Keep the day ordered + minimally spaced after snapping.
        placed.sort(key=lambda x: (x[0] if x[0] >= w.wake else x[0] + 24 * 60))
        last_end = -10**6
        for m, t in placed:
            mm = m if m >= w.wake else m + 24 * 60
            if mm < last_end + 5:
                mm = friendly_time(last_end + 10)
                if mm < last_end + 5:  # rounding pulled it back - push a grid step
                    mm = last_end + 15
            t["time"] = hm(mm)
            last_end = mm + int(t.get("duration_min") or 10)
            if not t.get("why"):
                t["why"] = why_line(mm % (24 * 60), w, anchors)
    return days
