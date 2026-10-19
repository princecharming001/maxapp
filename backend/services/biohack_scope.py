"""What Superpower schedules: biology, never productivity.

Focusmax shipped as a planner (plan your top 3, a deep-work block, inbox
batching, a shutdown ritual, a weekly review) and Calmmax as a journal (brain
dump, gratitude note, expressive writing, a friend ping). None of that acts on
the body. Every habit the app recommends has to pull a physiological lever:
light, temperature, caffeine, a compound, food, water, movement, breathing,
rest, sleep, air, the senses, something on the skin, or tracking a body signal.

This module is the one definition of that scope:
  * LEVERS: the allowed `lever:` values in the program docs (tests require one
    on every habit)
  * is_productivity(text): planner / productivity / journaling language, used
    by the doc tests, by validate_template on custom habits, and by the chat
    so a request to add one gets an honest no instead of a to-do list
"""
from __future__ import annotations

import re

LEVERS = frozenset({
    "light",        # daylight, bright light, dim evenings
    "temperature",  # cold water, heat, sauna, a cool bedroom
    "caffeine",     # timing, dose, cutoffs, green tea
    "compound",     # supplements and prescribed protocols
    "nutrition",    # what and when you eat
    "hydration",    # water and electrolytes
    "movement",     # training, steps, movement breaks
    "breathing",    # paced breathing, sighs, nasal breathing
    "rest",         # NSDR, naps, body scans, recovery days
    "sleep",        # timing and regularity of sleep
    "air",          # ventilation, CO2
    "sensory",      # noise, eyes, sound
    "topical",      # skin and scalp care
    "tracking",     # logging a body signal (sleep, energy, HRV, side effects)
})

# Planner / productivity / journaling language. Phrases, not single words:
# "plan" and "list" are everywhere in honest text ("your plan").
_PRODUCTIVITY = re.compile(
    r"\b("
    r"to-?do(?:s| list)?|todo list|top (?:3|three)|plan (?:your|the|tomorrow'?s?) (?:day|tasks|top|priorities|week)|"
    r"priorit(?:y|ies|i[sz]e) (?:list|tasks)|daily planner|weekly planner|planner pad|"
    r"deep[- ]work|time[- ]block(?:ing)?|pomodoro|single[- ]task(?:ing)?|one tab|single[- ]tab|"
    r"batch(?:ing)? (?:your |the )?(?:inbox|email|messages)|inbox zero|e-?mail batch|"
    r"notification (?:cleanup|audit|diet)|turn off notifications|"
    r"shutdown ritual|work(?:day)? shutdown|weekly review|meeting[- ]free|"
    r"journal(?:ing|s)?|gratitude|brain ?dump|expressive writing|worry list|tomorrow list|"
    r"write (?:down|out) (?:your|the|three|3|what|tomorrow)|three lines|"
    r"reach out to|call a friend|text a friend|connect ping|"
    r"goal[- ]setting|set (?:your )?goals|write (?:your )?goals|vision board|affirmations?"
    r")\b",
    re.I,
)


def is_productivity(text: str) -> bool:
    """True when the text describes a planning, productivity or journaling habit."""
    return bool(_PRODUCTIVITY.search(text or ""))


def productivity_terms(text: str) -> list[str]:
    """The matched phrases (for test messages)."""
    return sorted({m.group(0).lower() for m in _PRODUCTIVITY.finditer(text or "")})


# A request to ADD one of these ("add a gratitude journal", "can you schedule a
# daily top 3?")
_ADD = re.compile(r"\b(add|schedule|put (?:in|on)|include|set up|remind me to|give me a)\b", re.I)


def asks_for_productivity_habit(message: str) -> bool:
    msg = message or ""
    return bool(_ADD.search(msg)) and is_productivity(msg)


REFUSAL = ("superpower only schedules things that act on your biology: light, temperature, caffeine timing, "
           "breathing, movement, food, water, sleep, supplements and tracking how your body responds. "
           "planning, journaling and to-do habits aren't part of it, so i haven't added that. ")


def refusal(program_hint: str = "") -> str:
    """Honest reply to a request for a productivity habit, with what to try instead."""
    alt = {
        "focus": "for focus, try caffeine with l-theanine or green tea, daylight soon after waking, a short cold "
                 "rinse, a 10-minute nsdr or a quick burst of movement before hard work.",
        "calm": "for stress, try a physiological sigh, slow breathing at about 6 breaths a minute, a walk outside "
                "or a warm shower before bed.",
    }.get(program_hint, "tell me what you want to improve (focus, energy, stress, sleep) and i'll pick a lever for it.")
    return REFUSAL + alt


# ── who a lever is wrong for ─────────────────────────────────────────────────
# Cold water, heat, hard breathing and all-out effort are real stressors. One
# shared question (asked once across programs, stored as a profile fact) and
# each habit's `avoid if:` line decide who never gets them.

HEALTH_QUESTION = "do any of these apply to you?"
HEALTH_OPTIONS = ["None of these", "Heart or blood-pressure condition", "Pregnant or breastfeeding", "Pain or injury",
                  "Raynaud's or cold sensitivity", "Panic attacks, seizures or fainting", "Prefer not to say"]
COLD_QUESTION = "how do you feel about cold water?"
COLD_OPTIONS = ["Up for a cold finish to my shower", "Willing to try 30 seconds", "Cold on my face is my limit",
                "Not for me", "I already do cold showers or plunges"]
HEAT_QUESTION = "which of these can you use most weeks?"
HEAT_OPTIONS = ["A sauna", "A bathtub", "Both", "Neither"]
REST_QUESTION = "could you lie down or recline for 15 minutes during the day?"
REST_OPTIONS = ["Yes, at work", "Only at home or on days off", "No"]

# condition → words that name it (in an avoid-if line, or in the answer)
_CONDITIONS = {
    "heart": ("heart", "blood pressure", "hypertens", "arrhythm", "cardio", "chest pain", "stroke"),
    "pregnancy": ("pregnan", "breastfeed", "trying to conceive"),
    "cold": ("raynaud", "cold sensitiv", "cold urticaria", "poor circulation"),
    "panic": ("panic",),
    "seizure": ("epilep", "seizure", "faint"),
    "injury": ("injur", "pain or injury", "joint pain", "back pain"),
    "minor": ("under 18",),
}
# "Prefer not to say" is treated as cautious: every lever a condition rules out
_CAUTIOUS = {"heart", "pregnancy", "cold", "panic", "seizure", "injury"}


def _conditions(text: str) -> set[str]:
    t = (text or "").lower()
    return {c for c, words in _CONDITIONS.items() if any(w in t for w in words)}


def health_blocks(avoid: list[str], about: dict) -> set[str]:
    """The person's conditions that rule a habit out (empty = fine for them).
    `about` holds the shared facts: health_flags and age_band."""
    flags = str((about or {}).get("health_flags") or "")
    have = _conditions(flags)
    if "prefer not" in flags.lower():
        have |= _CAUTIOUS
    if str((about or {}).get("age_band") or "").lower().startswith("under 18"):
        have.add("minor")
    return have & _conditions(", ".join(avoid or []))
