"""AI programs — the biohacking Maxes whose intake AND schedule are built by Claude.

The seven programs (Sleepmax, Energymax, Focusmax, Calmmax, Fitmax, Skin & Hair,
Longevitymax) replace the old doc-driven looks programs. Nothing here is a fixed
question list or a fixed skeleton:

  * Intake: Claude reads the program's research doc + everything we already
    know about the user (onboarding day shape, minutes-a-day budget, facts) and
    asks ONLY the few questions it actually needs, one at a time, then says
    when it has enough.
  * Planning: Claude builds a weekly habit TEMPLATE (habit, time, minutes,
    weekdays) that fits the user's real day, their time budget and every other
    program they already run. The template is stored on the schedule row
    (schedule_context["ai_plan"]) and expanded deterministically into dated
    tasks, so regeneration / horizon extension / edits never need another LLM
    call and every existing reader (Home, Planner, pushes, Google Calendar)
    keeps working on the usual task shape.
  * Redo: any time the user asks ("make it lighter", "move it all later",
    "swap the journaling"), Claude rebuilds the template from the current one
    plus the request, and the row is updated in place (done tasks are kept).

Safety: Claude may only schedule habits from the program's researched library
(plus a plain custom habit the user explicitly asked for). No diagnosis, no
supplements or dosing, no prescription anything — the docs and the prompts
both say so, and validation drops anything outside the library.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# ── Catalog ─────────────────────────────────────────────────────────────────

AI_PROGRAM_DIR = Path(__file__).resolve().parent.parent / "ai_programs"

# Ordered as Explore shows them. `goal` = the onboarding goal it answers.
AI_PROGRAMS: dict[str, dict[str, str]] = {
    "sleepmax": {
        "label": "Sleepmax", "goal": "sleep", "doc": "sleepmax.md",
        "tagline": "fall asleep faster, wake up rested",
        "description": "Light, caffeine timing and a short wind-down, set around your real bedtime.",
        "icon": "moon-outline", "color": "#5B6CD9",
    },
    "energymax": {
        "label": "Energymax", "goal": "energy", "doc": "energymax.md",
        "tagline": "steadier energy all day",
        "description": "Hydration, morning light, movement snacks and smarter caffeine for fewer slumps.",
        "icon": "flash-outline", "color": "#E0A21B",
    },
    "focusmax": {
        "label": "Focusmax", "goal": "focus", "doc": "focusmax.md",
        "tagline": "longer stretches of deep work",
        "description": "Plan your top three, protect one deep-work block and shut down on time.",
        "icon": "locate-outline", "color": "#2F8F83",
    },
    "calmmax": {
        "label": "Calmmax", "goal": "stress", "doc": "calmmax.md",
        "tagline": "calmer days, quicker resets",
        "description": "Breathing resets, walks outside and an evening brain dump that fit busy days.",
        "icon": "leaf-outline", "color": "#4F9D5D",
    },
    "trainmax": {
        "label": "Fitmax", "goal": "training", "doc": "fitmax.md",
        "tagline": "move more, recover better",
        "description": "Short strength sessions, steps, mobility and posture work that fit your week.",
        "icon": "barbell-outline", "color": "#D9534F",
    },
    "skinhairmax": {
        "label": "Skin & Hair", "goal": "skin_hair", "doc": "skinhairmax.md",
        "tagline": "simple daily care that adds up",
        "description": "A short AM/PM skin routine and gentle scalp care, introduced slowly.",
        "icon": "water-outline", "color": "#C77DBA",
    },
    "longevitymax": {
        "label": "Longevitymax", "goal": "longevity", "doc": "longevitymax.md",
        "tagline": "the habits that compound",
        "description": "Zone-2 cardio, strength twice a week, daily steps and the basics done consistently.",
        "icon": "infinite-outline", "color": "#7A5CC7",
    },
    "suppmax": {
        "label": "Suppmax", "goal": "", "doc": "suppmax.md",
        "tagline": "supplements that match your stack",
        "description": "The few supplements worth taking for your goals, timed around your day and kept in sync with your other programs.",
        "icon": "medical-outline", "color": "#0E9AA7",
    },
    "peptidemax": {
        "label": "Peptidemax", "goal": "", "doc": "peptidemax.md",
        "tagline": "your peptide protocol, organized",
        "description": "Dose reminders, site rotation, storage, side-effect logs and check-ins for the protocol your clinician set.",
        "icon": "flask-outline", "color": "#6C63FF",
    },
}

# Onboarding goals map to the habit programs only; Suppmax / Peptidemax are
# added from Explore.
GOAL_TO_PROGRAM = {v["goal"]: k for k, v in AI_PROGRAMS.items() if v["goal"]}

# Suppmax mirrors the user's other programs: each active program brings its
# "primary" supplement in, and removing the program takes it back out (unless
# the user chose that supplement for their own goal). Peptidemax never syncs:
# getting peptides is its own process, so it only ever tracks what the user has.
SUPP_PROGRAM = "suppmax"
PEPTIDE_PROGRAM = "peptidemax"
NO_SYNC_PROGRAMS = (SUPP_PROGRAM, PEPTIDE_PROGRAM)

# The retired looks programs. Their docs stay loaded (old rows + tests), but
# they are hidden from Explore, /api/maxes and new starts.
RETIRED_PROGRAMS = ("skinmax", "hairmax", "heightmax", "bonemax", "fitmax")

# How many days of dated tasks one expansion writes. Horizon extension
# re-expands from the stored template, so this is just the runway.
AI_PLAN_DAYS = 28

MAX_INTAKE_QUESTIONS = 3
INTAKE_KEY = "_ai_intake"
SUPP_OFFER_KEY = "_supp_offer"       # a supplement Suppmax asked to add, waiting for yes/no
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def is_ai_program(maxx_id: Optional[str]) -> bool:
    return (maxx_id or "").strip().lower() in AI_PROGRAMS


def program_label(maxx_id: str) -> str:
    return AI_PROGRAMS.get(maxx_id, {}).get("label") or (maxx_id[:1].upper() + maxx_id[1:])


@dataclass
class Habit:
    id: str
    title: str
    minutes_min: int
    minutes_default: int
    anchor: str
    frequency: str
    tier: str
    why: str
    how: str
    # Suppmax only: the programs this supplement serves, the one program it is
    # the default pick for, and plain contraindication keywords.
    programs: list[str] = field(default_factory=list)
    primary_for: str = ""
    avoid: list[str] = field(default_factory=list)
    timing: str = ""
    dose_note: str = ""
    # what sort of thing it is (BETA1_CONTRACTS C1): an action you tick, a
    # rule (a boundary with nothing to tick), a one-time setup, or a check-in
    kind: str = ""
    order: str = ""            # "first": first habit after waking
    after: str = ""            # placed after this habit when both are planned
    cycle_on: int = 0          # weeks on / weeks off, repeating ("4 on / 1 off")
    cycle_off: int = 0
    trial_weeks: int = 0       # weeks 1..N only, then a review ("trial 12")

    @property
    def is_rule(self) -> bool:
        return self.kind == "rule" or (not self.kind and self.minutes_min == 0 and self.minutes_default == 0)

    @property
    def habit_kind(self) -> str:
        return self.kind or ("rule" if self.is_rule else "action")


@dataclass
class ProgramDoc:
    maxx_id: str
    text: str
    habits: list[Habit] = field(default_factory=list)

    def habit(self, hid: str) -> Optional[Habit]:
        for h in self.habits:
            if h.id == hid:
                return h
        return None


_HABIT_HEAD = re.compile(r"^###\s+`([a-z0-9_]+)`\s*[—–-]\s*(.+?)\s*$")
_FIELD = re.compile(r"^-\s*([a-z /]+?):\s*(.*)$", re.IGNORECASE)
_DOCS: dict[str, ProgramDoc] = {}


def _int_or(v: str, default: int) -> int:
    m = re.search(r"\d+", v or "")
    return int(m.group(0)) if m else default


def parse_program_doc(maxx_id: str, text: str) -> ProgramDoc:
    """Pull the habit library out of a research doc. The full text still goes
    to Claude as grounding; the parsed library is what validation trusts."""
    habits: list[Habit] = []
    cur: Optional[dict] = None
    in_library = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_library = line.strip().lower().startswith("## habit library")
            continue
        if not in_library:
            continue
        m = _HABIT_HEAD.match(line.strip())
        if m:
            if cur:
                habits.append(cur["h"])
            cur = {"h": Habit(id=m.group(1), title=m.group(2).strip(), minutes_min=0, minutes_default=10,
                              anchor="flexible", frequency="daily", tier="core", why="", how="")}
            continue
        if not cur:
            continue
        f = _FIELD.match(line.strip())
        if not f:
            continue
        key, val = f.group(1).strip().lower(), f.group(2).strip()
        h: Habit = cur["h"]
        if key == "minutes":
            parts = val.split("/")
            h.minutes_min = _int_or(parts[0], 0)
            h.minutes_default = _int_or(parts[1] if len(parts) > 1 else parts[0], h.minutes_min or 10)
        elif key == "anchor":
            h.anchor = val
        elif key == "frequency":
            h.frequency = val
        elif key == "tier":
            h.tier = val.split()[0].lower() if val else "core"
        elif key == "why":
            h.why = val
        elif key == "how":
            h.how = val
        elif key == "programs":
            h.programs = [x.strip().lower() for x in val.split(",")
                          if x.strip() and x.strip().lower() != "none"]
        elif key == "primary for":
            v = val.split(",")[0].strip().lower()
            h.primary_for = "" if v in ("", "none") else v
        elif key == "avoid if":
            h.avoid = [x.strip().lower() for x in val.split(",")
                       if x.strip() and x.strip().lower() != "none"]
        elif key == "timing":
            h.timing = val
        elif key == "dose note":
            h.dose_note = val
        elif key == "kind":
            k = val.split()[0].lower() if val else ""
            h.kind = k if k in ("action", "rule", "setup", "checkin") else ""
        elif key == "order":
            h.order = val.split()[0].lower() if val else ""
        elif key == "after":
            h.after = val.strip("` ").split()[0].lower() if val else ""
        elif key == "cycle":
            mc = re.fullmatch(r"(\d+)\s*on\s*/\s*(\d+)\s*off", val.strip().lower())
            mt = re.fullmatch(r"trial\s*(\d+)", val.strip().lower())
            if mc:
                h.cycle_on, h.cycle_off = int(mc.group(1)), int(mc.group(2))
            elif mt:
                h.trial_weeks = int(mt.group(1))
    if cur:
        habits.append(cur["h"])
    return ProgramDoc(maxx_id=maxx_id, text=text, habits=habits)


def get_program_doc(maxx_id: str) -> Optional[ProgramDoc]:
    if maxx_id not in AI_PROGRAMS:
        return None
    if maxx_id not in _DOCS:
        path = AI_PROGRAM_DIR / AI_PROGRAMS[maxx_id]["doc"]
        try:
            _DOCS[maxx_id] = parse_program_doc(maxx_id, path.read_text(encoding="utf-8"))
        except Exception:
            logger.exception("ai_programs: could not load doc for %s", maxx_id)
            return None
    return _DOCS[maxx_id]


def register_ai_program_docs() -> None:
    """Register a MaxDoc per program in the shared catalog so every reader that
    looks a max up by id (thread titles, course titles, task guides, the
    'unknown max' guards) finds it. No skeleton: these are never expanded by
    the doc engine — the stored AI template is."""
    try:
        from services.max_doc_loader import MaxDoc, TaskDef
        from services.task_catalog_service import register_doc
    except Exception:
        logger.exception("ai_programs: catalog imports failed")
        return
    for mid, meta in AI_PROGRAMS.items():
        pd = get_program_doc(mid)
        if pd is None:
            continue
        tasks = [
            TaskDef(
                id=f"{mid}.{h.id}", title=h.title, description=h.how or h.why,
                duration_min=max(1, h.minutes_default or h.minutes_min or 2),
                default_window="flexible", tags=["ai_program", "foundation"],
                applies_when=[], contraindicated_when=[], intensity=0.5,
                evidence_section=None, cooldown_hours=0,
                frequency={"type": "daily", "n": 1}, source_doc=f"ai_program:{mid}",
            )
            for h in pd.habits
        ]
        register_doc(MaxDoc(
            maxx_id=mid, display_name=meta["label"], short_description=meta["tagline"],
            schedule_design={}, required_fields=[], optional_context=[], prompt_modifiers=[],
            info_schema=[], chunks=[], tasks=tasks, source_path=f"ai_program:{mid}",
        ))


# ── Profile ─────────────────────────────────────────────────────────────────

def _hm(v: Any, default: str) -> str:
    s = str(v or "").strip()
    return s if re.fullmatch(r"\d{1,2}:\d{2}", s) else default


def _to_min(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def _from_min(m: int) -> str:
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# Facts about the person any program may ask once and every program then reuses
# (first_meal_style: the fit puts "protein at your first meal" at lunch for
# people who skip breakfast).
# Facts any program's quiz asks once and every program reuses (beta 1, F33:
# Energymax asked about caffeine minutes after Sleepmax did, then set a 4:15 pm
# cutoff for someone whose last caffeine is before noon)
ABOUT_KEYS = ("age_band", "sex", "first_meal_style", "caffeine_last_time", "caffeine_pattern",
              "drinks_alcohol", "evening_screens", "sitting_hours")


def _window(w) -> Optional[list[str]]:
    """["23:30","00:15"] → normalized HH:MM pair, else None."""
    if isinstance(w, (list, tuple)) and len(w) == 2:
        a, b = _hm(w[0], ""), _hm(w[1], "")
        if a and b:
            return [a, b]
    return None


def build_profile(state: dict) -> dict:
    """The compact picture of the user's day Claude plans around."""
    # The person's real wake and bed times. (Onboarding stores the WIND-DOWN
    # window in sleep_window, so the window-based schedulable_anchors would read
    # the start of wind-down as bedtime and pull every evening habit ~45 min
    # early.) Fall back to the window logic only when no scalar exists.
    wake, sleep = _hm(state.get("wake_time"), ""), _hm(state.get("sleep_time"), "")
    if not wake or not sleep:
        try:
            from services.schedule_dsl import schedulable_anchors
            w2, s2 = schedulable_anchors(state)
        except Exception:
            w2, s2 = "07:00", "23:00"
        wake, sleep = wake or w2, sleep or s2
    minutes = state.get("daily_minutes")
    try:
        minutes = int(minutes) if minutes is not None else None
    except (TypeError, ValueError):
        minutes = None
    if minutes is None:
        minutes = {"low": 10, "medium": 25, "high": 45}.get(str(state.get("biohack_level") or ""), 25)
    facts = state.get("user_facts") or {}
    # Spelled out so Claude never asks what onboarding already answered
    # ("how much later do you wake on weekends?" after "same rhythm").
    wt = state.get("weekly_timings") if isinstance(state.get("weekly_timings"), dict) else {}
    sat = wt.get("saturday") if isinstance(wt.get("saturday"), dict) else {}
    if sat.get("wake_time") or sat.get("sleep_time"):
        weekends = f"wakes {sat.get('wake_time') or wake}, bed {sat.get('sleep_time') or sleep} on weekends"
    elif state.get("weekend_shift"):
        weekends = "sleeps in about an hour later on weekends"
    else:
        weekends = "same wake and bed times on weekends as on weekdays"
    return {
        "wake_time": wake,
        "bed_time": sleep,
        "weekends": weekends,
        "obligations": [
            {k: o.get(k) for k in ("label", "start", "end", "days") if isinstance(o, dict)}
            for o in (state.get("obligations") or []) if isinstance(o, dict)
        ],
        "work_location": state.get("work_location"),
        "commute_minutes": state.get("commute_minutes"),
        "meals": {
            "breakfast": state.get("breakfast_time"), "lunch": state.get("lunch_time"),
            "dinner": state.get("dinner_time"),
        },
        # onboarding stores the workout as preferred_workout_*; nothing writes
        # "workout_time", which left every plan thinking there was no workout
        # (or, via a stale anchor, a "7am workout" that didn't exist)
        "workout_time": _hm(state.get("preferred_workout_time") or state.get("workout_time"), "") or None,
        "workout_window": _window(state.get("preferred_workout_window")),
        "wind_down_window": _window(state.get("wind_down_window") or state.get("sleep_window")),
        "get_ready_window": _window(state.get("get_ready_window")),
        "weekend_shift": bool(state.get("weekend_shift")),
        "weekly_timings": state.get("weekly_timings") or {},
        "shower_time": state.get("shower_time"),
        "minutes_per_day_total": max(5, min(120, minutes)),
        "goals": state.get("goals") or [],
        "timezone": state.get("timezone"),
        # the day shape above is the truth; a fact copy of it can only be stale
        "known_facts": {k: v for k, v in (facts.items() if isinstance(facts, dict) else [])
                        if not str(k).startswith("_") and k not in ("wake_time", "sleep_time")},
        # asked once by any program's quiz, then reused (never asked again)
        "about": {k: state.get(k) for k in ABOUT_KEYS if str(state.get(k) or "").strip()},
    }


# ── Claude calls ────────────────────────────────────────────────────────────

_SAFETY = (
    "Safety rules (never break): general wellness routines only. Never diagnose, "
    "never recommend or dose supplements, medications, prescription products, peptides "
    "or nootropics, never suggest extreme fasting, calorie targets or sleep restriction, "
    "never make appearance, height or lifespan promises. If the user mentions a medical "
    "condition, pregnancy, an injury or a crisis, keep habits gentle and tell them to "
    "check with a professional (for self-harm: US 988, UK Samaritans 116 123)."
)

