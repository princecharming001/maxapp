"""Persona-styled push/notification copy — the active coach's voice in nudges.

Push copy is deterministic (no LLM at send time), so a persona is applied as a
deterministic RESTYLE layer rather than an LLM preamble: given the same signals
the base ``notification_copy.compose`` uses (name/task/streak/count/why), this
returns the line rewritten in the active persona's voice.

Personas (see ``persona_voice_research.md`` + ``persona_prompts.py``):
  Goggins     (slug ``hardcore``)   — terse callout + command, push the work
  Clavicular  (slug ``influencer``) — sharp, high standards, precise
  Big Daddy   (slug ``gentle``)     — warm and encouraging, no nicknames, no shame

SAFETY: every line here must also clear ``copy_filter`` (no shame/FOMO/body-threat
lexicon), because the send path re-filters. So Goggins pushes are intense but
carry NO shame words ("no excuses"/"lazy"/"don't lose" are banned); they push the
WORK, never attack the person. ``compose`` re-validates the restyled copy against
the taste bar and silently keeps the base line if a persona line ever trips it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from services.notification_copy import (
    CAT_TASK_DUE,
    CAT_MORNING_PREVIEW,
    CAT_EVENING_RECAP,
    CAT_STREAK,
    CAT_REENGAGE,
    CAT_MILESTONE,
    CAT_TIP,
)

# Live persona slugs and their back-compat aliases (SC7-friendly; no DB change).
_ALIASES = {
    "goggins": "hardcore",
    "clavicular": "influencer",
    "bigdaddy": "gentle",
    "big_daddy": "gentle",
}
LIVE_PERSONAS = frozenset({"hardcore", "influencer", "gentle"})


def normalize_persona(coaching_tone: Optional[str]) -> Optional[str]:
    """Map a stored coaching_tone (or a dedicated persona slug) to a live slug.
    Returns None for unknown/None/'default' so the base voice is kept."""
    key = (coaching_tone or "").strip().lower()
    key = _ALIASES.get(key, key)
    return key if key in LIVE_PERSONAS else None


@dataclass(frozen=True)
class _P:
    """A persona push template. ``requires`` gates on available signal keys, same
    as the base engine, so we never print an empty {streak}/{count}."""

    title: str
    body: str
    requires: frozenset = field(default_factory=frozenset)


# Per-persona, per-category banks. Slots match notification_copy._slots:
#   {name_c} ", anish" or "" · {task} · {streak} · {count} · {why}
# Every persona uses {name_c} (never a nickname).
_GOGGINS: dict[str, list[_P]] = {
    # task_due fires once per task (up to ~8 a day), so each voice needs enough
    # ungated lines that a full day doesn't read the same sentence twice.
    CAT_TASK_DUE: [
        _P("{task}", "{task} is up{name_c}. nobody is coming to do it for you. go."),
        _P("{task} now", "get after {task}{name_c}. the work doesn't care that you're tired."),
        _P("{task}", "{task}{name_c}. no negotiating with yourself. do the rep."),
        _P("{task}", "clock says {task}{name_c}. show up for it."),
        _P("{task} now", "{task}{name_c}. discipline over mood. handle it."),
        _P("{task}", "{task} is on the schedule{name_c}. earn the next hour."),
        _P("day {streak}: {task}", "{task}{name_c}. day {streak} was built one rep at a time. add one.", frozenset({"streak"})),
    ],
    CAT_MORNING_PREVIEW: [
        _P("get up{name_c}", "short list today. attack it before it attacks you."),
        _P("morning grind", "today's work is right there{name_c}. go take it."),
    ],
    CAT_EVENING_RECAP: [
        _P("close it out", "still {count} on the board{name_c}. handle it, then rest.", frozenset({"count"})),
        _P("finish strong", "finish what you started{name_c}. stay hard."),
    ],
    CAT_STREAK: [
        _P("day {streak}", "you built this with reps{name_c}. one more. keep stacking.", frozenset({"streak"})),
    ],
    CAT_REENGAGE: [
        _P("back to work", "you stepped off{name_c}. today you step back on. one rep."),
    ],
    CAT_MILESTONE: [
        _P("day {streak}", "that's reps, not luck{name_c}. respect. now go get more.", frozenset({"streak"})),
        _P("earned", "you earned this{name_c}. proof's in your profile. now keep going."),
    ],
    CAT_TIP: [
        _P("do it now", "10 seconds of cold water{name_c}. no debate. go."),
    ],
}

_CLAVICULAR: dict[str, list[_P]] = {
    CAT_TASK_DUE: [
        _P("day {streak}: {task}", "{task}{name_c}. same time as yesterday, that's the whole trick.", frozenset({"streak"})),
        _P("{task}", "{task} time{name_c}. two minutes, then back to your day."),
        _P("{task}", "{task}{name_c}. fundamentals first, they compound."),
        _P("{task}", "{task} is up{name_c}. small reps, real results."),
        _P("{task} now", "{task}{name_c}. do it, then back to your day."),
        _P("{task}", "{task}{name_c}. consistency beats intensity. lock in."),
        _P("{task}", "{task} o'clock{name_c}. results are built on boring reps."),
    ],
    CAT_MORNING_PREVIEW: [
        _P("morning{name_c}", "today's list is short. run it."),
    ],
    CAT_EVENING_RECAP: [
        _P("close it out", "{count} left{name_c}. finish before bed.", frozenset({"count"})),
    ],
    CAT_STREAK: [
        _P("day {streak}", "it compounds{name_c}. one rep keeps the streak.", frozenset({"streak"})),
    ],
    CAT_REENGAGE: [
        _P("your plan's here", "one rep gets you back{name_c}. start small."),
    ],
    CAT_MILESTONE: [
        _P("day {streak}", "that's real{name_c}. keep going.", frozenset({"streak"})),
        _P("real progress", "it's working{name_c}. see it in your profile."),
    ],
    CAT_TIP: [
        _P("quick one", "water before coffee{name_c}. easy win."),
    ],
}

# Big Daddy: warm, never nicknames (beta 1: "hey champ ... my boy" read as forced)
_BIG_DADDY: dict[str, list[_P]] = {
    CAT_TASK_DUE: [
        _P("one step", "time for {task}{name_c}. we go at your pace, but we don't quit."),
        _P("{task}", "{task} whenever you're ready{name_c}. one small step."),
        _P("{task}", "{task} time{name_c}. nice and easy, you've got this."),
        _P("one small thing", "{task} is up{name_c}. just this one, then enjoy your day."),
        _P("{task}", "{task} now{name_c}? glad you're showing up."),
        _P("right on time", "{task}{name_c}. one small step, then take a breath."),
    ],
    CAT_MORNING_PREVIEW: [
        _P("morning{name_c}", "short list today. one at a time."),
    ],
    CAT_EVENING_RECAP: [
        _P("almost there", "just {count} left{name_c}. no rush.", frozenset({"count"})),
    ],
    CAT_STREAK: [
        _P("day {streak}", "look at you go{name_c}. one more today.", frozenset({"streak"})),
    ],
    CAT_REENGAGE: [
        _P("welcome back", "your plan's still here{name_c}. one small thing today?"),
    ],
    CAT_MILESTONE: [
        _P("day {streak}", "that's real{name_c}. let's keep rolling.", frozenset({"streak"})),
        _P("you earned this", "you hit something real{name_c}. take a look."),
    ],
    CAT_TIP: [
        _P("quick one", "stand tall for 30 seconds{name_c}. small wins stack up."),
    ],
}

_PERSONA_BANKS: dict[str, dict[str, list[_P]]] = {
    "hardcore": _GOGGINS,
    "influencer": _CLAVICULAR,
    "gentle": _BIG_DADDY,
}


def persona_push_copy(
    coaching_tone: Optional[str],
    category: str,
    slots: dict,
    available: set,
    rotation: int = 0,
) -> Optional[dict]:
    """Return ``{title, body, template_id}`` restyled into the active persona's
    voice for this category, or ``None`` to keep the base copy (unknown persona,
    or no persona line for this category). Deterministic; honors signal
    requirements and the rotation index. The caller (``compose``) re-validates
    the result against the taste bar before using it."""
    persona = normalize_persona(coaching_tone)
    if persona is None:
        return None
    bank = _PERSONA_BANKS[persona].get(category)
    if not bank:
        return None
    eligible = [t for t in bank if t.requires <= available] or [t for t in bank if not t.requires]
    if not eligible:
        return None
    tmpl = eligible[rotation % len(eligible)]
    try:
        title = tmpl.title.format(**slots).strip()
        body = tmpl.body.format(**slots).strip()
    except Exception:
        return None
    return {"title": title, "body": body, "template_id": f"persona:{persona}:{category}:{tmpl.title}"}
