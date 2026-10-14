"""Skin & Hair: a real AM/PM routine from a 3-question quiz (deterministic).

Good routines are not every product stacked. They are a small core (cleanse,
moisturize, SPF), ONE main active matched to the person's goal, introduced
slowly and rotated across the week (never two strong actives the same night),
plus recovery nights. This module turns three tap answers into that:

  * quiz:    main goal · how skin feels after washing (type, no jargon) ·
             anything that applies (pregnancy, prescription, eczema/rosacea,
             already uses actives, thinning hair, dandruff)
  * output:  one "AM skin routine" task and one "PM skin routine" task a day,
             each with its ordered steps inside. The PM routine changes by
             night (retinoid / exfoliate / recovery) and by week: weeks 1-2 are
             basics so skin settles, then the main active comes in 2 nights a
             week and builds up. Scalp steps only when asked for.

Templates carry `variants` + `schedule` on a habit; `expand_template` picks the
variant for each date (see ai_programs.routine_variant_for). No brands, no
strengths beyond OTC, no prescription products, never a medical claim.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

PROGRAM = "skinhairmax"
ALL = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# ── the quiz (asked instead of Claude's intake for this program) ────────────

GOALS = {
    "Clear breakouts": "acne",
    "Smooth fine lines": "aging",
    "Fade dark spots": "spots",
    "Calm redness": "redness",
    "Smoother, brighter skin": "texture",
    "Fix dryness": "dry",
    "Keep it healthy and simple": "basics",
}
FEELS = {
    "Shiny all over": "oily",
    "Shiny forehead and nose only": "combination",
    "Tight, dry or flaky": "dry",
    "Comfortable": "normal",
    "Stings or gets red easily": "sensitive",
}
FLAGS = {
    "Pregnant, trying, or breastfeeding": "pregnant",
    "I use a prescription skin product": "rx",
    "Eczema or rosacea": "reactive",
    "I already use retinol or acids": "experienced",
    "My hair is thinning": "thinning",
    "Dandruff or an itchy scalp": "dandruff",
    "None of these": "none",
}
QUIZ = [
    {"fact_key": "skin_goal", "question": "what do you most want your skin routine to do?",
     "options": list(GOALS), "multi": False, "ack": ""},
    {"fact_key": "skin_feel", "question": "how does your face feel an hour after washing it?",
     "options": list(FEELS), "multi": False, "ack": "got it"},
    {"fact_key": "skin_flags", "question": "any of these apply to you?",
     "options": list(FLAGS), "multi": True, "ack": "good to know"},
]


def next_question(answers: dict, asked: list) -> dict:
    """The next quiz step in the shape next_intake_step returns."""
    n = len(asked or [])
    if n >= len(QUIZ):
        return {"done": True, "ack": "perfect, building your routine", "question": "", "options": [],
                "multi": False, "fact_key": ""}
    q = QUIZ[n]
    return {"done": False, "ack": q["ack"], "question": q["question"], "options": list(q["options"]),
            "multi": q["multi"], "fact_key": q["fact_key"]}


def _pick(text: str, table: dict, default: str) -> str:
    t = (text or "").lower()
    for label, key in table.items():
        if label.lower() in t or key in t:
            return key
    return default


def read_answers(answers: dict) -> dict:
    """Quiz answers (or free text from a vague user) → routine inputs."""
    goal = _pick(answers.get("skin_goal", ""), GOALS, "basics")
    skin = _pick(answers.get("skin_feel", ""), FEELS, "normal")
    raw = str(answers.get("skin_flags", "")).lower()
    flags = {key for label, key in FLAGS.items() if label.lower() in raw or key in raw} - {"none"}
    if "pregnan" in raw or "breastfeed" in raw:
        flags.add("pregnant")
    if "prescri" in raw:
        flags.add("rx")
    if "rosacea" in raw or "eczema" in raw:
        flags.add("reactive")
    if skin == "sensitive":
        flags.add("reactive")
    return {"goal": goal, "skin": skin, "flags": flags}


# ── step text ───────────────────────────────────────────────────────────────

def _steps(items: list[str]) -> str:
    return " ".join(f"{i}) {s}" for i, s in enumerate(items, 1))


def _cleanse_am(skin: str) -> str:
    if skin in ("dry", "sensitive"):
        return "Rinse with lukewarm water (no cleanser needed in the morning)."
    return "Wash with a gentle cleanser and lukewarm water for about 30 seconds, then pat dry."


def _moisturizer(skin: str) -> str:
    return {"oily": "A light gel moisturizer.", "combination": "A light lotion moisturizer.",
            "dry": "A rich cream moisturizer.", "sensitive": "A fragrance-free, ceramide moisturizer."
            }.get(skin, "A lotion moisturizer.")


def _spf(flags: set) -> str:
    kind = "mineral (zinc or titanium) SPF 30+" if "reactive" in flags else "broad-spectrum SPF 30+"
    return f"{kind[0].upper()}{kind[1:]}, about a quarter teaspoon for face and neck, as the last step."


PM_CLEANSE = ("Cleanse. If you wore sunscreen or makeup, first massage in an oil or balm cleanser, "
              "rinse, then use your gentle cleanser.")
DRY_HYDRATE = "On still-damp skin, a hydrating serum (hyaluronic acid or glycerin)."


def _treatment(goal: str, flags: set, skin: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(night active step, AM booster step, second-night exfoliant step) for this person."""
    pregnant, rx, reactive = "pregnant" in flags, "rx" in flags, "reactive" in flags
    acid = ("a gentle PHA or lactic acid exfoliant" if reactive or skin == "dry"
            else "a BHA (salicylic acid) exfoliant" if goal == "acne" or skin == "oily"
            else "an AHA (glycolic or lactic acid) exfoliant")
    retinoid = ("A pea-sized amount of adapalene gel (an over-the-counter retinoid) on fully dry skin, "
                "avoiding the corners of the eyes and nose." if goal == "acne" else
                "A pea-sized amount of retinol on fully dry skin, avoiding the corners of the eyes and nose.")
    if rx:
        return "Your prescribed skin treatment, exactly as directed.", None, None
    if pregnant:
        night = {"acne": "A thin layer of azelaic acid.", "spots": "A thin layer of azelaic acid.",
                 "aging": "A peptide serum.", "texture": None, "redness": None, "basics": None, "dry": None}[goal]
        booster = {"aging": "Vitamin C serum on dry skin.", "spots": "Vitamin C serum on dry skin.",
                   "redness": "A thin layer of azelaic acid.", "acne": "Niacinamide serum.",
                   "texture": "Vitamin C serum on dry skin.", "basics": None, "dry": None}[goal]
        exf = ("A gentle lactic acid or PHA exfoliant (leave-on, low strength)." if goal in ("texture", "dry")
               else None)
        return night, booster, exf
    night = {"acne": retinoid, "aging": retinoid, "spots": retinoid,
             "redness": None, "texture": None, "basics": None, "dry": None}[goal]
    booster = {"acne": "Niacinamide serum.", "aging": "Niacinamide serum." if reactive else "Vitamin C serum on dry skin.",
               "spots": "Niacinamide serum." if reactive else "Vitamin C serum on dry skin.",
               "redness": "A thin layer of azelaic acid.", "texture": "Vitamin C serum on dry skin.",
               "basics": None, "dry": None}[goal]
    if goal == "dry":
        acid = "a gentle lactic acid exfoliant"
    exf = f"Apply {acid} on dry skin." if goal in ("acne", "texture", "spots", "dry") else None
    if goal == "texture":
        night = None                      # the exfoliant IS the main active
    return night, booster, exf


