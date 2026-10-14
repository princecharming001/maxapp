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


def build_profile(state: dict) -> dict:
    """The compact picture of the user's day Claude plans around."""
    try:
        from services.schedule_dsl import schedulable_anchors
        wake, sleep = schedulable_anchors(state)
    except Exception:
        wake, sleep = _hm(state.get("wake_time"), "07:00"), _hm(state.get("sleep_time"), "23:00")
    minutes = state.get("daily_minutes")
    try:
        minutes = int(minutes) if minutes is not None else None
    except (TypeError, ValueError):
        minutes = None
    if minutes is None:
        minutes = {"low": 10, "medium": 25, "high": 45}.get(str(state.get("biohack_level") or ""), 25)
    facts = state.get("user_facts") or {}
    return {
        "wake_time": wake,
        "bed_time": sleep,
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
        "workout_time": state.get("workout_time"),
        "weekend_shift": bool(state.get("weekend_shift")),
        "weekly_timings": state.get("weekly_timings") or {},
        "shower_time": state.get("shower_time"),
        "minutes_per_day_total": max(5, min(120, minutes)),
        "goals": state.get("goals") or [],
        "timezone": state.get("timezone"),
        "known_facts": {k: v for k, v in (facts.items() if isinstance(facts, dict) else [])
                        if not str(k).startswith("_")},
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


async def next_intake_step(maxx_id: str, profile: dict, answers: dict, asked: list[dict]) -> dict:
    """Claude's next question for this program, or done. Falls back to done
    (plan with what we have) if Claude is unavailable — never blocks the user."""
    pd = get_program_doc(maxx_id)
    if pd is None or len(asked) >= MAX_INTAKE_QUESTIONS:
        return {"done": True, "ack": "", "question": "", "options": [], "multi": False, "fact_key": ""}
    system = (
        f"You set up the {program_label(maxx_id)} program inside the Superpower app. "
        "You ask the fewest questions needed to personalize it, then stop.\n"
        f"{_VOICE}\n{_safety(maxx_id)}\n\n"
        "Rules for intake:\n"
        "- The user's day (wake, bed, work hours, commute, meals, workout time) and their "
        "minutes-per-day budget are already known. Never ask about those.\n"
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
    if not out:
        return {"done": True, "ack": "", "question": "", "options": [], "multi": False, "fact_key": ""}
    opts = [str(o).strip() for o in (out.get("options") or []) if str(o).strip()][:5]
    q = str(out.get("question") or "").strip()
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
    total = 0.0
    for tmpl in other_plans.values():
        for h in (tmpl or {}).get("habits") or []:
            try:
                total += int(h.get("minutes") or 0) * len(h.get("days") or []) / 7.0
            except Exception:
                continue
    return int(round(total))


async def build_plan(
    maxx_id: str,
    profile: dict,
    answers: dict,
    other_plans: dict[str, dict],
    *,
    current_plan: Optional[dict] = None,
    request: Optional[str] = None,
    sync_required: Optional[list[str]] = None,
) -> Optional[dict]:
    """Claude builds (or rebuilds) the weekly template. Returns the validated
    template dict, or None if Claude was unavailable / produced nothing usable."""
    pd = get_program_doc(maxx_id)
    if pd is None:
        return None
    budget_total = int(profile.get("minutes_per_day_total") or 25)
    used = _other_minutes_per_day(other_plans)
    remaining = max(5, budget_total - used)
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
        f"- Time budget: this program gets about {remaining} minutes per day on average (the user gives "
        f"{budget_total} min/day across all programs and other programs already use about {used}). Stay "
        "within it. Start with the highest-value core habits and add medium/hard tier habits only when the "
        "budget allows. Week 1 should feel easy.\n"
        "- Do not duplicate a habit another program already schedules (same idea, e.g. morning light); "
        "if it is shared, leave it to the other program and pick something else.\n"
        "- Do not schedule two habits at the same minute as each other or as other programs' habits; "
        "space them at least 5 minutes apart.\n"
        "- Weekends: if the user shifts later on weekends, set weekend_time accordingly.\n"
        "- Use the user's answers to tailor which habits, how, and when. Tailor the 'how' text to them.\n"
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
    tmpl = validate_template(maxx_id, out, profile)
    if not tmpl["habits"]:
        logger.warning("ai_programs: plan for %s had no valid habits", maxx_id)
        return None
    return tmpl


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


def validate_template(maxx_id: str, raw: dict, profile: dict) -> dict:
    """Repair Claude's plan into something always schedulable: library ids
    only (or an explicit custom_), valid weekdays, times inside the waking day,
    sane minutes, no duplicates."""
    pd = get_program_doc(maxx_id)
    lib = {h.id for h in (pd.habits if pd else [])}
    wake = _to_min(_hm(profile.get("wake_time"), "07:00"))
    bed = _to_min(_hm(profile.get("bed_time"), "23:00"))
    if bed <= wake:
        bed += 1440
    # Weekend bounds: an explicit Saturday timing, else the +1h weekend shift.
    sat = (profile.get("weekly_timings") or {}).get("saturday") or {}
    shift = 60 if profile.get("weekend_shift") else 0
    wk_wake = _to_min(_hm(sat.get("wake_time"), _from_min(wake + shift)))
    wk_bed = _to_min(_hm(sat.get("sleep_time"), _from_min(bed + shift)))
    if wk_bed <= wk_wake:
        wk_bed += 1440
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
        days = [d for d in (h.get("days") or []) if d in WEEKDAYS]
        if not days:
            continue
        try:
            minutes = max(1, min(90, int(h.get("minutes") or 0) or 2))
        except (TypeError, ValueError):
            minutes = 5

        def _clamp(t: str, lo: int, hi: int) -> str:
            m = _to_min(_hm(t, _from_min(lo + 30)))
            if m < lo and m + 1440 <= hi:
                m += 1440  # a past-midnight bedtime routine
            m = max(lo, min(hi - minutes, m))
            return _from_min(m)

        time = _clamp(str(h.get("time") or ""), wake, bed)
        wt = str(h.get("weekend_time") or "").strip()
        weekend_time = _clamp(wt, wk_wake, wk_bed) if re.fullmatch(r"\d{1,2}:\d{2}", wt) else ""
        lib_h = pd.habit(hid) if pd else None
        habits.append({
            "habit_id": hid,
            "title": (str(h.get("title") or "").strip() or (lib_h.title if lib_h else hid.replace("_", " ")))[:40],
            "how": str(h.get("how") or (lib_h.how if lib_h else "")).strip()[:400],
            "why": str(h.get("why") or (lib_h.why if lib_h else "")).strip()[:200],
            "minutes": minutes,
            "time": time,
            "weekend_time": weekend_time,
            "days": days,
        })
        seen.add(hid)
    habits.sort(key=lambda x: x["time"])
    _space_out(habits, wake, max(bed, wk_bed))
    return {
        "version": 1,
        "summary": str(raw.get("summary") or "").strip()[:600],
        "habits": habits,
        "built_at": datetime.utcnow().isoformat(),
    }


def _space_out(habits: list[dict], wake: int, bed: int, gap: int = 5) -> None:
    """No two habits that share a day start at the same minute: nudge later
    ones forward (in place). Times stay inside the waking day."""
    for key in ("time", "weekend_time"):
        taken: list[tuple[int, set]] = []
        for h in sorted(habits, key=lambda x: x.get(key) or x["time"]):
            t = h.get(key)
            if not t:
                continue
            m = _to_min(t)
            days = set(h["days"])
            moved = True
            while moved:
                moved = False
                for tm, tdays in taken:
                    if tdays & days and abs(tm - m) < gap:
                        m = tm + gap
                        moved = True
            m = min(m, bed - 1)
            h[key] = _from_min(m)
            taken.append((m, days))
    habits.sort(key=lambda x: x["time"])


def expand_template(maxx_id: str, tmpl: dict, *, start_date: date, n_days: int = AI_PLAN_DAYS) -> list[dict]:
    """Template → dated day dicts in the persisted task shape. Pure."""
    days: list[dict] = []
    for i in range(n_days):
        d = start_date + timedelta(days=i)
        wd = WEEKDAYS[d.weekday()]
        tasks = []
        for h in tmpl.get("habits") or []:
            if wd not in (h.get("days") or []):
                continue
            t = h.get("weekend_time") if wd in ("sat", "sun") and h.get("weekend_time") else h.get("time")
            tasks.append({
                "task_id": str(uuid.uuid4()),
                "catalog_id": f"{maxx_id}.{h['habit_id']}",
                "title": h.get("title") or h["habit_id"],
                "description": h.get("how") or "",
                "why": h.get("why") or "",
                "time": t,
                "duration_min": int(h.get("minutes") or 5),
                "duration_minutes": int(h.get("minutes") or 5),
                "tags": ["ai_program", maxx_id, "foundation"],
                "status": "pending",
                "intensity": 0.5,
            })
        tasks.sort(key=lambda x: x["time"])
        days.append({"day_index": i, "date": d.isoformat(), "tasks": tasks})
    return days


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


def _contraindicated(h: "Habit", answers_text: str) -> bool:
    if not answers_text:
        return False
    for k in h.avoid:
        first = k.split()[0][:6] if k.split() else ""
        stems = _AVOID_SYNONYMS.get(k) or ((k, first) if len(first) >= 4 else (k,))
        if any(st and st in answers_text for st in stems):
            return True
    return False


def required_supplements(active: set[str], answers: dict, declined: set[str], present: set[str]) -> list["Habit"]:
    """The primary supplement for each active program that isn't covered yet,
    minus anything declined or contraindicated by the user's answers."""
    pd = get_program_doc(SUPP_PROGRAM)
    if pd is None:
        return []
    atext = _answers_text(answers)
    covered = {p for hid in present for p in ((pd.habit(hid).programs if pd.habit(hid) else []) or [])}
    out: list[Habit] = []
    for mid in AI_PROGRAMS:
        if mid not in active or mid in covered or mid in NO_SYNC_PROGRAMS:
            continue
        cand = next((h for h in pd.habits if h.primary_for == mid), None)
        if cand is None or cand.id in declined or cand.id in present or _contraindicated(cand, atext):
            continue
        if cand.id not in {h.id for h in out}:
            out.append(cand)
    return out


def _default_supp_time(h: "Habit", profile: dict) -> str:
    t = f"{h.timing} {h.anchor}".lower()
    wake = _to_min(_hm(profile.get("wake_time"), "07:00"))
    bed = _to_min(_hm(profile.get("bed_time"), "23:00"))
    meals = profile.get("meals") or {}
    if "bed" in t or "night" in t or "sleep" in t:
        return _from_min((bed if bed > wake else bed + 1440) - 45)
    if "workout" in t or "training" in t or "exercise" in t:
        return _hm(profile.get("workout_time"), _from_min(wake + 30))
    if "dinner" in t or "evening" in t:
        return _hm(meals.get("dinner"), "19:00")
    if "lunch" in t:
        return _hm(meals.get("lunch"), "12:30")
    return _hm(meals.get("breakfast"), _from_min(wake + 30))


def _insert_supps(tmpl: dict, habits: list["Habit"], profile: dict) -> None:
    for h in habits:
        tmpl.setdefault("habits", []).append({
            "habit_id": h.id, "title": h.title[:40], "how": (h.how or "")[:400], "why": (h.why or "")[:200],
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
                   prev: Optional[dict] = None, *, user_requested: bool = False, enforce: bool = True) -> dict:
    """Make the synced picks deterministic (Claude places them; this only fills
    a gap if Claude dropped one), then tag links."""
    declined = set((prev or {}).get("declined") or []) | set(tmpl.get("declined") or [])
    if enforce:
        present = {h.get("habit_id") for h in tmpl.get("habits") or []}
        missing = required_supplements(active, answers, declined, present)
        if missing:
            _insert_supps(tmpl, missing, profile)
            keep_extra = {k: tmpl.get(k) for k in ("answers", "declined") if k in tmpl}
            tmpl = {**validate_template(SUPP_PROGRAM, tmpl, profile), "summary": tmpl.get("summary") or "", **keep_extra}
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


async def active_programs_brief(user_id: str, db, *, max_habits: int = 6) -> str:
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
        bits = [f"{h.get('title')} {h.get('time')}" for h in habits[:max_habits] if h.get("title")]
        lines.append(f"{program_label(s.maxx_id)}: " + (", ".join(bits) or "set up"))
    return ("ACTIVE PROGRAMS (their real plan, use it): " + " | ".join(lines)) if lines else ""


async def preview_supp_adds(user_id: str, db, *, with_program: Optional[str] = None) -> list[str]:
    """Titles the next sync will add (for the chat reply), without writing."""
    sched = await active_ai_plan(user_id, SUPP_PROGRAM, db)
    if sched is None:
        return []
    tmpl = (sched.schedule_context or {}).get("ai_plan") or {}
    active = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
    if with_program:
        active.add(with_program)
    present = {h.get("habit_id") for h in tmpl.get("habits") or []}
    adds = required_supplements(active, tmpl.get("answers") or {}, set(tmpl.get("declined") or []), present)
    return [h.title for h in adds]


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
    answers = prev.get("answers") or {}
    declined = set(prev.get("declined") or [])

    kept, removed = [], []
    for h in prev.get("habits") or []:
        linked = set(h.get("linked_to") or [])
        if linked and not (linked & active) and not h.get("keep"):
            removed.append(h)
        else:
            kept.append(dict(h))
    present = {h.get("habit_id") for h in kept}
    adds = required_supplements(active, answers, declined, present)
    relink = any(sorted(set(h.get("linked_to") or []) & active) != sorted(h.get("linked_to") or []) for h in kept)
    if not removed and not adds and not relink:
        return None

    _, _, state = await _user_state(user_id, db)
    profile = build_profile(state)
    base = {**prev, "habits": kept}
    tmpl: Optional[dict] = None
    if adds:
        others = await other_program_plans(user_id, db, except_maxx=SUPP_PROGRAM)
        labels = ", ".join(sorted({program_label(h.primary_for) for h in adds}))
        tmpl = await build_plan(
            SUPP_PROGRAM, profile, answers, others,
            current_plan={"summary": prev.get("summary"), "habits": kept},
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
    # Claude only places the additions: never let a sync silently drop a kept one.
    have = {h.get("habit_id") for h in tmpl.get("habits") or []}
    for h in kept:
        if h.get("habit_id") not in have:
            tmpl.setdefault("habits", []).append({k: v for k, v in h.items() if k not in ("linked_to", "keep")})
    tmpl = _finalize_supp(tmpl, profile, answers, active, prev={**prev, "habits": kept})

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


def kick_supp_sync(user_id: str) -> None:
    """Run sync_supplements in the background on its own session (the caller's
    request returns right away). Coalesces: one sync per user at a time."""
    uid = str(user_id)

    async def _run():
        try:
            from db.sqlalchemy import AsyncSessionLocal
            async with AsyncSessionLocal() as db:
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
        active_now = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
        sync_required = [h.id for h in required_supplements(active_now, answers, set(), set())]
    tmpl = await build_plan(maxx_id, profile, answers, others, sync_required=sync_required)
    if tmpl is not None and maxx_id == SUPP_PROGRAM:
        tmpl["answers"] = answers
        tmpl = _finalize_supp(tmpl, profile, answers, active_now)
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

    today = local_today_date(state)
    days = expand_template(maxx_id, tmpl, start_date=today)
    normalize_days(days, maxx_id)
    busy = await calendar_busy_by_date(UUID(user_id), today, today + timedelta(days=35), db)
    days = apply_calendar_busy(days, busy)
    recon_ctx = {**state, "calendar_busy_by_date": busy}
    other_actives = await _load_other_active_days(UUID(user_id), db, except_maxx=maxx_id)
    if other_actives:
        bundle = reconcile_schedules({**other_actives, maxx_id: days}, user_ctx=recon_ctx, start_date=today)
        days = bundle[maxx_id]
        for other_max, other_days in bundle.items():
            if other_max != maxx_id:
                await _update_active_days(UUID(user_id), db, maxx_id=other_max,
                                          days=fence_days(other_days, recon_ctx))
    days = fence_days(days, recon_ctx)

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
    try:
        from services.gcal_mirror import kick_gcal_mirror
        kick_gcal_mirror(user_id)
    except Exception:
        pass
    if maxx_id not in NO_SYNC_PROGRAMS:
        kick_supp_sync(user_id)
    return {"schedule_id": str(row.id), "template": tmpl, "supp_added": supp_preview}


async def redo_program_plan(user_id: str, maxx_id: str, request: str, db) -> Optional[dict]:
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
    tmpl = await build_plan(maxx_id, profile, current.get("answers") or {}, others,
                            current_plan={k: current.get(k) for k in ("summary", "habits")},
                            request=request)
    if tmpl is None:
        return None
    tmpl["answers"] = current.get("answers") or {}
    if maxx_id == SUPP_PROGRAM:
        # A synced pick the user just asked to drop stays dropped on later syncs.
        new_ids = {h.get("habit_id") for h in tmpl.get("habits") or []}
        dropped = {h.get("habit_id") for h in current.get("habits") or []
                   if h.get("linked_to") and h.get("habit_id") not in new_ids}
        tmpl["declined"] = sorted(set(current.get("declined") or []) | dropped)
        active = (await _active_program_ids(user_id, db)) - set(NO_SYNC_PROGRAMS)
        tmpl = _finalize_supp(tmpl, profile, tmpl["answers"], active, prev=current,
                              user_requested=True, enforce=False)
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
    await regenerate_active_schedules(user_id=user_id, db=db, only_max=maxx_id, reason="ai_redo")
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


def plan_block(maxx_id: str, tmpl: dict, *, note: str = "") -> str:
    """The plan as a [VISUAL_BLOCK] marker the app renders as a native card
    (time · habit · minutes · days). Lives in the stored text, so a reopened
    chat re-renders the same card."""
    meta = AI_PROGRAMS.get(maxx_id) or {}
    habits = sorted(tmpl.get("habits") or [], key=lambda h: _to_min(_hm(h.get("time"), "12:00")))
    items = [{
        "time": _pretty_time(h.get("time") or ""),
        "title": str(h.get("title") or "").strip()[:60],
        "minutes": int(h.get("minutes") or 0),
        "days": _days_label(h.get("days") or []),
    } for h in habits if h.get("title")]
    block = {
        "type": "plan",
        "title": f"{program_label(maxx_id)} plan",
        "data": {
            "program": maxx_id,
            "color": meta.get("color") or "",
            "total_minutes": sum(i["minutes"] for i in items if i["days"] == "Daily"),
            "note": note,
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
    parts.append("anything you want to change? move a time, swap a habit, make it lighter or harder, just tell me.")
    return "\n\n".join(parts)


def _pretty_time(hm: str) -> str:
    try:
        h, m = (int(x) for x in hm.split(":"))
    except Exception:
        return hm
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d}{suffix}" if m else f"{h12}{suffix}"


AFTER_PLAN_CHOICES = ["looks good", "make it lighter", "move things later", "swap a habit"]
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
        # A change request inside a program's own thread → Claude rebuilds it.
        if not conv or not looks_like_change_request(msg):
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
        tmpl = await redo_program_plan(user_id, target, msg, db)
        if tmpl is None:
            return ("i couldn't rebuild that just now. try again in a moment, or tell me the one change "
                    "you want most.", [], False)
        return plan_reply(target, tmpl, redo=True), AFTER_PLAN_CHOICES, False

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
        pending.setdefault("asked", []).append({"question": step["question"], "fact_key": step["fact_key"]})
        await merge_context(user_id, {INTAKE_KEY: pending}, db)
        await db.commit()
        lead = ""
        if is_opener and typed_start:
            # A Start tap opens the program's own thread, where the app shows a
            # setup card that already says this; only a typed start needs it.
            lead = (f"let's set up {program_label(mid).lower()}. i already know your day, so just "
                    f"{'a couple' if MAX_INTAKE_QUESTIONS > 1 else 'one'} quick things.\n\n")
        elif step["ack"]:
            lead = step["ack"].rstrip() + "\n\n"
        return lead + step["question"], step["options"], step["multi"]

    # Enough to plan — build it.
    answers = pending.get("answers") or {}
    await merge_context(user_id, {INTAKE_KEY: None}, db)
    await db.commit()
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
    note = ""
    if built.get("supp_added"):
        names = " and ".join(t.lower() for t in built["supp_added"])
        note = f"since you run suppmax, i'm adding {names} to that plan too."
    return lead + plan_reply(mid, built["template"], note=note), AFTER_PLAN_CHOICES, False
