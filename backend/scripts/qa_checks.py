"""Invariant checks for AI-program plans as a real user lives them.

Pure functions over (persona truth, stored day rows, templates). The truth is
what the person told onboarding (their real wake/bed, work, commute, meals),
NOT the planner's derived profile — so a planner that misreads the day fails.

Invariants (numbered as in the QA brief):
  1 waking-day bounds (weekday + weekend)      6 no duplicate habit across programs
  2 clear of work/commute/meals (>2 min)       7 human text, no ids/claims/doses
  3 no two tasks at the same minute and no     7s summary only talks about habits
    task starting inside another task             that are actually in the plan
  4 doc timing rules + wake/meal anchors       8 week-1 load + daily cap
  5 daily time budget across the stack,        9 (checked by the runner: drift)
    EVERY day (1-minute reminders are free)
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime, timedelta

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def to_min(hm) -> int | None:
    s = str(hm or "").strip()
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", s)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def fmt(m: int) -> str:
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# ── persona truth ───────────────────────────────────────────────────────────

def day_bounds(truth: dict, d: date) -> tuple[int, int]:
    """(wake, bed) in minutes for date d; bed > wake (past-midnight bed +1440)."""
    wd = WEEKDAYS[d.weekday()]
    wake, bed = to_min(truth["wake_time"]), to_min(truth["sleep_time"])
    wt = (truth.get("weekly_timings") or {})
    key = {"sat": "saturday", "sun": "sunday"}.get(wd)
    if key and isinstance(wt.get(key), dict):
        wake = to_min(wt[key].get("wake_time")) if wt[key].get("wake_time") else wake
        bed = to_min(wt[key].get("sleep_time")) if wt[key].get("sleep_time") else bed
    elif key and truth.get("weekend_shift"):
        wake, bed = wake + 60, bed + 60
    if bed <= wake:
        bed += 1440
    return wake, bed


def _days_match(spec, wd: str) -> bool:
    if isinstance(spec, list):
        return wd in [str(x)[:3].lower() for x in spec]
    s = str(spec or "everyday").lower()
    if s in ("weekdays", "workdays"):
        return wd not in ("sat", "sun")
    if s == "weekends":
        return wd in ("sat", "sun")
    return True


def busy_windows(truth: dict, d: date) -> list[tuple[str, int, int]]:
    wd = WEEKDAYS[d.weekday()]
    out = []
    for o in truth.get("obligations") or []:
        if not _days_match(o.get("days"), wd):
            continue
        a, b = to_min(o.get("start")), to_min(o.get("end"))
        if a is None or b is None:
            continue
        kind = "commute" if "commute" in str(o.get("label", "")).lower() else "work"
        out.append((kind, a, b if b > a else b + 1440))
    for meal in ("breakfast", "lunch", "dinner"):
        t = to_min(truth.get(f"{meal}_time"))
        if t is not None:
            out.append(("meal", t, t + 30))
    return out


# ── library knowledge ───────────────────────────────────────────────────────

WORKOUTS = {"strength_full_body", "zone2_cardio", "vigorous_intervals", "strength_2x",
            "resistance_training", "move_it_out"}
HARD = {"strength_full_body", "strength_2x", "vigorous_intervals", "resistance_training"}
CONCEPTS = [
    {"morning_light"}, {"caffeine_cutoff"}, {"zone2_cardio"}, {"daily_steps"},
    {"balance_drill", "balance_practice"}, {"screens_off", "screen_free_evening"},
    {"strength_full_body", "strength_2x", "resistance_training"},
    {"long_walk_weekend", "weekly_long_walk"},
    {"brain_dump", "worry_list"},
    {"move_after_sitting", "movement_snack", "posture_break"},
    {"stair_snack", "stair_or_burst"},
    {"protein_each_meal", "protein_at_meals", "protein_first_meal"},
]
SUPP_WORDS = re.compile(r"\b(melatonin|magnesium|creatine|ashwagandha|theanine|glycine|vitamin d|d3|omega[- ]?3|"
                        r"fish oil|collagen|protein powder|whey|multivitamin|b12|iron (pill|supplement)|rhodiola|"
                        r"supplement|capsule|tablet)\b", re.I)
DOSE = re.compile(r"\b\d+(\.\d+)?\s?(mg|mcg|µg|ug|iu|units?|ml|cc|clicks?)\b", re.I)
MEDICAL = re.compile(r"\b(cures?|treats?|treatment for|diagnos\w*|prevents? (disease|cancer|diabetes|dementia)|"
                     r"reverses? (aging|ageing|disease)|guaranteed?)\b", re.I)
SOURCING = re.compile(r"\b(buy|purchase|order (it|them|from)|vendor|supplier|research[- ](chem|peptide|grade)|"
                      r"grey market|gray market|online (shop|store))\b", re.I)


MEAL_ESSENCE = {"protein_first_meal": ("breakfast",), "protein_each_meal": ("breakfast", "lunch", "dinner"),
                "protein_at_meals": ("breakfast", "lunch", "dinner"), "fiber_swap": ("breakfast", "lunch", "dinner")}


def meal_habit(hid: str, anchor: str) -> tuple[str, ...]:
    """Meals a habit must sit at (empty = not a meal habit)."""
    if hid in MEAL_ESSENCE:
        return MEAL_ESSENCE[hid]
    head = (anchor or "").lower().split("(")[0]
    parts = [x.strip() for x in re.split(r",|\bor\b|\band\b", head) if x.strip()]
    if parts and all(re.fullmatch(r"(breakfast|lunch|dinner|meals?|each meal|with a meal)", x) for x in parts):
        return tuple(m for m in ("breakfast", "lunch", "dinner") if m in head) or ("breakfast", "lunch", "dinner")
    return ()


def allowed_windows(anchor: str) -> set[str]:
    a = (anchor or "").lower()
    out = set()
    if re.search(r"work_break|work hours|within work|deep-work|before_work \(first|after_work \(last|"
                 r"start of deep|during the deep", a):
        out.add("work")
    if re.search(r"lunch|dinner|breakfast|meal", a):
        out.add("meal")
    if "commute" in a:
        out.add("commute")
    return out


# ── the check ───────────────────────────────────────────────────────────────

def check_stack(truth: dict, rows: dict[str, list[dict]], templates: dict[str, dict], lib: dict,
                *, start: date, n_days: int = 14, lib_titles: dict | None = None) -> dict:
    """rows: maxx_id -> stored days; templates: maxx_id -> ai_plan;
    lib: maxx_id -> {habit_id: anchor}. Returns {invariant: [violations]}."""
    v: dict[str, list[str]] = defaultdict(list)
    budget = int(truth.get("daily_minutes") or 25)
    by_date: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for mid, days in rows.items():
        for d in days or []:
            ds = str(d.get("date") or "")
            try:
                dd = date.fromisoformat(ds)
            except ValueError:
                continue
            if start <= dd < start + timedelta(days=n_days):
                live = {f"{mid}.{h.get('habit_id')}" for h in (templates.get(mid) or {}).get("habits") or []}
                for t in d.get("tasks") or []:
                    if str(t.get("status")) in ("completed", "skipped") and t.get("catalog_id") not in live:
                        continue          # done before a redo dropped it: history, not load
                    by_date[ds].append((mid, t))

    minutes_by_date = {}
    for ds, items in sorted(by_date.items()):
        d = date.fromisoformat(ds)
        wake, bed = day_bounds(truth, d)
        busy = busy_windows(truth, d)
        seen_min: dict[int, list[str]] = defaultdict(list)
        spans: list[tuple[int, int, str]] = []
        concepts_today: dict[int, set[str]] = defaultdict(set)
        total = 0
        for mid, t in items:
            hid = str(t.get("catalog_id", "")).split(".", 1)[-1]
            tm = to_min(t.get("time"))
            dur = int(t.get("duration_minutes") or t.get("duration_min") or 0)
            total += dur if dur >= 2 else 0
            label = f"{ds} {t.get('time')} {mid}.{hid}"
            if tm is None:
                v["1_bounds"].append(f"{label}: no time")
                continue
            if tm < wake and tm + 1440 < bed:
                tm += 1440
            # 1 bounds
            if tm < wake or tm + dur > bed:
                v["1_bounds"].append(f"{label} ({dur}m) outside {fmt(wake)}-{fmt(bed)}")
            anchor = lib.get(mid, {}).get(hid, "")
            # 2 busy windows (a lunch-time habit inside the lunch break is not "during work")
            if dur > 2:
                ok = allowed_windows(anchor) | ({"meal"} if meal_habit(hid, anchor) else set())
                in_meal = any(k == "meal" and a <= tm and tm + dur <= b for k, a, b in busy)
                for kind, a, b in busy:
                    if tm < b and tm + dur > a and kind not in ok and not (kind == "work" and in_meal and "meal" in ok):
                        v["2_busy"].append(f"{label} ({dur}m) overlaps {kind} {fmt(a)}-{fmt(b)}")
            # 3 same minute / overlap
            seen_min[tm].append(f"{mid}.{hid}")
            spans.append((tm, dur, f"{mid}.{hid}"))
            # 4 doc rules
            if hid == "caffeine_cutoff" and tm > bed - 360:
                v["4_rules"].append(f"{label}: caffeine cutoff <6h before bed {fmt(bed)}")
            if hid == "wind_down" and not (bed - 60 <= tm <= bed - 30):
                v["4_rules"].append(f"{label}: wind-down not 30-60 min before bed {fmt(bed)}")
            if hid == "morning_light" and not (wake <= tm <= wake + 60):
                v["4_rules"].append(f"{label}: morning light not within 60 min of wake {fmt(wake)}")
            if hid in WORKOUTS and tm + dur > bed - 120:
                v["4_rules"].append(f"{label}: workout ends <2h before bed {fmt(bed)}")
            if hid == "nap_rule" and tm + dur > bed - 420:
                v["4_rules"].append(f"{label}: nap within 7h of bed")
            if hid in ("fixed_wake_time",) and not (wake <= tm <= wake + 5):
                v["4_rules"].append(f"{label}: wake-time habit not at wake {fmt(wake)}")
            elif str(anchor).lower().startswith("wake") and not (wake <= tm <= wake + 60):
                v["4_rules"].append(f"{label}: wake habit not within 60 min of wake {fmt(wake)}")
            meals_here = meal_habit(hid, anchor)
            if meals_here and d.weekday() < 5:
                starts = [to_min(truth.get(f"{m}_time")) for m in meals_here if to_min(truth.get(f"{m}_time")) is not None]
                if starts and not any(m0 <= tm < m0 + 30 for m0 in starts):
                    v["4_rules"].append(f"{label}: meal habit not at {'/'.join(meals_here)} "
                                        f"({', '.join(fmt(x) for x in starts)})")
            for i, group in enumerate(CONCEPTS):
                if hid in group:
                    concepts_today[i].add(mid)
            # 7 text
            title = str(t.get("title") or "")
            body = f"{title} {t.get('description') or ''} {t.get('why') or ''}"
            if "_" in title or re.fullmatch(r"[a-z0-9_]+", title or "_"):
                v["7_text"].append(f"{label}: raw-looking title {title!r}")
            if str(t.get("description") or "").rstrip().endswith("…") or len(title) > 40 or title.endswith("…"):
                v["7_text"].append(f"{label}: text looks truncated")
            for tok in re.findall(r"\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[ap]m)?|\b(?:1[0-2]|0?[1-9])\s?[ap]m\b",
                                  f"{title} {t.get('description') or ''}", re.I):
                mm = re.match(r"(\d{1,2})(?::(\d{2}))?\s?([ap])?", tok, re.I)
                hh, mi, ap = int(mm.group(1)), int(mm.group(2) or 0), (mm.group(3) or "").lower()
                hh += 12 if ap == "p" and hh < 12 else 0
                hh = 0 if ap == "a" and hh == 12 else hh
                if (hh * 60 + mi) % 1440 not in (tm % 1440, (tm + 720) % 1440) and not t.get("group"):
                    v["7_text"].append(f"{label}: text names {tok!r} but the task is at {t.get('time')}")
                    break
            if MEDICAL.search(body):
                v["7_text"].append(f"{label}: medical-claim wording: {MEDICAL.search(body).group(0)!r}")
            if mid not in ("suppmax", "peptidemax") and SUPP_WORDS.search(body):
                v["7_text"].append(f"{label}: supplement talk outside Suppmax: {SUPP_WORDS.search(body).group(0)!r}")
            if DOSE.search(body) and mid != "suppmax":
                v["7_text"].append(f"{label}: dose-like number: {DOSE.search(body).group(0)!r}")
            if mid == "peptidemax" and SOURCING.search(body):
                v["7_text"].append(f"{label}: sourcing wording: {SOURCING.search(body).group(0)!r}")
        for tm, who in seen_min.items():
            if len(who) > 1:
                v["3_same_minute"].append(f"{ds} {fmt(tm)}: {', '.join(who)}")
        spans.sort()
        for i, (a0, d0, w0) in enumerate(spans):
            for a1, d1, w1 in spans[i + 1:]:
                if a1 >= a0 + d0:
                    break
                if a1 != a0:
                    v["3_same_minute"].append(f"{ds} {w1} at {fmt(a1)} starts inside {w0} {fmt(a0)}+{d0}m")
        for i, mids in concepts_today.items():
            if len(mids) > 1:
                v["6_duplicate"].append(f"{ds}: {sorted(CONCEPTS[i])[0]}-type habit from {sorted(mids)}")
        minutes_by_date[ds] = total
        n = len(items)
        if len(rows) >= 4 and n > 10:
            v["8_load"].append(f"{ds}: {n} tasks in one day with {len(rows)} programs")
    # 4 rest days between hard sessions (across programs)
    hard_days = sorted({ds for ds, items in by_date.items()
                        for mid, t in items if str(t.get("catalog_id", "")).split(".", 1)[-1] in HARD})
    for a, b in zip(hard_days, hard_days[1:]):
        if (date.fromisoformat(b) - date.fromisoformat(a)).days == 1:
            v["4_rules"].append(f"hard sessions on back-to-back days {a} and {b}")
    # 5 budget: every day, not an average (1-minute reminders are free)
    for ds, total in sorted(minutes_by_date.items()):
        if total > budget:
            v["5_budget"].append(f"{ds}: {total} min of tasks vs {budget} min/day")
    # 8 week-1 load per program
    for mid, days in rows.items():
        habits = {f"{mid}.{h.get('habit_id')}" for h in (templates.get(mid) or {}).get("habits") or []}
        if not habits and (templates.get(mid) is not None):
            v["8_load"].append(f"{mid}: active program with NO habits")
        if mid == "suppmax":
            own = [h for h in (templates.get(mid) or {}).get("habits") or [] if not h.get("linked_to")]
            if len(own) > 2:
                v["8_load"].append(f"suppmax: {len(own)} non-synced picks in week 1")
            continue
        limit = 3 + (len([h for h in habits if ".custom_dose" in h]) if mid == "peptidemax" else 0)
        if len(habits) > limit:
            v["8_load"].append(f"{mid}: {len(habits)} distinct habits in week 1")
    # 7s the plan card's summary must not promise a habit that is not in the plan
    present_titles = " ".join(str(h.get("title") or "") for t in templates.values()
                              for h in (t or {}).get("habits") or []).lower()
    for mid, t in templates.items():
        # a sentence saying something can come later is not a promise
        summ = " ".join(x for x in re.split(r"(?<=[.!?])\s+", str((t or {}).get("summary") or "").lower())
                        if not re.search(r"\blater\b|when there's room|once there's room", x))
        have = {h.get("habit_id") for h in (t or {}).get("habits") or []}
        for hid, title in (lib_titles or {}).get(mid, {}).items():
            if hid in have:
                continue
            for kw in ([ALIASES[hid]] if hid in ALIASES else _keywords(title)):
                if re.search(kw, summ) and not re.search(kw, present_titles):
                    v["7s_summary"].append(f"{mid}: summary mentions {title!r} which is not in the plan")
                    break
    return {k: sorted(set(x), key=x.index) for k, x in v.items()}


_STOP = {"daily", "morning", "evening", "night", "weekly", "weekend", "short", "quick", "minute", "minutes",
         "before", "after", "your", "with", "first", "every", "check", "routine", "block", "session", "simple",
         "easy", "light", "outdoor", "breathing", "times", "reminder", "practice", "twice", "something",
         "someone", "about", "meals", "training", "strength", "water", "protein", "caffeine", "sleep", "screen",
         "screens", "coffee", "lunch", "dinner", "breakfast", "stack", "walk", "check-in", "plate", "one-time",
         "reset", "optional", "evidence", "caution", "trial", "basic", "mixed", "weak", "food", "only", "early",
         "earlier", "possible", "awake", "small", "where", "think-time", "vegans", "bloodwork", "workday",
         "movement", "recovery", "energy", "three", "steps", "cardio", "focus", "calm", "regular", "gentle",
         "afternoon", "protect", "evening", "night", "morning", "protocol", "prescriber", "reminder",
         "review", "window", "slump", "fiber"}
ALIASES = {"post_meal_walk": r"post-?(lunch|meal|dinner) walk|walk after (lunch|dinner|meals?)",
           "notification_cleanup": r"notification", "deep_work_block": r"deep[- ]?work"}


def _keywords(title: str) -> list[str]:
    words = re.findall(r"[a-z][a-z-]{4,}", (title or "").lower())
    out = []
    for w in words:
        if w in _STOP:
            continue
        out.append(r"\b" + re.escape(w).replace(r"\-", "[- ]?") + r"s?\b")
    return out[:1]


SUMMARY_KEYS = ["1_bounds", "2_busy", "3_same_minute", "4_rules", "5_budget", "6_duplicate", "7_text",
                "7s_summary", "8_load"]
