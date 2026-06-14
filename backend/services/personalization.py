"""Hyper-personalization spine.

One unified profile of everything Max knows about a user, merged from every
source we have — explicit onboarding answers, durable facts the user tells the
chat (``UserMemory``), Onairos inference, the legacy ``user_facts`` blob, and
face scans — assembled into a per-dimension structure plus:

  * a natural-language **brief** the in-app chat injects into its system prompt
    ("what Max knows about this user"), and
  * structured **signals** the scheduler + program content read
    (diet, culture, work, communication style, personality).

Design goals
------------
* **Source-agnostic.** Onairos is ONE input among several. Anything the user
  tells the chat ("i'm vegetarian", "my family's Tamil", "i work nights") becomes
  a durable, correctable fact that is just as first-class as connected-app data.
* **Provenance + confidence.** Every fact carries where it came from and how
  sure we are, so explicit/recent statements beat inferred/old ones, and the
  user can always correct the record.
* **Forward-compatible.** When production Onairos returns richer categories
  (food, culture, demographics, communication style, brands), they flow into the
  right dimensions automatically via the category map — no schema change.

The ``UserPersonalizationProfile`` row is a rebuildable READ-MODEL: the source of
truth always lives in the contributing tables, so it can be regenerated from
scratch at any time.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from models.sqlalchemy_models import (
    User,
    UserMemory,
    UserPersonalizationProfile,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Taxonomy
# ---------------------------------------------------------------------------

# The dimensions of a person Max personalizes against. Order = brief order.
DIMENSIONS: tuple[str, ...] = (
    "identity",      # name, age, gender, location, timezone, languages
    "culture",       # culture/ethnicity, religion, observances
    "diet",          # pattern, cuisines, foods liked/avoided, allergies
    "work",          # role, workplace, location type, hours, commute
    "lifestyle",     # chronotype, sleep, activity, workout window, stress
    "personality",   # Big-5-ish traits, motivations, values
    "comms_style",   # how they want Max to talk to them
    "goals",         # the maxxes they're chasing + why
    "interests",     # topics, brands, hobbies
    "constraints",   # conditions, injuries, medications, equipment
    "misc",          # free-form anecdotes
)
_DIMENSION_SET = set(DIMENSIONS)

# Provenance ranking — higher beats lower when a keyed fact conflicts. What the
# user states explicitly always wins over what we infer.
_SOURCE_RANK: dict[str, int] = {
    "chat": 5,        # the user told Max directly
    "onboarding": 4,  # the user answered a form
    "scan": 3,        # derived from a face scan
    "onairos": 2,     # inferred from connected apps
    "inferred": 1,    # inferred from behavior
}
_VALID_SOURCES = set(_SOURCE_RANK)
_DEFAULT_CONF: dict[str, float] = {
    "chat": 0.9, "onboarding": 0.85, "scan": 0.7, "onairos": 0.6, "inferred": 0.5,
}

# Production Onairos may return categories beyond personality. Map each into the
# dimension it belongs to; unknown categories land in `misc` (never dropped).
_ONAIROS_CATEGORY_DIM: dict[str, str] = {
    "demographics": "identity", "identity": "identity", "basic": "identity",
    "lifestyle": "lifestyle", "habits": "lifestyle", "wellness": "lifestyle",
    "food": "diet", "diet": "diet", "nutrition": "diet", "cuisine": "diet",
    "culture": "culture", "ethnicity": "culture", "language": "culture",
    "religion": "culture",
    "communication": "comms_style", "tone": "comms_style", "sentiment": "comms_style",
    "interests": "interests", "affinities": "interests", "brands": "interests",
    "topics": "interests", "hobbies": "interests",
    "work": "work", "career": "work", "occupation": "work",
    "values": "personality", "personality": "personality", "psychographics": "personality",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _norm_text(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def _coerce_dimension(d: Any) -> str:
    d = _norm_text(d).replace(" ", "_")
    return d if d in _DIMENSION_SET else "misc"


def _coerce_source(s: Any) -> str:
    s = _norm_text(s)
    return s if s in _VALID_SOURCES else "chat"


def _coerce_confidence(c: Any) -> float:
    try:
        return max(0.0, min(1.0, float(c)))
    except (TypeError, ValueError):
        return 0.8


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _as_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        parts = re.split(r"[,;/]| and ", v)
        return [p.strip() for p in parts if p.strip()]
    if isinstance(v, (list, tuple, set)):
        return [str(x).strip() for x in v if str(x).strip()]
    return [str(v).strip()]


def _merge_list(dst: dict, field: str, values: Iterable[str]) -> None:
    cur = dst.get(field) or []
    seen = {_norm_text(x) for x in cur}
    for v in values:
        if v and _norm_text(v) not in seen:
            cur.append(v)
            seen.add(_norm_text(v))
    if cur:
        dst[field] = cur


# ---------------------------------------------------------------------------
# Durable memory: write + read
# ---------------------------------------------------------------------------

def resolve_keyed_conflict(
    *,
    existing_text: Any,
    existing_value: Any,
    existing_source: str,
    new_text: Any,
    new_value: Any,
    new_source: str,
) -> str:
    """Decide what a new keyed fact does to the standing one (pure / testable):

      * ``"dedupe"``    — same fact restated; just touch last_seen + confidence.
      * ``"supersede"`` — a real update from an at-least-as-authoritative source;
                          retire the old value and store the new.
      * ``"keep"``      — a weaker inference contradicting an explicit fact; the
                          standing value wins, drop the incoming one.
    """
    if _norm_text(existing_text) == _norm_text(new_text) and existing_value == new_value:
        return "dedupe"
    if _SOURCE_RANK.get(new_source, 0) >= _SOURCE_RANK.get(existing_source, 1):
        return "supersede"
    return "keep"

async def remember_fact(
    db: AsyncSession,
    user_id: str,
    *,
    dimension: str,
    text: str,
    key: Optional[str] = None,
    value: Any = None,
    source: str = "chat",
    confidence: Optional[float] = None,
    rebuild: bool = True,
) -> Optional[UserMemory]:
    """Persist one durable fact about the user, with conflict resolution.

    KEYED facts (``key`` set, e.g. ``"diet.pattern"``) hold the canonical value
    for a slot. A new keyed fact whose source rank is >= the standing one
    supersedes it ("actually i eat fish now" overrides "vegetarian"); a weaker
    inference never clobbers an explicit statement. KEYLESS facts are free-form
    anecdotes deduped by normalized text within their dimension.

    Returns the active ``UserMemory`` row (new or the deduped existing one), or
    ``None`` for empty input.
    """
    text = (text or "").strip()
    if not text:
        return None
    dim = _coerce_dimension(dimension)
    src = _coerce_source(source)
    conf = _coerce_confidence(confidence if confidence is not None else _DEFAULT_CONF.get(src, 0.8))
    uid = UUID(str(user_id))
    now = _utcnow()
    key = (key or "").strip() or None

    if key:
        existing = (
            await db.execute(
                select(UserMemory)
                .where(
                    UserMemory.user_id == uid,
                    UserMemory.key == key,
                    UserMemory.status == "active",
                )
                .order_by(UserMemory.updated_at.desc())
            )
        ).scalars().first()
        if existing is not None:
            decision = resolve_keyed_conflict(
                existing_text=existing.text, existing_value=existing.value,
                existing_source=existing.source, new_text=text, new_value=value,
                new_source=src,
            )
            if decision == "dedupe":
                existing.last_seen_at = now
                existing.confidence = max(float(existing.confidence or 0.0), conf)
                if _SOURCE_RANK[src] >= _SOURCE_RANK.get(existing.source, 1):
                    existing.source = src
                await db.commit()
                return existing
            if decision == "keep":
                await db.commit()
                return existing
            # supersede: retire the standing value, fall through to insert.
            existing.status = "superseded"
            existing.updated_at = now
    else:
        rows = (
            await db.execute(
                select(UserMemory).where(
                    UserMemory.user_id == uid,
                    UserMemory.dimension == dim,
                    UserMemory.key.is_(None),
                    UserMemory.status == "active",
                )
            )
        ).scalars().all()
        norm = _norm_text(text)
        for r in rows:
            if _norm_text(r.text) == norm:
                r.last_seen_at = now
                r.confidence = max(float(r.confidence or 0.0), conf)
                await db.commit()
                return r

    mem = UserMemory(
        user_id=uid, dimension=dim, key=key, text=text, value=value,
        source=src, confidence=conf, status="active",
        created_at=now, updated_at=now, last_seen_at=now,
    )
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    if rebuild:
        await _safe_rebuild(user_id, db)
    return mem


async def retract_fact(db: AsyncSession, user_id: str, memory_id: str) -> bool:
    """Mark a fact retracted (the user corrected us). Soft delete — keeps history."""
    row = (
        await db.execute(
            select(UserMemory).where(
                UserMemory.id == UUID(str(memory_id)),
                UserMemory.user_id == UUID(str(user_id)),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return False
    row.status = "retracted"
    row.updated_at = _utcnow()
    await db.commit()
    await _safe_rebuild(user_id, db)
    return True


async def get_memories(
    db: AsyncSession,
    user_id: str,
    *,
    dimensions: Optional[Iterable[str]] = None,
    min_confidence: float = 0.0,
) -> list[UserMemory]:
    """All ACTIVE durable facts for a user, newest first."""
    stmt = select(UserMemory).where(
        UserMemory.user_id == UUID(str(user_id)),
        UserMemory.status == "active",
    )
    if dimensions:
        stmt = stmt.where(UserMemory.dimension.in_([_coerce_dimension(d) for d in dimensions]))
    if min_confidence > 0:
        stmt = stmt.where(UserMemory.confidence >= min_confidence)
    stmt = stmt.order_by(UserMemory.updated_at.desc())
    return list((await db.execute(stmt)).scalars().all())


# ---------------------------------------------------------------------------
# Source normalizers — each merges into the per-dimension profile structure
# ---------------------------------------------------------------------------

def _blank_profile() -> dict[str, dict]:
    return {d: {} for d in DIMENSIONS}


def _apply_onboarding(profile: dict, onboarding: dict, *, coaching_tone: Optional[str] = None) -> None:
    ob = onboarding or {}

    def g(*keys):
        for k in keys:
            v = ob.get(k)
            if v not in (None, "", [], {}):
                return v
        return None

    ident = profile["identity"]
    for field, val in (
        ("age", g("age")), ("gender", g("gender")), ("location", g("location", "city")),
        ("timezone", g("timezone")),
    ):
        if val is not None and field not in ident:
            ident[field] = val

    work = profile["work"]
    for field, val in (
        ("location_type", g("work_location")), ("start", g("work_start")),
        ("end", g("work_end")), ("commute_minutes", g("commute_minutes")),
        ("schedule_kind", g("work_schedule")),
    ):
        if val is not None and field not in work:
            work[field] = val

    life = profile["lifestyle"]
    for field, val in (
        ("chronotype", g("chronotype")), ("wake", g("wake_time")), ("sleep", g("sleep_time")),
        ("activity_level", g("activity_level", "daily_activity_level")),
        ("dinner", g("dinner_time")),
    ):
        if val is not None and field not in life:
            life[field] = val

    restr = g("dietary_restrictions")
    if restr:
        _merge_list(profile["diet"], "restrictions", _as_list(restr))

    goals = g("goals", "priority_order", "priority_ranking")
    if goals:
        _merge_list(profile["goals"], "maxxes", _as_list(goals))

    rl = g("response_length")
    if rl and "length" not in profile["comms_style"]:
        profile["comms_style"]["length"] = rl
    if coaching_tone and "tone" not in profile["comms_style"]:
        profile["comms_style"]["tone"] = coaching_tone


def _apply_user_facts(profile: dict, user_facts: dict) -> None:
    """Fold the legacy user_facts blob (diet/allergies/body/lifestyle/...) in."""
    uf = user_facts or {}
    if uf.get("diet"):
        _merge_list(profile["diet"], "restrictions", _as_list(uf["diet"]))
    if uf.get("allergies"):
        _merge_list(profile["diet"], "allergies", _as_list(uf["allergies"]))
    if uf.get("equipment"):
        _merge_list(profile["constraints"], "equipment", _as_list(uf["equipment"]))
    if uf.get("health"):
        _merge_list(profile["constraints"], "conditions", _as_list(uf["health"]))
    if uf.get("lifestyle"):
        _merge_list(profile["lifestyle"], "notes", _as_list(uf["lifestyle"]))
    if uf.get("dislikes"):
        _merge_list(profile["diet"], "foods_avoided", _as_list(uf["dislikes"]))
    body = uf.get("body") or {}
    if isinstance(body, dict) and body:
        profile["identity"].setdefault("body", {}).update(
            {k: v for k, v in body.items() if not str(k).startswith("_")}
        )


def _top_keys(d: dict, n: int) -> list[str]:
    pairs = [(str(k), float(v)) for k, v in d.items() if k and _is_num(v)]
    pairs.sort(key=lambda kv: kv[1], reverse=True)
    return [k for k, _ in pairs[:n]]


def _absorb_onairos_category(target: dict, value: Any) -> None:
    """Defensively merge an arbitrary Onairos category payload into a dim dict."""
    try:
        if isinstance(value, dict):
            if value and all(_is_num(v) for v in value.values()):
                _merge_list(target, "signals", _top_keys(value, 6))
            else:
                for k, v in value.items():
                    if v in (None, "", [], {}):
                        continue
                    target.setdefault(str(k), v if not isinstance(v, (list, dict)) else v)
        elif isinstance(value, (list, tuple)):
            _merge_list(target, "signals", [str(x) for x in value])
        elif value not in (None, ""):
            _merge_list(target, "signals", [str(value)])
    except Exception as e:  # never let a surprise payload break assembly
        logger.warning("onairos category absorb failed: %s", e)


def _apply_onairos(profile: dict, traits_cached: dict) -> None:
    oc = traits_cached or {}
    traits_obj = oc.get("traits") or {}
    pos = traits_obj.get("positive_traits") or {}
    imp = traits_obj.get("traits_to_improve") or {}
    if pos:
        profile["personality"].setdefault("strengths", {}).update(
            {str(k): round(float(v), 3) for k, v in pos.items() if _is_num(v)}
        )
    if imp:
        profile["personality"].setdefault("to_improve", {}).update(
            {str(k): round(float(v), 3) for k, v in imp.items() if _is_num(v)}
        )

    inf = oc.get("inference") or {}
    aff = inf.get("affinities") or inf.get("interests") or {}
    if isinstance(aff, dict) and aff:
        _merge_list(profile["interests"], "topics", _top_keys(aff, 8))
    elif isinstance(aff, list):
        _merge_list(profile["interests"], "topics", [str(x) for x in aff])

    for cat, val in (oc.get("extra") or {}).items():
        dim = _ONAIROS_CATEGORY_DIM.get(_norm_text(cat), "misc")
        _absorb_onairos_category(profile[dim], val)


def _apply_memories(profile: dict, memories: list[UserMemory]) -> None:
    """Overlay durable facts LAST so explicit statements win over inferred ones."""
    # Apply oldest-first so the newest keyed fact ends up on top.
    for mem in sorted(memories, key=lambda m: m.updated_at or _utcnow()):
        dim = mem.dimension if mem.dimension in _DIMENSION_SET else "misc"
        if mem.key:
            leaf = mem.key.split(".")[-1]
            profile[dim][leaf] = mem.value if mem.value is not None else mem.text
        else:
            _merge_list(profile[dim], "notes", [mem.text])


# ---------------------------------------------------------------------------
# Brief + completeness + downstream signals
# ---------------------------------------------------------------------------

def _join(parts: Iterable[Optional[str]], sep: str = " · ") -> str:
    return sep.join(p for p in parts if p)


def _line_identity(d: dict) -> Optional[str]:
    bits = [
        d.get("name"),
        f"{d['age']}" if d.get("age") else None,
        d.get("gender"),
        d.get("location"),
    ]
    langs = _as_list(d.get("languages"))
    if langs:
        bits.append("speaks " + ", ".join(langs))
    s = _join(bits)
    return f"identity: {s}" if s else None


def _line_culture(d: dict) -> Optional[str]:
    bits = [d.get("culture") or d.get("ethnicity"), d.get("religion")]
    obs = _as_list(d.get("observances"))
    if obs:
        bits.append("observes " + ", ".join(obs))
    s = _join(bits)
    return f"culture: {s}" if s else None


def _line_diet(d: dict) -> Optional[str]:
    bits = []
    if d.get("pattern"):
        bits.append(str(d["pattern"]))
    cuisines = _as_list(d.get("cuisines"))
    liked = _as_list(d.get("foods_liked"))
    if cuisines:
        bits.append("cuisines: " + ", ".join(cuisines))
    if liked:
        bits.append("loves " + ", ".join(liked))
    avoid = _as_list(d.get("foods_avoided")) + _as_list(d.get("restrictions"))
    if avoid:
        bits.append("avoids " + ", ".join(dict.fromkeys(avoid)))
    allerg = _as_list(d.get("allergies"))
    if allerg:
        bits.append("allergic to " + ", ".join(allerg))
    s = "; ".join(bits)
    return f"diet: {s}" if s else None


def _line_work(d: dict) -> Optional[str]:
    bits = [d.get("role")]
    if d.get("workplace"):
        bits.append("at " + str(d["workplace"]))
    if d.get("location_type"):
        bits.append(str(d["location_type"]))
    if d.get("start") and d.get("end"):
        bits.append(f"{d['start']}–{d['end']}")
    if d.get("commute_minutes"):
        bits.append(f"~{d['commute_minutes']}min commute")
    s = _join(bits, sep=", ")
    return f"work: {s}" if s else None


def _line_lifestyle(d: dict) -> Optional[str]:
    bits = []
    if d.get("chronotype"):
        bits.append(str(d["chronotype"]) + " person")
    if d.get("activity_level"):
        bits.append(str(d["activity_level"]))
    if d.get("workout_window"):
        bits.append("works out " + str(d["workout_window"]))
    bits += _as_list(d.get("notes"))[:3]
    s = _join(bits, sep=", ")
    return f"rhythm: {s}" if s else None


def _line_personality(d: dict) -> Optional[str]:
    bits = []
    strengths = d.get("strengths") or {}
    if isinstance(strengths, dict) and strengths:
        bits.append("strong on " + ", ".join(_top_keys(strengths, 3)))
    mot = _as_list(d.get("motivations"))
    if mot:
        bits.append("motivated by " + ", ".join(mot))
    vals = _as_list(d.get("values"))
    if vals:
        bits.append("values " + ", ".join(vals))
    bits += _as_list(d.get("notes"))[:2]
    s = "; ".join(bits)
    return f"personality: {s}" if s else None


def _line_comms(d: dict) -> Optional[str]:
    bits = [d.get("tone"), d.get("length"), d.get("directness"), d.get("humor"), d.get("encouragement")]
    bits += _as_list(d.get("notes"))[:2]
    s = _join([str(b) for b in bits if b], sep=", ")
    return f"talk to them: {s}" if s else None


def _line_goals(d: dict) -> Optional[str]:
    bits = []
    maxxes = _as_list(d.get("maxxes"))
    if maxxes:
        bits.append(", ".join(maxxes))
    if d.get("why"):
        bits.append("why: " + str(d["why"]))
    if d.get("timeline"):
        bits.append("by " + str(d["timeline"]))
    bits += _as_list(d.get("notes"))[:2]
    s = "; ".join(bits)
    return f"goals: {s}" if s else None


def _line_interests(d: dict) -> Optional[str]:
    items = _as_list(d.get("topics")) + _as_list(d.get("brands")) + _as_list(d.get("notes"))
    items = list(dict.fromkeys(items))[:8]
    return ("cares about: " + ", ".join(items)) if items else None


def _line_constraints(d: dict) -> Optional[str]:
    bits = []
    for f, label in (("conditions", None), ("injuries", "injured"), ("medications", "on"), ("equipment", "has")):
        vals = _as_list(d.get(f))
        if vals:
            bits.append((label + " " if label else "") + ", ".join(vals))
    bits += _as_list(d.get("notes"))[:2]
    s = "; ".join(bits)
    return f"constraints: {s}" if s else None


def _line_misc(d: dict) -> Optional[str]:
    notes = _as_list(d.get("notes"))
    if not notes:
        # surface any signals absorbed from unmapped onairos categories
        notes = _as_list(d.get("signals"))
    notes = notes[:4]
    return ("also: " + "; ".join(notes)) if notes else None


_LINE_BUILDERS = {
    "identity": _line_identity, "culture": _line_culture, "diet": _line_diet,
    "work": _line_work, "lifestyle": _line_lifestyle, "personality": _line_personality,
    "comms_style": _line_comms, "goals": _line_goals, "interests": _line_interests,
    "constraints": _line_constraints, "misc": _line_misc,
}

_BRIEF_HEADER = (
    "## WHAT MAX KNOWS ABOUT THIS USER\n"
    "Use this to personalize tone, examples, food & culture references, and timing. "
    "Treat it as background you already know — weave it in naturally, never recite it "
    "back as a list, and always prefer what they've told you directly over inferred signals.\n"
)


def build_personalization_brief(profile: dict) -> Optional[str]:
    """Render the profile into a compact natural-language brief for the prompt."""
    lines: list[str] = []
    for dim in DIMENSIONS:
        line = _LINE_BUILDERS[dim](profile.get(dim) or {})
        if line:
            lines.append("- " + line)
    if not lines:
        return None
    return _BRIEF_HEADER + "\n".join(lines)


def _completeness(profile: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for dim in DIMENSIONS:
        d = profile.get(dim) or {}
        filled = sum(1 for v in d.values() if v not in (None, "", [], {}))
        out[dim] = round(min(1.0, filled / 3.0), 2)  # ~3 fields = "well known"
    return out


def profile_to_state_signals(profile: dict, *, brief: Optional[str] = None) -> dict[str, Any]:
    """Structured signals to merge into merged_user_state for the scheduler +
    program content (nutrition, copy tone, timing). Only emits non-empty keys."""
    sig: dict[str, Any] = {}
    diet = profile.get("diet") or {}
    pattern = diet.get("pattern")
    restrictions = list(dict.fromkeys(
        _as_list(diet.get("restrictions")) + _as_list(diet.get("allergies"))
        + _as_list(diet.get("foods_avoided"))
    ))
    if pattern:
        sig["dietary_pattern"] = pattern
    if restrictions:
        sig["dietary_restrictions"] = restrictions
        sig["dietary_restrictions_text"] = ", ".join(restrictions)
    if diet.get("cuisines"):
        sig["food_cuisines"] = _as_list(diet.get("cuisines"))
    if diet.get("foods_liked"):
        sig["foods_liked"] = _as_list(diet.get("foods_liked"))
    if diet.get("allergies"):
        sig["food_allergies"] = _as_list(diet.get("allergies"))

    culture = profile.get("culture") or {}
    if culture.get("culture") or culture.get("ethnicity"):
        sig["culture"] = culture.get("culture") or culture.get("ethnicity")
    if culture.get("religion"):
        sig["religion"] = culture.get("religion")
    if culture.get("observances"):
        sig["observances"] = _as_list(culture.get("observances"))

    work = profile.get("work") or {}
    if work.get("location_type"):
        sig["work_location"] = work["location_type"]
    if work.get("workplace"):
        sig["workplace"] = work["workplace"]
    if work.get("role"):
        sig["occupation"] = work["role"]

    comms = profile.get("comms_style") or {}
    tone, length = comms_to_tone(profile)
    if tone:
        sig["comms_tone"] = tone
    if length:
        sig["comms_length"] = length
    if comms.get("notes"):
        sig["comms_notes"] = _as_list(comms.get("notes"))

    constraints = profile.get("constraints") or {}
    for f in ("conditions", "injuries", "medications", "equipment"):
        if constraints.get(f):
            sig[f] = _as_list(constraints[f])

    if brief:
        sig["personalization_brief"] = brief
    return sig


# Map a free-text communication style onto the app's existing coaching_tone +
# response_length enums so Max's voice adapts even where only those are read.
_TONE_WORDS = {
    "hardcore": "hardcore", "blunt": "hardcore", "tough": "hardcore", "direct": "hardcore",
    "drill": "hardcore", "aggressive": "hardcore", "no-nonsense": "hardcore",
    "gentle": "gentle", "soft": "gentle", "kind": "gentle", "supportive": "gentle",
    "encouraging": "gentle", "warm": "gentle", "patient": "gentle",
    "influencer": "influencer", "hype": "influencer", "energetic": "influencer",
}
_LENGTH_WORDS = {
    "concise": "concise", "short": "concise", "brief": "concise", "quick": "concise",
    "detailed": "detailed", "thorough": "detailed", "long": "detailed", "deep": "detailed",
    "medium": "medium",
}


def comms_to_tone(profile: dict) -> tuple[Optional[str], Optional[str]]:
    """Best-effort (coaching_tone, response_length) from the comms_style dim."""
    comms = profile.get("comms_style") or {}
    hay = _norm_text(_join(
        [str(comms.get(k, "")) for k in ("tone", "directness", "humor", "encouragement")]
        + _as_list(comms.get("notes")),
        sep=" ",
    ))
    tone = next((v for w, v in _TONE_WORDS.items() if w in hay), None)
    length = comms.get("length") if comms.get("length") in ("concise", "medium", "detailed") else None
    if length is None:
        length = next((v for w, v in _LENGTH_WORDS.items() if w in hay), None)
    return tone, length


# ---------------------------------------------------------------------------
# Assembly + persistence
# ---------------------------------------------------------------------------

async def _load_user_facts(db: AsyncSession, user_id: str) -> dict:
    try:
        # NB: user_context_service.get_context is (user_id, db) — user_id first.
        from services.user_context_service import get_context
        ctx = await get_context(user_id, db)
        return (ctx or {}).get("user_facts") or {}
    except Exception as e:
        logger.debug("user_facts load skipped: %s", e)
        return {}


async def _load_onairos_traits(db: AsyncSession, user_id: str) -> dict:
    try:
        from services.onairos_service import onairos_service
        return (await onairos_service.get_active_traits(user_id, db)) or {}
    except Exception as e:
        logger.debug("onairos traits load skipped: %s", e)
        return {}


async def assemble_profile(
    db: AsyncSession,
    user_id: str,
    *,
    onboarding: Optional[dict] = None,
    coaching_tone: Optional[str] = None,
) -> dict[str, Any]:
    """Build the unified profile read-model from every live source. Pure read —
    does not persist. Returns {profile, completeness, brief, sources}."""
    sources: list[str] = []
    profile = _blank_profile()

    if onboarding:
        _apply_onboarding(profile, onboarding, coaching_tone=coaching_tone)
        sources.append("onboarding")

    user_facts = await _load_user_facts(db, user_id)
    if user_facts:
        _apply_user_facts(profile, user_facts)
        sources.append("user_facts")

    traits = await _load_onairos_traits(db, user_id)
    if traits:
        _apply_onairos(profile, traits)
        sources.append("onairos")

    memories = await get_memories(db, user_id)
    if memories:
        _apply_memories(profile, memories)
        sources.append("memory")

    # Drop empty dimensions for a clean stored shape.
    profile = {k: v for k, v in profile.items() if v}
    brief = build_personalization_brief(profile)
    return {
        "profile": profile,
        "completeness": _completeness({**_blank_profile(), **profile}),
        "brief": brief,
        "sources": sources,
    }


async def rebuild_profile(user_id: str, db: AsyncSession) -> dict[str, Any]:
    """Assemble + persist the UserPersonalizationProfile read-model."""
    user = (
        await db.execute(select(User).where(User.id == UUID(str(user_id))))
    ).scalar_one_or_none()
    onboarding = (user.onboarding if user else None) or {}
    coaching_tone = getattr(user, "coaching_tone", None) if user else None

    built = await assemble_profile(
        db, user_id, onboarding=onboarding, coaching_tone=coaching_tone
    )

    row = (
        await db.execute(
            select(UserPersonalizationProfile).where(
                UserPersonalizationProfile.user_id == UUID(str(user_id))
            )
        )
    ).scalar_one_or_none()
    now = _utcnow()
    if row is None:
        row = UserPersonalizationProfile(
            user_id=UUID(str(user_id)),
            profile=built["profile"],
            completeness=built["completeness"],
            sources=built["sources"],
            brief=built["brief"],
            rebuilt_at=now,
        )
        db.add(row)
    else:
        row.profile = built["profile"]
        row.completeness = built["completeness"]
        row.sources = built["sources"]
        row.brief = built["brief"]
        row.rebuilt_at = now
        flag_modified(row, "profile")
        flag_modified(row, "completeness")
        flag_modified(row, "sources")
    await db.commit()
    return built


async def _safe_rebuild(user_id: str, db: AsyncSession) -> None:
    try:
        await rebuild_profile(user_id, db)
    except Exception as e:
        logger.warning("personalization rebuild failed for user=%s: %s", user_id, e)


async def get_profile(db: AsyncSession, user_id: str, *, rebuild_if_missing: bool = True) -> dict[str, Any]:
    """Return the stored profile read-model (rebuilding it once if absent)."""
    row = (
        await db.execute(
            select(UserPersonalizationProfile).where(
                UserPersonalizationProfile.user_id == UUID(str(user_id))
            )
        )
    ).scalar_one_or_none()
    if row is None:
        if not rebuild_if_missing:
            return {"profile": {}, "completeness": {}, "brief": None, "sources": []}
        return await rebuild_profile(user_id, db)
    return {
        "profile": row.profile or {},
        "completeness": row.completeness or {},
        "brief": row.brief,
        "sources": row.sources or [],
    }


async def personalization_brief(db: AsyncSession, user_id: str) -> Optional[str]:
    """Convenience: just the NL brief for prompt injection (never raises)."""
    try:
        return (await get_profile(db, user_id)).get("brief")
    except Exception as e:
        logger.debug("personalization_brief skipped: %s", e)
        return None


async def state_signals(db: AsyncSession, user_id: str) -> dict[str, Any]:
    """Convenience: structured signals to merge into merged_user_state."""
    try:
        built = await get_profile(db, user_id)
        return profile_to_state_signals(built.get("profile") or {}, brief=built.get("brief"))
    except Exception as e:
        logger.debug("personalization state_signals skipped: %s", e)
        return {}
