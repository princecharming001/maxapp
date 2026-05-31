"""Tiny expression evaluator + window resolver for the schedule system.

The expression language is intentionally minimal — only what the
applies_when / contraindicated_when / prompt_modifiers blocks need.
NO eval, NO arbitrary code paths. Hand-written parser, ~80 lines.

Supported forms:
    always
    field
    !field          (negation, truthy)
    field == value
    field != value
    field < value   field <= value   field > value   field >= value
    field in [a, b, c]
    field not in [a, b, c]
    expr_a and expr_b   (AND chains; OR is not supported on purpose —
                         encode disjunctions as multiple list entries)

`evaluate_all(exprs, ctx)` returns True iff every expression is true.
This lets `applies_when: [a, b]` mean "a AND b".

Window resolver maps named windows (am_open, pm_active, ...) to
(start_minute, end_minute) tuples relative to the user's wake/sleep.
"""

from __future__ import annotations

import logging
import re
from datetime import time as dtime
from typing import Any

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Expression evaluator                                                       #
# --------------------------------------------------------------------------- #

_LIST_RE = re.compile(r"^\[(.*)\]$")


def evaluate(expr: str, ctx: dict[str, Any]) -> bool:
    """Evaluate one expression against ctx. Returns False on parse errors
    (with a log) — never raises during scheduling."""
    if not expr:
        return False
    e = expr.strip()
    if e.lower() == "always":
        return True

    # AND chain
    if " and " in e:
        return all(evaluate(part, ctx) for part in _split_top_level_and(e))

    # in / not in
    m = re.match(r"^(\w[\w\.]*)\s+(not\s+in|in)\s+(\[.*\])$", e)
    if m:
        field, op, list_lit = m.group(1), m.group(2).strip(), m.group(3)
        values = _parse_list(list_lit)
        actual = _normalize(ctx.get(field))
        in_list = actual in values
        return (in_list if op == "in" else not in_list)

    # comparison (==, !=, <, <=, >, >=)
    m = re.match(r"^(\w[\w\.]*)\s*(==|!=|<=|>=|<|>)\s*(.+)$", e)
    if m:
        field, op, raw_val = m.group(1), m.group(2), m.group(3).strip()
        actual = ctx.get(field)
        target = _coerce_literal(raw_val)
        try:
            if op == "==":
                return _normalize(actual) == _normalize(target)
            if op == "!=":
                return _normalize(actual) != _normalize(target)
            if op == "<":
                return float(actual) < float(target)
            if op == "<=":
                return float(actual) <= float(target)
            if op == ">":
                return float(actual) > float(target)
            if op == ">=":
                return float(actual) >= float(target)
        except (TypeError, ValueError):
            return False

    # negation
    if e.startswith("!"):
        return not _truthy(ctx.get(e[1:].strip()))

    # bare field — truthiness
    if re.match(r"^\w[\w\.]*$", e):
        return _truthy(ctx.get(e))

    logger.debug("schedule_dsl: unparseable expression: %r", expr)
    return False


def evaluate_all(exprs: list[str], ctx: dict[str, Any]) -> bool:
    if not exprs:
        return True
    return all(evaluate(x, ctx) for x in exprs)


def evaluate_any(exprs: list[str], ctx: dict[str, Any]) -> bool:
    return any(evaluate(x, ctx) for x in exprs)


def _split_top_level_and(s: str) -> list[str]:
    # Naive: respect [...] list literals
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        if depth == 0 and s[i:i+5].lower() == " and ":
            parts.append("".join(cur).strip())
            cur = []
            i += 5
            continue
        cur.append(ch)
        i += 1
    if cur:
        parts.append("".join(cur).strip())
    return parts


def _parse_list(literal: str) -> list[Any]:
    m = _LIST_RE.match(literal.strip())
    if not m:
        return []
    inner = m.group(1).strip()
    if not inner:
        return []
    return [_coerce_literal(x.strip()) for x in inner.split(",")]


