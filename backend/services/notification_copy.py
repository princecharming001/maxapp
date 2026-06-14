"""Personalized notification copy — internal-trigger reminders.

The single highest-ROI retention lever from the research: a generic "time for
your routine" decays fast, but a prompt keyed to the user's IDENTITY, their
stated GOAL, and their preferred VOICE forms a durable internal trigger. This
turns the unified personalization profile (services.personalization) into the
reminder-copy engine — Max already knows their tone and their why.

Pure + testable: ``personalized_reminder(profile, ...)`` takes the assembled
profile dict and returns ``{title, body}``. ``reminder_copy(db, user_id, ...)``
is the async wrapper that loads the profile.

Ethics: value-first, never shame, never fake urgency. The blunt voice is short,
not mean; the gentle voice encourages; neither manufactures anxiety.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# What each routine slot is, in plain words.
_SLOT_ACTION: dict[str, str] = {
    "am": "morning routine",
    "pm": "evening routine",
    "midday": "midday check",
    "workout": "workout",
    "spf": "SPF reapply",
    "default": "routine",
}

# A tiny, plain duration cue keeps the Ability side of B=MAP high ("it's quick").
_SLOT_DURATION: dict[str, str] = {
    "am": "2 minutes",
    "pm": "90 seconds",
    "midday": "30 seconds",
    "workout": "",
    "spf": "10 seconds",
}


def _voice(profile: dict) -> str:
    """Resolve the user's preferred coaching voice from comms_style."""
    try:
        from services.personalization import comms_to_tone
        tone, _ = comms_to_tone(profile or {})
        return tone or "default"
    except Exception:
        return "default"


def _goal_why(profile: dict) -> Optional[str]:
    goals = (profile or {}).get("goals") or {}
    why = goals.get("why")
    if why and isinstance(why, str) and why.strip():
        return why.strip().rstrip(".")
    return None


def personalized_reminder(
    profile: dict,
    *,
    maxx_label: str = "your",
    slot: str = "default",
    name: Optional[str] = None,
) -> dict[str, str]:
    """Compose a personalized reminder. `profile` is the assembled
    personalization profile (per-dimension dict); falls back to plain, warm copy
    when we know nothing about the user."""
    voice = _voice(profile)
    action = _SLOT_ACTION.get(slot, _SLOT_ACTION["default"])
    dur = _SLOT_DURATION.get(slot, "")
    why = _goal_why(profile)
    label = (maxx_label or "your").strip()
    # "Skinmax evening routine" reads better than "your evening routine" when we
    # have a maxx, but stay gramatical for the "your" fallback.
    what = f"{label} {action}" if label.lower() != "your" else f"your {action}"

    if voice == "hardcore":
        title = what.capitalize() + "."
        body = (dur + ". Go." if dur else "Go.")
        if why:
            body = f"{dur + '. ' if dur else ''}{why.capitalize()} doesn't happen by skipping. Go."
    elif voice == "gentle":
        lead = f"Quick one{' for ' + name if name else ''} — {what}."
        tail = f" A small step toward {why}." if why else " You've got this."
        title = "A gentle nudge"
        body = lead + tail
    elif voice == "influencer":
        title = f"{what.capitalize()} ✨"
        body = (f"{dur}, that's it. " if dur else "") + (f"Future-you ({why}) says thanks." if why else "Small habits, big payoff.")
    else:  # default — clear, warm, value-first
        title = "Time for " + what
        body = (f"Takes about {dur}." if dur else "A couple minutes.") + (f" One step toward {why}." if why else "")

    return {"title": title.strip(), "body": body.strip()}


async def reminder_copy(
    db,
    user_id: str,
    *,
    maxx_label: str = "your",
    slot: str = "default",
) -> dict[str, str]:
    """Async wrapper: load the user's profile + name, compose the reminder.
    Never raises — falls back to plain copy."""
    profile: dict[str, Any] = {}
    name: Optional[str] = None
    try:
        from services.personalization import get_profile
        built = await get_profile(db, str(user_id))
        profile = built.get("profile") or {}
        name = ((profile.get("identity") or {}).get("name")) or None
    except Exception as e:
        logger.debug("reminder_copy profile load skipped: %s", e)
    return personalized_reminder(profile, maxx_label=maxx_label, slot=slot, name=name)