_SUPP_SAFETY = (
    "Safety rules (never break): this is the supplement program. Only schedule supplements from the "
    "library. Never go above the label serving; describe amounts only as 'the serving on your label' "
    "plus the doc's dose note as information. Respect every 'avoid if' against the user's answers: if "
    "they are pregnant or breastfeeding, on blood thinners, antidepressants, blood pressure, thyroid or "
    "diabetes medication, or have kidney or liver disease, leave out anything flagged for that and tell "
    "them to ask their doctor or pharmacist. Never add iron without bloodwork showing it is low. No "
    "stimulant stacking. Never claim a supplement treats, cures or prevents a disease. For self-harm: "
    "US 988, UK Samaritans 116 123."
)

_PEPTIDE_SAFETY = (
    "Safety rules (never break): this program organizes a peptide protocol the user ALREADY has. "
    "Never recommend a peptide, never suggest, calculate or change a dose, never explain how or where to "
    "get peptides. Schedule only peptides the user named, at the frequency and with the instructions "
    "they said their prescriber or clinic gave, in their own words. If they are self-sourcing or unsure "
    "of their protocol, still organize tracking, but add a 'confirm your protocol with a clinician' "
    "task and say why plainly. Point to emergency care for severe abdominal pain, allergic reactions "
    "or an infected injection site. No outcome promises. For self-harm: US 988, UK Samaritans 116 123."
)


def _safety(maxx_id: str) -> str:
    if maxx_id == SUPP_PROGRAM:
        return _SUPP_SAFETY
    if maxx_id == PEPTIDE_PROGRAM:
        return _PEPTIDE_SAFETY
    return _SAFETY


_VOICE = (
    "Voice: Superpower, a calm, direct coach for busy people. Lowercase, short, "
    "texting style, no emoji, no em dashes, no hype."
)


async def _claude_tool(system: str, user: str, tool: dict, *, max_tokens: int = 2500) -> Optional[dict]:
    """One forced-tool Claude call → the tool input dict, or None on failure."""
    from config import settings
    key = (settings.anthropic_api_key or "").strip()
    if not key:
        logger.warning("ai_programs: no ANTHROPIC_API_KEY; AI programs unavailable")
        return None
    try:
        import anthropic
    except Exception:
        logger.exception("ai_programs: anthropic sdk missing")
        return None
    client = anthropic.AsyncAnthropic(api_key=key)
    models = []
    for m in (getattr(settings, "ai_program_model", "") or "", settings.anthropic_model or "", "claude-haiku-4-5"):
        m = m.strip()
        if m and m not in models:
            models.append(m)
    for model in models:
        try:
            resp = await client.messages.create(
                model=model, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": user}],
                tools=[tool], tool_choice={"type": "tool", "name": tool["name"]},
                timeout=60.0,
            )
            for block in resp.content:
                if getattr(block, "type", "") == "tool_use":
                    return dict(block.input or {})
            logger.warning("ai_programs: %s returned no tool_use", model)
        except Exception as e:
            logger.warning("ai_programs: claude call failed on %s (%s: %s)", model, type(e).__name__, e)
            continue
    return None


_INTAKE_TOOL = {
    "name": "intake_step",
    "description": "Decide the next intake step for this program.",
    "input_schema": {
        "type": "object",
        "properties": {
            "done": {"type": "boolean", "description": "true when you know enough to build a good plan"},
            "ack": {"type": "string", "description": "one short line reacting to their last answer (empty on the first question)"},
            "question": {"type": "string", "description": "the next question, one sentence, empty when done"},
            "fact_key": {"type": "string", "description": "snake_case key the answer is stored under"},
            "options": {"type": "array", "items": {"type": "string"}, "description": "2-5 short tap options"},
            "multi": {"type": "boolean", "description": "true if several options can apply"},
        },
        "required": ["done", "ack", "question", "fact_key", "options", "multi"],
    },
}


_KNOWN_FACT_RE = re.compile(
    r"\b(weekends?|sleep in|wake (up )?(time|on)|what time do you (wake|get up|go to bed|sleep)|bed ?time|"
    r"go(ing)? to bed|work(ing)? hours|when do you (work|start work|finish work|eat)|commute|"
    r"breakfast|lunch time|dinner time|meal times?|how (many|much) (minutes|time) (a|per|each) day)\b",
    re.IGNORECASE)


_NONE_OPT = re.compile(r"^(none|no|nothing|not really|none of (these|the above)|prefer not to say|n/a)\b", re.I)
_FREE_OPT = re.compile(r"^(something else|other|another|else)\W*$", re.I)


# "do you take / have / do any of these…" — a question someone can honestly answer "none"
_SCREEN_Q = re.compile(r"\b(any of these|apply to you|do you (take|have|use|already)|what do you (already )?(take|use)|"
                       r"medications?|meds|conditions?|allerg|pregnan|injur)\b", re.I)


def tidy_options(opts: list[str], *, multi: bool, question: str = "") -> list[str]:
    """Chips a person can always answer: a 'pick any that apply' list, or any
    screening question ("do you take any of these?"), gets a 'none of these'
    FIRST (a safety question with nothing that applies was a dead end), and a
    free-text 'something else' goes last, never first."""
    free = [o for o in opts if _FREE_OPT.match(o.strip(" .…"))]
    out = [o for o in opts if o not in free]
    if out and (multi or _SCREEN_Q.search(question or "")):
        nones = [o for o in out if _NONE_OPT.match(o)]
        out = (nones[:1] or ["none of these"]) + [o for o in out if not _NONE_OPT.match(o)]
    return out + free[:1]


def asks_known_fact(question: str) -> bool:
    """True when an intake question asks what onboarding already collected."""
    return bool(_KNOWN_FACT_RE.search(question or ""))


async def next_intake_step(maxx_id: str, profile: dict, answers: dict, asked: list[dict]) -> dict:
    """Claude's next question for this program, or done. Falls back to done
    (plan with what we have) if Claude is unavailable — never blocks the user."""
    if maxx_id == "skinhairmax":
        # a fixed 3-question quiz: the routine builder needs exactly these
        from services import skin_routine
        return skin_routine.next_question(answers, asked)
    if maxx_id == SUPP_PROGRAM:
        # a fixed screen: goals, safety, meds, age, sex, gaps, current stack
        from services import supp_intake
        return supp_intake.next_question(answers, asked, profile)
    if maxx_id == PEPTIDE_PROGRAM:
        # the protocol check: consent, age, situation, each peptide's label,
        # class-specific screens, prescriber awareness, label confirmation
        from services import peptide_intake
        return peptide_intake.next_question(answers, asked, profile)
    from services import program_quiz
    if maxx_id in program_quiz.QUIZ_PROGRAMS:
        # every question in the program's doc, in order, minus what's known
        return program_quiz.next_question(maxx_id, answers, asked, profile)
    pd = get_program_doc(maxx_id)
    if pd is None or len(asked) >= MAX_INTAKE_QUESTIONS:
        return {"done": True, "ack": "", "question": "", "options": [], "multi": False, "fact_key": ""}
    system = (
        f"You set up the {program_label(maxx_id)} program inside the Superpower app. "
        "You ask the fewest questions needed to personalize it, then stop.\n"
        f"{_VOICE}\n{_safety(maxx_id)}\n\n"
        "Rules for intake:\n"
        "- The user's day (wake, bed, weekends, work hours, commute, meals, workout time) and their "
        "minutes-per-day budget are already known from onboarding (see profile). Never ask about "
        "those, including whether or how much they sleep in on weekends.\n"
        "- Never ask something already in known_facts or answers.\n"
        f"- Ask at most {MAX_INTAKE_QUESTIONS} questions in total. Aim for 2. Only ask a question if "
        "its answer would clearly change which habits you schedule, when, or how hard. Anything "
        "nice-to-know but not plan-changing: skip it and set done=true. People are busy; "
        "fewer questions is better.\n"
        "- Ask the safety-relevant question first when the program doc has one.\n"
        "- One question per turn, with 2 to 5 short tap options. Options are plain words, "
        "no emoji.\n"
        "- If the user's last answer is unclear or off-topic, either interpret it sensibly or "
        "ask again more simply.\n\n"
        "Program research doc:\n" + pd.text
    )
    user = json.dumps({
        "profile": profile,
        "answers_so_far": answers,
        "questions_already_asked": [a.get("question") for a in asked],
        "questions_remaining_allowed": MAX_INTAKE_QUESTIONS - len(asked),
    }, default=str)
    out = await _claude_tool(system, user, _INTAKE_TOOL, max_tokens=700)
    if out and not out.get("done") and asks_known_fact(str(out.get("question") or "")):
        # Onboarding already answered this (weekends, wake/bed, work, meals,
        # minutes). Say so once; a repeat ends intake instead of asking it.
        retry_user = json.dumps({**json.loads(user), "rejected_question": out.get("question"),
                                 "why_rejected": "already known from onboarding; see profile. Ask something "
                                                 "else that changes the plan, or set done=true."}, default=str)
        out = await _claude_tool(system, retry_user, _INTAKE_TOOL, max_tokens=700)
        if out and asks_known_fact(str(out.get("question") or "")):
            out = {**out, "done": True}
    if not out:
        return {"done": True, "ack": "", "question": "", "options": [], "multi": False, "fact_key": ""}
    q = str(out.get("question") or "").strip()
    raw_opts = [str(o).strip() for o in (out.get("options") or []) if str(o).strip()]
    # keep a "none" Claude offered even when it listed it sixth
    raw_opts = ([o for o in raw_opts if _NONE_OPT.match(o)][:1] + [o for o in raw_opts if not _NONE_OPT.match(o)])[:6]
    opts = tidy_options(raw_opts, multi=bool(out.get("multi")), question=q)
    done = bool(out.get("done")) or not q
    return {
        "done": done,
        "ack": str(out.get("ack") or "").strip(),
        "question": "" if done else q,
        "options": [] if done else opts,
        "multi": bool(out.get("multi")) and not done,
        "fact_key": re.sub(r"[^a-z0-9_]", "_", str(out.get("fact_key") or "").lower()).strip("_")[:40]
                    or f"q{len(asked) + 1}",
    }


_PLAN_TOOL = {
    "name": "build_plan",
    "description": "Return the user's weekly habit plan for this program.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "2-3 short lines telling the user what the plan is and why it fits their day"},
            "habits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "habit_id": {"type": "string", "description": "an id from the habit library, or custom_<slug> ONLY for a habit the user explicitly asked for"},
                        "title": {"type": "string", "description": "short title, 4 words max"},
                        "how": {"type": "string", "description": "1-2 concrete steps tailored to this user"},
                        "why": {"type": "string", "description": "one short line"},
                        "minutes": {"type": "integer"},
                        "time": {"type": "string", "description": "HH:MM 24h on workdays"},
                        "weekend_time": {"type": "string", "description": "HH:MM on Sat/Sun, or empty to reuse time"},
                        "days": {"type": "array", "items": {"type": "string", "enum": WEEKDAYS}},
                    },
                    "required": ["habit_id", "title", "how", "why", "minutes", "time", "weekend_time", "days"],
                },
            },
        },
        "required": ["summary", "habits"],
    },
}


def _other_minutes_per_day(other_plans: dict[str, dict]) -> int:
    """Busiest-day minutes the other programs use (1-minute reminders free)."""
    from services import ai_fit
    return max((sum(ai_fit.day_load((t or {}).get("habits"), d) for t in other_plans.values())
                for d in ai_fit.WEEKDAYS), default=0)


def _program_share(budget_total: int, other_plans: dict[str, dict]) -> int:
    """Minutes this program can use on its tightest day (fair share of the stack)."""
    from services import ai_fit
    return int(min(ai_fit.allowance(budget_total, other_plans).values()))


async def build_plan(
    maxx_id: str,
    profile: dict,
    answers: dict,
    other_plans: dict[str, dict],
    *,
    current_plan: Optional[dict] = None,
    request: Optional[str] = None,
    sync_required: Optional[list[str]] = None,
    level: str = "balanced",
) -> Optional[dict]:
    """Claude builds (or rebuilds) the weekly template. Returns the validated
    template dict, or None if Claude was unavailable / produced nothing usable."""
    pd = get_program_doc(maxx_id)
    if pd is None:
        return None
    if maxx_id == "skinhairmax" and not request:
        from services import skin_routine
        raw = skin_routine.build_template(answers or {}, started_on=_local_today(profile))
        tmpl = validate_template(maxx_id, {**raw, "level": level}, profile, others=other_plans)
        return tmpl if tmpl["habits"] else None
    if maxx_id == PEPTIDE_PROGRAM and not request:
        # who gets what is decided by rules, never by the model (no invented doses)
        from services import peptide_intake
        raw = peptide_intake.build_template(answers or {}, profile, started_on=_local_today(profile).isoformat(),
                                            runs_fitmax="trainmax" in (other_plans or {}))
        tmpl = validate_template(maxx_id, {**raw, "level": level}, profile, others=other_plans,
                                 keep_ids={h["habit_id"] for h in raw["habits"]})
        tmpl["summary"] = raw["summary"]
        return tmpl if tmpl["habits"] else None
    budget_total = int(_level_profile(profile, level).get("minutes_per_day_total") or 25)
    used = _other_minutes_per_day(other_plans)
    remaining = _program_share(budget_total, other_plans)
    system = (
        f"You are the planner for the {program_label(maxx_id)} program in the Superpower app. "
        "You build a weekly plan of small habits that fits into this specific person's real day.\n"
        f"{_VOICE}\n{_safety(maxx_id)}\n\n"
        "Planning rules:\n"
        "- Only use habits from the habit library below (use their exact ids). A custom_<slug> habit is "
        "allowed only when the user explicitly asked for that habit.\n"
        "- Every time must sit between wake_time and bed_time, and must not land inside work hours, "
        "commute or meals, unless the habit is short and naturally done at a work break or with a meal.\n"
        "- Respect the doc's scheduling rules (e.g. caffeine cutoff vs bedtime, light soon after waking, "
        "wind-down before bed, rest days between hard sessions).\n"
        f"- Time budget: this program gets at most {remaining} minutes on ANY single day (the user gives "
        f"{budget_total} min/day across all programs; the others use up to {used} on their busiest day). "
        "Add up the minutes of every habit that lands on the same day and stay within it; 0-minute rules "
        "and 1-minute reminders are free. Never shrink a habit below its library minimum to squeeze it "
        "in: leave it out instead (no 2-minute deep-work block). Only describe habits you actually "
        "include in the summary.\n"
        + {"light": "- The user wants this LIGHT: 2 habits for this program, only the most valuable ones "
                    "for THIS person. ",
           "full": "- The user asked for MORE: 5 or 6 habits for this program, the highest-value ones for THIS "
                   "person, still each easy to start. ",
           }.get(level, "- Build a real plan: 3 or 4 habits for this program, the highest-value ones for THIS "
                        "person. ")
        + "List habits most important first for this person (their answers decide: someone who can't fall "
        f"asleep needs the wind-down before a fixed wake time); anything past the "
        f"{ {'light': 'second', 'full': 'sixth'}.get(level, 'fourth') } is cut.\n"
        "- Personal, not generic: two people with different answers must get different plans. Every "
        "habit's 'how' must use at least one specific thing from intake_answers or the profile (their "
        "main problem, their equipment, their distraction, their eating style, their stress time, their "
        "age), with concrete amounts for THEM (sets and reps for their level, step target from their "
        "current steps, block length for their work type). 'why' says why it matters for them, in one "
        "sentence that names their situation.\n"
        "- already_doing in intake_answers: never schedule the beginner version of something they already "
        "do. Simple habits they already have are left out so the plan adds something new; training "
        "habits they already do (strength, cardio, steps, mobility) are scheduled one level up from "
        "where they are (more sets, longer, harder variant) and the 'how' says so.\n"
        "- Training habits: write the actual session (exercises with sets x reps or minutes, rest, how "
        "to progress next week) for their equipment and experience, not 'do a workout'.\n"
        "- Do not duplicate a habit another program already schedules (same idea, e.g. morning light); "
        "if it is shared, leave it to the other program and pick something else.\n"
        "- Do not schedule two habits at the same minute as each other or as other programs' habits; "
        "space them at least 5 minutes apart.\n"
        "- Weekends: if the user shifts later on weekends, set weekend_time accordingly.\n"
        "- Use the user's answers to tailor which habits, how, and when. Tailor the 'how' text to them.\n"
        "- Never write clock times in title, how or why (no 'last coffee by 3:30pm'): the app shows each "
        "habit's time, and times can shift to fit the day.\n"
        "- The app already reminds them at each habit's time. 'how' explains how to DO the habit (e.g. morning "
        "light: step outside, walk or have coffee in daylight, 5-15 min). Never tell them to set an alarm, "
        "reminder or notification to remember a habit.\n"
        "- If this is a redo, start from the current plan and change what the request asks for, keeping "
        "the rest stable.\n"
        + _program_rules(maxx_id, sync_required) + "\n"
        "Program research doc:\n" + pd.text
    )
    user = json.dumps({
        "profile": profile,
        "intake_answers": answers,
        "other_programs": {
            program_label(k): [
                {"title": h.get("title"), "time": h.get("time"), "minutes": h.get("minutes"), "days": h.get("days")}
                for h in (v or {}).get("habits") or []
            ]
            for k, v in other_plans.items()
        },
        "current_plan": current_plan,
        "change_request": request,
    }, default=str)
    out = await _claude_tool(system, user, _PLAN_TOOL, max_tokens=3500)
    if not out:
        return None
    for h in out.get("habits") or []:
        if isinstance(h, dict):
            h.pop("priority", None)      # this list's order IS the priority
    out["level"] = level
    from services import program_quiz
    skip = program_quiz.skip_ids(maxx_id, {**((profile or {}).get("about") or {}), **(answers or {})})
    if skip and not request:
        # simple habits they already do: the plan adds something new instead
        kept = [h for h in out.get("habits") or [] if not (isinstance(h, dict) and h.get("habit_id") in skip)]
        if kept:
            out["habits"] = kept
    # every plan knows its week 1, so setups, cycles and trials can count weeks
    out["started_on"] = str((current_plan or {}).get("started_on") or _local_today(profile).isoformat())[:10]
    if (current_plan or {}).get("declined"):
        out["declined"] = list(current_plan["declined"])
    tmpl = validate_template(maxx_id, out, profile, others=other_plans,
                             keep_ids=set(sync_required or []))
    if not tmpl["habits"]:
        logger.warning("ai_programs: plan for %s had no valid habits", maxx_id)
        return None
    tmpl["_draft"] = {
        "summary": str(out.get("summary") or ""),
        "request": request or "",
        "habits": [{"habit_id": str(h.get("habit_id") or ""), "title": str(h.get("title") or ""),
                    "time": _hm(h.get("time"), ""), "minutes": h.get("minutes"),
                    "days": [d for d in WEEKDAYS if d in (h.get("days") or [])]}
                   for h in out.get("habits") or [] if isinstance(h, dict)],
    }
    return tmpl


