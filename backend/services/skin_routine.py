"""Skin & Hair: a real AM/PM routine from a 3-question quiz (deterministic).

Good routines are not every product stacked, and they work by consistency: a
small core (cleanse, moisturize, SPF) plus ONE main active matched to the
person's goal, done the same way every day from day 1. This module turns three
tap answers into that:

  * quiz:    main goal · how skin feels after washing (type, no jargon) ·
             anything that applies (pregnancy, prescription, eczema/rosacea,
             already uses actives, thinning hair, dandruff)
  * output:  one "AM skin routine" task and one "PM skin routine" task a day,
             each with its ordered steps inside, identical every day. The only
             exceptions are rare, fixed treatment nights: a weekly face mask and
             (for lines, spots or texture) a weekly at-home microneedling night,
             which replace that night's active. Scalp steps only when asked for.

Templates carry `variants` + `schedule` on a habit; `expand_template` picks the
variant for each date. No brands, no strengths beyond OTC, no prescription
products, never a medical claim.
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

MASK_DAY, NEEDLE_DAY = "sun", "wed"


def _mask(goal: str, skin: str, flags: set) -> str:
    if "reactive" in flags or goal == "redness":
        return "A soothing mask (oat, centella or aloe) for 10 to 15 minutes, then rinse with lukewarm water."
    if goal == "acne" or skin in ("oily", "combination"):
        return "A clay mask on your T-zone for 10 minutes (rinse before it fully dries)."
    return "A hydrating sheet or cream mask for 15 minutes; pat in what's left instead of rinsing."


NEEDLE = ("Disinfect a 0.25 mm derma roller or stamp in 70% alcohol and let it dry, then roll each area "
          "4 times in each direction with light pressure (skip any spots or broken skin). Rinse the roller "
          "and let it air-dry.")


def build_template(answers: dict, *, started_on: Optional[date] = None) -> dict:
    """Quiz answers → raw plan (validated and fitted by validate_template)."""
    a = read_answers(answers)
    goal, skin, flags = a["goal"], a["skin"], a["flags"]
    reactive = "reactive" in flags
    mode = str(answers.get("skin_mode") or "")
    night, booster, exf = _treatment(goal, flags, skin)
    if night is None and goal == "texture" and exf:   # the gentle leave-on acid IS the nightly active
        night = ("A low-strength, leave-on lactic acid or PHA exfoliant on dry skin."
                 if not (skin == "oily" and not reactive) else "A low-strength BHA (salicylic acid) exfoliant on dry skin.")
    gentle = reactive or mode == "gentle"
    if mode in ("minimal", "gentle"):
        booster = None
    if night and gentle and "rx" not in flags:
        night = f"A thin layer of moisturizer first, then {night[0].lower()}{night[1:]}"  # buffered = gentler

    thirsty = skin == "dry" or goal == "dry"
    hydrate = [DRY_HYDRATE] if thirsty else []
    am_steps = [_cleanse_am(skin)] + ([booster] if booster else []) + hydrate + [_moisturizer(skin), _spf(flags)]
    am = {
        "habit_id": "am_routine", "title": "AM skin routine", "minutes": 4 if booster else 3,
        "time": "", "weekend_time": "", "days": ALL,
        "why": "Clean skin, moisture and daily sunscreen do most of the work; the same steps every day is what makes it work.",
        "how": _steps(am_steps),
    }

    seal = ["Optional: seal with a thin layer of petroleum jelly."] if thirsty and goal != "acne" else []
    nightly = [PM_CLEANSE] + ([night] if night else []) + hydrate + [_moisturizer(skin)] + seal
    variants = {"nightly": {"title": "PM skin routine", "how": _steps(nightly)}}
    by_day: dict = {}
    if mode != "minimal":
        variants["mask"] = {"title": "PM skin routine · mask night",
                            "how": _steps([PM_CLEANSE, _mask(goal, skin, flags)] + hydrate + [_moisturizer(skin)])}
        by_day[MASK_DAY] = "mask"
        needling_ok = (goal in ("aging", "spots", "texture") and not reactive and mode != "gentle"
                       and not flags & {"rx", "pregnant"})
        if needling_ok:
            variants["needling"] = {"title": "PM skin routine · microneedling night",
                                    "how": _steps([PM_CLEANSE, NEEDLE, "A plain hydrating serum (hyaluronic acid), "
                                                   "no actives tonight.", _moisturizer(skin)])}
            by_day[NEEDLE_DAY] = "needling"
    pm = {
        "habit_id": "pm_routine", "title": "PM skin routine", "minutes": 4,
        "time": "", "weekend_time": "", "days": ALL,
        "why": "Night is when actives work best, and doing it every night is what shows results.",
        "how": variants["nightly"]["how"], "variants": variants,
        "schedule": [{"from_week": 1, "default": "nightly", "by_day": by_day}],
    }
    habits = [am, pm]
    if "thinning" in flags or "dandruff" in flags:
        # in the shower, so it goes before the AM routine
        habits.insert(0, {"habit_id": "keto_wash", "title": "Ketoconazole shampoo wash", "minutes": 5,
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
        "summary": summary_for(goal, skin, flags, am["how"], variants["nightly"]["how"], sorted(variants)),
        "habits": habits,
        "started_on": (started_on or date.today()).isoformat(),
        "skin_profile": {"goal": goal, "skin": skin, "flags": sorted(flags)},
    }


_GOAL_WORDS = {"acne": "clearer skin", "aging": "smoother lines", "spots": "fading dark spots",
               "redness": "calmer, less red skin", "texture": "smoother, brighter skin", "dry": "comfortable, hydrated skin",
               "basics": "healthy skin"}


def _count(how: str) -> int:
    import re
    return len(re.findall(r"(?:^|\s)\d+\) ", how))


def summary_for(goal: str, skin: str, flags: set, am_how: str, pm_how: str, extras: list) -> str:
    head = (f"your routine: {_count(am_how)} steps in the morning, {_count(pm_how)} at night, the same every day, "
            f"about 5 minutes, made for {skin} skin")
    if "rx" in flags:
        head += ". at night it's your prescribed treatment plus moisturizer, so it can do its job"
    elif "pregnant" in flags:
        head += ", pregnancy-safe picks only"
    rare = [w for k, w in (("mask", "a face mask on sundays"), ("needling", "at-home microneedling on wednesdays"))
            if k in extras]
    tail = f". the only change: {' and '.join(rare)}, in place of that night's active." if rare else "."
    return head + f". built for {_GOAL_WORDS.get(goal, 'healthy skin')}{tail}"


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
