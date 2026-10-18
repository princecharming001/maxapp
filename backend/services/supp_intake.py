"""Suppmax: a fixed tap quiz (deterministic), then answers → ordered picks.

Supplements are only worth taking for a reason, and only safe after a screen,
so this asks what the person wants help with, screens them (conditions,
medications, age), and finds real gaps (diet, sun, protein, fiber, bloodwork)
before anything is picked. Age, sex and diet are saved to their profile so no
program asks again.

Order of picks (most deserved first, capped by the daily max):
  1. gaps they told us about (vegan → B12, little sun → D3, rarely fish → omega-3,
     low protein → protein, low fiber → psyllium, low iron on a blood test → iron)
  2. their goals (each goal's program default, or the next pick for that
     program when the default is ruled out)
  3. the default for each other program they run (the existing sync)
Anything matching an avoid-if (conditions, meds, age, pregnancy) is left out.
Under 18: a short teen plan from an allowlist (TEEN_ALLOWED: vitamin D, B12,
omega-3, a basic multi), at most two, always with a parent/doctor check and
food first. A skipped screen: nothing is picked; the plan is the stack audit.
"""
from __future__ import annotations

import re
from typing import Optional

SAFETY_KEYS = ("supp_safety_flags", "supp_medications", "age_band")

# Under 18: the only supplements a teen plan may hold (everything else is
# adult-only), how many a day, and the routines every teen plan carries.
TEEN_ALLOWED = ("vitamin_d3", "b12", "omega3", "multivitamin")
TEEN_DAILY_MAX = 2
TEEN_ROUTINES = ("parent_check", "food_first")
# Adult wording a teen should never get (the library's how is written for adults).
TEEN_HOW = {
    "vitamin_d3": "1) Ask a parent or your doctor first. 2) Pick a D3 at 600 to 1,000 IU with a USP or NSF seal, never a higher dose. 3) Take it with breakfast or lunch.",
    "multivitamin": "1) Ask a parent or your doctor first. 2) Pick a basic teen multivitamin at about 100% of the Daily Value, not a mega dose. 3) Take it with breakfast.",
    "omega3": "1) Try fish like salmon or tuna twice a week first. 2) If you rarely eat fish, ask a parent or doctor about a fish or algae oil. 3) Take the serving on the label with a meal.",
    "b12": "1) Ask a parent or your doctor first. 2) Pick a third-party tested B12, any form. 3) Take it with breakfast; many plant milks and cereals have it added too.",
}

GOALS = {
    "Sleep": "sleepmax", "Energy": "energymax", "Focus": "focusmax", "Stress": "calmmax",
    "Training and recovery": "trainmax", "Skin and hair": "skinhairmax",
    "Long-term health": "longevitymax", "Just the basics": "basics",
}
from services.program_quiz import AGE_OPTIONS as AGES  # one age question for every program
SEXES = ["Male", "Female", "Prefer not to say"]
DIET = {
    "Vegan or vegetarian": "plant_based",
    "Rarely eat fish": "low_fish",
    "Little sun, indoors most days": "low_sun",
    "Hard to get enough protein": "low_protein",
    "Few vegetables, beans or whole grains": "low_fiber",
    "A blood test showed low iron": "low_iron",
}

QUIZ = [
    {"fact_key": "supp_goals", "multi": True, "ack": "",
     "question": "what do you want supplements to help with?", "options": list(GOALS)},
    {"fact_key": "supp_safety_flags", "multi": True, "ack": "got it",
     "question": "before we pick anything: do any of these apply to you?",
     "options": ["None of these", "Pregnant, trying, or breastfeeding", "Kidney or liver condition",
                 "Surgery in the next 2 weeks"]},
    {"fact_key": "supp_medications", "multi": True, "ack": "good to know",
     "question": "do you take any of these regularly?",
     "options": ["None", "Blood thinners", "Antidepressants, anxiety or sleep meds",
                 "Blood pressure or heart meds", "Diabetes, thyroid or other daily meds"]},
    {"fact_key": "age_band", "multi": False, "ack": "",
     "question": "how old are you?", "options": AGES, "profile": True},
    {"fact_key": "sex", "multi": False, "ack": "",
     "question": "which fits you? it changes things like iron and which multivitamin fits.",
     "options": SEXES, "profile": True},
    {"fact_key": "supp_diet", "multi": True, "ack": "",
     "question": "any of these true for you most weeks?", "options": ["None of these"] + list(DIET)},
    {"fact_key": "supp_current_stack", "multi": True, "ack": "nearly done",
     "question": "what do you already take?",
     "options": ["Nothing yet", "Multivitamin", "Vitamin D or fish oil", "Magnesium, melatonin or a sleep aid",
                 "Protein, creatine or pre-workout"]},
]
PROFILE_KEYS = ("age_band", "sex")


def _known(key: str, answers: dict, profile: Optional[dict]) -> bool:
    if str(answers.get(key) or "").strip():
        return True
    return bool(str(((profile or {}).get("about") or {}).get(key) or "").strip())