def _draft_matches(draft: dict, tmpl: dict) -> bool:
    """True when the fitted plan is what Claude described: same habits, and
    each at (about) the time, length and days Claude's summary talks about."""
    want = {h.get("habit_id"): h for h in draft.get("habits") or [] if h.get("habit_id")}
    have = {h.get("habit_id"): h for h in tmpl.get("habits") or []}
    if set(want) != set(have):
        return False
    for hid, h in have.items():
        w = want[hid]
        a, b = _hm(w.get("time"), ""), _hm(h.get("time"), "")
        if a and b:
            ma, mb = int(a[:2]) * 60 + int(a[3:]), int(b[:2]) * 60 + int(b[3:])
            if min(abs(ma - mb), 1440 - abs(ma - mb)) > 10:
                return False
        try:
            if w.get("minutes") is not None and int(w["minutes"]) != int(h.get("minutes") or 0) \
                    and int(h.get("minutes") or 0) > 1:
                return False
        except (TypeError, ValueError):
            pass
        if w.get("days") and set(w["days"]) != set(h.get("days") or []):
            return False
    return True


_SUMMARY_TOOL = {
    "name": "plan_summary",
    "description": "The 2-3 line plan summary shown above the plan card.",
    "input_schema": {
        "type": "object",
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
    },
}


def plain_summary(tmpl: dict, left_out: Optional[list[str]] = None, budget: Optional[int] = None) -> str:
    """A truthful summary built from the final habits (no LLM)."""
    titles = [str(h.get("title") or "").strip() for h in tmpl.get("habits") or [] if h.get("title")]
    titles = [t[:1].lower() + t[1:] for t in titles]
    if not titles:
        return ""
    lst = titles[0] if len(titles) == 1 else ", ".join(titles[:-1]) + " and " + titles[-1]
    out = f"week 1 keeps it simple: {lst}."
    if left_out:
        lo = [t[:1].lower() + t[1:] for t in left_out if t][:2]
        if lo:
            room = f"your {budget} minutes a day" if budget else "your day"
            out += f" {' and '.join(lo)} can come in later, once there's room in {room}."
    return out


async def sync_summary(maxx_id: str, tmpl: dict, profile: dict, *, changed: bool = False) -> dict:
    """Claude wrote the summary for its draft; the fit may have left habits out
    (budget, week-1 limit, a duplicate) or added synced ones. When the final
    habit set differs from the draft, rewrite the summary for exactly what is
    in the plan so the card never promises a habit that isn't there."""
    draft = tmpl.pop("_draft", None) or {}
    final = {h.get("habit_id") for h in tmpl.get("habits") or []}
    proposed = {h.get("habit_id") for h in draft.get("habits") or [] if h.get("habit_id")}
    if not changed and (not draft or (_draft_matches(draft, tmpl) and (tmpl.get("summary") or "").strip()
                                      and not absent_mentions(maxx_id, tmpl.get("summary") or "", tmpl))):
        return tmpl
    titles = {h["habit_id"]: h.get("title") for h in draft.get("habits") or [] if h.get("habit_id")}
    left_out = [titles.get(i) or i.replace("_", " ") for i in proposed - final
                if not i.startswith("custom_")]
    budget = int(profile.get("minutes_per_day_total") or 25)
    system = (
        f"You write the short summary shown above a {program_label(maxx_id)} week-1 plan in the Superpower app.\n"
        f"{_VOICE}\n"
        "Rewrite the draft summary so it describes EXACTLY the habits listed in final_habits (2-3 short lines, "
        "under 60 words). Keep the draft's reasons for why it fits this person. Never mention a habit that is "
        "not in final_habits, and any time, length or day you mention must match final_habits exactly (use "
        "the given am/pm times as written). adjustments says why the planner kept a habit where it is. If "
        "left_out is not empty you may say in a few words that it can be added later when there's room; do "
        "not promise it this week. If change_request asked for something the final plan could not do "
        "exactly, say plainly what you did instead and give the reason from adjustments (never invent a "
        "different reason). No doses, no medical claims."
    )
    user = json.dumps({
        "change_request": draft.get("request") or "",
        "draft_summary": draft.get("summary") or tmpl.get("summary") or "",
        "final_habits": [{"title": h.get("title"), "time": _pretty_time(h.get("time") or ""),
                          **({"weekend_time": _pretty_time(h["weekend_time"])} if h.get("weekend_time") else {}),
                          "days": h.get("days"), "minutes": h.get("minutes")} for h in tmpl.get("habits") or []],
        "adjustments": [n for n in tmpl.get("fit_notes") or [] if n.startswith(("kept ", "dropped "))],
        "left_out": left_out,
        "minutes_per_day": budget,
    }, default=str)
    out = await _claude_tool(system, user, _SUMMARY_TOOL, max_tokens=400)
    text = _clean_text(str((out or {}).get("summary") or ""), 600)
    if text and absent_mentions(maxx_id, text, tmpl, allow_later=True):
        text = ""                       # still describing a habit that isn't there
    tmpl["summary"] = text or plain_summary(tmpl, left_out, budget)
    return tmpl


_MENTION_STOP = {
    "daily", "morning", "evening", "night", "weekly", "weekend", "short", "quick", "minute", "minutes",
    "before", "after", "your", "with", "first", "every", "check", "routine", "block", "session", "simple",
    "easy", "light", "outdoor", "times", "reminder", "practice", "twice", "something", "someone", "about",
    "meals", "training", "strength", "water", "protein", "caffeine", "sleep", "screen", "screens", "coffee",
    "lunch", "dinner", "breakfast", "stack", "check-in", "plate", "one-time", "reset", "optional", "evidence",
    "caution", "trial", "basic", "mixed", "weak", "food", "only", "early", "earlier", "possible", "awake",
    "small", "where", "vegans", "workday", "movement", "recovery", "energy", "three", "steps", "cardio",
    "focus", "calm", "regular", "gentle", "afternoon", "protect", "window", "slump", "dose", "prescriber",
    "instructions", "build", "keep", "muscle", "comfort", "fiber",
}
_MENTION_ALIASES = {"post_meal_walk": r"\bwalk", "outdoor_walk": r"\bwalk", "deep_work_block": r"deep[- ]?work",
                    "notification_cleanup": r"notification", "cold_chain_check": r"\bstorage",
                    "sleep_regularity": r"(regular|steady|consistent) sleep (window|schedule|times?)"}


def absent_mentions(maxx_id: str, summary: str, tmpl: dict, *, allow_later: bool = False) -> list[str]:
    """Library habits the summary talks about that are NOT in the plan (a
    word only counts when no planned habit's title uses it too)."""
    lib = _lib(maxx_id)
    have = {h.get("habit_id") for h in tmpl.get("habits") or []}
    titles = " ".join(str(h.get("title") or "") + " " + str(h.get("habit_id") or "").replace("_", " ")
                      for h in tmpl.get("habits") or []).lower()
    text = (summary or "").lower()
    if allow_later:
        text = " ".join(x for x in re.split(r"(?<=[.!?])\s+", text)
                        if not re.search(r"\blater\b|when there's room|once there's room", x))
    out = []
    for hid, hd in lib.items():
        if hid in have:
            continue
        if hid in _MENTION_ALIASES:
            pats = [_MENTION_ALIASES[hid]]
        else:
            words = [w for w in re.findall(r"[a-z][a-z-]{4,}", re.sub(r"\(.*?\)", "", hd.title.lower()))
                     if w not in _MENTION_STOP]
            pats = [r"\b" + re.escape(w).replace(r"\-", "[- ]?") + r"s?\b" for w in words[:1]]
        for pat in pats:
            if re.search(pat, text) and not re.search(pat, titles):
                out.append(hid)
                break
    return out


def _program_rules(maxx_id: str, sync_required: Optional[list[str]]) -> str:
    if maxx_id == SUPP_PROGRAM:
        req = ", ".join(sync_required or []) or "none"
        return (
            "- Supplement program: each supplement is a ~1 minute task placed by its timing rule (with a "
            "meal, before bed, around training). Group items taken together at the same meal 5 minutes "
            "apart rather than spreading reminders across the day.\n"
            f"- Synced from the user's other programs (include these unless an 'avoid if' matches their "
            f"answers): {req}.\n"
            "- Then add at most 1-3 more for the user's own goals from their answers. Week 1 holds no more "
            "than 5 supplements in total. Skip anything they said they already take elsewhere.\n"
        )
    if maxx_id == PEPTIDE_PROGRAM:
        return (
            "- Peptide program: for EACH peptide the user named, add one dose reminder with habit_id "
            "custom_dose_<slug> (e.g. custom_dose_semaglutide), title '<name> dose', 'how' = the "
            "instructions they said their prescriber gave, in their words, never a dose you chose, and "
            "days matching their stated frequency. Add the library's support habits that fit (site "
            "rotation, storage check, side-effect log, weekly review, bloodwork/prescriber check-in). "
            "Never add a peptide they did not name.\n"
        )
    return ""


def _lib(maxx_id: str) -> dict:
    pd = get_program_doc(maxx_id)
    return {h.id: h for h in (pd.habits if pd else [])}


# How much of a program the person wants, set from the plan card's
# Lighter · Balanced · More control (or "make it harder" in chat). It scales
# this program's habit cap and its share of the person's daily minutes.
PLAN_LEVELS = ("light", "balanced", "full")
LEVEL_CONTROL = {"lighter, please": "light", "this feels right": "balanced", "give me more": "full"}
_HARDER_RE = re.compile(r"\b(harder|more habits|add more|step it up|level up|more intense|push me|give me more|"
                        r"too easy|too light|not enough|go further|go harder)\b", re.IGNORECASE)


def plan_level(tmpl: Optional[dict]) -> str:
    lv = str((tmpl or {}).get("level") or "balanced")
    return lv if lv in PLAN_LEVELS else "balanced"


def _level_cap(cap: int, protected: set, level: str) -> int:
    if level == "light":
        return max(len(protected), cap - 1 if protected else 2)
    if level == "full":
        return cap + 2
    return cap


def _level_profile(profile: dict, level: str) -> dict:
    """The person's day as this program sees it at a level: lighter plans get a
    smaller slice of their minutes, 'more' a bigger one (they asked for it)."""
    total = int(profile.get("minutes_per_day_total") or 25)
    if level == "light":
        total = max(5, round(total * 0.6))
    elif level == "full":
        total = min(180, max(total + 10, round(total * 1.6)))
        return {**profile, "minutes_per_day_total": total, "_task_cap": 14}
    else:
        return profile
    return {**profile, "minutes_per_day_total": total}


# what the planner is asked when the control is tapped
LEVEL_REQUEST = {
    "light": "make it lighter: fewer habits and less time, keep only what matters most for me",
    "balanced": "make it a balanced amount: the core habits that matter most for me, nothing extra",
    "full": ("give me more: keep every habit I have on the same days, and add the next most useful habits "
             "for me on top. I'm ready for a fuller plan"),
}


def control_level(message: str) -> Optional[str]:
    """The level a plan-card control tap asks for (its exact text), else None."""
    return LEVEL_CONTROL.get((message or "").strip().lower().rstrip("."))


def _implied_level(request: str, current: str) -> str:
    """A typed 'make it lighter' / 'make it harder' also moves the level one step."""
    i = PLAN_LEVELS.index(current)
    if _HARDER_RE.search(request or ""):
        return PLAN_LEVELS[min(2, i + 1)]
    if _LIGHTER_RE.search(request or ""):
        return PLAN_LEVELS[max(0, i - 1)]
    return current


def _fit_caps(maxx_id: str, habits: list[dict]) -> tuple[set, int]:
    """(protected habit ids, habit cap) for a program's week-1 load."""
    if maxx_id == SUPP_PROGRAM:
        synced = {h["habit_id"] for h in habits if h.get("linked_to") or h.get("_required")}
        return synced, len(synced) + 2
    if maxx_id == PEPTIDE_PROGRAM:
        doses = {h["habit_id"] for h in habits if str(h.get("habit_id", "")).startswith("custom_dose")}
        required = {h["habit_id"] for h in habits if h.get("_required")}
        return doses | required, len(doses | required) + 3
    if maxx_id == "skinhairmax":
        # the AM and PM routines ARE the program; scalp steps ride along
        return {h["habit_id"] for h in habits if h["habit_id"] in ("am_routine", "pm_routine")}, 4
    return set(), 4


def validate_template(maxx_id: str, raw: dict, profile: dict, *, others: Optional[dict] = None,
                      keep_ids: Optional[set] = None, refit: bool = False) -> dict:
    """Repair Claude's plan into something always schedulable: library ids
    only (or an explicit custom_), valid weekdays, human text, sane minutes —
    then fit it to the person's real day and the rest of their stack
    (services/ai_fit.py: budget, week-1 load, duplicates, rest days, doc
    timing rules, busy windows, cross-program spacing)."""
    from services import ai_fit
    lib = _lib(maxx_id)
    habits: list[dict] = []
    seen: set[str] = set()
    for h in raw.get("habits") or []:
        if not isinstance(h, dict):
            continue
        hid = re.sub(r"[^a-z0-9_]", "_", str(h.get("habit_id") or "").lower()).strip("_")
        if not hid or hid in seen:
            continue
        if hid not in lib and not hid.startswith("custom_"):
            continue
        if hid in set(raw.get("declined") or []) and hid not in (keep_ids or set()):
            continue            # the person removed it; a rebuild never brings it back
        days = [d for d in WEEKDAYS if d in (h.get("days") or [])]
        if not days:
            continue
        try:
            minutes = int(h.get("minutes") or 0)
        except (TypeError, ValueError):
            minutes = 0
        lib_h = lib.get(hid)
        habits.append({
            "habit_id": hid,
            # one name everywhere (Tune, Home, Planner, chat): the library's. A
            # model-written title carried a time or a reason that went stale
            # ("vitamin D3 at breakfast" at 12:30, "electrolytes post-workout"
            # with no workout) and differed from the Tune sheet (beta 1, F36)
            "title": (_library_title(lib_h) if lib_h else
                      _clean_text(str(h.get("title") or "") or hid.replace("_", " "), 40)),
            "how": _clean_text(str(h.get("how") or (lib_h.how if lib_h else "")), 700),
            "why": _clean_text(str(h.get("why") or (lib_h.why if lib_h else "")), 200),
            "minutes": minutes,
            "time": _hm(h.get("time"), ""),
            "weekend_time": _hm(h.get("weekend_time"), ""),
            "days": days,
            **({"linked_to": h["linked_to"]} if "linked_to" in h else {}),
            **({"keep": h["keep"]} if "keep" in h else {}),
            **({"priority": h["priority"]} if isinstance(h.get("priority"), int) else {}),
            **({"variants": {k: {"title": _clean_text(str(v.get("title") or ""), 40),
                                 "how": _clean_text(str(v.get("how") or ""), 700)}
                             for k, v in h["variants"].items() if isinstance(v, dict)},
                "schedule": h.get("schedule") or []} if isinstance(h.get("variants"), dict) else {}),
            **({"_required": True} if hid in (keep_ids or set()) else {}),
            **({"weeks": sorted({int(w) for w in h["weeks"] if str(w).isdigit() and int(w) > 0})}
               if isinstance(h.get("weeks"), list) and h["weeks"] else {}),
            **({"every_weeks": int(h["every_weeks"])} if str(h.get("every_weeks") or "").isdigit()
               and int(h["every_weeks"]) > 1 else {}),
            **({"cycle": [int(h["cycle"][0]), int(h["cycle"][1])]}
               if isinstance(h.get("cycle"), list) and len(h["cycle"]) == 2 else {}),
            **({"kind": h["kind"]} if hid.startswith("custom_") and h.get("kind") in ("action", "setup", "checkin")
               else {}),
            **({"trial": int(h["trial"])} if str(h.get("trial") or "").isdigit() else {}),
        })
        seen.add(hid)
    protected, cap = _fit_caps(maxx_id, habits)
    level = plan_level(raw)
    cap = _level_cap(cap, protected, level)
    if refit:
        # the week-1 cap shapes a NEW plan; re-fitting a stored one (another
        # program started, the day changed) never drops a habit they already have
        cap = max(cap, len([h for h in habits if (lib.get(h["habit_id"]) is None
                                                  or not lib[h["habit_id"]].is_rule)]))
    # (text is reconciled with the FINAL times after the fit, below)
    parked_in = [p for p in raw.get("parked") or []
                 if isinstance(p, dict) and (p.get("habit_id") in lib or str(p.get("habit_id", "")).startswith("custom_"))
                 and p.get("habit_id") not in seen]
    parked_out: list[dict] = []
    placed, notes = ai_fit.fit(maxx_id, habits, _level_profile(profile, level), lib, others=others,
                               prev_fit=(raw.get("fit_for") if isinstance(raw.get("fit_for"), dict) else None),
                               keep_ids=protected | set(keep_ids or set()), cap_habits=cap,
                               parked=parked_in, parked_out=parked_out)
    for h in placed + parked_out:
        h.pop("_required", None)
    for h in placed:
        h["how"] = drop_reminder_steps(h["habit_id"], h.get("how") or "")
        # a time in the steps can only be right if the habit has ONE time, and
        # only that time: "with your 8am breakfast" on a 12:30 task, "after your
        # 7am workout" with no workout in the plan, "set an alarm for 7:00" after
        # the wake time moved (beta 1) were all "facts about the day" kept here
        times = set() if h.get("weekend_time") else ({_hm(h.get("time"), "")} - {""})
        h["title"] = _strip_clock(h.get("title") or "")
        h["how"] = _fix_clock(h.get("how") or "", times, set())
        h["why"] = _fix_clock(h.get("why") or "", times, set())
        h["how"] = _fix_meal_words(h["how"], h.get("time"), profile)
        h["how"] = _fix_minutes(h["how"], int(h.get("minutes") or 0), lib.get(h["habit_id"]))
    _apply_kinds_and_cycles(placed, lib)
    return {
        "version": 2,
        "summary": _clean_text(str(raw.get("summary") or ""), 600),
        "habits": placed,
        **({"parked": parked_out} if parked_out else {}),
        "fit_for": ai_fit.fit_signature(ai_fit.day_models(profile)),
        "fit_notes": notes,
        **{k: raw[k] for k in ("started_on", "skin_profile", "peptide_profile", "declined", "accepted") if raw.get(k)},
        **({"level": level} if level != "balanced" else {}),
        "built_at": datetime.utcnow().isoformat(),
    }


