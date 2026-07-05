"""checks.py — deterministic per-turn checks. Vocabulary + semantics defined
in RUBRIC.md; this module is the implementation. Every check function takes
the turn's (request, response_body, latency_s) and returns (passed: bool,
detail: str). `run_checks` evaluates a scenario turn's `expect.deterministic`
list (strings, or {name: arg} dicts for parameterized checks) against a
TurnResult and the parsed response body.
"""
from __future__ import annotations

import re
from typing import Any

from validator import validate_all_blocks, validate_method_metadata

_MARKER_LEAK_RE = re.compile(
    r"\[/?(visual_block|method_confidence|choices(_multi)?)\]", re.IGNORECASE
)
_JSON_LEAK_RE = re.compile(r'\{\s*"(type|methods)"\s*:', re.IGNORECASE)
_TECH_LEAK_RE = re.compile(
    r"traceback|asyncio\.|exception:|\[system|api[_ ]key|langgraph", re.IGNORECASE
)
_FRIENDLY_ERROR_MARKERS = (
    "usage or billing limit",
    "trouble reaching my brain",
    "took too long",
)

# Slot -> compiled re-ask regex. Extend as new no_reask probes are added.
_REASK_PATTERNS = {
    "skin_type": re.compile(r"what('s| is) your skin type|what type of skin", re.IGNORECASE),
    "skin_concern": re.compile(r"what are you trying to fix|what('s| is) your (main )?skin concern", re.IGNORECASE),
    "hair_goal": re.compile(r"what('s| is) the hair goal|what('s| is) your hair goal", re.IGNORECASE),
    "allergies": re.compile(r"what products are you using|any allerg(y|ies)\?|are you allergic to anything", re.IGNORECASE),
    "diet_preference": re.compile(r"are you vegetarian|do you eat meat|any dietary restrictions", re.IGNORECASE),
}

# A cheap proxy for "AI voice" creeping in — sentence-initial capitalized words
# that aren't acronyms/known brand names. Real arbitration is the `max_voice`
# judge dimension; this is just a fast deterministic smell test.
_KNOWN_ACRONYMS_OR_BRANDS = {
    "I", "AM", "PM", "TMJ", "SPF", "AI", "CeraVe", "La", "Roche-Posay",
    "Amazon", "Max",
}
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_LEADING_WORD_RE = re.compile(r"^([A-Za-z][A-Za-z'-]*)")


def no_marker_leak(response: str, **_) -> tuple[bool, str]:
    m = _MARKER_LEAK_RE.search(response or "")
    return (m is None, f"leaked marker: {m.group(0)!r}" if m else "clean")


def no_leaked_json(response: str, **_) -> tuple[bool, str]:
    m = _JSON_LEAK_RE.search(response or "")
    return (m is None, f"leaked JSON near: {response[max(0, m.start()-20):m.end()+20]!r}" if m else "clean")


def blocks_schema_valid(body: dict, **_) -> tuple[bool, str]:
    blocks_r = validate_all_blocks(body.get("visual_blocks") or [])
    mm_r = validate_method_metadata(body.get("method_metadata"))
    fails = blocks_r.fails + mm_r.fails
    warns = blocks_r.warns + mm_r.warns
    detail = "; ".join(fails) if fails else ("; ".join(warns) or "clean")
    return (not fails, detail)


def no_tech_leak(response: str, **_) -> tuple[bool, str]:
    m = _TECH_LEAK_RE.search(response or "")
    return (m is None, f"tech leak: {m.group(0)!r}" if m else "clean")


def no_friendly_error(response: str, **_) -> tuple[bool, str]:
    low = (response or "").lower()
    for marker in _FRIENDLY_ERROR_MARKERS:
        if marker in low:
            return False, f"friendly-error copy present: {marker!r}"
    return True, "clean"


def prose_nonempty(response: str, body: dict, **_) -> tuple[bool, str]:
    stripped = (response or "").strip()
    if body.get("choices"):
        return True, "skipped (choices present, short clarifier OK)"
    ok = len(stripped) >= 40
    return ok, f"len={len(stripped)}"


def latency_lt(latency_s: float, arg: float, **_) -> tuple[bool, str]:
    ok = latency_s < float(arg)
    return ok, f"{latency_s:.1f}s (ceiling {arg}s)"


def block_present(body: dict, arg: str, **_) -> tuple[bool, str]:
    types = [b.get("type") for b in (body.get("visual_blocks") or []) if isinstance(b, dict)]
    ok = arg in types
    return ok, f"types present: {types}"


