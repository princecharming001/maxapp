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

QUIZ_PROGRAMS = ("sleepmax", "energymax", "focusmax", "calmmax", "trainmax", "longevitymax")

# One age question for every program (Longevitymax and Suppmax both use it).
AGE_OPTIONS = ["Under 18", "18–29", "30–49", "50–59", "60 or older"]
SHARED = {
    "age_band": {"question": "how old are you?", "options": AGE_OPTIONS, "multi": False},
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
        "Plan my top tasks each day": ["top_three_plan"],
        "Blocks of focused time": ["deep_work_block"],
        "Phone out of reach while working": ["phone_away"],
        "Notifications mostly off": ["notification_cleanup"],
        "A clear end to my workday": ["shutdown_ritual"],
    },
    "calmmax": {
        "Breathing exercises": ["physiological_sigh", "slow_belly_breathing"],
        "Walks outside": ["outdoor_walk"],
        "Writing things down": ["brain_dump", "expressive_writing"],
        "Regular time with friends or family": ["connect_ping"],
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


def _shared_keys() -> set[str]:
    from services.ai_programs import ABOUT_KEYS
    return set(ABOUT_KEYS)


_EARLY_OR_NO_CAFFEINE = re.compile(r"before noon|don'?t have caffeine|^none$|no caffeine", re.I)


def skip_ids(maxx_id: str, answers: dict) -> set[str]:
    """Habits to leave out: simple ones they already do (training ones level up
    instead), and a caffeine cutoff for someone whose caffeine already stops by
    noon or who has none (a 4:15 pm cutoff for them contradicted their answer)."""
    out = already_doing(maxx_id, answers) - ALREADY_LEVEL_UP
    caff = " ".join(str((answers or {}).get(k) or "") for k in ("caffeine_last_time", "caffeine_pattern")).strip()
    if caff and any(_EARLY_OR_NO_CAFFEINE.search(p.strip()) for p in caff.split("  ") + [caff]):
        out.add("caffeine_cutoff")
    return out