def refit_template(maxx_id: str, tmpl: dict, profile: dict, others: Optional[dict] = None) -> dict:
    """Re-fit a stored template to the person's CURRENT day (no LLM). A no-op
    on an already-fitted template whose day didn't change."""
    if maxx_id == "skinhairmax" and not any(h.get("variants") for h in tmpl.get("habits") or []):
        # a plan from before the routine builder: rebuild it from its answers
        from services import skin_routine
        rebuilt = skin_routine.build_template(tmpl.get("answers") or {}, started_on=_local_today(profile))
        tmpl = {**tmpl, **rebuilt, "answers": tmpl.get("answers") or {}}
    out = validate_template(maxx_id, tmpl, profile, others=others, refit=True)
    for k in ("answers", "declined", "accepted", "built_at", "started_on", "skin_profile", "peptide_profile"):
        if k in tmpl:
            out[k] = tmpl[k]
    out["summary"] = tmpl.get("summary") or out.get("summary") or ""
    before = {h.get("habit_id"): h.get("title") for h in tmpl.get("habits") or []}
    after = {h.get("habit_id") for h in out.get("habits") or []}
    gone = [t or i for i, t in before.items() if i not in after]
    if gone or (after - set(before)):
        out["summary"] = plain_summary(out, gone, int(profile.get("minutes_per_day_total") or 25))
    return out


_REMINDER_STEP = re.compile(r"\b(set|put|add|turn on|schedule|create|use)\b[^.;]*\b(alarms?|reminders?|notifications?)\b",
                            re.IGNORECASE)
# where the alarm IS the habit's tool, not a way to remember it
_ALARM_IS_THE_TOOL = {"nap_rule", "nsdr_break", "phone_away", "screens_off", "bedroom_setup"}


def drop_reminder_steps(hid: str, how: str) -> str:
    """The app reminds them at each habit's time, so steps like 'set a phone
    alarm for your light window' are noise: drop them (renumbering the rest)."""
    if hid in _ALARM_IS_THE_TOOL or not _REMINDER_STEP.search(how or ""):
        return how
    numbered = re.split(r"\s*(?:^|(?<=\s))\d\)\s*", how.strip())
    if len([x for x in numbered if x.strip()]) >= 2:
        steps = [x.strip() for x in numbered if x.strip()]
        keep = [x for x in steps if not _REMINDER_STEP.search(x)]
        if not keep:
            return how
        return " ".join(f"{i}) {x}" for i, x in enumerate(keep, 1)) if len(keep) > 1 else keep[0]
    sents = re.split(r"(?<=[.!?])\s+", how.strip())
    keep = [x for x in sents if not _REMINDER_STEP.search(x)]
    return " ".join(keep) if keep else how


_CLOCK = re.compile(r"\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[ap]\.?m\.?)?|\b(?:1[0-2]|0?[1-9])\s?[ap]\.?m\.?\b",
                    re.IGNORECASE)


def _clock_min(tok: str) -> Optional[int]:
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s?([ap])?", tok.strip(), re.IGNORECASE)
    if not m:
        return None
    h, mm, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if ap == "p" and h < 12:
        h += 12
    if ap == "a" and h == 12:
        h = 0
    return h * 60 + mm


def _strip_clock(title: str) -> str:
    """'Last coffee by 3:30pm' -> 'Last coffee' (the card shows the time)."""
    t = re.sub(r"\s*(?:by|at|before|after|around|until|@)?\s*" + _CLOCK.pattern, "", title, flags=re.IGNORECASE)
    t = re.sub(r"\s{2,}", " ", t).strip(" ,;:-")
    return t or title


def _day_anchors(profile: dict) -> set[str]:
    """Clock times that are facts about the person's day (wake, bed, meals, work,
    workout): naming them in a habit's steps can't go stale."""
    out = {profile.get("wake_time"), profile.get("bed_time"), profile.get("workout_time")}
    out |= set((profile.get("meals") or {}).values())
    for o in profile.get("obligations") or []:
        if isinstance(o, dict):
            out |= {o.get("start"), o.get("end")}
    return {_hm(t, "") for t in out if t} - {""}


_PLAN_PHRASE = r"the time on your plan"   # what older plans wrote in place of a time

_MEAL_WORDS = ("breakfast", "lunch", "dinner")


def _fix_meal_words(text: str, time: Any, profile: dict) -> str:
    """Steps that name a different meal than the one the habit sits at ("with
    your breakfast" on a task moved to lunch) name the right one."""
    t = _hm(time, "")
    meals = {k: _hm(v, "") for k, v in ((profile or {}).get("meals") or {}).items() if _hm(v, "")}
    if not t or not meals or not text:
        return text
    tm = _to_min(t)
    near = min(meals.items(), key=lambda kv: abs(_to_min(kv[1]) - tm))
    if abs(_to_min(near[1]) - tm) > 60:
        return text
    named = {m for m in _MEAL_WORDS if re.search(rf"\b{m}\b", text, re.I)}
    if len(named) != 1 or near[0] in named:
        return text
    wrong = named.pop()
    return re.sub(rf"\b{wrong}\b", lambda m: near[0].capitalize() if m.group(0)[0].isupper() else near[0], text,
                  flags=re.I)


def _fix_minutes(text: str, minutes: int, lib_h: Optional["Habit"]) -> str:
    """'Spend the full 10 minutes outside' on a habit the fit shortened to 6
    says 6. Only the habit's own duration numbers change (never 'wait 30
    minutes after')."""
    if not text or minutes < 2:
        return text
    own = {minutes}
    if lib_h is not None:
        own |= {lib_h.minutes_default, lib_h.minutes_min}
    own.discard(0)

    def sub(m: re.Match) -> str:
        n = int(m.group(2))
        return m.group(0) if n == minutes or n not in own else f"{m.group(1) or ''}{minutes}{m.group(3)}"
    return re.sub(r"\b(the full |a full |full )?(\d{1,3})(\s?(?:-\s?)?(?:minutes?|mins?)\b)", sub, text, flags=re.I)


def _library_title(h: "Habit") -> str:
    """A library title for the card: notes for the planner ("(caution)",
    "(vegans, 50+)") left out."""
    return _clean_text(re.sub(r"\s*\([^)]*\)", "", h.title or h.id).strip() or h.id, 40)


_TIMES_A_WEEK = re.compile(r"(\d)\s*(?:[–-]\s*(\d)\s*)?times? a week", re.I)
_SPREAD = {1: ["sat"], 2: ["tue", "fri"], 3: ["mon", "wed", "fri"], 4: ["mon", "tue", "thu", "fri"],
           5: ["mon", "tue", "wed", "thu", "fri"]}


def _apply_kinds_and_cycles(placed: list[dict], lib: dict) -> None:
    """Library kinds and protocol lengths become schedule fields: a setup runs
    in week 1 on one day; a cycle ('4 on / 1 off') and a trial ('12 weeks, then
    review') are weeks the planner keeps (BETA1_CONTRACTS C1)."""
    for h in placed:
        lh = lib.get(h["habit_id"])
        if lh is None:
            continue
        if lh.habit_kind == "setup":
            h.setdefault("weeks", [1])
            h.pop("every_weeks", None)
            days = h.get("days") or []
            one = next((d for d in ("sat", "sun") if d in days), days[0] if days else "sat")
            h["days"] = [one]
        m = _TIMES_A_WEEK.search(lh.frequency or "")
        if m and len(h.get("days") or []) == 7 and lh.habit_kind != "setup":
            # "2–3 times a week on workout or hot days (never daily)": a daily
            # electrolytes task contradicted its own library entry (beta 1, F18)
            n = int(m.group(2) or m.group(1))
            h["days"] = _SPREAD.get(n, h["days"])
        if lh.cycle_on and not h.get("cycle"):
            h["cycle"] = [lh.cycle_on, lh.cycle_off]
        if lh.trial_weeks and not h.get("weeks"):
            # the review in the week after is added when the days are expanded
            h["weeks"] = list(range(1, lh.trial_weeks + 1))
            h["trial"] = lh.trial_weeks


def _fix_clock(text: str, times: set, anchors: Optional[set] = None) -> str:
    """A clock time in the steps that is neither when this habit happens nor a
    fact about their day (meals, wake, work) would contradict the card once the
    fit moves it: take it out, with the little word that went with it, so the
    sentence still reads ("your 7:10 commute" -> "your commute", "finish by
    7pm (3 hours before bed)" -> "finish (3 hours before bed)")."""
    keep = {int(t[:2]) * 60 + int(t[3:]) for t in (set(times) | set(anchors or set())) if t}
    tok = r"(?:" + _CLOCK.pattern + r"|" + _PLAN_PHRASE + r")"

    def stale(t: str) -> bool:
        if t.lower() == _PLAN_PHRASE:
            return True
        if keep is None:
            return False
        v = _clock_min(t)
        return v is None or not (v in keep or (v + 720) in keep or (v - 720) in keep)

    out = text or ""
    if len({_clock_min(m.group(0)) for m in _CLOCK.finditer(out)}) >= 3:
        # several times = the habit's own timetable ("check email at 10, 12, 3 and 4:30"):
        # keep them; only the old placeholder phrase goes
        keep = None
    # ranges: "9:10–9:35", "from 9 to 10am" (kept whole when either end is real)
    held: list[str] = []

    def hold(t: str) -> str:            # protect what stays from the later passes
        held.append(t)
        return f"\x00{len(held) - 1}\x00"
    out = re.sub(r"\b(?:from |between )?(" + tok + r")\s*(?:-|–|—|to|and)\s*(" + tok + r")",
                 lambda m: "" if stale(m.group(1)) and stale(m.group(2)) else hold(m.group(0)), out, flags=re.I)
    # "after-3pm habit" -> "late habit"
    out = re.sub(r"\b(after|before)-(" + tok + r")",
                 lambda m: ("late" if m.group(1).lower() == "after" else "early") if stale(m.group(2)) else m.group(0),
                 out, flags=re.I)
    # "your 7:10 commute" -> "your commute"
    out = re.sub(r"\b(your|the|a)\s+(" + tok + r")\s+(?=[a-z])",
                 lambda m: f"{m.group(1)} " if stale(m.group(2)) else m.group(0), out, flags=re.I)
    # "by 7:10", "at 10pm", "around 2"
    out = re.sub(r"\s*\b(?:at|by|before|after|around|until|till|from|for|@)\s+(" + tok + r")",
                 lambda m: "" if stale(m.group(1)) else m.group(0), out, flags=re.I)
    # anything left on its own
    out = re.sub(r"\s*\b(" + tok + r")", lambda m: "" if stale(m.group(1)) else m.group(0), out, flags=re.I)
    # tidy what the removals left
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"\s+([,.;:)])", r"\1", out)
    out = re.sub(r"([(])\s+", r"\1", out)
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\x00(\d+)\x00", lambda m: held[int(m.group(1))], out)
    return out.strip()


def _clean_text(text: str, limit: int) -> str:
    """Trim to `limit` on a word/sentence boundary (never mid-word)."""
    t = re.sub(r"\s+", " ", text or "").strip()
    if len(t) <= limit:
        return t
    cut = t[:limit]
    end = max(cut.rfind(". "), cut.rfind("; "))
    if end >= limit * 0.6:
        return cut[: end + 1].strip()
    return cut.rsplit(" ", 1)[0].rstrip(",;:-") + "…"


def _routine_variant(h: dict, d: date, started_on) -> Optional[dict]:
    if not h.get("variants"):
        return None
    from services import skin_routine
    return skin_routine.routine_variant(h, d, started_on)


def _local_today(profile: dict) -> date:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(str(profile.get("timezone") or "UTC"))).date()
    except Exception:
        return date.today()


def _peptide_guard(new: dict, current: dict) -> dict:
    """A chat change to Peptidemax can move times or lighten support habits,
    but dose reminders are exactly the ones the protocol check approved: a
    request can't add a peptide (that goes through the check again) or drop
    one silently, and their wording stays the label-first wording."""
    approved = {h["habit_id"]: h for h in current.get("habits") or []
                if str(h.get("habit_id", "")).startswith("custom_dose")}
    habits = []
    for h in new.get("habits") or []:
        hid = str(h.get("habit_id", ""))
        if hid.startswith("custom_dose"):
            if hid not in approved:
                continue
            h = {**h, "how": approved[hid].get("how") or h.get("how"), "title": approved[hid].get("title") or h.get("title")}
        habits.append(h)
    have = {h.get("habit_id") for h in habits}
    habits += [dict(h) for hid, h in approved.items() if hid not in have]
    out = {**new, "habits": habits}
    for k in ("peptide_profile", "started_on"):
        if current.get(k):
            out[k] = current[k]
    return out


def scrub_peptide_details(sched) -> None:
    """Peptidemax answers are consumer health data (Washington's My Health My
    Data Act and friends). When its plan stops or is replaced, keep only what
    the streak and XP history count (task times and statuses), and drop the
    answers, the decision, and every task's drug names and reasons."""
    if getattr(sched, "maxx_id", None) != PEPTIDE_PROGRAM:
        return
    sc = dict(sched.schedule_context or {})
    plan = sc.get("ai_plan") or {}
    sc["ai_plan"] = {"scrubbed": True, "started_on": plan.get("started_on")}
    sc.pop("summary", None)
    sched.schedule_context = sc
    sched.days = [
        {**day, "tasks": [{**task, "title": "Peptidemax task", "description": "", "why": "",
                           "catalog_id": f"{PEPTIDE_PROGRAM}.task"} for task in (day.get("tasks") or [])]}
        for day in (sched.days or [])
    ]


