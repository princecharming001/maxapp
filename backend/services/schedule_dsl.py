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
    field contains value   (membership: value in a list field, or substring
                            of a string field)
    expr_a and expr_b      (AND chains)
    expr_a or expr_b       (OR chains; lower precedence than AND, so
                            `a and b or c` parses as `(a and b) or c`)

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
# Strict numeric shapes. We match these instead of calling int()/float()
# directly because Python accepts underscores as digit separators
# (int("20_25") == 2025), which would silently mangle enum value keys like the
# body-fat bands 10_15 / 15_20 / 20_25 into integers and break comparisons
# against the stored string. Requiring an all-digits (optionally one dot) shape
# keeps those enum tokens as strings.
_INT_RE = re.compile(r"^-?\d+$")
_FLOAT_RE = re.compile(r"^-?\d*\.\d+$")


def evaluate(expr: str, ctx: dict[str, Any]) -> bool:
    """Evaluate one expression against ctx. Returns False on parse errors
    (with a log) — never raises during scheduling."""
    if not expr:
        return False
    e = expr.strip()
    if e.lower() == "always":
        return True

    # OR chain — lowest precedence, so split it FIRST. `a and b or c` becomes
    # `(a and b) or c`. Any true disjunct wins.
    or_parts = _split_top_level(e, " or ")
    if len(or_parts) > 1:
        return any(evaluate(part, ctx) for part in or_parts)

    # AND chain
    and_parts = _split_top_level(e, " and ")
    if len(and_parts) > 1:
        return all(evaluate(part, ctx) for part in and_parts)

    # in / not in
    m = re.match(r"^(\w[\w\.]*)\s+(not\s+in|in)\s+(\[.*\])$", e)
    if m:
        field, op, list_lit = m.group(1), m.group(2).strip(), m.group(3)
        values = [_normalize(v) for v in _parse_list(list_lit)]
        actual = _normalize(ctx.get(field))
        in_list = actual in values
        return (in_list if op == "in" else not in_list)

    # membership: `field contains value`. Field may be a list (membership)
    # or a string (substring). Used for multi-select fields like
    # injury_history where one answer can hold several tags.
    m = re.match(r"^(\w[\w\.]*)\s+contains\s+(.+)$", e)
    if m:
        field, raw_val = m.group(1), m.group(2).strip()
        target = _coerce_literal(raw_val)
        actual = ctx.get(field)
        if isinstance(actual, (list, tuple, set)):
            return _normalize(target) in [_normalize(x) for x in actual]
        if isinstance(actual, str):
            return _normalize(str(target)) in _normalize(actual)
        return False

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


def _expr_fields(expr: str) -> set[str]:
    """Return the set of context field ids one expression READS. Mirrors
    `evaluate`'s grammar exactly (OR/AND split, in/not in, contains,
    comparison, negation, bare truthiness). The right-hand side of a
    comparison is a literal, never a field, so only the left token counts.

    Used to decide whether a task/block is safe to schedule before we know
    a given answer: if a condition reads a field we haven't collected yet,
    its result isn't trustworthy, so the caller can exclude it.
    """
    e = (expr or "").strip()
    if not e or e.lower() == "always":
        return set()

    or_parts = _split_top_level(e, " or ")
    if len(or_parts) > 1:
        out: set[str] = set()
        for p in or_parts:
            out |= _expr_fields(p)
        return out

    and_parts = _split_top_level(e, " and ")
    if len(and_parts) > 1:
        out = set()
        for p in and_parts:
            out |= _expr_fields(p)
        return out

    m = re.match(r"^(\w[\w\.]*)\s+(?:not\s+in|in)\s+\[.*\]$", e)
    if m:
        return {m.group(1)}
    m = re.match(r"^(\w[\w\.]*)\s+contains\s+.+$", e)
    if m:
        return {m.group(1)}
    m = re.match(r"^(\w[\w\.]*)\s*(?:==|!=|<=|>=|<|>)\s*.+$", e)
    if m:
        return {m.group(1)}
    if e.startswith("!"):
        f = e[1:].strip()
        return {f} if re.match(r"^\w[\w\.]*$", f) else set()
    if re.match(r"^\w[\w\.]*$", e):
        return {e}
    return set()


