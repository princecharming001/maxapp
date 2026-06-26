"""Persona-styled push/notification copy — the active coach's voice in nudges.

Push copy is deterministic (no LLM at send time), so a persona is applied as a
deterministic RESTYLE layer rather than an LLM preamble: given the same signals
the base ``notification_copy.compose`` uses (name/task/streak/count/why), this
returns the line rewritten in the active persona's voice.

Personas (see ``persona_voice_research.md`` + ``persona_prompts.py``):
  Goggins     (slug ``hardcore``)   — terse callout + command, push the work
  Clavicular  (slug ``influencer``) — looksmaxxing-coded, "ascending", the stack
  Big Daddy   (slug ``gentle``)     — warm father-figure, "champ", proud, no shame

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
# Big Daddy addresses the user as "champ"/"kid" instead of using {name_c}.
_GOGGINS: dict[str, list[_P]] = {
    CAT_TASK_DUE: [
        _P("{task}", "{task} is up{name_c}. nobody is coming to do it for you. go."),
        _P("{task} now", "get after {task}{name_c}. the work doesn't care that you're tired."),
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
        _P("day {streak}: {task}", "{task}{name_c}. tongue on the palate, stack the fundamentals.", frozenset({"streak"})),
        _P("{task}", "{task} time{name_c}. lock it in, you're ascending."),
    ],
    CAT_MORNING_PREVIEW: [
        _P("morning{name_c}", "today's stack is short. run it and mog the day."),
    ],
    CAT_EVENING_RECAP: [
        _P("close the stack", "{count} left{name_c}. finish before bed, stay on the ladder.", frozenset({"count"})),
    ],
    CAT_STREAK: [
        _P("day {streak}", "softmaxxing compounds{name_c}. one rep keeps you ascending.", frozenset({"streak"})),
    ],
    CAT_REENGAGE: [
        _P("the stack's here", "one rep back on the ladder{name_c}. we're so back."),
    ],
    CAT_MILESTONE: [
        _P("day {streak}", "that's a mog{name_c}. the halo effect is earned, keep going.", frozenset({"streak"})),
        _P("you're ascending", "real progress{name_c}. the stack is working. see it in your profile."),
    ],
    CAT_TIP: [
        _P("quick maxx", "spf now{name_c}. the skin barrier is half the halo."),
    ],
}

_BIG_DADDY: dict[str, list[_P]] = {
    CAT_TASK_DUE: [
        _P("one step, kid", "time for {task}, champ. we go at your pace, but we don't quit."),
        _P("hey champ", "{task} whenever you're ready, champ. one small step, i've got you."),
    ],
    CAT_MORNING_PREVIEW: [
        _P("morning, champ", "short list today, kid. one at a time. i'm right here."),
    ],
    CAT_EVENING_RECAP: [
        _P("almost there, kid", "just {count} left, champ. no rush, i'm proud of you already.", frozenset({"count"})),
    ],
    CAT_STREAK: [
        _P("day {streak}, champ", "look at you go, kid. one more and i'm beaming.", frozenset({"streak"})),
    ],
    CAT_REENGAGE: [
        _P("hey champ", "your spot's still warm, kid. one small thing today? i've got you."),
    ],
    CAT_MILESTONE: [
        _P("day {streak}, my boy", "that's real, champ. so proud of you. let's keep rolling.", frozenset({"streak"})),
        _P("proud of you, kid", "you hit something real, champ. take a look, you earned it."),
    ],
    CAT_TIP: [
        _P("quick one, kid", "stand tall for 30 seconds, champ. small wins stack up."),
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