def _plan_week(started_on, d: date) -> int:
    """1 for the plan's first 7 days, 2 for the next 7, ... (1 when unknown)."""
    try:
        start = date.fromisoformat(str(started_on)[:10])
    except (TypeError, ValueError):
        return 1
    return max(1, (d - start).days // 7 + 1)


def _in_plan_week(h: dict, week_no: int) -> bool:
    """A habit limited to some weeks ('weeks': [1]) or a cadence ('every_weeks': 4,
    i.e. weeks 1, 5, 9...). Both set = either one. Neither = every week."""
    cyc = h.get("cycle")
    if isinstance(cyc, (list, tuple)) and len(cyc) == 2 and int(cyc[0] or 0) > 0:
        # "4 on / 1 off": weeks 1-4 on, 5 off, 6-9 on ... (melatonin)
        on, off = int(cyc[0]), int(cyc[1] or 0)
        if (week_no - 1) % (on + off) >= on:
            return False
    weeks, every = h.get("weeks"), h.get("every_weeks")
    if not weeks and not every:
        return True
    return bool((weeks and week_no in weeks) or (every and (week_no - 1) % int(every) == 0))


def expand_template(maxx_id: str, tmpl: dict, *, start_date: date, n_days: int = AI_PLAN_DAYS) -> list[dict]:
    """Template → dated day dicts in the persisted task shape. Pure."""
    days: list[dict] = []
    for i in range(n_days):
        d = start_date + timedelta(days=i)
        wd = WEEKDAYS[d.weekday()]
        tasks = []
        rules = []
        week_no = _plan_week(tmpl.get("started_on"), d)
        for h in tmpl.get("habits") or []:
            if wd not in (h.get("days") or []):
                continue
            t = h.get("weekend_time") if wd in ("sat", "sun") and h.get("weekend_time") else h.get("time")
            trial = int(h.get("trial") or 0)
            if trial and week_no == trial + 1 and wd == [x for x in WEEKDAYS if x in h["days"]][0]:
                # the end of a trial: one check-in, then the habit stops
                tasks.append({
                    "task_id": str(uuid.uuid4()),
                    "catalog_id": f"{maxx_id}.{h['habit_id']}_review",
                    "title": f"{str(h.get('title') or h['habit_id']).split('(')[0].strip()}: {trial}-week check"[:48],
                    "description": "1) Look back over the trial: did it help? 2) Keep it only if it did. "
                                   "3) Tell me in chat to drop it or keep going.",
                    "why": "A trial only means something if you check it at the end.",
                    "time": t, "duration_min": 2, "duration_minutes": 2,
                    "tags": ["ai_program", maxx_id, "foundation"], "status": "pending", "intensity": 0.5,
                    "kind": "checkin",
                })
            if not _in_plan_week(h, week_no):
                continue
            kind = habit_kind(maxx_id, h)
            if kind == "rule":
                # a boundary, not a task: no checkbox, no XP, not in progress
                # or day close (BETA1_CONTRACTS C1)
                rules.append({
                    "title": h.get("title") or h["habit_id"], "time": t,
                    "catalog_id": f"{maxx_id}.{h['habit_id']}", "maxx_id": maxx_id,
                    "note": _rule_note(h.get("how") or ""),
                })
                continue
            v = _routine_variant(h, d, tmpl.get("started_on")) or {}
            tasks.append({
                "task_id": str(uuid.uuid4()),
                "catalog_id": f"{maxx_id}.{h['habit_id']}",
                "title": v.get("title") or h.get("title") or h["habit_id"],
                "description": v.get("how") or h.get("how") or "",
                "why": h.get("why") or "",
                "time": t,
                "duration_min": int(h.get("minutes") or 1),
                "duration_minutes": int(h.get("minutes") or 1),
                "tags": ["ai_program", maxx_id, "foundation"],
                "status": "pending",
                "intensity": 0.5,
                "kind": kind,
            })
        if maxx_id == SUPP_PROGRAM:
            tasks = _group_same_time(tasks)
        # In the order of the person's waking day: a 00:15 wind-down on a
        # 01:00-bedtime Saturday comes after 23:00, not before breakfast.
        fit_for = (tmpl.get("fit_for") or {}).get("weekend" if wd in ("sat", "sun") else "weekday") or []
        wake = _hm(fit_for[0], "") if fit_for else ""
        tasks.sort(key=lambda x: (x["time"] < wake if wake else False, x["time"]))
        days.append({"day_index": i, "date": d.isoformat(), "tasks": tasks,
                     **({"rules": sorted(rules, key=lambda r: r["time"] or "")} if rules else {})})
    return days


def habit_kind(maxx_id: str, h: dict) -> str:
    """action | rule | setup | checkin for a planned habit (plans stored before
    kinds existed are read from the library)."""
    k = h.get("kind")
    if k in ("action", "rule", "setup", "checkin"):
        return k
    lh = _lib(maxx_id).get(h.get("habit_id") or "")
    return lh.habit_kind if lh is not None else "action"


def _rule_note(how: str) -> str:
    """The first step of a rule's how, as one short line."""
    first = re.split(r"\s*\d\)\s*", how or "")
    first = next((s for s in first if s.strip()), "")
    return _clean_text(first.strip().rstrip("."), 90)


def _short_supp_name(title: str) -> str:
    t = re.sub(r"\s*\(.*?\)", "", title or "").strip()
    return re.split(r"\s+(with|before|after|for)\s+", t, maxsplit=1)[0].strip() or title


def _group_same_time(tasks: list[dict]) -> list[dict]:
    """Supplements taken together (same slot) are ONE task: 'Vitamin D3 +
    Omega-3', each pick's instructions in the description. Keeps Home sane
    when a big stack syncs several picks to the same meal."""
    by_time: dict[str, list[dict]] = {}
    for t in tasks:
        by_time.setdefault(t["time"], []).append(t)
    out = []
    for tm, group in by_time.items():
        if len(group) == 1:
            out.append(group[0])
            continue
        names = [_short_supp_name(g["title"]) for g in group]
        title = " + ".join(names)
        if len(title) > 40:
            title = f"{names[0]} + {len(names) - 1} more"
        first = dict(group[0])
        first.update({
            "title": title,
            "description": "\n\n".join(f"{n}: {g['description']}" for n, g in zip(names, group) if g["description"]),
            "why": group[0].get("why") or "",
            "duration_min": max(int(g.get("duration_min") or 1) for g in group),
            "duration_minutes": max(int(g.get("duration_minutes") or 1) for g in group),
            "group": [g["catalog_id"] for g in group],
        })
        out.append(first)
    return out


# ── Persistence ─────────────────────────────────────────────────────────────

async def _user_state(user_id: str, db) -> tuple[Any, dict, dict]:
    from models.sqlalchemy_models import User
    from services.user_context_service import get_context, merged_user_state
    user = await db.get(User, UUID(user_id))
    onboarding = dict(getattr(user, "onboarding", {}) or {})
    persistent = await get_context(user_id, db)
    return user, onboarding, merged_user_state(onboarding, persistent)


async def other_program_plans(user_id: str, db, *, except_maxx: str) -> dict[str, dict]:
    """Templates of the user's OTHER active AI programs (for budget + dedupe)."""
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))
        )
    )
    out: dict[str, dict] = {}
    for s in res.scalars().all():
        mid = s.maxx_id or ""
        if mid == except_maxx:
            continue
        tmpl = (s.schedule_context or {}).get("ai_plan")
        if tmpl:
            out[mid] = tmpl
    return out


async def active_ai_plan(user_id: str, maxx_id: str, db):
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id))
            & (UserSchedule.maxx_id == maxx_id)
            & (UserSchedule.is_active.is_(True))
        ).order_by(UserSchedule.created_at.desc())
    )
    return res.scalars().first()


# ── Suppmax sync ────────────────────────────────────────────────────────────
# Each Suppmax habit carries `linked_to` (the active programs it is there for)
# and `keep` (the user chose it for their own goal / asked for it). A synced
# supplement leaves when every program it is linked to is gone; a kept one
# stays. `declined` on the template holds synced picks the user removed, so a
# later sync never forces them back.

_NO_ANSWERS = re.compile(r"^\s*(no|none|nope|n/?a|not really|nothing|prefer not to say)\b", re.IGNORECASE)
_AVOID_SYNONYMS = {
    "blood thinners": ("thinner", "warfarin", "anticoag", "eliquis", "xarelto", "apixaban", "blood thin"),
    "ssris": ("ssri", "antidepress", "sertraline", "fluoxetine", "lexapro", "zoloft", "prozac"),
    "antidepressants": ("ssri", "antidepress", "sertraline", "fluoxetine", "lexapro", "zoloft", "prozac"),
    "blood pressure meds": ("blood pressure", "hypertens", "lisinopril", "amlodipine"),
    "pregnancy": ("pregnan", "trying to conceive"),
    "breastfeeding": ("breastfeed", "nursing"),
}


def _answers_text(answers: dict) -> str:
    vals = []
    for v in (answers or {}).values():
        t = str(v or "").strip().lower()
        if t and not _NO_ANSWERS.match(t):
            vals.append(t)
    return " | ".join(vals)


def _supp_safety_text(answers: dict) -> str:
    """What supplement avoid-if lists are matched against: the screening
    answers only (a goal like 'Stress' or a diet note must never rule anything
    out). Plans from before the fixed quiz keep matching all their answers."""
    from services import supp_intake
    if any(k in (answers or {}) for k in ("supp_goals", "supp_diet", "age_band")):
        return supp_intake.safety_text(answers).lower()
    return _answers_text(answers)


def _contraindicated(h: "Habit", answers_text: str) -> bool:
    if not answers_text:
        return False
    for k in h.avoid:
        first = k.split()[0][:6] if k.split() else ""
        stems = _AVOID_SYNONYMS.get(k) or ((k, first) if len(first) >= 4 else (k,))
        if any(st and st in answers_text for st in stems):
            return True
    return False


SUPP_DAILY_MAX = 3   # week 1: at most this many supplements a day (the level slider moves it)


def supp_answer_picks(answers: dict, active: set[str], profile: dict, synced: int) -> list[str]:
    """Supplements the person's own quiz answers call for (gaps first, then
    goals), safe ones only, filling the slots the program sync left. Someone
    who named a gap or goal always gets at least one."""
    from services import supp_intake
    pd = get_program_doc(SUPP_PROGRAM)
    if pd is None:
        return []
    atext = _supp_safety_text(answers)
    picks = supp_intake.ordered_picks(answers, active, profile, pd.habits, lambda h: _contraindicated(h, atext))
    cap = supp_intake.TEEN_DAILY_MAX if supp_intake.is_minor(answers, profile) else SUPP_DAILY_MAX
    return picks[: max(1, cap - synced)] if picks else []


def supp_intake_is_minor(answers: dict, profile: Optional[dict] = None) -> bool:
    from services import supp_intake
    return supp_intake.is_minor(answers, profile)


def _supp_answers(answers: dict, profile: dict) -> dict:
    """Suppmax answers with the shared facts filled in. Age asked by another
    program is skipped in this quiz, but the screen still has to see it: an
    under-18 who answered age elsewhere must never get adult-only picks."""
    about = (profile or {}).get("about") or {}
    shared = {k: about[k] for k in ("age_band", "sex") if str(about.get(k) or "").strip()}
    return {**shared, **(answers or {})}


# avoid-if words that name a medicine: "other daily meds" rules these out
_MED_WORDS = ("meds", "medic", "thinner", "ssri", "antidep", "sedative", "seizure", "immunosupp", "antibiotic",
              "antipsych", "water pill", "statin", "insulin", "stimulant", "osteoporosis", "thyroid", "diabetes")
# "what do you already take?" → what that already covers
_STACK_COVERS = {
    "magnesium, melatonin or a sleep aid": {"melatonin", "magnesium_glycinate", "glycine"},
    "vitamin d or fish oil": {"vitamin_d3", "omega3"},
    "multivitamin": {"multivitamin"},
    "protein, creatine or pre-workout": {"protein_powder", "creatine", "caffeine_theanine"},
}


def supp_screen_complete(answers: dict) -> bool:
    """The Suppmax safety screen was answered (conditions and medicines). Without
    it nothing is ever added: an empty screen used to rule nothing out."""
    a = answers or {}
    return bool(str(a.get("supp_safety_flags") or "").strip()) and bool(str(a.get("supp_medications") or "").strip())


def supp_block_reason(h: "Habit", answers: dict) -> Optional[str]:
    """Why this supplement can't be added for this person (None = it can)."""
    from services import supp_intake
    a = answers or {}
    if not supp_screen_complete(a):
        return "the suppmax safety check isn't done"
    flags = str(a.get("supp_safety_flags") or "").lower()
    meds = str(a.get("supp_medications") or "").lower()
    if "pregnan" in flags or "breastfeed" in flags:
        return "you're pregnant, trying or breastfeeding"
    if supp_intake.is_minor(a) and h.id not in supp_intake.TEEN_ALLOWED:
        return "it isn't for under 18s"
    if _contraindicated(h, _supp_safety_text(a)):
        return "something you told me rules it out"
    if "other daily meds" in meds and any(w in " ".join(h.avoid) for w in _MED_WORDS):
        return "it can interact with daily medicines"
    stack = str(a.get("supp_current_stack") or "").lower()
    if any(label in stack and h.id in ids for label, ids in _STACK_COVERS.items()):
        return "you already take something that covers it"
    return None


def required_supplements(active: set[str], answers: dict, declined: set[str], present: set[str],
                         accepted: Optional[set[str]] = None) -> list["Habit"]:
    """The primary supplement for each active program that isn't covered yet,
    minus anything declined or ruled out by the screen. With `accepted`, only
    the ones the person said yes to (a sync never adds anything unasked)."""
    pd = get_program_doc(SUPP_PROGRAM)
    if pd is None:
        return []
    covered = {p for hid in present for p in ((pd.habit(hid).programs if pd.habit(hid) else []) or [])}
    out: list[Habit] = []
    for mid in AI_PROGRAMS:
        if mid not in active or mid in covered or mid in NO_SYNC_PROGRAMS:
            continue
        cand = next((h for h in pd.habits if h.primary_for == mid), None)
        if cand is None or cand.id in declined or cand.id in present or supp_block_reason(cand, answers):
            continue
        if accepted is not None and cand.id not in accepted:
            continue
        if cand.id not in {h.id for h in out}:
            out.append(cand)
    return out


def supp_offer_text(habits: list["Habit"]) -> str:
    """The question that asks before a supplement goes in (beta 1: melatonin was
    added with no question about age, medicine, pregnancy or whether they wanted it)."""
    names = " and ".join(h.title.split("(")[0].strip().lower() for h in habits)
    skips = []
    for h in habits:
        skips += [a for a in h.avoid if a not in skips]
    skip = ", ".join(skips[:6])
    return (f"suppmax can add {names} for this. skip it if you have or take: {skip}. "
            "take only the serving on the label, and check with your clinician if you take other medicines. "
            "want me to add it?")


def _default_supp_time(h: "Habit", profile: dict) -> str:
    """Where a pick goes when Claude dropped it: the library anchor's first
    choice ("dinner (or wind_down)" -> dinner). The free-text timing note is not
    matched: its "Not close to bedtime" would read as bedtime."""
    first = re.split(r"\(|\bor\b|\band\b|,", (h.anchor or "").lower())[0].strip()
    wake = _to_min(_hm(profile.get("wake_time"), "07:00"))
    bed = _to_min(_hm(profile.get("bed_time"), "23:00"))
    meals = profile.get("meals") or {}
    breakfast = _hm(meals.get("breakfast"), _from_min(wake + 30))
    if first.startswith(("wind_down", "pre_bed")) or "bed" in first:
        return _from_min(((bed if bed > wake else bed + 1440) - 45) % 1440)
    if first.startswith("workout"):
        return _hm(profile.get("workout_time"), breakfast)
    if first.startswith("afternoon"):
        return _from_min(_to_min(_hm(meals.get("lunch"), "12:30")) + 90)
    if first.startswith("wake"):
        return _from_min(wake + 15)
    if first.startswith("weekend"):
        return _from_min(max(wake + 60, 600))
    if first.startswith("dinner"):
        return _hm(meals.get("dinner"), "19:00")
    if first.startswith("lunch"):
        return _hm(meals.get("lunch"), "12:30")
    return breakfast


def _teen_only(tmpl: dict) -> None:
    """Under 18, whatever Claude or a request put in: only the allowlisted
    supplements (at most TEEN_DAILY_MAX, in plan order) and the teen routines,
    with teen wording. Custom and adult-only items are dropped."""
    from services import supp_intake
    keep_routines = set(supp_intake.TEEN_ROUTINES) | {"weekly_stack_checkin", "refill_check"}
    out, n_supps = [], 0
    for h in tmpl.get("habits") or []:
        hid = h.get("habit_id")
        if hid in supp_intake.TEEN_ALLOWED:
            if n_supps >= supp_intake.TEEN_DAILY_MAX:
                continue
            n_supps += 1
            h = {**h, "how": supp_intake.TEEN_HOW.get(hid, h.get("how") or "")}
        elif hid not in keep_routines:
            continue
        out.append(h)
    tmpl["habits"] = out


# Adult-only items a teen's summary must never name, even as "later".
_TEEN_NEVER = re.compile(
    r"creatine|melatonin|protein (powder|shake)|pre-?workout|ashwagandha|rhodiola|caffeine|"
    r"l-?theanine|glycine|magnesium|collagen|psyllium|electrolyte|iron\b|tart cherry", re.I)


def _teen_summary(text: str) -> str:
    """Drop any sentence of a teen's plan summary that names an adult-only item."""
    parts = re.split(r"(?<=[.!?])\s+", str(text or "").strip())
    return " ".join(s for s in parts if s and not _TEEN_NEVER.search(s)).strip()


def _insert_supps(tmpl: dict, habits: list["Habit"], profile: dict) -> None:
    for h in habits:
        tmpl.setdefault("habits", []).append({
            # library titles carry notes for the planner ("(vegans, 50+)"): not for the card
            "habit_id": h.id, "title": re.sub(r"\s*\([^)]*\)", "", h.title).strip()[:40],
            "how": (h.how or "")[:400], "why": (h.why or "")[:200],
            "minutes": 1, "time": _default_supp_time(h, profile), "weekend_time": "", "days": list(WEEKDAYS),
        })