def _under_18(answers: dict, profile: Optional[dict]) -> bool:
    age = str(answers.get("age_band") or ((profile or {}).get("about") or {}).get("age_band") or "")
    return "under 18" in age.lower()


def is_minor(answers: dict, profile: Optional[dict] = None) -> bool:
    return _under_18(answers or {}, profile)


def next_question(answers: dict, asked: list, profile: Optional[dict] = None) -> dict:
    """The next unanswered quiz step, in the shape next_intake_step returns.
    Age and sex already on the profile are not asked again. Teens get the whole
    quiz too: their diet answers decide the (small) teen plan."""
    asked_keys = {a.get("fact_key") for a in asked or []}
    for q in QUIZ:
        if q["fact_key"] in asked_keys or _known(q["fact_key"], answers, profile):
            continue
        return {"done": False, "ack": q["ack"], "question": q["question"], "options": list(q["options"]),
                "multi": q["multi"], "fact_key": q["fact_key"]}
    return {"done": True, "ack": "thanks, building your stack", "question": "", "options": [],
            "multi": False, "fact_key": ""}


def read_answers(answers: dict, profile: Optional[dict] = None) -> dict:
    about = (profile or {}).get("about") or {}
    goals_raw = str(answers.get("supp_goals") or "").lower()
    goals = [v for k, v in GOALS.items() if k.lower() in goals_raw]
    diet_raw = str(answers.get("supp_diet") or "").lower()
    gaps = {v for k, v in DIET.items() if k.lower() in diet_raw}
    if re.search(r"\bvegan|vegetarian|plant", diet_raw + " " + str(about.get("diet") or "").lower()):
        gaps.add("plant_based")
    age = str(answers.get("age_band") or about.get("age_band") or "")
    sex = str(answers.get("sex") or about.get("sex") or "")
    return {"goals": goals, "gaps": gaps, "age_band": age, "sex": sex,
            "over_50": age in ("50–59", "60 or older"), "under_18": "under 18" in age.lower()}


def safety_text(answers: dict, profile: Optional[dict] = None) -> str:
    """Only the screening answers (conditions, meds, age) — what avoid-if lists
    are matched against. Goals or diet words must never rule anything out."""
    about = (profile or {}).get("about") or {}
    parts = [str(answers.get(k) or "") for k in ("supp_safety_flags", "supp_medications")]
    parts.append(str(answers.get("age_band") or about.get("age_band") or ""))
    return " | ".join(p for p in parts if p.strip())


_GAP_PICKS = [("low_iron", "iron"), ("plant_based", "b12"), ("low_sun", "vitamin_d3"),
              ("low_fish", "omega3"), ("low_protein", "protein_powder"), ("low_fiber", "psyllium_fiber")]


def ordered_picks(answers: dict, active: set[str], profile: Optional[dict], lib_habits: list,
                  contraindicated) -> list[str]:
    """Habit ids in the order they deserve a slot, safe ones only."""
    a = read_answers(answers, profile)
    if not safety_text(answers, profile).strip():
        return []
    if a["under_18"]:
        return _teen_picks(a, lib_habits, contraindicated)
    by_id = {h.id: h for h in lib_habits}
    safe = lambda hid: hid in by_id and not contraindicated(by_id[hid])  # noqa: E731
    out: list[str] = []

    def add(hid: str):
        if hid not in out and safe(hid):
            out.append(hid)

    for gap, hid in _GAP_PICKS:
        if gap in a["gaps"]:
            add(hid)
    if a["over_50"]:
        add("b12")

    def for_program(mid: str):
        primary = next((h for h in lib_habits if h.primary_for == mid), None)
        if primary and safe(primary.id):
            add(primary.id)
            return
        alt = next((h for h in lib_habits if mid in h.programs and h.tier != "hard" and safe(h.id)), None)
        if alt:
            add(alt.id)

    for g in a["goals"]:
        if g == "basics":
            add("vitamin_d3")
        else:
            for_program(g)
    for mid in sorted(active):
        for_program(mid)
    return out


def _teen_picks(a: dict, lib_habits: list, contraindicated) -> list[str]:
    """Under 18: only allowlisted picks, only for a gap (or "just the basics"),
    vitamin D when nothing else applies, never more than TEEN_DAILY_MAX."""
    by_id = {h.id: h for h in lib_habits}
    out: list[str] = []

    def add(hid: str):
        if hid in TEEN_ALLOWED and hid in by_id and hid not in out and not contraindicated(by_id[hid]):
            out.append(hid)

    gaps = a["gaps"]
    if "plant_based" in gaps:
        add("b12")
    if "low_sun" in gaps:
        add("vitamin_d3")
    if "low_fish" in gaps:
        add("omega3")
    if gaps & {"plant_based", "low_protein", "low_fiber"} or "basics" in a["goals"]:
        add("multivitamin")
    if not out:
        add("vitamin_d3")       # the most common teen shortfall, low risk at a teen dose
    return out[:TEEN_DAILY_MAX]
