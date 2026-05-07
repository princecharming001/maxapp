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


# IMPORTANT — none of these preambles change LENGTH or INFO content. Length
# is governed *exclusively* by the user's `response_length` preference (handled
# in lc_agent + fast_rag_answer with explicit caps); personality is voice
# only — diction, register, slang, presence/absence of warmth. Earlier
# drafts of these preambles included phrases like "one-line answers when the
# question allows" or "<=4 words before the answer" — which silently
# overrode the length system and made the bot feel like the old short stub
# prompt for every user on `default` tone. Those length-implying phrases
# have been removed; if you edit these, keep that contract.
_BASE_RULES = (
    "Voice/diction shaping only. Do NOT change response length, do NOT "
    "drop specifics (doses, products, timing, numbers), do NOT skip the "
    "structure the underlying coaching prompt asks for. The user's length "
    "preference is handled separately."
)

_COACH = (
    "[PERSONALITY: COACH]\n"
    "Ruthless tough-love diction. Imperative phrasing, blunt language, "
    "call out excuses directly when relevant. No emojis, no exclamation "
    "marks, no warm-up phrases ('great question', 'i love that'). "
    "Lowercase. " + _BASE_RULES
)

_SUPPORTIVE = (
    "[PERSONALITY: SUPPORTIVE]\n"
    "Warm, encouraging diction. Frame next steps as gentle invitations "
    "where natural ('you might', 'something to try'). Lowercase. No "
    "therapist lead-ins ('i hear you', 'that's so valid'), no emojis "
    "unless one fits naturally. " + _BASE_RULES
)

_NERD = (
    "[PERSONALITY: NERD]\n"
    "Protocol-detail diction. When a mechanism, dose, %, or study adds "
    "signal, say it ('0.05% tret, pea-sized, MWF'). Lowercase, no hype, "
    "no slang. Precision in the language IS the personality. " + _BASE_RULES
)

_DUDE = (
    "[PERSONALITY: DUDE]\n"
    "Nonchalant, casual diction. Lowercase, low-key. Light slang ok "
    "('yeah', 'tbh', 'fwiw') but sparingly and never in place of a "
    "specific. No motivational framing, no formal hedges. " + _BASE_RULES
)


TONE_PROMPTS: dict[str, str] = {
    # Canonical slugs (current).
    "coach":      _COACH,
    "supportive": _SUPPORTIVE,
    "nerd":       _NERD,
    "dude":       _DUDE,
    # Legacy aliases. Existing users with `default` (the vast majority)
    # land on COACH-mediumcore voice, NOT dude — earlier alias mapped them
    # to dude which was too terse and made the chat feel like the old
    # stub prompt. The original "default" was Mediumcore (firm, focused,
    # no fluff) — Coach is the closest current personality so use it.
    "hardcore":   _COACH,
    "gentle":     _SUPPORTIVE,
    "default":    _COACH,
    "mediumcore": _COACH,
    "influencer": _DUDE,
}


def tone_preamble(coaching_tone: Optional[str]) -> str:
    """Return the personality preamble for the user's selected slug.
    Empty for unknown values (degrades gracefully → base prompt voice)."""
    key = (coaching_tone or "default").strip().lower()
    return TONE_PROMPTS.get(key, "")
