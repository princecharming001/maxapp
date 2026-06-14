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


def _window(value: Any, *, night: bool = False) -> tuple[int, int] | None:
    """Parse a stored [start, end] 'HH:MM' window to (lo, hi) clock minutes.
    Returns None unless it's a well-formed, positive-width range. With night=True
    an end past midnight is normalised forward (+1440) so 22:30–00:30 stays
    ordered."""
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    lo, hi = to_min(value[0], -1), to_min(value[1], -1)
    if lo < 0 or hi < 0:
        return None
    if night and hi <= lo:
        hi += 24 * 60
    return (lo, hi) if hi > lo else None


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
    breakfast: tuple[int, int] | None   # stated breakfast - PROTECTED (None if skipped)
    crunch: tuple[int, int] | None      # get-ready squeeze before work - PROTECTED
    lunch: tuple[int, int] | None       # midday breather inside the work block
    settle_in: tuple[int, int] | None   # commute + decompress after work - PROTECTED
    dinner: tuple[int, int] | None      # PROTECTED for optionals (None if skipped)
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

    # Morning routine (get-ready: AM skincare, shower, hair). Honor an explicit
    # get-ready WINDOW when the user gave one; otherwise the legacy biology
    # default — a ~45-min block off wake, never overrunning into work.
    gr = _window(state.get("get_ready_window"))
    if gr:
        morning_routine = gr
    else:
        morning_routine = (wake, min(wake + 45, (work_start - 30) if work_start else wake + 45))

    crunch = None
    if work_start is not None and work_start - wake > 45:
        crunch = (max(wake + 30, work_start - 45), work_start)

    # Which meals the user told us they skip — those reserve no window, so the
    # scheduler is free to use the time.
    skipped = {str(x).strip().lower() for x in (state.get("meals_skipped") or [])}

    # Breakfast: only honored when the user gave a time (and didn't skip it).
    # A short eating window near the start of the day; no default — plenty of
    # people skip breakfast and we don't want to invent one.
    stated_breakfast = to_min(state.get("breakfast_time"), -1)
    breakfast = None
    if "breakfast" not in skipped and stated_breakfast >= 0:
        breakfast = (stated_breakfast, stated_breakfast + 30)

    # Lunch: a stated lunch time wins; otherwise the midday breather derived
    # from a long work block. Either is dropped if the user skips lunch.
    lunch = None
    if work and (work_end - work_start) >= 5 * 60:
        mid = (work_start + work_end) // 2
        lunch = (max(work_start + 90, mid - 45), min(work_end - 60, mid + 45))
        if lunch[1] - lunch[0] < 20:
            lunch = None
    stated_lunch = to_min(state.get("lunch_time"), -1)
    if stated_lunch >= 0:
        lunch = (stated_lunch, stated_lunch + 45)
    if "lunch" in skipped:
        lunch = None

    settle_in = None
    if work_end is not None:
        settle_in = (work_end, min(work_end + 45, sleep_for_calc - 90))

    # Dinner: honor a stated dinner time when the user gave one (a real
    # anchor we protect optionals around), else a daytime default of
    # 18:30-19:45 — unless the user skips dinner, in which case the evening is
    # one open block. Either way it's scaled into the evening for shifted
    # schedules via the evening floor below.
    evening_start_floor = (settle_in[1] if settle_in else max(wake + 9 * 60, 17 * 60))
    dinner = None
    if "dinner" not in skipped:
        stated_dinner = to_min(state.get("dinner_time"), -1)
        if stated_dinner >= 0:
            default_dinner = (stated_dinner, stated_dinner + 60)
        else:
            default_dinner = (18 * 60 + 30, 19 * 60 + 45)
        dinner = (
            max(default_dinner[0], evening_start_floor),
            max(default_dinner[1], evening_start_floor + 45),
        )
        if dinner[1] > sleep_for_calc - 60:
            dinner = (sleep_for_calc - 150, sleep_for_calc - 90)

    # Wind-down routine (PM skincare, shower, winding down). Honor an explicit
    # wind-down WINDOW when the user gave one (bedtime = its end); otherwise the
    # legacy default — the hour before the sleep anchor. Normalised forward so a
    # window that ends after midnight stays ordered against sleep_for_calc.
    wd = _window(state.get("wind_down_window"), night=True)
    if wd and wd[0] >= wake:
        wind_down = wd
    else:
        wind_down = (sleep_for_calc - 75, sleep_for_calc - 15)
    # The free evening starts after dinner when there is one, else straight off
    # the evening floor (settle-in / late-afternoon), and runs until wind-down.
    evening_lo = (dinner[1] + 15) if dinner else evening_start_floor
    evening = (evening_lo, wind_down[0])
    if evening[1] <= evening[0]:
        evening = (max(wake + 60, wind_down[0] - 90), wind_down[0])

    return LifeWindows(
        wake=wake,
        sleep=sleep,
        work_start=work_start,
        work_end=work_end,
        morning_routine=morning_routine,
        breakfast=breakfast,
        crunch=crunch,
        lunch=lunch,
        settle_in=settle_in,
        dinner=dinner,
        evening=evening,
        wind_down=wind_down,
    )


def protected_spans(w: LifeWindows) -> list[tuple[int, int]]:
    """Times where OPTIONAL tasks must never land: breakfast, the get-ready
    crunch, the settle-in right after work, and dinner (each only when it
    actually exists for this user)."""
    out: list[tuple[int, int]] = []
    if w.breakfast:
        out.append(w.breakfast)
    if w.crunch:
        out.append(w.crunch)
    if w.settle_in:
        out.append(w.settle_in)
    if w.dinner:
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
        end = min(w.dinner[0] if w.dinner else start + 150, start + 150)
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
    if w.breakfast and w.breakfast[0] <= m < w.breakfast[1]:
        return "over breakfast"
    if w.lunch and w.lunch[0] <= m < w.lunch[1]:
        return "on your lunch break"
    if w.work_start is not None and w.work_end is not None and w.work_start <= m < w.work_end:
        return "a quick break in your day"
    if w.settle_in and w.settle_in[0] <= m < w.settle_in[1] + 30:
        return "once you're home and settled"
    if w.dinner and w.dinner[0] <= m < w.dinner[1]:
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

        # Keep the day ordered, then space tasks — EXCEPT steps of the same
        # routine (same `group`), which stay snug back-to-back like a real
        # sitting (cleanse, then moisturize, then SPF) instead of drifting
        # 10+ minutes apart.
        placed.sort(key=lambda x: (x[0] if x[0] >= w.wake else x[0] + 24 * 60))
        last_end = -10**6
        last_group = None
        for m, t in placed:
            mm = m if m >= w.wake else m + 24 * 60
            grp = t.get("group")
            if grp is not None and grp == last_group:
                # one routine — keep it tight (1 min after the previous step ends)
                if mm < last_end + 1:
                    mm = last_end + 1
            elif mm < last_end + 5:
                mm = friendly_time(last_end + 10)
                if mm < last_end + 5:  # rounding pulled it back - push a grid step
                    mm = last_end + 15
            t["time"] = hm(mm)
            last_end = mm + int(t.get("duration_min") or 10)
            last_group = grp
            if not t.get("why"):
                t["why"] = why_line(mm % (24 * 60), w, anchors)
    return days