def _tag_supp_links(tmpl: dict, active: set[str], prev: Optional[dict] = None, *, user_requested: bool = False) -> None:
    pd = get_program_doc(SUPP_PROGRAM)
    before = {h.get("habit_id"): h for h in ((prev or {}).get("habits") or [])}
    for h in tmpl.get("habits") or []:
        lib = pd.habit(h.get("habit_id")) if pd else None
        linked = sorted(set(lib.programs if lib else []) & active)
        old = before.get(h.get("habit_id"))
        h["linked_to"] = linked
        h["keep"] = bool(old.get("keep")) if old else (user_requested or not linked)
    tmpl["declined"] = sorted(set((prev or {}).get("declined") or []) | set(tmpl.get("declined") or []))


def _finalize_supp(tmpl: dict, profile: dict, answers: dict, active: set[str],
                   prev: Optional[dict] = None, *, user_requested: bool = False, enforce: bool = True,
                   others: Optional[dict] = None, also_required: Optional[list[str]] = None) -> dict:
    """Make the synced picks deterministic (Claude places them; this only fills
    a gap if Claude dropped one), fit the whole Suppmax plan into the day with
    the synced and user-chosen picks protected, then tag links."""
    from services import supp_intake
    declined = set((prev or {}).get("declined") or []) | set(tmpl.get("declined") or [])
    minor = supp_intake.is_minor(answers, profile)
    if minor:
        also_required = list(dict.fromkeys([*supp_intake.TEEN_ROUTINES, *(also_required or [])]))
    if enforce:
        present = {h.get("habit_id") for h in tmpl.get("habits") or []}
        missing = required_supplements(active, answers, declined, present)
        if missing:
            _insert_supps(tmpl, missing, profile)
        pd = get_program_doc(SUPP_PROGRAM)
        present = {h.get("habit_id") for h in tmpl.get("habits") or []}
        extra = [pd.habit(hid) for hid in (also_required or []) if hid not in present and pd and pd.habit(hid)]
        if extra:
            _insert_supps(tmpl, extra, profile)
    if minor:
        _teen_only(tmpl)
        tmpl["summary"] = _teen_summary(tmpl.get("summary") or "")
    needed = {h.id for h in required_supplements(active, answers, declined, set())} | set(also_required or [])
    prev_keep = {h.get("habit_id") for h in (prev or {}).get("habits") or [] if h.get("keep")}
    have = {h.get("habit_id") for h in tmpl.get("habits") or []}
    keep_extra = {k: tmpl.get(k) for k in ("answers", "declined", "accepted", "_draft") if k in tmpl}
    tmpl = {**validate_template(SUPP_PROGRAM, tmpl, profile, others=others,
                                keep_ids=(needed | prev_keep) & have),
            "summary": tmpl.get("summary") or "", **keep_extra}
    tmpl["declined"] = sorted(declined)
    _tag_supp_links(tmpl, active, prev, user_requested=user_requested)
    return tmpl


async def _active_program_ids(user_id: str, db) -> set[str]:
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    res = await db.execute(
        select(UserSchedule.maxx_id).where(
            (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))
        )
    )
    return {m for (m,) in res.all() if is_ai_program(m)}


async def active_programs_brief(user_id: str, db, *, max_habits: int = 8) -> str:
    """One line per active AI program with its habits and times, for chat
    context: lets a knowledge answer say 'your sleepmax wind-down at 22:15'."""
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == UUID(str(user_id))) & (UserSchedule.is_active.is_(True))
        )
    )
    lines = []
    for s in res.scalars().all():
        if not is_ai_program(s.maxx_id):
            continue
        plan = (s.schedule_context or {}).get("ai_plan") or {}
        habits = sorted(plan.get("habits") or [], key=lambda h: h.get("time") or "")
        bits = []
        for h in habits[:max_habits]:
            if not h.get("title"):
                continue
            kind = habit_kind(s.maxx_id, h)
            when = _pretty_time(h.get("time") or "")
            if h.get("weekend_time"):
                when += f" (weekends {_pretty_time(h['weekend_time'])})"
            how = _clean_text(re.sub(r"\s+", " ", str(h.get("how") or "")), 160)
            bits.append(f"{h.get('title')} [{'rule' if kind == 'rule' else str(h.get('minutes') or 1) + ' min'}, "
                        f"{when}, {_days_label(h.get('days') or [])}]" + (f": {how}" if how else ""))
        lines.append(f"{program_label(s.maxx_id)}: " + ("; ".join(bits) or "set up"))
    return ("ACTIVE PROGRAMS (the user's real plan: what each habit is, when, and the steps they see. "
            "It is the truth for their plan: never contradict its times or steps, and never describe "
            "anything not in it as part of their plan): " + " | ".join(lines)) if lines else ""


def pending_intake_question(ctx: dict, conversation_id: Optional[str]) -> Optional[dict]:
    """The AI-program question waiting for an answer in this thread, shaped
    like the history endpoint's pendingQuestion (None if nothing is pending
    here)."""
    pending = ctx.get(INTAKE_KEY) if isinstance(ctx.get(INTAKE_KEY), dict) else None
    if not pending or not is_ai_program(pending.get("max")):
        return None
    if pending.get("conv") and conversation_id and str(pending["conv"]) != str(conversation_id):
        return None
    asked = pending.get("asked") or []
    if not asked:
        return None
    last = asked[-1]
    return {
        "max": pending["max"], "field_id": last.get("fact_key"), "text": last.get("question"),
        "choices": list(last.get("options") or []), "input_widget": None,
        "multi_choice": bool(last.get("multi")), "progress": None,
        "conversation_id": str(pending.get("conv") or conversation_id or "") or None,
    }


async def preview_supp_adds(user_id: str, db, *, with_program: Optional[str] = None) -> list[str]:
    """Supplement ids Suppmax could add for the user's programs, to OFFER (never
    added without a yes). Same screen and answers the sync uses."""
    sched = await active_ai_plan(user_id, SUPP_PROGRAM, db)
    if sched is None:
        return []
    tmpl = (sched.schedule_context or {}).get("ai_plan") or {}
    active = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
    if with_program:
        active.add(with_program)
    _, _, state = await _user_state(user_id, db)
    answers = _supp_answers(tmpl.get("answers") or {}, build_profile(state))
    present = {h.get("habit_id") for h in tmpl.get("habits") or []}
    declined = set(tmpl.get("declined") or [])
    adds = required_supplements(active, answers, declined, present)
    accepted = set(tmpl.get("accepted") or [])
    return [h.id for h in adds if h.id not in accepted]


async def answer_supp_offer(user_id: str, ids: list[str], yes: bool, db) -> None:
    """A yes puts the offered picks in Suppmax (then the sync places them); a
    no keeps them out for good."""
    from sqlalchemy.orm.attributes import flag_modified
    sched = await active_ai_plan(user_id, SUPP_PROGRAM, db)
    if sched is None or not ids:
        return
    sctx = dict(sched.schedule_context or {})
    tmpl = dict(sctx.get("ai_plan") or {})
    key = "accepted" if yes else "declined"
    tmpl[key] = sorted(set(tmpl.get(key) or []) | set(ids))
    sctx["ai_plan"] = tmpl
    sched.schedule_context = sctx
    flag_modified(sched, "schedule_context")
    await db.flush()
    if yes:
        await sync_supplements(user_id, db)
    await db.commit()


async def sync_supplements(user_id: str, db) -> Optional[dict]:
    """Bring Suppmax in line with the user's active programs. Removals are
    applied directly; additions go through Claude so they are placed around the
    real day (deterministic placement if Claude is unavailable). Returns
    {"added": [...], "removed": [...]} or None when nothing changed."""
    from sqlalchemy.orm.attributes import flag_modified
    sched = await active_ai_plan(user_id, SUPP_PROGRAM, db)
    if sched is None:
        return None
    sctx = dict(sched.schedule_context or {})
    prev = sctx.get("ai_plan") or {}
    active = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
    _, _, state = await _user_state(user_id, db)
    profile = build_profile(state)
    answers = _supp_answers(prev.get("answers") or {}, profile)
    declined = set(prev.get("declined") or [])

    kept, removed = [], []
    for h in prev.get("habits") or []:
        linked = set(h.get("linked_to") or [])
        if linked and not (linked & active) and not h.get("keep"):
            removed.append(h)
        else:
            kept.append(dict(h))
    present = {h.get("habit_id") for h in kept}
    # only what the person said yes to (or what's already there) is ever added
    adds = required_supplements(active, answers, declined, present, accepted=set(prev.get("accepted") or []))
    relink = any(sorted(set(h.get("linked_to") or []) & active) != sorted(h.get("linked_to") or []) for h in kept)
    if not removed and not adds and not relink:
        return None

    base = {**prev, "habits": kept}
    tmpl: Optional[dict] = None
    others = await other_program_plans(user_id, db, except_maxx=SUPP_PROGRAM)
    if adds:
        labels = ", ".join(sorted({program_label(h.primary_for) for h in adds}))
        tmpl = await build_plan(
            SUPP_PROGRAM, profile, answers, others,
            current_plan={"summary": prev.get("summary"), "habits": kept, "started_on": prev.get("started_on")},
            request=(f"sync: the user now runs {labels}. add {', '.join(h.id for h in adds)} at the right "
                     "time for each and keep every other supplement exactly as it is."),
            sync_required=[h.id for h in adds],
        )
    if tmpl is None:
        tmpl = dict(base)
    # A sync only places the additions; it never slips in new picks.
    allowed = present | {h.id for h in adds}
    tmpl["habits"] = [h for h in tmpl.get("habits") or [] if h.get("habit_id") in allowed]
    tmpl["answers"] = answers
    tmpl["summary"] = tmpl.get("summary") or prev.get("summary") or ""
    tmpl["declined"] = sorted(declined)
    tmpl["accepted"] = sorted(set(prev.get("accepted") or []))
    # Claude only places the additions: never let a sync silently drop a kept one.
    have = {h.get("habit_id") for h in tmpl.get("habits") or []}
    for h in kept:
        if h.get("habit_id") not in have:
            tmpl.setdefault("habits", []).append({k: v for k, v in h.items() if k not in ("linked_to", "keep")})
    tmpl = _finalize_supp(tmpl, profile, answers, active, prev={**prev, "habits": kept}, others=others)
    tmpl.pop("_draft", None)
    if {h.get("habit_id") for h in tmpl.get("habits") or []} != {h.get("habit_id") for h in prev.get("habits") or []}:
        tmpl = await sync_summary(SUPP_PROGRAM, tmpl, profile, changed=True)

    sctx["ai_plan"] = tmpl
    sctx["summary"] = tmpl.get("summary")
    sched.schedule_context = sctx
    flag_modified(sched, "schedule_context")
    await db.flush()
    from services.schedule_runtime import regenerate_active_schedules
    await regenerate_active_schedules(user_id=user_id, db=db, only_max=SUPP_PROGRAM, reason="supp_sync")
    await db.commit()
    out = {"added": [h.title for h in adds], "removed": [h.get("title") for h in removed]}
    logger.info("ai_programs: suppmax sync for %s: %s", user_id[:8], out)
    return out


_SYNC_TASKS: dict[str, "asyncio.Task"] = {}


def kick_supp_sync(user_id: str, *, refit: bool = False) -> None:
    """Run sync_supplements in the background on its own session (the caller's
    request returns right away). Coalesces: one sync per user at a time.
    refit=True first re-fits the remaining AI stack (after a program stops:
    habits it was covering come back to the programs that set them aside)."""
    uid = str(user_id)

    async def _run():
        try:
            from db.sqlalchemy import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
                if refit:
                    from services.schedule_runtime import regenerate_active_schedules
                    await regenerate_active_schedules(user_id=uid, db=db, only_ai=True, reason="stack_change")
                    await db.commit()
                await sync_supplements(uid, db)
        except Exception:
            logger.exception("ai_programs: suppmax sync failed for %s", uid[:8])
        finally:
            _SYNC_TASKS.pop(uid, None)

    prev = _SYNC_TASKS.get(uid)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def _chain():
        if prev is not None and not prev.done():
            try:
                await prev
            except Exception:
                pass
        await _run()

    _SYNC_TASKS[uid] = loop.create_task(_chain())


async def create_program_schedule(user_id: str, maxx_id: str, db, *, answers: dict) -> Optional[dict]:
    """Build the first plan for a program and persist it as a UserSchedule.
    Returns {"schedule_id", "template"} or None if the planner failed."""
    from sqlalchemy import select
    from models.sqlalchemy_models import UserSchedule
    from services.calendar_busy import apply_calendar_busy, calendar_busy_by_date
    from services.day_fence import fence_days
    from services.multi_module_collision import reconcile_schedules
    from services.schedule_runtime import _load_other_active_days, _log_op, _update_active_days
    from services.schedule_streak import local_today_date
    from services.task_fields import normalize_days

    user, onboarding, state = await _user_state(user_id, db)
    if user is None:
        return None
    profile = build_profile(state)
    others = await other_program_plans(user_id, db, except_maxx=maxx_id)
    sync_required = None
    if maxx_id == SUPP_PROGRAM:
        answers = _supp_answers(answers, profile)
        active_now = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
        # starting Suppmax after its safety screen is the yes for its own picks
        program_picks = [h.id for h in required_supplements(active_now, answers, set(), set())]
        sync_required = list(program_picks)
        sync_required += [h for h in supp_answer_picks(answers, active_now, profile, len(sync_required))
                          if h not in sync_required]
    # shared facts (age, sex, first meal) asked by any program are remembered for all
    about = {k: answers[k] for k in ABOUT_KEYS if str(answers.get(k) or "").strip()}
    if about:
        from services.user_context_service import merge_context
        await merge_context(user_id, about, db)
        profile = {**profile, "about": {**(profile.get("about") or {}), **about}}
    tmpl = await build_plan(maxx_id, profile, answers, others, sync_required=sync_required)
    if tmpl is not None and maxx_id == SUPP_PROGRAM:
        tmpl["answers"] = answers
        tmpl["accepted"] = sorted(program_picks)
        drafted = {h.get("habit_id") for h in tmpl.get("habits") or []}
        tmpl = _finalize_supp(tmpl, profile, answers, active_now, others=others,
                              also_required=sync_required)
        if {h.get("habit_id") for h in tmpl.get("habits") or []} != drafted:
            # the summary must describe the plan they actually got
            tmpl = await sync_summary(SUPP_PROGRAM, tmpl, profile, changed=True)
        if supp_intake_is_minor(answers, profile):
            tmpl["summary"] = _teen_summary(tmpl.get("summary") or "")
    supp_preview: list[str] = []
    if tmpl is not None and maxx_id not in NO_SYNC_PROGRAMS:
        try:
            supp_preview = await preview_supp_adds(user_id, db, with_program=maxx_id)
        except Exception:
            logger.warning("ai_programs: suppmax preview failed (non-fatal)")
    # A typed "start sleepmax" never passed through Explore; record the
    # program as entered so Explore shows it as on the user's stack.
    entered = list(onboarding.get("entered_maxxes") or [])
    if maxx_id not in entered:
        from sqlalchemy.orm.attributes import flag_modified as _fm
        ob = dict(user.onboarding or {})
        ob["entered_maxxes"] = entered + [maxx_id]
        ob.setdefault("maxx_entered_at", {})[maxx_id] = datetime.utcnow().isoformat()
        user.onboarding = ob
        _fm(user, "onboarding")
    if tmpl is None:
        return None
    tmpl["answers"] = answers
    tmpl = await sync_summary(maxx_id, tmpl, profile)
    if maxx_id != PEPTIDE_PROGRAM:
        cleaned = strip_unsupported_claims(tmpl.get("summary") or "", answers, profile)
        tmpl["summary"] = cleaned or plain_summary(tmpl)
    if maxx_id == "sleepmax":
        note = _short_night_note(profile)
        if note:
            tmpl["summary"] = (tmpl.get("summary") or "").rstrip() + "\n\n" + note

    today = local_today_date(state)
    # Same pipeline as regenerate_active_schedules (so a fresh plan and its
    # first regeneration are identical): the fitted template already knows the
    # whole day and every other program, so only real calendar events move
    # tasks after expansion. The old skeleton passes (work fence, cross-module
    # re-pack) are not run on AI programs.
    days = expand_template(maxx_id, tmpl, start_date=today)
    normalize_days(days, maxx_id)
    busy = await calendar_busy_by_date(UUID(user_id), today, today + timedelta(days=35), db)
    days = apply_calendar_busy(days, busy)

    res = await db.execute(
        select(UserSchedule).where(
            (UserSchedule.user_id == UUID(user_id))
            & (UserSchedule.maxx_id == maxx_id)
            & (UserSchedule.is_active.is_(True))
        )
    )
    for prior in res.scalars().all():
        prior.is_active = False
        prior.updated_at = datetime.utcnow()
        scrub_peptide_details(prior)

    row = UserSchedule(
        user_id=UUID(user_id), schedule_type="maxx", maxx_id=maxx_id,
        course_title=f"{program_label(maxx_id)} Plan", days=days,
        preferences={"wake_time": profile["wake_time"], "sleep_time": profile["bed_time"]},
        schedule_context={"summary": tmpl.get("summary"), "ai_plan": tmpl},
        is_active=True, created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        adapted_count=0, user_feedback=[],
        completion_stats={"completed": 0, "total": 0, "skipped": 0},
    )
    db.add(row)
    await db.flush()
    try:
        await _log_op(db, user_id=UUID(user_id), schedule_id=row.id, maxx_id=maxx_id, op="generate",
                      elapsed_ms=0, task_count=sum(len(d.get("tasks") or []) for d in days),
                      validator_retries=0)
    except Exception:
        logger.warning("ai_programs: op log failed (non-fatal)")
    await db.commit()
    schedule_id = str(row.id)      # before anything below can expire the row
    try:
        from services.gcal_mirror import kick_gcal_mirror
        kick_gcal_mirror(user_id)
    except Exception:
        pass
    # The new program took its fair share of the day: re-fit the rest of the
    # stack so the person's minutes hold across ALL programs (a no-op for any
    # program already inside its share).
    if others:
        try:
            from services.schedule_runtime import regenerate_active_schedules
            await regenerate_active_schedules(user_id=user_id, db=db, only_ai=True, reason="stack_change")
            await db.commit()
        except Exception:
            logger.warning("ai_programs: stack refit after create failed (non-fatal)", exc_info=True)
            await db.rollback()
    if maxx_id not in NO_SYNC_PROGRAMS:
        kick_supp_sync(user_id)
    return {"schedule_id": schedule_id, "template": tmpl, "supp_added": supp_preview}


