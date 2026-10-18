"""Deterministic placement for AI-program plans (the weekly habit template).

Claude decides WHAT a person does and roughly WHEN. This module makes the
template fit that person's real day, with the same rules everywhere a plan is
touched (create, redo, Suppmax sync, wake/bed change, regeneration), so a plan
never comes out different just because a different path wrote it:

  * minutes: library minimum for each habit (no 2-minute deep-work blocks);
    0-minute "rules" (caffeine cutoff, fixed wake) show as 1 minute and never
    count against the time budget
  * one program per idea: a habit another active program already covers
    (morning light, desk breaks, strength…) is dropped
  * week 1 stays easy: at most 3 habits per program (Suppmax: synced picks +
    2 own; Peptidemax: dose reminders + 3)
  * the person's daily minutes are shared across the whole stack, per day
    (a fair water-fill: light programs leave their unused share to heavy
    ones); 1-minute reminders and 0-minute rules are free
  * at most TASK_CAP visible tasks on any weekday across all programs
  * hard sessions never on back-to-back days (across programs)
  * every time sits inside that day's waking window (weekday vs weekend),
    obeys the doc rule for its kind (light within an hour of waking, wind-down
    30-60 min before bed, caffeine cutoff 8h before bed, workouts done 2h
    before bed, naps 7h before bed), stays clear of work / commute / meals
    unless it is naturally done there, never overlaps another task and starts
    5+ minutes from every other task in the stack; meal habits (protein at
    breakfast, veg first, a supplement with dinner) sit AT that meal
  * when wake/bed change, wake-anchored habits move with wake and bed-anchored
    ones with bed (the template remembers the day it was fitted for)

Pure: no I/O, no LLM. Running it on its own output with the same inputs
changes nothing (that is what keeps regeneration drift-free).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any, Optional

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKEND = ("sat", "sun")
GAP = 5                 # minutes between task starts across the whole stack
TASK_CAP = 10           # visible tasks on one day, all programs together
MEAL_MIN = 30           # assumed meal length

HARD = {"strength_full_body", "strength_2x", "vigorous_intervals", "resistance_training"}
WORKOUT = HARD | {"zone2_cardio", "move_it_out"}

# One idea, one program. Order within the stack decides who keeps it (the
# program that already has it).
CONCEPT_GROUPS: list[set[str]] = [
    {"morning_light"},
    {"caffeine_cutoff"},
    {"fixed_wake_time", "sleep_regularity"},
    {"zone2_cardio"},
    {"daily_steps"},
    {"balance_drill", "balance_practice"},
    {"screens_off", "screen_free_evening"},
    {"strength_full_body", "strength_2x", "resistance_training"},
    {"long_walk_weekend", "weekly_long_walk"},
    {"brain_dump", "worry_list"},
    {"move_after_sitting", "movement_snack", "posture_break", "micro_break", "stair_snack", "stair_or_burst"},
    {"protein_each_meal", "protein_at_meals", "protein_first_meal"},
    {"outdoor_walk", "nature_time", "walk_to_think"},
]
_GROUP_OF = {h: i for i, g in enumerate(CONCEPT_GROUPS) for h in g}

# Allowed inside work hours by nature (structure the work itself / a desk break).
WORK_NATIVE = {"top_three_plan", "deep_work_block", "phone_away", "batch_inbox", "single_tab_rule",
               "meeting_free_block", "shutdown_ritual", "micro_break", "movement_snack", "posture_break",
               "move_after_sitting", "stair_snack", "stair_or_burst", "physiological_sigh", "caffeine_for_focus"}
TIER_RANK = {"core": 0, "medium": 1, "hard": 2}


def to_min(hm: Any, default: Optional[int] = None) -> Optional[int]:
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(hm or "").strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else default


def hhmm(m: int) -> str:
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# ── the person's day ─────────────────────────────────────────────────────────

@dataclass
class Day:
    wake: int
    bed: int                                   # > wake (past-midnight bed is +1440)
    busy: list[tuple[str, int, int]] = field(default_factory=list)   # (kind, start, end)
    work: Optional[tuple[int, int]] = None
    wind: Optional[int] = None                 # start of the wind-down window the person set


def _frame(m: int, wake: int) -> int:
    """Put a clock time on the wake-anchored frame (after-midnight → +1440)."""
    return m + 1440 if m < wake else m


def _ob_days(o: dict) -> set[str]:
    """The weekdays a commitment covers."""
    days = o.get("days")
    if isinstance(days, (list, tuple)):
        out = {str(x).lower()[:3] for x in days}
        return {d for d in out if d in WEEKDAYS} or set(WEEKDAYS[:5])
    s = str(days or "weekdays").lower()
    if s in ("weekends", "weekend"):
        return set(WEEKEND)
    if s in ("everyday", "every day", "daily", "all", "all days"):
        return set(WEEKDAYS)
    return set(WEEKDAYS[:5])


def _frame_block(s: int, e: int, w: int) -> tuple[int, int]:
    """A commitment on the wake-anchored frame. Only a block that ends before
    waking belongs to the coming night; one that starts before waking but runs
    into the day (Work 9-5 for someone who said they wake at 10) is today's.
    (Framing each end separately pushed that work block to tomorrow, so every
    morning habit was scheduled inside work hours.)"""
    if e <= s:
        e += 1440
    if e <= w:
        s, e = s + 1440, e + 1440
    return s, e


def day_models(profile: dict) -> dict[str, Day]:
    """'weekday' and 'weekend' day models from build_profile output."""
    wake = to_min(profile.get("wake_time"), 7 * 60)
    bed = to_min(profile.get("bed_time"), 23 * 60)
    sat = (profile.get("weekly_timings") or {}).get("saturday") or {}
    shift = 60 if profile.get("weekend_shift") else 0
    wk_wake = to_min(sat.get("wake_time"), wake + shift)
    wk_bed = to_min(sat.get("sleep_time"), bed + shift)
    meals = profile.get("meals") or {}

    def model(w: int, b: int, weekend: bool) -> Day:
        b = b if b > w else b + 1440
        delta = (w - wake) if weekend else 0
        busy: list[tuple[str, int, int]] = []
        work = None
        for o in profile.get("obligations") or []:
            if not isinstance(o, dict):
                continue
            # a weekday model holds every commitment on any weekday (a Mon/Wed
            # class is avoided on all weekdays: the template has one weekday time)
            if not (_ob_days(o) & (set(WEEKEND) if weekend else set(WEEKDAYS[:5]))):
                continue
            s, e = to_min(o.get("start")), to_min(o.get("end"))
            if s is None or e is None:
                continue
            s, e = _frame_block(s, e, w)
            kind = "commute" if "commute" in str(o.get("label", "")).lower() else "work"
            busy.append((kind, s, e))
            if kind == "work" and (work is None or e - s > work[1] - work[0]):
                work = (s, e)
        for meal in ("breakfast", "lunch", "dinner"):
            t = to_min(meals.get(meal))
            if t is not None:
                tf = _frame(t, w)
                if tf + MEAL_MIN > b and delta:      # a slept-in weekend moves meals too
                    tf = _frame((t + delta) % 1440, w)
                if tf + MEAL_MIN <= b:
                    busy.append((meal, tf, tf + MEAL_MIN))
        wind = None
        wdw = profile.get("wind_down_window")
        if isinstance(wdw, (list, tuple)) and len(wdw) == 2 and to_min(wdw[0]) is not None:
            ws = _frame(to_min(wdw[0]), w) + ((b - bed_f) if weekend else 0)
            if w + 60 <= ws < b:
                wind = ws
        return Day(wake=w, bed=b, busy=busy, work=work, wind=wind)

    bed_f = bed if bed > wake else bed + 1440
    return {"weekday": model(wake, bed, False), "weekend": model(wk_wake, wk_bed, True)}


def fit_signature(models: dict[str, Day]) -> dict:
    return {k: [hhmm(m.wake), hhmm(m.bed)] for k, m in models.items()}


# ── habit knowledge ─────────────────────────────────────────────────────────

MEALS = ("breakfast", "lunch", "dinner")
# Habits whose whole point is a meal, even when the library anchor reads
# otherwise ("protein at your first meal" is anchored get_ready/before_work).
MEAL_HABITS = {
    "protein_first_meal": ["breakfast"],
    "protein_each_meal": ["breakfast", "lunch", "dinner"],
    "protein_at_meals": ["breakfast", "lunch", "dinner"],
    "fiber_swap": ["breakfast", "lunch", "dinner"],
}


def _bkind(k: str) -> str:
    return "meal" if k in MEALS else k


@dataclass
class HabitInfo:
    rule: bool
    minutes_min: int
    tier: str
    anchor: str
    kind: str = "action"
    order: str = ""
    after: str = ""


def info(hid: str, lib: dict) -> HabitInfo:
    h = lib.get(hid)
    if h is None:      # custom_ habit (user asked for it) or unknown
        return HabitInfo(rule=False, minutes_min=1, tier="core", anchor="")
    rule = getattr(h, "is_rule", h.minutes_min == 0 and h.minutes_default == 0)
    return HabitInfo(rule=bool(rule), minutes_min=max(1, h.minutes_min),
                     tier=h.tier or "core", anchor=(h.anchor or "").lower(),
                     kind=getattr(h, "habit_kind", "rule" if rule else "action"),
                     order=getattr(h, "order", "") or "", after=getattr(h, "after", "") or "")


def meals_for(hid: str, inf: HabitInfo) -> list[str]:
    """The meals a habit belongs to ([] = not a meal habit). Only anchors that
    name nothing BUT meals count ("lunch and dinner" yes; "lunch, after_work or
    weekend" no — that one is just allowed at lunch)."""
    if hid in MEAL_HABITS:
        return MEAL_HABITS[hid]
    head = inf.anchor.split("(")[0]
    parts = [x.strip() for x in re.split(r",|\bor\b|\band\b", head) if x.strip()]
    if not parts or not all(re.fullmatch(r"(breakfast|lunch|dinner|meals?|each meal|with a meal)", x) for x in parts):
        return []
    named = [m for m in MEALS if m in head]
    return named or list(MEALS)


def skips_breakfast(profile: dict) -> bool:
    """Their first meal is lunch: coffee only / eats later (Energymax quiz), or
    no breakfast in their day."""
    style = str(((profile or {}).get("about") or {}).get("first_meal_style") or "").lower()
    meals = (profile or {}).get("meals") or {}
    return bool(re.search(r"coffee only|later in the day|skip", style)) or (bool(meals) and not meals.get("breakfast"))


def supp_meals(hid: str, inf: HabitInfo) -> list[str]:
    """Meals a supplement can be taken with: any meal its timing names
    ('breakfast or the coffee before the focus block', 'workout (or breakfast
    on rest days)'), so picks can share one slot."""
    return meals_for(hid, inf) or [m for m in MEALS if m in inf.anchor]


CAFFEINATED = ("caffeine_theanine", "caffeine_for_focus", "coffee", "pre_workout")


def caffeinated(hid: str) -> bool:
    return hid != "caffeine_cutoff" and any(k in hid for k in CAFFEINATED)


def kind_of(hid: str, inf: HabitInfo) -> str:
    a = inf.anchor
    if hid == "caffeine_cutoff":
        return "caffeine"
    if hid in ("screens_off", "screen_free_evening"):
        return "screens_off"
    if hid == "wind_down":
        return "wind_down"
    if hid in ("melatonin", "glycine", "pm_retinoid") or a.startswith("pre_bed"):
        return "pre_bed"
    if a.startswith("wind_down"):
        return "evening"
    if hid in WORKOUT:
        return "workout"
    if hid == "nap_rule":
        return "nap"
    if hid in ("fixed_wake_time", "sleep_regularity"):
        return "wake_exact"
    if a.startswith("wake") or hid in ("morning_light", "water_on_waking", "sleep_log"):
        return "wake"
    if hid == "post_meal_walk":
        return "after_meal"           # after the meal ends, not at its first bite
    if meals_for(hid, inf):
        return "meal"
    if a.startswith("get_ready"):
        return "get_ready"
    if hid == "top_three_plan":
        return "work_start"
    if hid == "shutdown_ritual":
        return "work_end"
    return "any"


SHIFTS_WITH_WAKE = {"wake", "wake_exact", "get_ready"}
SHIFTS_WITH_BED = {"wind_down", "screens_off", "pre_bed", "evening", "caffeine", "nap"}


def window(kind: str, dur: int, d: Day, *, weekday: bool) -> tuple[int, int]:
    """[lo, hi] for the START of a habit of this kind on day d (frame minutes).
    The wake minute itself is left to the wake-time habit."""
    w, b = d.wake, d.bed
    lo, hi = w, b - dur
    if kind == "wake_exact":
        return w, w
    if kind == "wake":
        return min(w + GAP, w + 60), min(w + 60, hi)
    if kind == "get_ready":
        return min(w + GAP, w + 90), min(w + 90, hi)
    if kind == "screens_off":
        # a boundary at (or before) the start of the wind-down, never after it
        s = d.wind if d.wind is not None else max(w, b - 60)
        return s, s
    if kind == "wind_down":
        if d.wind is not None:
            return d.wind, max(d.wind, min(d.wind + 15, b - 15 - dur))
        return max(w, b - 60), max(w, b - 30)
    if kind == "pre_bed":
        lo = d.wind if d.wind is not None else max(w, b - 60)
        return lo, max(lo, b - 15)
    if kind == "evening":
        return max(w, b - 120), max(w, b - 10)
    if kind == "caffeine":
        target = b - 480 if b - 480 >= w + 180 else b - 360
        return max(w, min(target, b - 360)), max(w, b - 360)
    if kind == "workout":
        return w, max(w, b - 120 - dur)
    if kind == "nap":
        return max(w + 300, w), max(w, b - 420 - dur)
    if kind == "work_start" and weekday and d.work:
        return d.work[0], d.work[0] + 15
    if kind == "work_end" and weekday and d.work:
        return max(d.work[0], d.work[1] - 10), d.work[1]
    # anything else: not on top of waking up, and the last half hour before
    # bed belongs to the wind-down (no step-goal reminder at 22:59)
    return min(w + 15, hi), max(min(w + 15, hi), b - 30 - dur)


def meal_windows(meals: list[str], dur: int, d: Day, pref: int) -> list[tuple[int, int, int]]:
    """(lo, hi, pref) inside each of the habit's meals on day d, nearest first."""
    out = []
    for k, s, e in d.busy:
        if k in meals:
            out.append((s, max(s, e - dur), s))
    return sorted(out, key=lambda x: abs(x[0] - pref))


def _why_here(kind: str, asked: int, d: Day, meals: list[str]) -> str:
    """Plain words for why a habit sits where it does (fed to the reply)."""
    if kind == "meal":
        return f"it goes with {meals[0] if meals else 'a meal'}"
    if kind == "after_meal":
        return "it starts right after a meal"
    if kind in ("wake", "wake_exact", "get_ready"):
        return "it belongs within an hour of waking"
    if kind == "wind_down":
        return "it starts when your wind-down starts"
    if kind == "screens_off":
        return "screens go away when your wind-down starts"
    if kind in ("pre_bed", "evening"):
        return "it belongs in the last hour or two before bed"
    if kind == "caffeine":
        return "caffeine has to stop at least 6 hours before bed"
    if kind == "workout":
        return "workouts finish at least 2 hours before bed"
    if kind == "work_start":
        return "it's the first thing when work starts"
    if kind == "work_end":
        return "it closes out the workday"
    for k, a, b in d.busy:
        if a <= asked < b:
            return f"that time is inside your {_bkind(k) if k not in MEALS else k}"
    if asked > d.bed - 30:
        return "the last half hour before bed is for winding down"
    return "another habit already has that slot"


def allowed_busy(hid: str, mid: str, inf: HabitInfo, dur: int) -> set[str]:
    """Which busy windows this habit may sit inside."""
    if inf.rule:
        return {"work", "meal", "commute"}
    out: set[str] = set()
    a = inf.anchor
    if hid in WORK_NATIVE or re.search(r"work_break|within work|work hours|deep-work|start of deep", a):
        out.add("work")
    if mid == "suppmax" and dur <= 2:
        out |= {"work", "meal"}
    if hid != "post_meal_walk" and re.search(r"lunch|dinner|breakfast|meal", a):
        out.add("meal")
    if meals_for(hid, inf):
        out |= {"meal", "work", "commute"}   # the meal is when they eat, wherever they are
    if "commute" in a:
        out.add("commute")
    return out


# ── fit ──────────────────────────────────────────────────────────────────────

@dataclass
class Taken:
    start: int
    dur: int
    days: set
    hid: str = ""


def _near(t: int, d: Day) -> int:
    """Put a clock time on day d's frame, on whichever side of the night it is
    closest to the waking window (06:00 on a 09:00-wake weekend is 'early
    morning', not 'after midnight')."""
    best = None
    for c in (t, t + 1440, t - 1440):
        dist = 0 if d.wake <= c <= d.bed else min(abs(c - d.wake), abs(c - d.bed))
        if best is None or dist < best[0]:
            best = (dist, c)
    return best[1]


def _occupied(others: dict[str, dict], models: dict[str, Day]) -> dict[str, list[Taken]]:
    """Other programs' tasks per model key."""
    out: dict[str, list[Taken]] = {"weekday": [], "weekend": []}
    for tmpl in (others or {}).values():
        for h in (tmpl or {}).get("habits") or []:
            if h.get("kind") == "rule":
                continue            # a boundary line takes no time and no slot
            days = set(h.get("days") or [])
            dur = int(h.get("minutes") or 1)
            hid = str(h.get("habit_id") or "")
            wkd, wke = days - set(WEEKEND), days & set(WEEKEND)
            t = to_min(h.get("time"))
            if wkd and t is not None:
                out["weekday"].append(Taken(_near(t, models["weekday"]), dur, wkd, hid))
            te = to_min(h.get("weekend_time")) if h.get("weekend_time") else t
            if wke and te is not None:
                out["weekend"].append(Taken(_near(te, models["weekend"]), dur, wke, hid))
    return out


def _free(s: int, dur: int, days: set, d: Day, taken: list[Taken], allowed: set[str]) -> bool:
    for kind, a, b in d.busy:
        if _bkind(kind) not in allowed and s < b and s + dur > a:
            return False
    for t in taken:
        if not (t.days & days):
            continue
        if abs(t.start - s) < GAP:
            return False
        if s < t.start + t.dur and t.start < s + dur:      # never inside another task
            return False
    return True


def _place(pref: int, lo: int, hi: int, dur: int, days: set, d: Day, taken: list[Taken],
           allowed: set[str]) -> Optional[int]:
    """Free start in [lo, hi] nearest pref (round 5-minute times first)."""
    if hi < lo:
        return None
    pref = min(max(pref, lo), hi)
    if _free(pref, dur, days, d, taken, allowed):
        return pref
    base = pref - pref % 5
    for step in (5, 1):
        for k in range(0, (hi - lo) // step + 2):
            for cand in ((base + k * step, base - k * step) if k else (base,)):
                if lo <= cand <= hi and _free(cand, dur, days, d, taken, allowed):
                    return cand
    return None


def _spread_hard(days: list[str], n: int, blocked: set[str]) -> Optional[list[str]]:
    """n non-adjacent weekdays (cyclic), none on/next to `blocked`, closest to `days`."""
    def adjacent(a: str, b: str) -> bool:
        i, j = WEEKDAYS.index(a), WEEKDAYS.index(b)
        return abs(i - j) in (1, 6)
    for k in range(n, 0, -1):
        best = None
        for combo in combinations(WEEKDAYS, k):
            if any(adjacent(a, b) for a, b in combinations(combo, 2)):
                continue
            if any(c in blocked or any(adjacent(c, x) for x in blocked) for c in combo):
                continue
            score = (len(set(combo) & set(days)), [-WEEKDAYS.index(c) for c in combo])
            if best is None or score > best[0]:
                best = (score, list(combo))
        if best:
            return best[1]
    return None


def cost(h: dict) -> int:
    """Minutes a habit takes out of the day. 1-minute reminders and 0-minute
    rules (take a capsule with breakfast, last coffee by 2pm) are free."""
    try:
        m = int(h.get("minutes") or 1)
    except (TypeError, ValueError):
        return 0
    return m if m >= 2 else 0


def day_load(habits: list[dict], day: str) -> int:
    return sum(cost(h) for h in habits or [] if day in (h.get("days") or []))


SUPP = "suppmax"


def day_count(tmpl: dict, day: str, *, supp: bool = False) -> int:
    """Visible tasks a program puts on a day. Suppmax picks taken together at
    the same time show as one task ("Creatine + Vitamin D3")."""
    hs = [h for h in (tmpl or {}).get("habits") or []
          if day in (h.get("days") or []) and h.get("kind") != "rule"]
    if supp:
        key = "weekend_time" if day in WEEKEND else "time"
        return len({(h.get(key) or h.get("time") or h.get("habit_id")) for h in hs})
    return len(hs)


def _free_fallback(lib: dict, others: dict, *, exclude: set) -> Optional[dict]:
    """The program's best habit that costs no time (a rule or a 1-minute
    reminder) and that no other program already covers."""
    taken = {_GROUP_OF.get(oh.get("habit_id")) for t in others.values()
             for oh in (t or {}).get("habits") or []} - {None}
    for hid, hd in lib.items():
        inf = info(hid, lib)
        if inf.tier != "core" or inf.minutes_min > 1 or hid in exclude:
            continue
        if _GROUP_OF.get(hid) in taken:
            continue
        return {"habit_id": hid, "title": getattr(hd, "title", hid), "how": getattr(hd, "how", ""),
                "why": getattr(hd, "why", ""), "minutes": 1, "time": "", "weekend_time": "",
                "days": list(WEEKDAYS), "_i": 999}
    return None


def _fold_supp_rows(placed: list[dict], lib: dict, allow: int) -> None:
    """A crowded day leaves Suppmax only a couple of rows: picks without a
    fixed timing (L-theanine, electrolytes) are taken with the nearest stack it
    already has (breakfast, pre-bed) instead of adding their own reminder."""
    allow = max(2, allow)

    def rows() -> set:
        return {h["time"] for h in placed}
    fixed = [h for h in placed if kind_of(h["habit_id"], info(h["habit_id"], lib)) != "any"
             or supp_meals(h["habit_id"], info(h["habit_id"], lib))]
    flexible = sorted((h for h in placed if h not in fixed), key=lambda h: -int(h.get("_i", h.get("priority", 0)) or 0))
    # one (weekday, weekend) slot per stack; the weekend time comes from a pick
    # that actually runs on weekends (a Tue/Thu pick's "" is not a weekend time)
    wk_of: dict[str, str] = {}
    for h in fixed:
        if set(h.get("days") or []) & set(WEEKEND):
            wk_of.setdefault(h["time"], h.get("weekend_time") or "")
    anchors = sorted({(h["time"], wk_of.get(h["time"], "")) for h in fixed}, key=lambda x: to_min(x[0], 0))
    if not anchors:
        return
    for h in flexible:
        t = to_min(h["time"], 0)
        best = min(anchors, key=lambda a: abs(to_min(a[0], 0) - t))
        # right next to a stack: just take it with that stack
        if abs(to_min(best[0], 0) - t) <= 30 or len(rows()) > allow:
            h["time"], h["weekend_time"] = best


def _unify_supp_weekends(placed: list[dict], models: dict[str, "Day"]) -> None:
    """Picks taken together on weekdays are taken together on weekends too:
    one weekend time per stack (the earliest any member has), so a stack is
    one row every day and a re-fit lands in the same place."""
    groups: dict[str, list[dict]] = {}
    for h in placed:
        groups.setdefault(h["time"], []).append(h)
    wk = models["weekend"]
    for t, hs in groups.items():
        if len(hs) < 2:
            continue
        # only picks that run on weekends have a (placed, valid) weekend time
        ends = [h.get("weekend_time") or t for h in hs if set(h.get("days") or []) & set(WEEKEND)]
        if not ends:
            continue
        best = min(ends, key=lambda x: _near(to_min(x, 0), wk))
        for h in hs:
            h["weekend_time"] = best if best != t else ""


def share_of_day(budget: int, other_loads: list[int]) -> float:
    """This program's fair share of `budget` minutes given the other programs'
    loads that day (water-fill: a program using less than an even split leaves
    the rest to the others; nobody is starved by whoever was added first)."""
    left, n = float(budget), len(other_loads) + 1
    for k, load in enumerate(sorted(other_loads)):
        share = left / (n - k)
        left -= min(load, share)
    return max(0.0, left)


def allowance(budget: int, others: dict[str, dict]) -> dict[str, float]:
    return {d: share_of_day(budget, [day_load((t or {}).get("habits"), d) for t in others.values()])
            for d in WEEKDAYS}


def fit(maxx_id: str, habits: list[dict], profile: dict, lib: dict, *,
        others: Optional[dict[str, dict]] = None, prev_fit: Optional[dict] = None,
        keep_ids: Optional[set[str]] = None, cap_habits: Optional[int] = None,
        parked: Optional[list[dict]] = None, parked_out: Optional[list[dict]] = None,
        ) -> tuple[list[dict], list[str]]:
    """Fit a program's habits into the day. Returns (habits, notes) where notes
    say what was dropped or trimmed and why (empty when nothing changed).

    `parked` are habits this program set aside earlier because another program
    covered the same idea; they come back (lowest priority) once that program
    is gone. Habits set aside now, or still waiting, are appended to
    `parked_out`."""
    others = {k: v for k, v in (others or {}).items() if k != maxx_id}
    keep_ids = set(keep_ids or set())
    notes: list[str] = []
    models = day_models(profile)
    budget_total = int(profile.get("minutes_per_day_total") or 25)
    hs = [dict(h) for h in habits if h.get("habit_id")]
    for i, h in enumerate(hs):           # Claude lists habits most important first;
        try:                             # a stored plan remembers that order
            h["_i"] = int(h["priority"]) if h.get("priority") is not None else i
        except (TypeError, ValueError):
            h["_i"] = i
    have = {h["habit_id"] for h in hs}
    for p in parked or []:
        if p.get("habit_id") and p["habit_id"] not in have:
            hs.append({**p, "_parked": True, "_i": 1000 + len(hs)})
            have.add(p["habit_id"])
    waiting: list[dict] = []

    # minutes: library floor; rules are boundaries (0 min, nothing to tick)
    for h in hs:
        inf = info(h["habit_id"], lib)
        h["kind"] = "rule" if inf.rule else (h.get("kind") if h["habit_id"].startswith("custom_") and h.get("kind")
                                             else inf.kind if inf.kind != "rule" else "action")
        m = int(h.get("minutes") or 0)
        h["minutes"] = 0 if inf.rule else max(inf.minutes_min, min(90, m or inf.minutes_min))

    def protected(h: dict) -> bool:
        return h["habit_id"] in keep_ids or h["habit_id"].startswith("custom_")

    def rank(h: dict) -> tuple:
        # protected first, then the person's own priorities (Claude's order),
        # with the doc's "hard" tier last
        inf = info(h["habit_id"], lib)
        return (0 if protected(h) else 2 if h.get("_parked") else 1, 1 if inf.tier == "hard" else 0,
                h.get("_i", 0))

    # one idea, one program
    other_groups: dict[int, set] = {}
    for tmpl in others.values():
        for oh in (tmpl or {}).get("habits") or []:
            g = _GROUP_OF.get(oh.get("habit_id"))
            if g is not None:
                other_groups.setdefault(g, set()).update(oh.get("days") or [])
    kept = []
    for h in hs:
        g = _GROUP_OF.get(h["habit_id"])
        # one idea, one program — on any day (morning light from Sleepmax six
        # days and from Energymax on Sunday is still the same habit twice)
        if g is not None and g in other_groups and h["habit_id"] not in keep_ids:
            if not h.get("_parked"):
                notes.append(f"dropped {h['habit_id']}: another program already covers it")
            waiting.append(h)
            continue
        kept.append(h)
    hs = kept

    # week 1 stays easy
    cap = cap_habits if cap_habits is not None else 3
    tasks_only = [h for h in hs if h.get("kind") != "rule"]       # rules are free boundaries
    if len(tasks_only) > cap:
        ordered = sorted(tasks_only, key=rank)
        drop = {id(h) for h in ordered[cap:] if not protected(h)}
        for h in hs:
            if id(h) in drop:
                if h.get("_parked"):
                    waiting.append(h)
                else:
                    notes.append(f"dropped {h['habit_id']}: week 1 keeps it to {cap} habits")
        hs = [h for h in hs if id(h) not in drop]

    # time budget: every day, this program stays inside its share of the
    # person's minutes (shrink toward the library minimum first, then drop the
    # least important habit that is costing time that day)
    allow = allowance(budget_total, others)
    for _ in range(64):
        over = sorted(((day_load(hs, d) - allow[d], d) for d in WEEKDAYS), reverse=True)[0]
        excess, day = over
        if excess <= 1e-6:
            break
        on_day = [h for h in hs if day in (h.get("days") or []) and cost(h) > 0]
        shrinkable = [h for h in on_day if h["minutes"] > info(h["habit_id"], lib).minutes_min]
        # a habit's minutes are the same every day it runs: only shorten one
        # whose every day is over budget (a Saturday-only overage must not cut
        # a daily habit all week)
        over_days = {d for d in WEEKDAYS if day_load(hs, d) - allow[d] > 1e-6}
        shrinkable = [h for h in shrinkable if set(h.get("days") or []) <= over_days]
        if shrinkable:
            h = max(shrinkable, key=lambda x: x["minutes"])
            floor = info(h["habit_id"], lib).minutes_min
            new_m = max(floor, int(h["minutes"] - excess))
            notes.append(f"shortened {h['habit_id']} from {h['minutes']} to {new_m} min: "
                         f"your {budget_total} min a day is shared with your other programs")
            h["minutes"] = new_m
            continue
        droppable = [h for h in on_day if not protected(h)]
        if not droppable:
            break
        pool = [h for h in droppable if h.get("_parked")] or droppable

        def tier(x: dict) -> int:
            return TIER_RANK.get(info(x["habit_id"], lib).tier, 1)
        # Lose as little of the week as possible: one habit that clears the
        # overage on its own (fewest sessions a week, then the smallest),
        # before peeling off several small daily ones.
        enough = [h for h in pool if cost(h) >= excess - 1e-6]
        if enough:
            h = min(enough, key=lambda x: (len(x.get("days") or []), -tier(x), cost(x)))
        else:
            h = min(pool, key=lambda x: (-tier(x), len(x.get("days") or []), -cost(x)))
        if h.get("_parked"):
            waiting.append(h)
        else:
            notes.append(f"dropped {h['habit_id']}: over the {budget_total} min/day budget")
        hs = [x for x in hs if x is not h]

    # hard sessions never back to back (across the stack)
    other_hard = {d for t in others.values() for oh in (t or {}).get("habits") or []
                  if oh.get("habit_id") in HARD for d in oh.get("days") or []}
    for h in hs:
        if h["habit_id"] not in HARD:
            continue
        days = [d for d in WEEKDAYS if d in (h.get("days") or [])]
        new = _spread_hard(days, len(days), other_hard)
        if new is None:
            notes.append(f"dropped {h['habit_id']}: no rest day left between hard sessions")
            h["days"] = []
            continue
        h["days"] = new
        other_hard |= set(new)
    hs = [h for h in hs if h.get("days")]

    # nothing left after the budget (every habit costs minutes this person's
    # share can't hold): keep the program alive with its best free habit
    if not hs:
        free = _free_fallback(lib, others, exclude={h["habit_id"] for h in habits})
        if free is not None:
            notes.append(f"added {free['habit_id']}: the day's minutes are taken, so a 1-minute habit for now")
            hs = [free]

    # daily task cap: every day, this program keeps its fair share of the
    # TASK_CAP visible tasks (water-fill across the stack) and always at least
    # one slot, so a program added later is never starved to nothing and the
    # first programs are trimmed rather than emptied
    # a program the person asked "more" of gets extra room (ai_programs._level_profile)
    task_cap = int(profile.get("_task_cap") or TASK_CAP)

    def _slots(d: str) -> int:
        # Suppmax's synced picks are pinned (they follow the other programs),
        # so its rows are a fixed cost; the rest of the cap is shared fairly
        if maxx_id == SUPP:
            return max(1, int(share_of_day(task_cap, [day_count(t, d) for t in others.values()]) + 1e-9))
        fixed = day_count(others[SUPP], d, supp=True) if SUPP in others else 0
        rest = [day_count(t, d) for m, t in others.items() if m != SUPP]
        return max(1, int(share_of_day(max(0, task_cap - fixed), rest) + 1e-9))
    slots = {d: _slots(d) for d in WEEKDAYS}
    for d in WEEKDAYS:
        on = sorted([h for h in hs if d in (h.get("days") or [])], key=rank)
        for h in reversed(on):
            if day_count({"habits": [x for x in on if d in x["days"]]}, d, supp=(maxx_id == SUPP)) <= slots[d]:
                break
            if protected(h) or h is on[0]:
                continue
            h["days"] = [x for x in h["days"] if x != d]
            notes.append(f"{h['habit_id']}: off {d} to keep the day at {TASK_CAP} tasks")
    hs = [h for h in hs if h.get("days")]

    # placement
    taken = _occupied(others, models)
    prev = {k: (to_min(v[0]), to_min(v[1])) for k, v in (prev_fit or {}).items()} if prev_fit else {}

    def pref_for(key: str, h: dict, kind: str) -> int:
        d = models[key]
        raw = h.get("weekend_time") if key == "weekend" and h.get("weekend_time") else h.get("time")
        t = to_min(raw)
        if key == "weekend" and not h.get("weekend_time") and t is not None:
            # derive from the weekday time
            wd = models["weekday"]
            t0 = _near(t, wd)
            if kind in SHIFTS_WITH_WAKE:
                return d.wake + (t0 - wd.wake)
            if kind in SHIFTS_WITH_BED:
                return d.bed - (wd.bed - t0)
            return _near(t, d)
        if t is None:
            return d.wake + 60
        t0 = _near(t, d)
        old = prev.get(key)
        if old and old[0] is not None and old[1] is not None:
            ow, ob = old
            ob = ob if ob > ow else ob + 1440
            tt = t + 1440 if t < ow else t
            if kind in SHIFTS_WITH_WAKE:
                return d.wake + (tt - ow)
            if kind in SHIFTS_WITH_BED:
                return d.bed - (ob - tt)
        return t0

    order = {"wake_exact": 0, "wake": 1, "wind_down": 2, "pre_bed": 3, "caffeine": 4, "work_start": 5,
             "work_end": 6, "meal": 7, "workout": 8, "evening": 9, "nap": 10, "get_ready": 11,
             "after_meal": 12, "any": 13}
    placed: list[dict] = []
    cluster: dict[tuple, Taken] = {}     # Suppmax: (day key, meal start) -> the shared slot
    stack_meal = None
    if maxx_id == SUPP:
        # the one meal most picks can be taken with: they share that slot
        votes = {m: sum(1 for h in hs if m in supp_meals(h["habit_id"], info(h["habit_id"], lib))) for m in MEALS}
        best = max(votes.values(), default=0)
        stack_meal = next((m for m in MEALS if votes[m] == best), None) if best >= 2 else None
    order["screens_off"] = order["wind_down"]

    def seq(x: dict) -> int:
        inf_ = info(x["habit_id"], lib)
        return 0 if inf_.order == "first" else 2 if inf_.after else 1
    for h in sorted(hs, key=lambda x: (order[kind_of(x["habit_id"], info(x["habit_id"], lib))], seq(x),
                                        to_min(x.get("time"), 0))):
        inf = info(h["habit_id"], lib)
        kind = kind_of(h["habit_id"], inf)
        meals = meals_for(h["habit_id"], inf)
        if h["habit_id"] == "protein_first_meal" and skips_breakfast(profile):
            meals = ["lunch"]
        if maxx_id == SUPP and kind in ("meal", "any", "get_ready") and supp_meals(h["habit_id"], inf):
            kind = "meal"
            meals = supp_meals(h["habit_id"], inf)
            if stack_meal in meals:
                meals = [stack_meal] + [m for m in meals if m != stack_meal]
        dur = int(h["minutes"])
        days = set(h.get("days") or [])
        allowed = allowed_busy(h["habit_id"], maxx_id, inf, dur)
        if kind == "meal":
            allowed |= {"meal", "work", "commute"}
        if kind in ("wake", "wake_exact", "get_ready"):
            # a morning habit is done before work, not as a 'work break' at 11:00
            allowed.discard("work")
        ok = True
        for key, ds in (("weekday", days - set(WEEKEND)), ("weekend", days & set(WEEKEND))):
            if not ds:
                continue
            d = models[key]
            pref = pref_for(key, h, kind)
            if inf.order == "first" and kind in ("wake", "get_ready"):
                pref = d.wake + GAP
            mw = meal_windows(meals, dur, d, pref) if kind == "meal" else []
            if mw and maxx_id == SUPP and stack_meal in meals:
                mw.sort(key=lambda x: 0 if any(k == stack_meal and s0 == x[0] for k, s0, _ in d.busy) else 1)
            if mw:
                tries = mw
            else:
                lo, hi = window(kind if kind != "meal" else "any", dur, d, weekday=(key == "weekday"))
                if kind == "after_meal":
                    named = [m for m in MEALS if m in inf.anchor] or list(MEALS)
                    ends = sorted(e for k, s0, e in d.busy if k in named)
                    if ends:
                        pref = min(ends, key=lambda e: abs(e - pref))
                        lo = max(lo, min(ends))
                if inf.after:
                    # placed after the habit it follows (water before light),
                    # wherever that one sits in the stack
                    ends = [t.start + t.dur for t in taken[key] if t.hid == inf.after and t.days & ds]
                    if ends:
                        lo = max(lo, max(ends))
                        hi = max(hi, lo)
                        pref = max(pref, lo)
                tries = [(lo, hi, pref)]
            if inf.rule:
                # a boundary line: its time comes from its rule window, it
                # shares the moment with any task and occupies nothing
                lo0, hi0, p0 = tries[0]
                if caffeinated(h["habit_id"]) or kind == "caffeine":
                    hi0 = min(hi0, d.bed - 360)
                s = min(max(p0, lo0), max(lo0, hi0))
                h["_" + key] = hhmm(s)
                continue
            if caffeinated(h["habit_id"]):
                # caffeine (with theanine, or before a focus block) never after the cutoff
                cut = d.bed - 360
                tries = [(lo, min(hi, cut), min(p, cut)) for lo, hi, p in tries if lo <= cut] or \
                        [(d.wake + 15, cut, min(pref, cut))]
            s = None
            ck = (key, tries[0][0]) if (maxx_id == SUPP and kind == "meal") else None
            if ck in cluster:
                # taken with the other supplements at this meal: same slot
                c = cluster[ck]
                if _free(c.start, max(dur, c.dur), ds, d, [t for t in taken[key] if t is not c], allowed):
                    c.days |= ds
                    c.dur = max(c.dur, dur)
                    h["_" + key] = hhmm(c.start)
                    continue
            for lo, hi, p in tries:
                s = _place(p, lo, hi, dur, ds, d, taken[key], allowed)
                if s is not None:
                    break
            if s is None:         # rule window full: anywhere in the waking day
                hi_any = d.bed - 360 if caffeinated(h["habit_id"]) else d.bed - dur
                s = _place(tries[0][2], d.wake, hi_any, dur, ds, d, taken[key], allowed)
            if s is None:
                ok = False
                break
            asked = to_min(h.get("weekend_time") if key == "weekend" and h.get("weekend_time") else h.get("time"))
            if key == "weekday" and asked is not None and abs(_near(asked, d) - s) > 10:
                notes.append(f"kept {h['habit_id']} at {hhmm(s)}: {_why_here(kind, _near(asked, d), d, meals)}")
            tk = Taken(s, dur, set(ds), h["habit_id"])
            taken[key].append(tk)
            if ck is not None and ck not in cluster:
                cluster[ck] = tk
            h["_" + key] = hhmm(s)
        if not ok:
            notes.append(f"dropped {h['habit_id']}: no free time that fits the day")
            continue
        wk, we = h.pop("_weekday", None), h.pop("_weekend", None)
        h["time"] = wk or we
        h["weekend_time"] = we if (we and wk and we != wk) else ""
        h.pop("_parked", None)
        h["priority"] = h.pop("_i", 0)
        placed.append(h)
    if maxx_id == SUPP and placed:
        _fold_supp_rows(placed, lib, min(slots.values()) if slots else task_cap)
        _unify_supp_weekends(placed, models)
    placed.sort(key=lambda x: _near(to_min(x["time"], 0), models["weekday"]))
    if parked_out is not None:
        for h in waiting:
            parked_out.append({**{k: v for k, v in h.items() if k not in ("_parked", "_i") and not k.startswith("_week")},
                               "priority": h.get("_i", 0)})
    return placed, notes
