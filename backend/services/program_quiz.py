"""Fixed setup quizzes for the AI programs, read from each program's doc.

Each doc's "What the AI needs to know (intake)" section lists its questions:

    1. `sleep_main_issue` (required) — why it matters ...
       Q: "What's the biggest sleep thing you'd like to fix?" Options: A | B | C

Every question is asked, in order (a model choosing "the fewest" questions
asked two and planned generically). Skipped: anything onboarding already
answered (wake/bed, weekends, work, meals — asks_known_fact), anything another
program already asked (shared facts like age live on the profile), and
anything answered earlier in this intake. Last comes "what do you already do?",
so the plan builds on their habits instead of teaching them what they do.

Skin & Hair, Suppmax and Peptidemax keep their own intake (routine builder,
safety screen, free-text protocol).
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

from services import biohack_scope

QUIZ_PROGRAMS = ("sleepmax", "energymax", "focusmax", "calmmax", "trainmax", "longevitymax")

# One age question for every program (Longevitymax and Suppmax both use it).
AGE_OPTIONS = ["Under 18", "18–29", "30–49", "50–59", "60 or older"]
SHARED = {
    "age_band": {"question": "how old are you?", "options": AGE_OPTIONS, "multi": False},
    # cold water, heat, breath holds and all-out effort are wrong for some
    # people; asked once, every program's avoid-if lines read it
    "health_flags": {"question": biohack_scope.HEALTH_QUESTION, "options": biohack_scope.HEALTH_OPTIONS,
                     "multi": True},
    # the same cold, heat and rest answers decide habits in several programs
    "cold_tolerance": {"question": biohack_scope.COLD_QUESTION, "options": biohack_scope.COLD_OPTIONS, "multi": False},
    "heat_access": {"question": biohack_scope.HEAT_QUESTION, "options": biohack_scope.HEAT_OPTIONS, "multi": False},
    "rest_spot": {"question": biohack_scope.REST_QUESTION, "options": biohack_scope.REST_OPTIONS, "multi": False},
}

# "What do you already do?" — label → the habits it means. Simple daily habits
# they already have are left out of the plan; training habits are scheduled at
# their level instead (see ALREADY_LEVEL_UP).
ALREADY = {
    "sleepmax": {
        "Same wake time most days": ["fixed_wake_time"],
        "Daylight soon after waking": ["morning_light"],
        "No caffeine after early afternoon": ["caffeine_cutoff"],
        "A wind-down routine": ["wind_down"],
        "Dark, cool, quiet bedroom": ["bedroom_setup"],
    },
    "energymax": {
        "Water soon after waking": ["water_on_waking"],
        "Daylight in the morning": ["morning_light"],
        "Protein at breakfast": ["protein_first_meal"],
        "Short walks after meals": ["post_meal_walk"],
        "Get up and move every hour": ["movement_snack"],
    },
    "focusmax": {
        "Coffee or tea timed before hard work": ["caffeine_for_focus"],
        "Daylight soon after waking": ["morning_light"],
        "Exercise or a walk before hard work": ["move_before_focus"],
        "Naps or NSDR during the day": ["power_nap", "nsdr_break"],
        "Cold showers": ["cold_shower_finish"],
    },
    "calmmax": {
        "Breathing exercises": ["physiological_sigh", "slow_belly_breathing"],
        "Walks outside": ["outdoor_walk"],
        "Regular cardio": ["move_it_out"],
        "Yoga": ["slow_yoga"],
        "Screens off before bed": ["screen_free_evening"],
    },
    "trainmax": {
        "Strength training": ["strength_full_body"],
        "Cardio": ["zone2_cardio"],
        "Walking a lot": ["daily_steps"],
        "Stretching or mobility work": ["mobility_flow"],
        "Getting enough protein": ["protein_each_meal"],
    },
    "longevitymax": {
        "Regular cardio": ["zone2_cardio"],
        "Strength training": ["strength_2x"],
        "Walking most days": ["daily_steps"],
        "Plenty of vegetables": ["veg_first"],
        "A regular sleep schedule": ["sleep_regularity"],
        "Sauna most weeks": ["sauna_session"],
    },
}
ALREADY_LEVEL_UP = {"strength_full_body", "zone2_cardio", "daily_steps", "strength_2x", "mobility_flow"}

_ITEM = re.compile(r"^\d+\.\s+`([a-z0-9_]+)`\s*\(([^)]*)\)", re.M)
_Q = re.compile(r'Q:\s*"([^"]+)"\s*Options:\s*(.+)$', re.M)


@lru_cache(maxsize=None)
def quiz_for(maxx_id: str) -> tuple[dict, ...]:
    """The program's questions from its doc, plus the shared/already-doing ones."""
    from services.ai_programs import get_program_doc
    pd = get_program_doc(maxx_id)
    if pd is None or maxx_id not in QUIZ_PROGRAMS:
        return ()
    m = re.search(r"## What the AI needs to know \(intake\)(.*?)(\n## |\Z)", pd.text, re.S)
    section = m.group(1) if m else ""
    out: list[dict] = []
    items = list(_ITEM.finditer(section))
    for i, it in enumerate(items):
        key, flags = it.group(1), it.group(2).lower()
        body = section[it.end(): items[i + 1].start() if i + 1 < len(items) else len(section)]
        q = _Q.search(body)
        if not q:
            continue
        if key in SHARED:
            out.append({"fact_key": key, "shared": True, **SHARED[key]})
            continue
        opts = [o.strip().rstrip(".") for o in q.group(2).split("|") if o.strip()]
        question = q.group(1).strip()
        out.append({"fact_key": key, "question": question[0].lower() + question[1:],
                    "options": opts[:6], "multi": "multi" in flags})
    if maxx_id in ALREADY:
        out.append({"fact_key": "already_doing", "multi": True,
                    "question": "which of these do you already do?",
                    "options": ["None of these"] + list(ALREADY[maxx_id])})
    return tuple(out)