def _coerce_literal(s: str) -> Any:
    s = s.strip().strip("\"'")
    low = s.lower()
    if low in ("true", "yes"):
        return True
    if low in ("false", "no"):
        return False
    if low in ("null", "none"):
        return None
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s


def _normalize(v: Any) -> Any:
    if isinstance(v, str):
        return v.strip().lower()
    return v


def _truthy(v: Any) -> bool:
    if v is None or v is False:
        return False
    if isinstance(v, str) and v.strip().lower() in ("", "no", "false", "none", "null"):
        return False
    return bool(v)


# --------------------------------------------------------------------------- #
#  Window resolver                                                            #
# --------------------------------------------------------------------------- #

# Time slots anchored to a real human's day (wake 07, sleep 23 → defaults
# below). Slots are biology-aware, not vague: "morning_routine" is the
# 5-30 min after wake when a person is in the bathroom; "midday" is lunch
# protein + posture window; "pre_evening" is 4 hr before sleep so
# minoxidil dries before pillow contact.
#
# Old vague slots (am_open / am_active / midday / pm_active / pm_close /
# flexible) are kept as ALIASES that map onto the new anchors so existing
# docs render in sensible places without a mass rewrite. New blocks should
# prefer the named anchors.
_DEFAULT_WINDOWS: dict[str, tuple[str, str]] = {
    # --- New biology-anchored windows ---
    "morning_routine":   ("wake+0:05", "wake+0:30"),    # bathroom: skin AM, mewing, hair
    "post_routine":      ("wake+0:30", "wake+1:00"),    # supplements + breakfast
    "mid_morning":       ("wake+2:30", "wake+3:30"),    # one cue: posture / hydration
    "lunch":             ("wake+4:30", "wake+5:30"),    # protein + diet check
    "afternoon":         ("wake+7:00", "wake+8:30"),    # SPF reapply / posture reset
    "pre_evening":       ("sleep-4:00", "sleep-3:00"),  # evening minox (4hr dry-time)
    "workout":           ("sleep-3:30", "sleep-2:00"),  # late-afternoon strength window
    "post_workout":      ("sleep-2:00", "sleep-1:30"),  # protein hit + cooldown
    "pm_routine":        ("sleep-1:30", "sleep-0:45"),  # bathroom: skin PM, mewing
    "wind_down":         ("sleep-1:00", "sleep-0:15"),  # screens off, casein, magnesium

    # --- Legacy aliases (existing .md docs use these names) ---
    # am_open ≈ morning_routine; was 0:10-0:30, now slightly wider.
    "am_open":   ("wake+0:05", "wake+0:30"),
    # am_active ≈ post_routine (supplements + breakfast).
    "am_active": ("wake+0:30", "wake+1:30"),
    # midday ≈ lunch — split off the SPF reapply / afternoon reset
    # to its own slot via the new "afternoon" name where helpful.
    "midday":    ("wake+4:30", "wake+5:30"),
    # pm_active ≈ workout / post-workout window.
    "pm_active": ("sleep-3:30", "sleep-2:00"),
    # pm_close ≈ pm_routine (bathroom + bedtime stack).
    "pm_close":  ("sleep-1:30", "sleep-0:30"),
    # flexible — anywhere in the day, but avoid the dense morning/PM
    # windows so picker spreads it out.
    "flexible":  ("wake+1:30", "sleep-1:30"),
}


def parse_clock(s: str | None, default: str = "07:00") -> dtime:
    """Parse 'HH:MM' or 'H:MM' into datetime.time. Defaults on failure."""
    s = (s or default).strip()
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if not m:
        m = re.match(r"^(\d{1,2})$", s)
        if m:
            return dtime(int(m.group(1)), 0)
        s = default
        m = re.match(r"^(\d{1,2}):(\d{2})$", default)
    h, mm = int(m.group(1)), int(m.group(2))
    return dtime(max(0, min(23, h)), max(0, min(59, mm)))


def to_minutes(t: dtime) -> int:
    return t.hour * 60 + t.minute