_SKIN_IRRITATED = re.compile(r"\b(sting|stinging|burn|burning|irritat\w*|peel\w*|flak\w*|too (strong|harsh|much)|"
                             r"red(ness)?|raw|sensitive)\b", re.IGNORECASE)
_SKIN_SIMPLER = re.compile(r"\b(simpler|simple|lighter|fewer steps|less|minimal|too many steps)\b", re.IGNORECASE)


def skin_redo(current: dict, request: str, profile: dict, others: dict) -> Optional[dict]:
    """Skin & Hair changes that the routine builder handles itself (no Claude):
    irritation makes it gentler (buffered active, no extras), 'simpler' drops
    the extra serum and treatment nights, and a new goal or skin type rebuilds.
    None = not one of these (Claude handles it, routines kept)."""
    from services import skin_routine
    answers = dict(current.get("answers") or {})
    req = request or ""
    try:
        started = date.fromisoformat(str(current.get("started_on"))[:10])
    except (TypeError, ValueError):
        started = _local_today(profile)
    note = ""
    for label in list(skin_routine.GOALS):
        if label.lower() in req.lower():
            answers["skin_goal"] = label
            note = "rebuilt around your new goal."
    for label in list(skin_routine.FEELS):
        if label.lower() in req.lower():
            answers["skin_feel"] = label
            note = "rebuilt for your skin type."
    if not note and _SKIN_IRRITATED.search(req):
        answers["skin_mode"] = "gentle"
        note = ("made it gentler: moisturizer goes on before your active, and no extra serum or microneedling. "
                "stop anything that burns or causes a rash.")
    elif not note and _SKIN_SIMPLER.search(req):
        answers["skin_mode"] = "minimal"
        note = "made it simpler: just the core steps plus your main night active."
    if not note:
        return None
    raw = skin_routine.build_template(answers, started_on=started)
    out = validate_template("skinhairmax", raw, profile, others=others)
    out["answers"] = answers
    out["summary"] = f"{note} {raw['summary']}"
    return out


def _keep_routines(tmpl: dict, current: dict) -> None:
    """A Claude redo of Skin & Hair (e.g. 'move my night routine later') keeps
    the routine's nightly steps and phases: Claude only moves times/days."""
    prev = {h.get("habit_id"): h for h in (current or {}).get("habits") or []}
    for h in tmpl.get("habits") or []:
        p = prev.get(h.get("habit_id"))
        if p and p.get("variants") and not h.get("variants"):
            h["variants"], h["schedule"] = p["variants"], p.get("schedule") or []
    for k in ("started_on", "skin_profile"):
        if current.get(k) and not tmpl.get(k):
            tmpl[k] = current[k]


_SWAP_RE = re.compile(r"\b(swap|replace|instead of|switch out|trade)\b", re.IGNORECASE)


def _limit_swap(maxx_id: str, tmpl: dict, current: dict, request: str, profile: dict, others: dict) -> dict:
    """'Swap X for something else' trades one habit for one: Claude sometimes
    answers by adding two or three; keep only the most important newcomer per
    habit taken out."""
    if not _SWAP_RE.search(request or ""):
        return tmpl
    old = {h.get("habit_id") for h in (current or {}).get("habits") or []}
    new = {h.get("habit_id") for h in tmpl.get("habits") or []}
    added, removed = new - old, old - new
    room = max(1, len(removed))
    if len(added) <= room:
        return tmpl
    keep_new = {h["habit_id"] for h in sorted((h for h in tmpl["habits"] if h["habit_id"] in added),
                                              key=lambda h: h.get("priority", 0))[:room]}
    hs = [h for h in tmpl["habits"] if h["habit_id"] not in added or h["habit_id"] in keep_new]
    out = validate_template(maxx_id, {**tmpl, "habits": hs}, profile, others=others)
    out["_draft"] = {**(tmpl.get("_draft") or {}), "habits": []}     # summary must be rewritten
    return out


_LIGHTER_RE = re.compile(r"\b(lighter|less|easier|fewer|shorter|cut back|scale back|too (much|many|long|hard))\b",
                         re.IGNORECASE)


def _week_minutes(tmpl: dict) -> int:
    return sum(int(h.get("minutes") or 1) * len(h.get("days") or []) for h in (tmpl or {}).get("habits") or [])


def _is_lighter(new: dict, old: dict) -> bool:
    n_new, n_old = len(new.get("habits") or []), len((old or {}).get("habits") or [])
    sessions = lambda t: sum(len(h.get("days") or []) for h in (t or {}).get("habits") or [])  # noqa: E731
    return _week_minutes(new) < _week_minutes(old) or n_new < n_old or sessions(new) < sessions(old)


def _lighten(maxx_id: str, tmpl: dict, old: dict, profile: dict, others: dict) -> dict:
    """Deterministic 'make it lighter': drop the last (least important) habit,
    or with a single habit left, a third of its days."""
    hs = sorted((dict(h) for h in tmpl.get("habits") or []), key=lambda h: h.get("priority", 0))
    if len(hs) > 1:
        hs = hs[:-1]                     # the least important one
    elif hs and len(hs[0].get("days") or []) > 2:
        days = hs[0]["days"]
        hs[0]["days"] = days[: max(2, len(days) - max(1, len(days) // 3))]
    out = validate_template(maxx_id, {**tmpl, "habits": hs}, profile, others=others)
    out["_draft"] = {**(tmpl.get("_draft") or {}), "habits": []}     # summary must be rewritten
    return out


def _is_heavier(new: dict, old: dict) -> bool:
    n_new, n_old = len(new.get("habits") or []), len((old or {}).get("habits") or [])
    return _week_minutes(new) > _week_minutes(old) or n_new > n_old


_TIER_ORDER = {"core": 0, "medium": 1, "hard": 2}
_SUPP_ROUTINES = {"stack_audit", "weekly_stack_checkin", "refill_check"}


def _harden(maxx_id: str, tmpl: dict, profile: dict, others: dict, n: int = 2) -> dict:
    """Deterministic 'give me more': add the next most valuable library habits
    this plan doesn't have yet (the fit still decides what really fits)."""
    lib = _lib(maxx_id)
    have = {h.get("habit_id") for h in tmpl.get("habits") or []}
    have |= {p.get("habit_id") for p in tmpl.get("parked") or []}
    picks = [h for h in lib.values() if h.id not in have and not h.programs]
    if maxx_id == SUPP_PROGRAM:
        # never add something to swallow unscreened: only the stack check-ins
        picks = [h for h in picks if h.id in _SUPP_ROUTINES]
    picks.sort(key=lambda h: _TIER_ORDER.get(h.tier, 1))
    adds = []
    for h in picks[:n]:
        m = re.search(r"(\d)\s*x", h.frequency or "")
        days = ["mon", "wed", "fri", "sat", "tue", "thu", "sun"][: int(m.group(1))] if m else list(WEEKDAYS)
        adds.append({"habit_id": h.id, "title": h.title, "minutes": h.minutes_default, "time": "",
                     "weekend_time": "", "days": days, "why": h.why, "how": h.how})
    out = validate_template(maxx_id, {**tmpl, "habits": list(tmpl.get("habits") or []) + adds},
                            profile, others=others)
    out["_draft"] = {**(tmpl.get("_draft") or {}), "habits": []}     # summary must be rewritten
    return out


async def redo_program_plan(user_id: str, maxx_id: str, request: str, db, *,
                            level: Optional[str] = None) -> Optional[dict]:
    """Rebuild an existing program's plan from the user's request. Updates the
    row in place (done tasks kept). Returns the new template, or None."""
    from sqlalchemy.orm.attributes import flag_modified
    sched = await active_ai_plan(user_id, maxx_id, db)
    if sched is None:
        return None
    sctx = dict(sched.schedule_context or {})
    current = sctx.get("ai_plan") or {}
    _, _, state = await _user_state(user_id, db)
    profile = build_profile(state)
    others = await other_program_plans(user_id, db, except_maxx=maxx_id)
    was = plan_level(current)
    level = level if level in PLAN_LEVELS else _implied_level(request, was)
    lighter = PLAN_LEVELS.index(level) < PLAN_LEVELS.index(was)
    heavier = PLAN_LEVELS.index(level) > PLAN_LEVELS.index(was)
    skin = skin_redo(current, request, profile, others) if maxx_id == "skinhairmax" and not (lighter or heavier) else None
    if skin is not None:
        tmpl = skin
    else:
        tmpl = await build_plan(maxx_id, profile, current.get("answers") or {}, others,
                                current_plan={k: current.get(k) for k in ("summary", "habits", "started_on", "declined")},
                                request=request, level=level)
        if tmpl is not None:
            _keep_routines(tmpl, current)
    if tmpl is None:
        return None
    if plan_level(tmpl) != level:
        tmpl = validate_template(maxx_id, {**tmpl, "level": level}, profile, others=others)
    tmpl = _limit_swap(maxx_id, tmpl, current, request, profile, others)
    if heavier:
        # "more" never quietly takes days away from a habit the person already has
        prev_days = {h.get("habit_id"): set(h.get("days") or []) for h in current.get("habits") or []}
        if any(prev_days.get(h["habit_id"], set()) - set(h.get("days") or []) for h in tmpl["habits"]):
            hs = [{**h, "days": [d for d in WEEKDAYS if d in set(h.get("days") or []) | prev_days.get(h["habit_id"], set())]}
                  for h in tmpl["habits"]]
            draft = tmpl.get("_draft")
            tmpl = validate_template(maxx_id, {**tmpl, "habits": hs}, profile, others=others)
            tmpl["_draft"] = {**(draft or {}), "habits": []}
    if heavier and not _is_heavier(tmpl, current):
        tmpl = _harden(maxx_id, tmpl, profile, others)
    if (lighter or _LIGHTER_RE.search(request or "")) and not _is_lighter(tmpl, current):
        # Claude "lightened" by shortening a habit below its minimum, which the
        # fit undid: ask once more with the reason, then cut it ourselves.
        retry = await build_plan(
            maxx_id, profile, current.get("answers") or {}, others,
            current_plan={k: current.get(k) for k in ("summary", "habits", "started_on", "declined")},
            request=(f"{request}. (Your last version was not lighter once each habit's minimum minutes "
                     "were applied. Make it lighter by removing a habit or some days, never by shortening "
                     "a habit below its minimum.)"),
            level=level,
        )
        if retry is not None and _is_lighter(retry, current):
            tmpl = retry
        else:
            tmpl = _lighten(maxx_id, tmpl, current, profile, others)
    tmpl["answers"] = current.get("answers") or {}
    if current.get("declined") and maxx_id != SUPP_PROGRAM:
        tmpl["declined"] = sorted(set(current.get("declined") or []) | set(tmpl.get("declined") or []))
    if maxx_id == PEPTIDE_PROGRAM:
        tmpl = _peptide_guard(tmpl, current)
    if maxx_id == SUPP_PROGRAM:
        # A synced pick the user just asked to drop stays dropped on later syncs.
        new_ids = {h.get("habit_id") for h in tmpl.get("habits") or []}
        dropped = {h.get("habit_id") for h in current.get("habits") or []
                   if h.get("linked_to") and h.get("habit_id") not in new_ids}
        tmpl["declined"] = sorted(set(current.get("declined") or []) | dropped)
        tmpl["accepted"] = sorted(set(current.get("accepted") or []) - dropped)
        active = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
        tmpl["answers"] = _supp_answers(tmpl["answers"], profile)
        tmpl = _finalize_supp(tmpl, profile, tmpl["answers"], active, prev=current, others=others,
                              user_requested=True, enforce=False)
    tmpl = await sync_summary(maxx_id, tmpl, profile)
    history = list(sctx.get("ai_plan_history") or [])[-4:]
    history.append({"at": datetime.utcnow().isoformat(), "request": request[:300]})
    sctx["ai_plan"] = tmpl
    sctx["ai_plan_history"] = history
    sctx["summary"] = tmpl.get("summary")
    # A redo replaces the plan, so earlier per-habit pins/removals no longer apply.
    for k in ("time_overrides", "excluded_catalog_ids", "avoided_catalog_ids", "wanted_catalog_ids"):
        sctx.pop(k, None)
    sched.schedule_context = sctx
    flag_modified(sched, "schedule_context")
    await db.flush()
    from services.schedule_runtime import regenerate_active_schedules
    # The whole stack, not just this program: a heavier redo may need the
    # others to give back minutes (each is a no-op when already inside its share).
    await regenerate_active_schedules(user_id=user_id, db=db, only_ai=True, reason="ai_redo")
    await db.commit()
    return tmpl


# ── first-question prefetch ──────────────────────────────────────────────────
# Opening a program's page warms Claude's first intake question so tapping
# "Start" answers instantly instead of waiting on a model call. One cached step
# per program, keyed to a hash of the profile it was asked against; the start
# turn consumes it (one-shot). Same-process starts that land while the prefetch
# is still running await it instead of making a second call.
PREFETCH_KEY = "_ai_intake_prefetch"
PREFETCH_TTL_S = 12 * 3600
_INFLIGHT: dict[tuple[str, str], "asyncio.Task"] = {}


def _profile_sig(profile: dict) -> str:
    import hashlib
    return hashlib.sha1(json.dumps(profile, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _cached_first_step(ctx: dict, maxx_id: str, sig: str) -> Optional[dict]:
    entry = ((ctx.get(PREFETCH_KEY) or {}) if isinstance(ctx.get(PREFETCH_KEY), dict) else {}).get(maxx_id)
    if not isinstance(entry, dict) or entry.get("sig") != sig:
        return None
    try:
        age = datetime.utcnow().timestamp() - float(entry.get("at") or 0)
    except (TypeError, ValueError):
        return None
    step = entry.get("step")
    if age > PREFETCH_TTL_S or not isinstance(step, dict) or not step.get("question"):
        return None
    return step


async def _prefetch(user_id: str, maxx_id: str) -> Optional[dict]:
    from db.sqlalchemy import AsyncSessionLocal
    from services.user_context_service import get_context, merge_context
    async with AsyncSessionLocal() as db:
        if await active_ai_plan(user_id, maxx_id, db) is not None:
            return None
        _, _, state = await _user_state(user_id, db)
        profile = build_profile(state)
        sig = _profile_sig(profile)
        ctx = await get_context(user_id, db)
        cached = _cached_first_step(ctx, maxx_id, sig)
        if cached:
            return cached
        await db.commit()  # hand the connection back while Claude thinks
        step = await next_intake_step(maxx_id, profile, {}, [])
        if step.get("done") or not step.get("question"):
            return None  # Claude unavailable (or nothing to ask) — the start turn decides live
        ctx = await get_context(user_id, db)
        cache = dict(ctx.get(PREFETCH_KEY) or {}) if isinstance(ctx.get(PREFETCH_KEY), dict) else {}
        cache[maxx_id] = {"step": step, "sig": sig, "at": datetime.utcnow().timestamp()}
        await merge_context(user_id, {PREFETCH_KEY: cache}, db)
        await db.commit()
        return step


def prefetch_first_step(user_id: str, maxx_id: str) -> bool:
    """Fire-and-forget warm of the first intake question. False if not an AI
    program or one is already running for this user+program."""
    if not is_ai_program(maxx_id):
        return False
    key = (str(user_id), maxx_id)
    task = _INFLIGHT.get(key)
    if task is not None and not task.done():
        return True

    async def _run():
        try:
            return await _prefetch(str(user_id), maxx_id)
        except Exception:
            logger.exception("ai_programs: prefetch failed for %s", maxx_id)
            return None
        finally:
            _INFLIGHT.pop(key, None)

    _INFLIGHT[key] = asyncio.create_task(_run())
    return True


async def _first_step(user_id: str, maxx_id: str, profile: dict, ctx: dict) -> Optional[dict]:
    """The prefetched first question if there is one (consuming it), else None."""
    task = _INFLIGHT.get((str(user_id), maxx_id))
    if task is not None and not task.done():
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=30)
        except Exception:
            pass
    return _cached_first_step(ctx, maxx_id, _profile_sig(profile))


_DAY_ABBR = {"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu", "fri": "Fri", "sat": "Sat", "sun": "Sun"}


def _days_label(days: list) -> str:
    days = [d for d in WEEKDAYS if d in (days or [])]
    if len(days) == 7:
        return "Daily"
    if days == WEEKDAYS[:5]:
        return "Weekdays"
    if days == WEEKDAYS[5:]:
        return "Weekends"
    return " · ".join(_DAY_ABBR.get(d, d) for d in days)


def plan_day_minutes(maxx_id: str, tmpl: dict) -> tuple[int, int]:
    """(weekday, weekend) minutes on a busiest regular day: every task that
    runs that day every week, rules and once-only setups left out."""
    def load(day: str) -> int:
        return sum(int(h.get("minutes") or 0) for h in tmpl.get("habits") or []
                   if day in (h.get("days") or []) and not h.get("weeks") and not h.get("trial")
                   and habit_kind(maxx_id, h) not in ("rule", "setup"))
    return (max(load(d) for d in WEEKDAYS[:5]), max(load(d) for d in WEEKDAYS[5:]))


def plan_block(maxx_id: str, tmpl: dict, *, note: str = "") -> str:
    """The plan as a [VISUAL_BLOCK] marker the app renders as a native card
    (time · habit · minutes · days). Lives in the stored text, so a reopened
    chat re-renders the same card."""
    meta = AI_PROGRAMS.get(maxx_id) or {}
    # in the order of the person's waking day (a 00:45 wind-down comes last)
    wake = _to_min(_hm(((tmpl.get("fit_for") or {}).get("weekday") or ["04:00"])[0], "04:00"))
    habits = sorted(tmpl.get("habits") or [],
                    key=lambda h: (_to_min(_hm(h.get("time"), "12:00")) - wake) % 1440)
    items = [{
        "time": _pretty_time(h.get("time") or ""),
        "title": str(h.get("title") or "").strip()[:60],
        "minutes": 0 if habit_kind(maxx_id, h) == "rule" else int(h.get("minutes") or 0),
        "days": _days_label(h.get("days") or []),
        "kind": habit_kind(maxx_id, h),
    } for h in habits if h.get("title")]
    wkd, wke = plan_day_minutes(maxx_id, tmpl)
    block = {
        "type": "plan",
        "title": f"{program_label(maxx_id)} plan",
        "data": {
            "program": maxx_id,
            "color": meta.get("color") or "",
            # real per-day sums (rules and once-only setups excluded), so
            # the card's number is what the person's day actually holds
            "total_minutes": wkd,
            "weekday_minutes": wkd,
            "weekend_minutes": wke,
            "note": note,
            "level": plan_level(tmpl),
            "items": items,
        },
    }
    return "[VISUAL_BLOCK]" + json.dumps(block, separators=(",", ":")) + "[/VISUAL_BLOCK]"


def plan_reply(maxx_id: str, tmpl: dict, *, redo: bool = False, include_summary: bool = True,
               note: str = "") -> str:
    """The chat message that presents a plan and invites changes."""
    parts = []
    summary = (tmpl.get("summary") or "").strip()
    if summary and include_summary:
        parts.append(summary)
    if note:
        parts.append(note)
    parts.append(plan_block(
        maxx_id, tmpl,
        note="Updated on your Home and Planner" if redo else "Added to your Home and Planner",
    ))
    if maxx_id == PEPTIDE_PROGRAM:
        parts.append("anything here different from your label, or did your prescriber change something? tell me "
                     "and i'll update it. severe belly pain, trouble breathing, swelling or a hot, spreading "
                     "injection site: get care now.")
    # (no "slide it lighter" line: the Lighter / Balanced / More control under
    # the card is the affordance, and it isn't always there)
    return "\n\n".join(parts)


def redo_reply(maxx_id: str, tmpl: dict, changes: list[dict]) -> str:
    """A changed plan, told from what actually changed (never from the request:
    beta 1's 'moved your workout to evening' had no workout behind it)."""
    from services import plan_diff
    said = plan_diff.describe([c for c in changes if c["type"] != "program_added"])
    if said:
        lead = f"done. {said[0].lower()}{said[1:]}"
    else:
        why = [n.split(":", 1)[1].strip() for n in tmpl.get("fit_notes") or [] if ":" in n][:2]
        lead = ("nothing in your plan changed" + (f": {'; '.join(why)}." if why else ". ")
                + " tell me which habit and what to change, and i'll do it.")
    return plan_reply(maxx_id, tmpl, redo=True, include_summary=False, note=lead)


# Claims about the person a summary may only make when their answers or day
# say so (beta 1, F6: "working late into the night on short sleep" from
# answers that mentioned neither)
_CLAIMS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"short sleep|not (getting|sleeping) enough|sleep(ing)? too little|sleep[- ]deprived|under-?slept", re.I),
     "short_sleep"),
    (re.compile(r"late (into the )?nights?|working late|night owl|up late|stay(ing)? up late", re.I), "late"),
    (re.compile(r"\bstress(ed|ful)?\b|\banxious|\banxiety", re.I), "stress"),
    (re.compile(r"skip(ping)? breakfast|no breakfast|don'?t eat breakfast", re.I), "no_breakfast"),
    (re.compile(r"drink(ing)? (a lot|heavily|most nights|every night)|heavy drink", re.I), "drinks"),
    (re.compile(r"\bshift work|night shifts?\b", re.I), "shift"),
]


def _claim_supported(kind: str, answers: dict, profile: dict) -> bool:
    text = " ".join(str(v) for v in list((answers or {}).values())
                    + list(((profile or {}).get("about") or {}).values())).lower()
    wake = _to_min(_hm(profile.get("wake_time"), "07:00"))
    bed = _to_min(_hm(profile.get("bed_time"), "23:00"))
    night = (wake - bed) % 1440
    if kind == "short_sleep":
        return 0 < night < 7 * 60
    if kind == "late":
        return 60 <= bed < 360 or bool(re.search(r"\blate\b|evening", text)) and "screen" in text
    if kind == "stress":
        return bool(re.search(r"stress|anx|overwhelm|tense", text))
    if kind == "no_breakfast":
        return bool(re.search(r"coffee only|later in the day|skip", text))
    if kind == "drinks":
        return bool(re.search(r"3\+ nights|most nights|every night", text))
    if kind == "shift":
        return "shift" in text
    return True


def strip_unsupported_claims(summary: str, answers: dict, profile: dict) -> str:
    """The summary without sentences that state things about the person they
    never said."""
    if not summary:
        return summary
    parts = re.split(r"(?<=[.!?])\s+", summary.strip())
    keep = []
    for s in parts:
        bad = [k for rx, k in _CLAIMS if rx.search(s) and not _claim_supported(k, answers, profile)]
        if not bad:
            keep.append(s)
            continue
        # keep the plan part of a sentence that opened with an invented picture
        tail = re.split(r"\b(?:this plan|your plan|so (?:this|the) plan|the plan)\b", s, maxsplit=1, flags=re.I)
        if len(tail) == 2 and not any(rx.search(tail[1]) for rx, _ in _CLAIMS):
            keep.append(("this plan" + tail[1]).strip())
    return " ".join(keep).strip()


def _short_night_note(profile: dict) -> str:
    wake = _to_min(_hm(profile.get("wake_time"), "07:00"))
    bed = _to_min(_hm(profile.get("bed_time"), "23:00"))
    night = (wake - bed) % 1440
    if 0 < night < 7 * 60:
        h, m = divmod(night, 60)
        return (f"heads up: bed at {_pretty_time(_hm(profile.get('bed_time'), '23:00'))} and up at "
                f"{_pretty_time(_hm(profile.get('wake_time'), '07:00'))} leaves {h} h{f' {m} min' if m else ''} "
                "for sleep, and most adults need 7 or more. if either time is off, fix it in planner settings or "
                "tell me your real wake and bed times.")
    return ""


def _pretty_time(hm: str) -> str:
    try:
        h, m = (int(x) for x in hm.split(":"))
    except Exception:
        return hm
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d}{suffix}" if m else f"{h12}{suffix}"