# ── build ───────────────────────────────────────────────────────────────────

def _ramp(reactive: bool, experienced: bool) -> list[dict]:
    """Nights per week for the main night active, by week since start."""
    if experienced:
        return [{"from_week": 1, "days": ["mon", "wed", "fri"]}, {"from_week": 3, "days": ["mon", "wed", "fri", "sun"]}]
    if reactive:
        return [{"from_week": 3, "days": ["mon"]}, {"from_week": 5, "days": ["mon", "thu"]},
                {"from_week": 9, "days": ["mon", "wed", "fri"]}]
    return [{"from_week": 3, "days": ["mon", "thu"]}, {"from_week": 5, "days": ["mon", "wed", "fri"]},
            {"from_week": 7, "days": ["mon", "wed", "fri", "sun"]}]


def build_template(answers: dict, *, started_on: Optional[date] = None) -> dict:
    """Quiz answers → raw plan (validated and fitted by validate_template)."""
    a = read_answers(answers)
    goal, skin, flags = a["goal"], a["skin"], a["flags"]
    reactive, experienced = "reactive" in flags, "experienced" in flags and "rx" not in flags
    night, booster, exf = _treatment(goal, flags, skin)
    if str(answers.get("skin_mode") or "") == "minimal":
        booster, exf = None, (exf if not night else None)  # core + one active only
    first = 1 if experienced else 3                      # basics first so skin settles

    thirsty = skin == "dry" or goal == "dry"
    am_base = [_cleanse_am(skin)] + ([DRY_HYDRATE] if thirsty else []) + [_moisturizer(skin), _spf(flags)]
    am_plus = ([_cleanse_am(skin), booster] + ([DRY_HYDRATE] if thirsty else [])
               + [_moisturizer(skin), _spf(flags)]) if booster else am_base
    am = {
        "habit_id": "am_routine", "title": "AM skin routine", "minutes": 4 if booster else 3,
        "time": "", "weekend_time": "", "days": ALL,
        "why": "Clean skin, moisture and daily sunscreen do most of the work; one active on top targets your goal.",
        "how": _steps(am_base),
        "variants": {"base": {"title": "AM skin routine", "how": _steps(am_base)},
                     **({"plus": {"title": "AM skin routine", "how": _steps(am_plus)}} if booster else {})},
        "schedule": ([{"from_week": 1, "default": "base"}]
                     + ([{"from_week": first, "default": "plus"}] if booster else [])),
    }

    recover = ([PM_CLEANSE] + ([DRY_HYDRATE] if thirsty else []) + [_moisturizer(skin)]
               + (["Optional: seal with a thin layer of petroleum jelly."] if thirsty and goal != "acne" else []))
    variants = {"basic": {"title": "PM skin routine", "how": _steps(recover)},
                "recovery": {"title": "PM skin routine · recovery night", "how": _steps(recover)}}
    sched: list[dict] = [{"from_week": 1, "default": "basic", "by_day": {}}]
    if night:
        label = ("prescription" if "rx" in flags else "retinoid" if "retinoid" in night.lower() or "retinol" in night.lower()
                 or "adapalene" in night.lower() else "treatment")
        variants["treat"] = {"title": f"PM skin routine · {label} night",
                             "how": _steps([PM_CLEANSE, night, _moisturizer(skin)])}
        nights = ([{"from_week": 1, "days": ALL}] if "rx" in flags else
                  [{"from_week": first, "days": ALL}] if label == "treatment" else _ramp(reactive, experienced))
        for ph in nights:
            sched.append({"from_week": ph["from_week"], "default": "recovery", "by_day": {d: "treat" for d in ph["days"]}})
    if exf:
        variants["exfoliate"] = {"title": "PM skin routine · exfoliate night",
                                 "how": _steps([PM_CLEANSE, exf, _moisturizer(skin)])}
        exf_from = first if goal in ("texture", "dry") else first + 4   # a second active waits for the first
        exf_days = (["tue"] if reactive or goal == "dry" else ["tue", "sat"]) if goal in ("texture", "dry") else ["sat"]
        merged = []
        for ph in sched:
            merged.append(ph)
        if not any(p["from_week"] == exf_from for p in merged):
            prev = max((p for p in merged if p["from_week"] <= exf_from), key=lambda p: p["from_week"])
            merged.append({"from_week": exf_from, "default": "recovery", "by_day": dict(prev["by_day"])})
        for ph in merged:
            if ph["from_week"] >= exf_from:
                for d in exf_days:
                    if ph["by_day"].get(d) != "treat":      # never two strong actives the same night
                        ph["by_day"][d] = "exfoliate"
        sched = sorted(merged, key=lambda p: p["from_week"])
    pm = {
        "habit_id": "pm_routine", "title": "PM skin routine", "minutes": 4,
        "time": "", "weekend_time": "", "days": ALL,
        "why": "Night is when actives work best; recovery nights in between keep your skin barrier strong.",
        "how": variants["recovery"]["how"], "variants": variants, "schedule": sched,
    }
    habits = [am, pm]
    if "thinning" in flags or "dandruff" in flags:
        habits.insert(0, {"habit_id": "keto_wash",            # in the shower, before the AM routine "title": "Ketoconazole shampoo wash", "minutes": 5,
                       "time": "", "weekend_time": "", "days": ["tue", "sat"],
                       "how": _steps(["Wet hair and lather ketoconazole shampoo into your scalp.",
                                      "Leave it on for 3 to 5 minutes, then rinse.",
                                      "Condition the lengths only."]),
                       "why": "Calms flaking and an oily, itchy scalp; often used alongside hair-thinning care."})
    if "thinning" in flags:
        habits.append({"habit_id": "scalp_massage", "title": "Scalp massage", "minutes": 4,
                       "time": "", "weekend_time": "", "days": ALL,
                       "how": _steps(["Use your fingertips or a soft silicone scalp brush.",
                                      "Small circles, front to back, firm but not scratching, for 4 minutes."]),
                       "why": "A simple daily habit; small studies link it to thicker-looking hair."})
    return {
        "summary": summary_for(goal, skin, flags, am["variants"].get("plus", am["variants"]["base"])["how"],
                               variants["recovery"]["how"], first, bool(night or booster or exf)),
        "habits": habits,
        "started_on": (started_on or date.today()).isoformat(),
        "skin_profile": {"goal": goal, "skin": skin, "flags": sorted(flags)},
    }