def from_minutes(m: int) -> dtime:
    """Minutes-of-day → clock time, WRAPPING across midnight.

    A night-shift / very-late user has a waking window that crosses midnight
    (wake 14:00, sleep 05:00). Their "before bed" slot resolves to a minute
    PAST 1440 (e.g. 1650 == 27:30 == 3:30am next day). The old behaviour
    CLAMPED to 23:59, which silently stacked every post-midnight task at
    11:59pm. Wrapping (mod 1440) renders the true clock time instead:
    1650 → 03:30, -30 → 23:30. For day-schedule users nothing ever exceeds
    [0, 1439] in normal flow, so this is a no-op for them.
    """
    return dtime((int(m) % (24 * 60)) // 60, int(m) % 60)


def crosses_midnight(wake: dtime, sleep: dtime) -> bool:
    """True when the waking window wraps past midnight (sleep clock at or
    before wake clock on the 24h dial, e.g. wake 14:00 / sleep 05:00).

    Callers use this to switch ordering into "minutes-since-wake" space ONLY
    for genuinely overnight schedules; day-schedule users keep plain clock
    ordering, so their behaviour is provably unchanged.
    """
    return to_minutes(sleep) <= to_minutes(wake)


def order_minutes(clock_min: int, wake_min: int) -> int:
    """Minutes-since-wake (0..1439). Post-midnight times for a late sleeper
    sort AFTER pre-midnight ones; for a day-schedule user (every task between
    wake and a pre-midnight bedtime) this is a monotonic shift that preserves
    clock order. Pair with `crosses_midnight` to decide whether to use it."""
    return (int(clock_min) - int(wake_min)) % (24 * 60)


def resolve_window(
    window_name: str,
    *,
    wake: dtime,
    sleep: dtime,
    overrides: dict[str, list[str]] | None = None,
) -> tuple[int, int]:
    """Return (start_minute, end_minute) for a named window.

    Sleep can be < wake (e.g. wake 06:00, sleep 23:00) or > wake on
    the next-day clock (sleep 02:00 with wake 09:00). We normalize
    'sleep-X:YY' so that sleep is treated as "later in the same day"
    relative to wake.
    """
    overrides = overrides or {}
    spec = overrides.get(window_name) or _DEFAULT_WINDOWS.get(window_name)
    if not spec:
        # Unknown window → assume mid-waking.
        spec = ("wake+1:00", "sleep-1:00")

    start = _resolve_anchor(spec[0], wake=wake, sleep=sleep)
    end = _resolve_anchor(spec[1], wake=wake, sleep=sleep)
    if end < start:
        end = start + 30  # safety: keep window non-empty
    return start, end


def _resolve_anchor(expr: str, *, wake: dtime, sleep: dtime) -> int:
    """Parse 'wake+H:MM' or 'sleep-H:MM' into minutes-of-day."""
    e = expr.strip().lower()
    m = re.match(r"^(wake|sleep)\s*([+-])\s*(\d{1,2}):(\d{2})$", e)
    if not m:
        # Allow plain HH:MM clock literals as fallback.
        try:
            return to_minutes(parse_clock(e))
        except Exception:
            return to_minutes(wake) + 60

    base = to_minutes(wake) if m.group(1) == "wake" else _sleep_minutes(wake, sleep)
    delta_h, delta_m = int(m.group(3)), int(m.group(4))
    delta = delta_h * 60 + delta_m
    return base + delta if m.group(2) == "+" else base - delta


def _sleep_minutes(wake: dtime, sleep: dtime) -> int:
    """Sleep-time as minutes-of-day; if sleep clock < wake clock, treat
    sleep as next-day (so a later-in-day-than-wake number)."""
    s = to_minutes(sleep)
    w = to_minutes(wake)
    if s < w:
        s += 24 * 60
    return s


# --------------------------------------------------------------------------- #
#  User precise-timing anchors → window overrides                             #
# --------------------------------------------------------------------------- #
#
# Wake & sleep already drive every window (see _DEFAULT_WINDOWS). But two
# anchors are too crucial to leave derived: WHEN the user actually works out,
# and WHEN they get ready / shower in the morning. HeightMax + FitMax hang
# their whole sequence off the workout time; skin/hair AM routines hang off
# the get-ready time. When the user pins those explicitly we override the
# biology-default windows so EVERY module's tasks in those windows shift to
# the user's real day — across all active maxes at once.
#
# We only emit an override when the user gave a REAL clock time. Vague answers
# ("evening", "after work") return None and the biology defaults stand.

def clock_or_none(v: Any) -> str | None:
    """Return canonical 'HH:MM' (24h) if v is a real clock time, else None.

    Accepts '18:00', '6:00', '6:30 pm', '6 pm', '6pm', '06:30'. Rejects
    vague buckets like 'evening'/'after work' (→ None, defaults kept).
    """
    if v is None:
        return None
    s = str(v).strip().lower()
    if not s:
        return None
    # 24h H:MM / HH:MM
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if m:
        h, mm = int(m.group(1)), int(m.group(2))
        if 0 <= h <= 23 and 0 <= mm <= 59:
            return f"{h:02d}:{mm:02d}"
    # 12h with am/pm: '6pm', '6 pm', '6:30pm'
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", s)
    if m:
        h = int(m.group(1))
        mm = int(m.group(2) or 0)
        ap = m.group(3)
        if 1 <= h <= 12 and 0 <= mm <= 59:
            if ap == "pm" and h != 12:
                h += 12
            if ap == "am" and h == 12:
                h = 0
            return f"{h:02d}:{mm:02d}"
    return None


def _window_endpoint(win: Any, idx: int) -> str | None:
    """Pick endpoint `idx` (0=start, 1=end) of a [start, end] window of clock
    strings. Returns canonical 'HH:MM' or None when `win` isn't a usable
    2-element window. The planner sends windows positionally ordered (start is
    the earlier bedtime / earlier wake), so we never numerically re-sort — a
    bedtime range like ['23:00','01:00'] keeps 23:00 as the *earliest* sleep.
    """
    if not isinstance(win, (list, tuple)) or len(win) != 2:
        return None
    return clock_or_none(win[idx])


def schedulable_anchors(
    state: dict[str, Any] | None,
    *,
    default_wake: str = "07:00",
    default_sleep: str = "23:00",
) -> tuple[str, str]:
    """Derive the (wake, sleep) anchors the scheduler should build the day around.

    The planner lets the user give wake & sleep as a RANGE (a [start, end]
    window) or an exact time (a collapsed range). To fit looksmaxing into a
    real life *without forcing it*, we schedule only inside the window the user
    is GUARANTEED to be awake:

        morning floor   = LATEST wake    = wake_window[1]
        evening ceiling = EARLIEST sleep = sleep_window[0]

    so no routine is ever placed before the user is reliably up or after they
    might already be in bed. A collapsed range yields the same scalar the
    backend used before, so exact-time users see zero behaviour change.

    Falls back to the scalar wake_time/sleep_time (the window MIDPOINT the
    client also sends) when no window is present, then to the defaults. If the
    derived window is inverted or implausibly short (< 4h of guaranteed-awake
    time) the range is treated as malformed and we fall back to the midpoints.
    """
    if not isinstance(state, dict):
        return default_wake, default_sleep

    mid_wake = clock_or_none(state.get("wake_time")) or default_wake
    mid_sleep = clock_or_none(state.get("sleep_time")) or default_sleep

    wake = _window_endpoint(state.get("wake_window"), 1) or mid_wake
    sleep = _window_endpoint(state.get("sleep_window"), 0) or mid_sleep

    # Guard: a guaranteed-awake span under 4h means the range is malformed (or
    # a pathological per-weekday override) — fall back to the expected midpoints
    # so a bad range can never collapse the whole day.
    w = to_minutes(parse_clock(wake, default_wake))
    s = to_minutes(parse_clock(sleep, default_sleep))
    if s <= w:
        s += 24 * 60
    if s - w < 240:
        return mid_wake, mid_sleep
    return wake, sleep


def _shift_clock(hhmm: str, minutes: int) -> str:
    """Return 'HH:MM' shifted by `minutes` (clamped to 00:00-23:59)."""
    base = to_minutes(parse_clock(hhmm))
    return from_minutes(base + minutes).strftime("%H:%M")


# Maxes whose evening (`pm_active`) block is PHYSICAL TRAINING — for these the
# workout anchor also re-times that block (HeightMax's dead-hang / foam-roll,
# FitMax's form-check). For skin/hair the `pm_active` alias means evening
# *skincare*, which must stay anchored to sleep — so we never move it there.
_PHYSICAL_PM_MAXES = {"fitmax", "heightmax"}


def build_anchor_overrides(
    state: dict[str, Any], *, maxx_id: str | None = None
) -> dict[str, list[str]]:
    """Translate the user's precise timing answers into window overrides.

    Returns a mapping of window_name -> [start_anchor, end_anchor] suitable
    for `resolve_window(..., overrides=...)`. Only windows tied to a pinned
    anchor appear; everything else keeps its biology default.

    `maxx_id` lets us treat the overloaded legacy `pm_active` alias correctly:
    it's the workout block for physical maxes but evening skincare elsewhere.
    """
    out: dict[str, list[str]] = {}
    mid = (maxx_id or "").strip().lower()

    # --- Workout anchor — drives the strength/training window across maxes.
    # The planner now lets the user give workout as a WINDOW (a [start, end]
    # range to fit the session anywhere inside — true to "fit into a real life")
    # or, legacy, a single exact time. Prefer a real window when present and at
    # least 30 min wide; otherwise fall back to the single anchor expanded into a
    # 90-min block, so old data and exact-time users see zero behaviour change.
    win_lo = _window_endpoint(state.get("preferred_workout_window"), 0)
    win_hi = _window_endpoint(state.get("preferred_workout_window"), 1)
    workout = (
        clock_or_none(state.get("preferred_workout_time"))
        or clock_or_none(state.get("workout_time"))
        or clock_or_none(state.get("heightmax_workout_time"))
    )
    if win_lo and win_hi and (to_minutes(parse_clock(win_hi)) - to_minutes(parse_clock(win_lo))) >= 30:
        # Workout WINDOW — the engine drops the session into free time anywhere
        # in the user's range, with fuel just before and recovery just after.
        out["pre_evening"] = [_shift_clock(win_lo, -45), _shift_clock(win_lo, -15)]
        out["workout"] = [win_lo, win_hi]
        out["post_workout"] = [win_hi, _shift_clock(win_hi, 30)]
        if mid in _PHYSICAL_PM_MAXES:
            out["pm_active"] = [win_lo, win_hi]
    elif workout:
        # Pre-workout fuel / warm-up in the 45 min before the lift.
        out["pre_evening"] = [_shift_clock(workout, -45), _shift_clock(workout, -15)]
        out["workout"] = [workout, _shift_clock(workout, 90)]
        out["post_workout"] = [_shift_clock(workout, 90), _shift_clock(workout, 120)]
        # Only remap the overloaded evening alias for physical maxes — leaves
        # skin/hair evening actives on their sleep-anchored default.
        if mid in _PHYSICAL_PM_MAXES:
            out["pm_active"] = [workout, _shift_clock(workout, 90)]

    # --- Morning get-ready / shower anchor — drives the AM bathroom routine.
    get_ready = (
        clock_or_none(state.get("get_ready_time"))
        or clock_or_none(state.get("shower_time"))
    )
    if get_ready:
        out["morning_routine"] = [get_ready, _shift_clock(get_ready, 25)]
        out["am_open"] = [get_ready, _shift_clock(get_ready, 25)]    # legacy alias
        out["post_routine"] = [_shift_clock(get_ready, 25), _shift_clock(get_ready, 55)]
        out["am_active"] = [_shift_clock(get_ready, 25), _shift_clock(get_ready, 75)]  # legacy alias

    return out