AFTER_PLAN_CHOICES = ["looks good", "move things later", "swap a habit"]
_CHANGE_RE = re.compile(
    r"\b(redo|rebuild|change|swap|replace|move|shift|earlier|later|lighter|harder|easier|"
    r"less|more|remove|drop|add|skip|weekend|morning|evening|night|instead|too (much|many|early|late))\b",
    re.IGNORECASE,
)


_START_RE = re.compile(r"\b(start|begin|set ?up|add|join|try|sign me up for)\b", re.IGNORECASE)


def detect_program_start(text: str) -> Optional[str]:
    """A typed "start sleepmax" / "set up skin & hair" → that program id."""
    t = (text or "").lower()
    if not _START_RE.search(t):
        return None
    for mid, meta in AI_PROGRAMS.items():
        names = {mid, meta["label"].lower(), meta["label"].lower().replace(" ", ""),
                 meta["label"].lower().replace("max", " max")}
        if mid == "skinhairmax":
            names |= {"skin and hair", "skin & hair", "skinhair"}
        if mid == SUPP_PROGRAM:
            names |= {"supplement max", "supplementmax", "supplements max"}
        if mid == PEPTIDE_PROGRAM:
            names |= {"peptide max", "peptides max", "pepmax"}
        if any(re.search(rf"\b{re.escape(n)}\b", t) for n in names):
            return mid
    return None


def looks_like_change_request(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t or t in ("looks good", "looks great", "perfect", "thanks", "thank you", "ok", "okay", "good"):
        return False
    return bool(_CHANGE_RE.search(t))


# ── Chat driver ─────────────────────────────────────────────────────────────

async def chat_turn(
    user_id: str,
    message: str,
    db,
    *,
    start_maxx: Optional[str],
    conversation_id: Optional[str],
) -> Optional[tuple[str, list[str], bool]]:
    """Own the chat turn when it belongs to an AI program:
      * the marketplace "start my plan" opener (start_maxx) → begin intake;
      * an answer to the pending intake question in that program's thread;
      * a change request in a program thread that already has a plan → redo.
    Returns (reply, choices, multi_choice) or None to let the normal chat run."""
    from services.user_context_service import get_context, merge_context

    msg = (message or "").strip()
    conv = str(conversation_id or "")
    ctx = await get_context(user_id, db)
    pending = ctx.get(INTAKE_KEY) if isinstance(ctx.get(INTAKE_KEY), dict) else None
    if pending and not is_ai_program(pending.get("max")):
        pending = None

    offer = ctx.get(SUPP_OFFER_KEY) if isinstance(ctx.get(SUPP_OFFER_KEY), dict) else None
    if offer and not start_maxx and (not offer.get("conv") or offer.get("conv") == conv):
        await merge_context(user_id, {SUPP_OFFER_KEY: None}, db)
        await db.commit()
        yes = bool(re.match(r"\s*(yes|yeah|yep|sure|ok|okay|add)\b", msg, re.I))
        no = bool(re.match(r"\s*(no|nope|nah|not now|skip|don'?t)\b", msg, re.I))
        if yes or no:
            ids = [x for x in offer.get("ids") or [] if isinstance(x, str)]
            await answer_supp_offer(user_id, ids, yes, db)
            pd = get_program_doc(SUPP_PROGRAM)
            names = " and ".join((pd.habit(x).title.split("(")[0].strip().lower() if pd and pd.habit(x) else x)
                                 for x in ids)
            if yes:
                return (f"added {names} to suppmax. it's on your home and planner; take the serving on the "
                        "label, and stop if anything feels off.", AFTER_PLAN_CHOICES, False)
            return (f"no problem, {names} stays out of your plan and i won't offer it again.",
                    AFTER_PLAN_CHOICES, False)

    typed_start = False
    if not start_maxx and not pending:
        start_maxx = detect_program_start(msg)
        typed_start = bool(start_maxx)

    if start_maxx and is_ai_program(start_maxx):
        existing = await active_ai_plan(user_id, start_maxx, db)
        if existing is not None and (existing.schedule_context or {}).get("ai_plan"):
            tmpl = existing.schedule_context["ai_plan"]
            return (
                f"you're already running {program_label(start_maxx).lower()}. here's your plan:\n\n"
                + plan_reply(start_maxx, tmpl, redo=False, include_summary=False),
                AFTER_PLAN_CHOICES, False,
            )
        pending = {"max": start_maxx, "conv": conv, "answers": {}, "asked": []}
        is_opener = True
    elif pending and (not pending.get("conv") or pending.get("conv") == conv):
        is_opener = False
        asked = pending.get("asked") or []
        if asked:
            last = asked[-1]
            pending.setdefault("answers", {})[last.get("fact_key") or f"q{len(asked)}"] = msg[:300]
    else:
        # A change request (or a Lighter · Balanced · More tap on the plan card)
        # inside a program's own thread → rebuild it.
        lvl = control_level(msg)
        if not conv or (lvl is None and not looks_like_change_request(msg)):
            return None
        from sqlalchemy import select
        from models.sqlalchemy_models import UserSchedule
        res = await db.execute(
            select(UserSchedule).where(
                (UserSchedule.user_id == UUID(user_id)) & (UserSchedule.is_active.is_(True))
            )
        )
        target = None
        for s in res.scalars().all():
            sc = s.schedule_context or {}
            if is_ai_program(s.maxx_id) and sc.get("ai_plan") and sc.get("thread_id") == conv:
                target = s.maxx_id
                break
        if not target:
            return None
        if lvl is not None:
            cur = await active_ai_plan(user_id, target, db)
            if plan_level(((cur.schedule_context or {}) if cur else {}).get("ai_plan")) == lvl:
                return ("good, keeping it as it is. you can change it any time from here.", [], False)
        from services import plan_diff
        before = await plan_diff.snapshot(user_id, db)
        tmpl = await redo_program_plan(user_id, target, LEVEL_REQUEST.get(lvl, msg), db, level=lvl)
        if tmpl is None:
            return ("i couldn't rebuild that just now. try again in a moment, or tell me the one change "
                    "you want most.", [], False)
        return redo_reply(target, tmpl, plan_diff.diff(before, await plan_diff.snapshot(user_id, db))), \
            AFTER_PLAN_CHOICES, False

    mid = pending["max"]
    _, _, state = await _user_state(user_id, db)
    profile = build_profile(state)
    step = None
    if is_opener:
        if (str(user_id), mid) in _INFLIGHT:
            # Still warming: let it finish rather than asking Claude twice.
            await _first_step(user_id, mid, profile, ctx)
            ctx = await get_context(user_id, db)
        step = _cached_first_step(ctx, mid, _profile_sig(profile))
        logger.info("ai_programs: opener for %s %s", mid, "served prefetched question" if step else "asking Claude live")
        if step is not None:
            cache = dict(ctx.get(PREFETCH_KEY) or {})
            cache.pop(mid, None)
            await merge_context(user_id, {PREFETCH_KEY: cache}, db)
    if step is None:
        step = await next_intake_step(mid, profile, pending.get("answers") or {}, pending.get("asked") or [])

    if not step["done"]:
        # options/multi/text are kept so a relaunch mid-intake can bring the
        # question's chips back on the right thread (api/chat.py history).
        pending.setdefault("asked", []).append({
            "question": step["question"], "fact_key": step["fact_key"],
            "options": list(step.get("options") or []), "multi": bool(step.get("multi")),
        })
        await merge_context(user_id, {INTAKE_KEY: pending}, db)
        await db.commit()
        lead = ""
        if is_opener and typed_start:
            # A Start tap opens the program's own thread, where the app shows a
            # setup card that already says this; only a typed start needs it.
            lead = (f"let's set up {program_label(mid).lower()}. i'll use the wake, bed and work times you set, "
                    "so these are only about this program.\n\n")
        elif step["ack"]:
            lead = step["ack"].rstrip() + "\n\n"
        return lead + step["question"], step["options"], step["multi"]

    # Enough to plan — build it.
    answers = pending.get("answers") or {}
    await merge_context(user_id, {INTAKE_KEY: None}, db)
    await db.commit()
    if mid == PEPTIDE_PROGRAM:
        from services import peptide_intake
        # the one outside check an app can make: is the compounding pharmacy registered?
        answers = await peptide_intake.check_registry(answers)
        blocked = peptide_intake.blocked_reply(peptide_intake.decide(answers, profile))
        if blocked:
            # nothing is built, and (no consent) nothing they said is kept
            return blocked, [], False
    built = await create_program_schedule(user_id, mid, db, answers=answers)
    if built is None:
        # Keep the answers so a retry doesn't re-ask.
        pending["asked"] = pending.get("asked") or []
        await merge_context(user_id, {INTAKE_KEY: {**pending, "conv": conv}}, db)
        await db.commit()
        return ("i couldn't build your plan just now. send me anything to try again.", ["try again"], False)
    # Remember which thread owns this plan, for "change it" requests there.
    sched = await active_ai_plan(user_id, mid, db)
    if sched is not None:
        from sqlalchemy.orm.attributes import flag_modified
        sc = dict(sched.schedule_context or {})
        sc["thread_id"] = conv
        sched.schedule_context = sc
        flag_modified(sched, "schedule_context")
        await db.commit()
    lead = (step["ack"].rstrip() + "\n\n") if step.get("ack") and not is_opener else ""
    reply = lead + plan_reply(mid, built["template"])
    offer = [x for x in built.get("supp_added") or []]
    pd = get_program_doc(SUPP_PROGRAM)
    habits = [h for h in (pd.habit(x) for x in offer) if h is not None] if pd else []
    if habits:
        # never added without a yes (beta 1, F1): ask, with who should skip it
        await merge_context(user_id, {SUPP_OFFER_KEY: {"conv": conv, "ids": [h.id for h in habits]}}, db)
        await db.commit()
        short = habits[0].title.split("(")[0].strip().lower() if len(habits) == 1 else "them"
        return (reply + "\n\n" + supp_offer_text(habits),
                [f"Yes, add {short}", "No thanks"], False)
    return reply, AFTER_PLAN_CHOICES, False