def referenced_fields(exprs: list[str] | None) -> set[str]:
    """Union of every context field id read across a list of expressions."""
    out: set[str] = set()
    for expr in exprs or []:
        out |= _expr_fields(expr)
    return out


def _split_top_level(s: str, sep: str) -> list[str]:
    """Split `s` on `sep` only at bracket-depth 0, so list literals like
    `[a, b]` are never broken apart. `sep` includes its surrounding spaces
    (e.g. ' and ', ' or '). Returns [s] when the separator never appears at
    the top level."""
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    i = 0
    n = len(sep)
    sep_l = sep.lower()
    while i < len(s):
        ch = s[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        if depth == 0 and s[i:i + n].lower() == sep_l:
            parts.append("".join(cur).strip())
            cur = []
            i += n
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
    # Numbers ONLY for a clean integer/float shape (see _INT_RE/_FLOAT_RE).
    # Tokens like the body-fat bands 10_15 / 20_25 stay strings so they compare
    # against the stored enum value rather than becoming 1015 / 2025.
    if _INT_RE.match(s):
        return int(s)
    if _FLOAT_RE.match(s):
        return float(s)
    return s


def _normalize(v: Any) -> Any:
    """Canonicalize a value for equality / membership tests.

    Strings are stripped + lowercased. An unset field (None), an empty
    string, and the literal tokens 'none'/'null' all collapse to the single
    sentinel "none". This is the key to the `none` enum value: docs write
    `field == none` to mean "they picked the 'none' choice" (e.g. no routine,
    no current treatment, healthy spine, no workouts). _coerce_literal turns
    the bare token `none` into Python None, and this is where it rejoins the
    stored string "none" so the comparison actually matches — for both an
    explicit "none" answer AND an unanswered field, which mean the same thing.
    """
    if v is None:
        return "none"
    if isinstance(v, str):
        s = v.strip().lower()
        return "none" if s in ("", "null") else s
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
    # Bedtime = the END of the wind-down window when the user gave one (the new
    # routine-window model); else the legacy conservative earliest-sleep edge of
    # a sleep_window range; else the midpoint scalar.
    sleep = (
        _window_endpoint(state.get("wind_down_window"), 1)
        or _window_endpoint(state.get("sleep_window"), 0)
        or mid_sleep
    )

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


# How long the user takes to get ready in the morning, in minutes. Sizes the
# AM `morning_routine` block (see build_anchor_overrides). Default matches the
# historical hard-coded 25-min block so users who never answer see no change;
# real answers are clamped to a sane band.
_DEFAULT_GET_READY_MIN = 25
_MIN_GET_READY_MIN = 10
_MAX_GET_READY_MIN = 90


def _get_ready_minutes(state: dict[str, Any]) -> int:
    """Clamp the user's stated get-ready duration to [10, 90]; default 25.

    Accepts an int or a numeric string. Anything missing/unparseable falls back
    to the biology default so the morning block keeps its prior 25-min size."""
    v = state.get("get_ready_minutes")
    if v is None or (isinstance(v, str) and not v.strip()):
        return _DEFAULT_GET_READY_MIN
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return _DEFAULT_GET_READY_MIN
    return max(_MIN_GET_READY_MIN, min(_MAX_GET_READY_MIN, n))


def _wake_plus(minutes: int) -> str:
    """Format a wake-relative anchor expression, e.g. 65 -> 'wake+1:05'."""
    minutes = max(0, minutes)
    return f"wake+{minutes // 60}:{minutes % 60:02d}"


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
    # The DURATION (how long the user takes to get ready) sizes the bathroom
    # block and pushes everything after it — supplements/breakfast (post_routine)
    # and the AM-active window — later by the same amount. So someone who needs
    # an hour to get ready gets a roomier morning instead of a crammed one.
    #
    #   morning_routine = [start,          start + dur]          (AM skin/hair/mewing)
    #   post_routine    = [start + dur,    start + dur + 30]     (supplements + breakfast)
    #   am_active       = [start + dur,    start + dur + 50]     (legacy alias, wider)
    #
    # When the user PINNED a get-ready clock time, `start` is that time. When
    # they only chose a duration (left the time on Auto), we keep the biology
    # default start (wake + 5 min) and just resize the wake-anchored block — so
    # changing the duration still re-shapes the schedule either way.
    # Prefer an explicit get-ready WINDOW (the routine-window model); its width
    # is the duration. Fall back to the legacy pinned time + duration.
    gr_lo = _window_endpoint(state.get("get_ready_window"), 0)
    gr_hi = _window_endpoint(state.get("get_ready_window"), 1)
    if gr_lo and gr_hi and to_minutes(parse_clock(gr_hi)) > to_minutes(parse_clock(gr_lo)):
        get_ready = gr_lo
        dur = to_minutes(parse_clock(gr_hi)) - to_minutes(parse_clock(gr_lo))
    else:
        dur = _get_ready_minutes(state)
        get_ready = (
            clock_or_none(state.get("get_ready_time"))
            or clock_or_none(state.get("shower_time"))
        )
    if get_ready:
        out["morning_routine"] = [get_ready, _shift_clock(get_ready, dur)]
        out["am_open"] = [get_ready, _shift_clock(get_ready, dur)]    # legacy alias
        out["post_routine"] = [_shift_clock(get_ready, dur), _shift_clock(get_ready, dur + 30)]
        out["am_active"] = [_shift_clock(get_ready, dur), _shift_clock(get_ready, dur + 50)]  # legacy alias
    elif dur != _DEFAULT_GET_READY_MIN:
        # No pinned time, but a non-default duration → resize the wake-anchored
        # default morning block (start = wake+5) and shift the rest down.
        head = 5
        out["morning_routine"] = [_wake_plus(head), _wake_plus(head + dur)]
        out["am_open"] = [_wake_plus(head), _wake_plus(head + dur)]
        out["post_routine"] = [_wake_plus(head + dur), _wake_plus(head + dur + 30)]
        out["am_active"] = [_wake_plus(head + dur), _wake_plus(head + dur + 50)]

    # --- Wind-down / nighttime routine WINDOW — the PM routine (skin PM, shower,
    # winding down) spans the user's chosen window instead of a fixed hour before
    # bed. Bedtime is the window's end. For skin/hair maxes the evening-skincare
    # alias (pm_active) lands inside it too; physical maxes keep pm_active on the
    # workout block (handled above).
    wd_lo = _window_endpoint(state.get("wind_down_window"), 0)
    wd_hi = _window_endpoint(state.get("wind_down_window"), 1)
    if wd_lo and wd_hi and (to_minutes(parse_clock(wd_hi)) - to_minutes(parse_clock(wd_lo))) >= 15:
        # pm_close is the slot the PM bathroom/skincare blocks ACTUALLY use
        # across maxes (skin PM, minox PM, product rinse); pm_routine/wind_down
        # are the newer names. Write all of them so the routine lands in the
        # user's window whatever the doc calls it.
        out["wind_down"] = [wd_lo, wd_hi]
        out["pm_routine"] = [wd_lo, wd_hi]
        out["pm_close"] = [wd_lo, wd_hi]
        # Evening skincare actives (microneedle, deep-condition) also live in the
        # wind-down window for skin/hair; physical maxes keep pm_active on the
        # workout block (set above).
        if mid not in _PHYSICAL_PM_MAXES:
            out["pm_active"] = [wd_lo, wd_hi]

    return out