_GOAL_WORDS = {"acne": "clearer skin", "aging": "smoother lines", "spots": "fading dark spots",
               "redness": "calmer, less red skin", "texture": "smoother, brighter skin", "dry": "comfortable, hydrated skin",
               "basics": "healthy skin"}


def _count(how: str) -> int:
    return how.count(") ")


def summary_for(goal: str, skin: str, flags: set, am_how: str, pm_how: str, first: int, has_active: bool) -> str:
    head = (f"your routine: {_count(am_how)} steps in the morning, {_count(pm_how)} at night, about 5 minutes a day, "
            f"made for {skin} skin")
    if "rx" in flags:
        return head + ". at night it's just your prescribed treatment plus moisturizer, so it can do its job."
    extra = ", pregnancy-safe picks only" if "pregnant" in flags else ""
    if not has_active:
        return head + extra + f". built for {_GOAL_WORDS.get(goal, 'healthy skin')}: simple, every day."
    start = ("you already use actives, so we start where you are" if first == 1 else
             "weeks 1-2 are just the basics so your skin settles, then your main active comes in 2 nights a week "
             "and builds up")
    return (head + extra + f". built for {_GOAL_WORDS.get(goal, 'healthy skin')}: {start}. each night's task tells "
            "you if it's a treatment night or a recovery night.")


def routine_variant(habit: dict, d: date, started_on: Optional[str]) -> Optional[dict]:
    """The variant (title/how) for this habit on date d, or None if it has none."""
    variants, schedule = habit.get("variants"), habit.get("schedule")
    if not variants or not schedule:
        return None
    try:
        start = date.fromisoformat(str(started_on)[:10]) if started_on else d
    except ValueError:
        start = d
    week = max(1, (d - start).days // 7 + 1)
    phase = None
    for ph in sorted(schedule, key=lambda p: p.get("from_week", 1)):
        if ph.get("from_week", 1) <= week:
            phase = ph
    if phase is None:
        return None
    wd = ALL[d.weekday()]
    key = (phase.get("by_day") or {}).get(wd) or phase.get("default")
    return variants.get(key) or None
