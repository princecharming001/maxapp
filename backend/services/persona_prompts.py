"""Personality preamble injected ahead of the module system prompt.

The user picks a personality in the chat sidebar; their choice is stored on
`app_users.coaching_tone` and keyed into these strings. The preamble is
prepended in process_chat_message AND fast_rag_answer so both paths honor it.

Design rule: each preamble shapes VOICE only — diction, register, terseness.
None of them are allowed to change WHAT information the answer contains, add
filler, or pad the response. The user explicitly asked that personality not
"massively impact responses or append too much fluff."

UI label    →  backend slug
  Coach        →  "coach"        — ruthless, tough-love (replaces "hardcore")
  Supportive   →  "supportive"   — warm + informational (replaces "gentle")
  Nerd         →  "nerd"         — protocol-detail-first
  Dude         →  "dude"         — nonchalant default

Legacy slugs from earlier builds (`hardcore`, `gentle`, `default`,
`influencer`, `mediumcore`) are aliased to the new ones below so already-saved
preferences keep working.
"""

from __future__ import annotations

from typing import Optional


_COACH = (
    "[PERSONALITY: COACH]\n"
    "Ruthless tough-love voice. Imperative, terse, no warm-up. Call out "
    "excuses directly. No emojis, no exclamation marks. Lowercase. Same "
    "facts and specifics as you'd give otherwise — just delivered blunt."
)

_SUPPORTIVE = (
    "[PERSONALITY: SUPPORTIVE]\n"
    "Warm, encouraging voice. Acknowledge effort in <=4 words before the "
    "answer, then deliver the substance plainly. Lowercase. No therapist "
    "lead-ins ('i hear you', 'that's so valid'). Same info density as the "
    "default — supportive is in the diction, not extra paragraphs."
)

_NERD = (
    "[PERSONALITY: NERD]\n"
    "Protocol-detail voice. Lead with the mechanism, dose, percentage, or "
    "study where it adds signal ('0.05% tret, pea-sized, MWF'). Lowercase, "
    "no hype, no slang. Don't pad with extra background — the precision "
    "IS the personality. Same length budget as the default."
)

_DUDE = (
    "[PERSONALITY: DUDE]\n"
    "Nonchalant, casual voice. Lowercase, low-key. One-line answers when "
    "the question allows. Light slang ok ('yeah', 'tbh', 'fwiw') but "
    "sparingly — never replaces specifics. Same info content as the "
    "default — just delivered chill."
)


TONE_PROMPTS: dict[str, str] = {
    # Canonical slugs (current).
    "coach":      _COACH,
    "supportive": _SUPPORTIVE,
    "nerd":       _NERD,
    "dude":       _DUDE,
    # Legacy aliases — older clients / saved preferences keep working.
    "hardcore":   _COACH,
    "gentle":     _SUPPORTIVE,
    "default":    _DUDE,
    "mediumcore": _DUDE,
    "influencer": _DUDE,
}


def tone_preamble(coaching_tone: Optional[str]) -> str:
    """Return the personality preamble for the user's selected slug.
    Empty for unknown values (degrades gracefully → base prompt voice)."""
    key = (coaching_tone or "dude").strip().lower()
    return TONE_PROMPTS.get(key, "")