_ACKS = ("got it", "good to know", "makes sense", "", "nearly there", "")


def next_question(maxx_id: str, answers: dict, asked: list, profile: Optional[dict] = None) -> dict:
    from services.ai_programs import asks_known_fact
    about = (profile or {}).get("about") or {}
    asked_keys = {a.get("fact_key") for a in asked or []}
    for q in quiz_for(maxx_id):
        key = q["fact_key"]
        if key in asked_keys or str(answers.get(key) or "").strip():
            continue
        if (q.get("shared") or key in _shared_keys()) and str(about.get(key) or "").strip():
            continue            # another program already asked it
        if any(str(about.get(k) or answers.get(k) or "").strip() for k in SAME_TOPIC.get(key, ())):
            continue            # the same topic was already covered (one caffeine question per person)
        if asks_known_fact(q["question"]):
            continue
        n = len(asked or [])
        return {"done": False, "ack": _ACKS[n % len(_ACKS)] if n else "", "question": q["question"],
                "options": list(q["options"]), "multi": bool(q.get("multi")), "fact_key": key}
    return {"done": True, "ack": "perfect, building your plan", "question": "", "options": [],
            "multi": False, "fact_key": ""}


def already_doing(maxx_id: str, answers: dict) -> set[str]:
    """Habit ids the person said they already do."""
    raw = str((answers or {}).get("already_doing") or "").lower()
    out: set[str] = set()
    for label, ids in ALREADY.get(maxx_id, {}).items():
        if label.lower() in raw:
            out |= set(ids)
    return out


# questions that cover the same topic as one already answered elsewhere
SAME_TOPIC = {"caffeine_pattern": ("caffeine_last_time",), "caffeine_last_time": ("caffeine_pattern",)}


def _shared_keys() -> set[str]:
    from services.ai_programs import ABOUT_KEYS
    return set(ABOUT_KEYS)


_EARLY_OR_NO_CAFFEINE = re.compile(r"before noon|don'?t have caffeine|^none$|no caffeine", re.I)


def safety_skip_ids(maxx_id: str, answers: dict) -> set[str]:
    """Habits this person must never get: a heart condition rules out the cold
    plunge and the sauna, Raynaud's rules out cold water, panic attacks rule
    out breath holds (each habit's `avoid if:` line). Applied to every build
    and every redo, even when it leaves the plan short."""
    from services.ai_programs import get_program_doc
    pd = get_program_doc(maxx_id)
    if pd is None:
        return set()
    return {h.id for h in pd.habits if h.avoid and biohack_scope.health_blocks(h.avoid, answers or {})}


def skip_ids(maxx_id: str, answers: dict) -> set[str]:
    """Habits to leave out: simple ones they already do (training ones level up
    instead) plus everything their answers rule out (preference_skip_ids)."""
    return (already_doing(maxx_id, answers or {}) - ALREADY_LEVEL_UP) | preference_skip_ids(answers)


def preference_skip_ids(answers: dict) -> set[str]:
    """What their answers rule out: a caffeine cutoff for someone whose caffeine
    already stops by noon (a 4:15 pm cutoff contradicted their answer), every
    caffeine habit for someone with none, cold for "not for me", a sauna with
    no sauna, a nap with nowhere to lie down. Never padded back in to fill a
    plan (that is what made 'not for me' come back as the only habit)."""
    a = answers or {}
    out: set[str] = set()
    caff = " ".join(str(a.get(k) or "") for k in ("caffeine_last_time", "caffeine_pattern")).strip()
    if caff and any(_EARLY_OR_NO_CAFFEINE.search(p.strip()) for p in caff.split("  ") + [caff]):
        out.add("caffeine_cutoff")
    if re.match(r"\s*none\b", str(a.get("caffeine_pattern") or ""), re.I) or \
            re.search(r"don'?t have caffeine", str(a.get("caffeine_jitters") or ""), re.I):
        out |= CAFFEINE_HABITS              # no caffeine: nothing to time or cap
    if re.search(r"no noticeable|don'?t have", str(a.get("caffeine_jitters") or ""), re.I) and \
            not re.search(r"4\+|energy", str(a.get("caffeine_pattern") or ""), re.I):
        out.add("caffeine_ceiling")
    cold = str(a.get("cold_tolerance") or "").lower()
    if cold.startswith("not for me"):
        out |= {"cold_shower_finish", "cold_face_reset"}
    elif "face is my limit" in cold or "already do" in cold:
        out.add("cold_shower_finish")       # the face reset only / they already have their cold habit
    heat = str(a.get("heat_access") or "").lower()
    if heat.startswith("neither"):
        out |= {"sauna_session", "heat_session", "sauna_after_training"}
    elif heat.startswith("a bathtub"):
        out |= {"sauna_session", "sauna_after_training"}   # the sauna data is sauna, not baths
    if str(a.get("rest_spot") or "").lower().startswith("no"):
        out |= {"power_nap", "nsdr_break"}
    return out


# habits that time or cap caffeine someone drinks
CAFFEINE_HABITS = {"caffeine_cutoff", "caffeine_for_focus", "green_tea_afternoon", "caffeine_ceiling",
                   "delay_first_coffee"}
