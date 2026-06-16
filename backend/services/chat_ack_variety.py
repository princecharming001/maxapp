"""Varied coach-style acknowledgements — avoids repeating "got it" every turn."""

from __future__ import annotations

import re
from typing import Optional

# Short openers in Max voice. Comma form reads natural before the rest of the line.
ACK_OPENERS: tuple[str, ...] = (
    "bet,",
    "copy,",
    "saved,",
    "fair,",
    "yeah,",
    "alright,",
    "good,",
    "solid,",
    "right,",
    "noted,",
    "cool,",
    "true,",
    "heard,",
)

# Leading ack phrases the LLM / hardcoded paths overuse — rotate these out.
_OVERUSED_ACK_LEAD = re.compile(
    r"^(?:got it|understood|makes sense|noted|okay|ok|sure|perfect|great)[,.\s—-]+",
    re.IGNORECASE,
)


def _seed_index(seed: str, modulo: int) -> int:
    return abs(hash(seed or "")) % modulo


def pick_ack_opener(seed: str = "", *, allow_skip: bool = True) -> str:
    """Pick a short ack opener. Deterministic per seed so the same turn is stable."""
    if allow_skip and _seed_index(seed, 7) == 0:
        return ""
    return ACK_OPENERS[_seed_index(seed, len(ACK_OPENERS))]


def format_ack_line(seed: str, rest: str, *, allow_skip: bool = False) -> str:
    """Prefix `rest` with a varied opener, or return rest alone when skipping."""
    rest = (rest or "").strip()
    if not rest:
        opener = pick_ack_opener(seed, allow_skip=allow_skip)
        return opener.rstrip(",.") + "." if opener else ""
    opener = pick_ack_opener(seed, allow_skip=allow_skip)
    if not opener:
        return rest[0].lower() + rest[1:] if rest else rest
    if rest[0].isupper():
        rest = rest[0].lower() + rest[1:]
    return f"{opener} {rest}"


def onboarding_ack_prefix(seed: str) -> str:
    """Short prefix between onboarding answers (may be empty)."""
    opener = pick_ack_opener(seed, allow_skip=True)
    if not opener:
        return ""
    return opener.rstrip(",.") + ". "


def rotate_ack_opener(text: str) -> str:
    """Replace a leading overused ack with a varied one (or drop it sometimes)."""
    if not text:
        return text
    stripped = text.strip()
    match = _OVERUSED_ACK_LEAD.match(stripped)
    if not match:
        return text
    rest = stripped[match.end() :].lstrip()
    if not rest:
        opener = pick_ack_opener(stripped, allow_skip=True)
        return opener.rstrip(",.") + "." if opener else stripped
    return format_ack_line(stripped, rest, allow_skip=True)


def sms_fallback_ack(seed: str = "") -> str:
    """One-liner for SMS when there's nothing else to say."""
    return format_ack_line(seed or "sms", "open the app if you need more detail.", allow_skip=False)