def block_absent(body: dict, arg: str, **_) -> tuple[bool, str]:
    types = [b.get("type") for b in (body.get("visual_blocks") or []) if isinstance(b, dict)]
    ok = arg not in types
    return ok, f"types present: {types}"


def choices_present(body: dict, **_) -> tuple[bool, str]:
    ok = bool(body.get("choices"))
    return ok, f"choices={body.get('choices')}"


def choices_absent(body: dict, **_) -> tuple[bool, str]:
    ok = not body.get("choices")
    return ok, f"choices={body.get('choices')}"


def no_reask(response: str, arg: str, **_) -> tuple[bool, str]:
    pattern = _REASK_PATTERNS.get(arg)
    if pattern is None:
        return False, f"unknown no_reask slot: {arg!r} (add it to checks.py _REASK_PATTERNS)"
    m = pattern.search(response or "")
    return (m is None, f"re-asked {arg!r}: matched {m.group(0)!r}" if m else "no re-ask")


def includes_any(response: str, arg: list[str], **_) -> tuple[bool, str]:
    low = (response or "").lower()
    hit = [kw for kw in arg if kw.lower() in low]
    return (bool(hit), f"matched: {hit}" if hit else f"none of {arg} found")


def excludes(response: str, arg: list[str], **_) -> tuple[bool, str]:
    low = (response or "").lower()
    hit = [kw for kw in arg if kw.lower() in low]
    return (not hit, f"forbidden term(s) present: {hit}" if hit else "clean")


def confidence_range_0_100(body: dict, **_) -> tuple[bool, str]:
    return blocks_schema_valid(body)


def max_voice_case(response: str, **_) -> tuple[bool, str]:
    sentences = _SENTENCE_SPLIT_RE.split((response or "").strip())
    leads = []
    for s in sentences:
        m = _LEADING_WORD_RE.match(s.strip())
        if m:
            leads.append(m.group(1))
    if not leads:
        return True, "no sentences to check"
    suspicious = [
        w for w in leads
        if w[:1].isupper() and w not in _KNOWN_ACRONYMS_OR_BRANDS and not w.isupper()
    ]
    # First-word-of-response capitalization is normal English; only flag if a
    # LOT of sentences start capitalized mid-response in a way that smells like
    # title-cased AI-speak. Loose threshold — this is a smell test, not the judge.
    ratio = len(suspicious) / max(1, len(leads))
    ok = ratio <= 0.5
    return ok, f"{len(suspicious)}/{len(leads)} suspicious leads ({ratio:.0%})"


def http_ok(status_code: int, **_) -> tuple[bool, str]:
    ok = status_code == 200
    return ok, f"status={status_code}"


_REGISTRY = {
    "no_marker_leak": no_marker_leak,
    "no_leaked_json": no_leaked_json,
    "blocks_schema_valid": blocks_schema_valid,
    "no_tech_leak": no_tech_leak,
    "no_friendly_error": no_friendly_error,
    "prose_nonempty": prose_nonempty,
    "latency_lt": latency_lt,
    "block_present": block_present,
    "block_absent": block_absent,
    "choices_present": choices_present,
    "choices_absent": choices_absent,
    "no_reask": no_reask,
    "includes_any": includes_any,
    "excludes": excludes,
    "confidence_range_0_100": confidence_range_0_100,
    "max_voice_case": max_voice_case,
    "http_ok": http_ok,
}


def run_checks(
    deterministic_spec: list,
    *,
    response: str,
    body: dict,
    status_code: int,
    latency_s: float,
) -> list[dict]:
    """deterministic_spec entries are either a bare check name (str) or a
    single-key dict {name: arg} for parameterized checks. Returns a list of
    {name, passed, detail} records in spec order."""
    results = []
    ctx: dict[str, Any] = dict(
        response=response, body=body, status_code=status_code, latency_s=latency_s
    )
    for entry in deterministic_spec:
        if isinstance(entry, str):
            name, arg = entry, None
        elif isinstance(entry, dict) and len(entry) == 1:
            (name, arg), = entry.items()
        else:
            results.append({"name": str(entry), "passed": False, "detail": "malformed check spec"})
            continue
        fn = _REGISTRY.get(name)
        if fn is None:
            results.append({"name": name, "passed": False, "detail": f"unknown check: {name!r}"})
            continue
        try:
            passed, detail = fn(arg=arg, **ctx) if arg is not None else fn(**ctx)
        except Exception as e:
            passed, detail = False, f"check raised: {e!r}"
        results.append({"name": name, "passed": passed, "detail": detail})
    return results
