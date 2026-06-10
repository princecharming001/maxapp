"""
Deterministic outbound copy filter (the voice gate).

Every user-facing string that leaves the server (push, SMS, in-app coach copy)
passes through filter_outbound_copy() before send. Two classes of violation:

- MECHANICAL (auto-fixed in place): em/en dashes, curly quotes, markdown chars,
  emoji, multi-!, ALL-CAPS shouting. The string is sanitized and sent.
- CONTENT (never auto-fixed): shame/loss lexicon, body-threat framing, medical
  claims/dosages. The string is replaced by the caller's deterministic fallback
  (or a safe generic) and the violation is logged.

No LLM anywhere in this module; pure functions, safe on the send path.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

SAFE_GENERIC_FALLBACK = "Quick check-in from Max. Your plan is in the app."

# --- mechanical fixes -------------------------------------------------------

_DASH_MAP = {
    "—": ", ",   # em dash
    "–": "-",    # en dash
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
}

_MARKDOWN_RE = re.compile(
    r"(\*\*|__|`+|^#+\s?|\[([^\]]+)\]\([^)]*\)|(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w))",
    re.MULTILINE,
)
_MULTI_BANG_RE = re.compile(r"!{2,}")
_EMOJI_RE = re.compile(
    "["
    "\U0001f000-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "⬀-⯿"
    "️"
    "‍"
    "]+"
)
# Words of 3+ letters in full caps that read as shouting. Real acronyms allowlisted.
_CAPS_ALLOWLIST = {
    "SPF", "AHA", "BHA", "PHA", "IGF", "HIIT", "REM", "LED", "GMT", "UTC",
    "FAQ", "USA", "DNA", "EOD", "MWF", "BP", "UV", "AM", "PM",
}
_CAPS_WORD_RE = re.compile(r"\b[A-Z]{3,}\b")

# --- content bans (never auto-fixed) ----------------------------------------

_SHAME_PATTERNS = [
    r"\byou failed\b",
    r"\bfailure\b",
    r"\blost your streak\b",
    r"\bbroke your streak\b",
    r"\bstreak (is )?(lost|broken|gone|dead)\b",
    r"\bfalling behind\b",
    r"\bdon'?t lose\b",
    r"\bno excuses\b",
    r"\blazy\b",
    r"\bpathetic\b",
    r"\bdisappoint",
]
_BODY_THREAT_PATTERNS = [
    r"\bcauses? (breakouts?|acne|irritation|wrinkles|damage)\b",
    r"\btriggers? (breakouts?|acne|flare)",
    r"\b(can|will|may) flare\b",
    r"\bflare (your )?skin\b",
    r"\bdrives? inflammation\b",
    r"\bpro-?inflammatory\b",
    r"\bshows? (up )?on (your )?skin\b",
    r"\bspikes? (igf|cortisol)",
    r"\b(cortisol|igf-?1) spikes?\b",
    r"\bmakes? you look\b",
    r"\blook (worse|older|tired|dull)\b",
    r"\bdull(s)? (and textured|your skin)\b",
    r"\bruins? your\b",
]
_MEDICAL_PATTERNS = [
    r"\b\d+(\.\d+)?\s?(mg|mcg|iu|milligrams?)\b",
    r"\bdosage\b",
    r"\bdose of\b",
    r"\bprescri(be|ption)\b",
    r"\bcures?\b",
    r"\bdiagnos",
]

_CONTENT_BANS: list[tuple[str, re.Pattern]] = (
    [("shame", re.compile(p, re.IGNORECASE)) for p in _SHAME_PATTERNS]
    + [("body_threat", re.compile(p, re.IGNORECASE)) for p in _BODY_THREAT_PATTERNS]
    + [("medical", re.compile(p, re.IGNORECASE)) for p in _MEDICAL_PATTERNS]
)


@dataclass
class FilterResult:
    text: str
    mechanical: list[str] = field(default_factory=list)
    content: list[str] = field(default_factory=list)
    used_fallback: bool = False

    @property
    def clean(self) -> bool:
        return not self.mechanical and not self.content


def _fix_caps_word(match: re.Match) -> str:
    word = match.group(0)
    if word in _CAPS_ALLOWLIST:
        return word
    return word.capitalize()


def _sanitize_mechanical(text: str) -> tuple[str, list[str]]:
    hits: list[str] = []
    out = text
    for bad, good in _DASH_MAP.items():
        if bad in out:
            hits.append(f"char:{bad!r}")
            out = out.replace(bad, good)
    if _EMOJI_RE.search(out):
        hits.append("emoji")
        out = _EMOJI_RE.sub("", out)
    if _MULTI_BANG_RE.search(out):
        hits.append("multi_bang")
        out = _MULTI_BANG_RE.sub(".", out)
    md_stripped = _MARKDOWN_RE.sub(lambda m: m.group(2) or "", out)
    if md_stripped != out:
        hits.append("markdown")
        out = md_stripped
    caps_fixed = _CAPS_WORD_RE.sub(_fix_caps_word, out)
    if caps_fixed != out:
        hits.append("all_caps")
        out = caps_fixed
    # tidy double spaces / space-before-punct introduced by replacements
    out = re.sub(r" {2,}", " ", out)
    out = re.sub(r"\s+([,.!?])", r"\1", out)
    return out.strip(), hits


def check_content(text: str) -> list[str]:
    """Return list of content violation codes (empty = clean)."""
    return [code for code, pat in _CONTENT_BANS if pat.search(text)]


def filter_outbound_copy(
    text: str,
    fallback: str | None = None,
    context: str = "",
) -> FilterResult:
    """
    Gate one outbound user-facing string.

    Mechanical issues are fixed in place. Content violations replace the whole
    string with `fallback` (or the safe generic) and log the original.
    """
    if not text:
        return FilterResult(text="")
    sanitized, mech = _sanitize_mechanical(text)
    content = check_content(sanitized)
    if content:
        replacement = fallback or SAFE_GENERIC_FALLBACK
        logger.warning(
            "copy_filter blocked outbound string (%s) [%s]: %r -> fallback",
            ",".join(content),
            context or "no-context",
            text[:200],
        )
        return FilterResult(
            text=replacement, mechanical=mech, content=content, used_fallback=True
        )
    if mech:
        logger.info(
            "copy_filter sanitized outbound string (%s) [%s]",
            ",".join(mech),
            context or "no-context",
        )
    return FilterResult(text=sanitized, mechanical=mech, content=content)


def filter_text(text: str, fallback: str | None = None, context: str = "") -> str:
    """Convenience: just the safe string."""
    return filter_outbound_copy(text, fallback=fallback, context=context).text
