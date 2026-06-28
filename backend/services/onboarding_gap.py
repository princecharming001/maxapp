"""Dynamic per-user onboarding: gap analysis + (later) question planning.

See DYNAMIC_ONBOARDING_SPEC.md. This module is purely additive and sits *in
front of* the existing deterministic questioner. Everything here is gated by
the `slot_prefill_enabled` / `dynamic_questions_enabled` config flags at the
call sites; with the flags off, nothing in this module runs.

U3 scope: Pydantic models (`InfoSlot`, `QuestionPlan`) + the pure, no-I/O
`compile_info_schema(doc) -> InfoSchema`. Later units add
`assemble_known_context` and `plan_questions`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field as dc_field
from datetime import date as _date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from config import settings
from services.max_doc_loader import MaxDoc, derive_info_schema_from_required
from services.schedule_dsl import referenced_fields

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class InfoSlot(BaseModel):
    """One canonical, cross-Max information requirement declared by a doc."""

    slot: str
    # `field` -> existing required_fields[].id in the same doc. None => the slot
    # is "infer-only": never asked, only resolved from known-context.
    field: Optional[str] = None
    needs: str = ""
    feeds: list[str] = Field(default_factory=list)
    plan_refs: list[str] = Field(default_factory=list)
    importance: Literal["high", "medium", "low"] = "high"
    satisfied_by: list[str] = Field(default_factory=list)
    derive: Optional[str] = None
    min_confidence: Optional[float] = None
    keep: bool = False
    # Computed at compile time: no live DSL rule reads this slot's field.
    dead: bool = False

    @property
    def is_infer_only(self) -> bool:
        return not self.field


class QuestionPlanItem(BaseModel):
    slot: str
    action: Literal["ask", "confirm"] = "ask"
    adapted_question: str = ""
    reason: str = ""


class SkippedSlot(BaseModel):
    slot: str
    reason: str = ""


class QuestionPlan(BaseModel):
    """LLM output (post-fence): ordered questions + what was skipped."""

    plan: list[QuestionPlanItem] = Field(default_factory=list)
    skipped: list[SkippedSlot] = Field(default_factory=list)


@dataclass
class InfoSchema:
    """Compiled, cached per-Max info schema."""

    maxx_id: str
    slots: list[InfoSlot] = dc_field(default_factory=list)
    # Fields actually consumed by some live DSL rule (modifiers/tasks/skeleton).
    consumed_fields: set[str] = dc_field(default_factory=set)
    # Consumed DSL fields that no slot covers (coverage gaps; logged at compile).
    uncovered_fields: set[str] = dc_field(default_factory=set)

    def active_slots(self) -> list[InfoSlot]:
        """Slots eligible to drive questions: not dead."""
        return [s for s in self.slots if not s.dead]

    def slot_for_field(self, field_id: str) -> Optional[InfoSlot]:
        for s in self.slots:
            if s.field == field_id:
                return s
        return None


# --------------------------------------------------------------------------- #
# compile_info_schema
# --------------------------------------------------------------------------- #
def _gather_dsl_exprs(doc: MaxDoc) -> list[str]:
    """Every DSL `if`/applies/contraindicated expression a plan actually reads."""
    exprs: list[str] = []
    # prompt_modifiers[].if
    for mod in doc.prompt_modifiers or []:
        cond = mod.get("if")
        if cond:
            exprs.append(str(cond))
    # tasks: applies_when + contraindicated_when
    for t in doc.tasks or []:
        exprs.extend(str(e) for e in (t.applies_when or []))
        exprs.extend(str(e) for e in (t.contraindicated_when or []))
    # schedule_design.skeleton.blocks[].if
    skeleton = (doc.schedule_design or {}).get("skeleton") or {}
    for block in skeleton.get("blocks") or []:
        if isinstance(block, dict):
            cond = block.get("if")
            if cond:
                exprs.append(str(cond))
    return exprs


def compile_info_schema(doc: MaxDoc) -> InfoSchema:
    """Compile a doc's info_schema (or auto-derive it) into an InfoSchema.

    Pure / no I/O:
    - auto-derive from required_fields when the doc declares no info_schema;
    - cross-link each slot.field to a real required_fields[].id (log on bad ref);
    - static-scan the live DSL to compute `consumed_fields`;
    - mark a slot `dead` when its field is read by NO live rule and `keep` is
      falsy (excluded from questions, still resolvable from known-context);
    - log a coverage WARNING for any consumed field with no slot.
    """
    raw = doc.info_schema or derive_info_schema_from_required(doc.required_fields)
    required_ids = {str(f["id"]) for f in (doc.required_fields or []) if f.get("id")}
    consumed = referenced_fields(_gather_dsl_exprs(doc))

    slots: list[InfoSlot] = []
    for entry in raw:
        if not isinstance(entry, dict):
            logger.warning("info_schema[%s]: non-dict slot entry skipped: %r", doc.maxx_id, entry)
            continue
        try:
            slot = InfoSlot(**entry)
        except Exception as e:  # malformed slot -> skip, don't crash compile
            logger.warning("info_schema[%s]: bad slot %r: %s", doc.maxx_id, entry.get("slot"), e)
            continue
        # Cross-link validation: a declared field must reference a real required id.
        if slot.field and slot.field not in required_ids:
            logger.warning(
                "info_schema[%s]: slot %s references unknown field '%s' (not in required_fields); treating as infer-only",
                doc.maxx_id, slot.slot, slot.field,
            )
            slot.field = None
        # Dead-scan: a field-backed slot no live rule reads is dead unless kept.
        if slot.field and slot.field not in consumed and not slot.keep:
            slot.dead = True
        slots.append(slot)

    covered_fields = {s.field for s in slots if s.field}
    uncovered = {f for f in consumed if f in required_ids and f not in covered_fields}
    if uncovered:
        logger.warning(
            "info_schema[%s]: %d consumed required field(s) have no slot: %s",
            doc.maxx_id, len(uncovered), sorted(uncovered),
        )

    return InfoSchema(
        maxx_id=doc.maxx_id,
        slots=slots,
        consumed_fields=consumed,
        uncovered_fields=uncovered,
    )


# --------------------------------------------------------------------------- #
# Known-context assembly (deterministic, NO LLM)
# --------------------------------------------------------------------------- #
# Per-alias-kind (source label, base confidence). Rank below decides ties.
_ALIAS_META: dict[str, tuple[str, float]] = {
    "onboarding": ("onboarding", 0.85),
    "facts": ("chat", 0.9),
    "profile": ("profile", 0.7),
    "scan": ("scan", 0.7),
}
# Source precedence (mirrors personalization._SOURCE_RANK, plus `profile`).
_SOURCE_RANK: dict[str, int] = {
    "chat": 5, "onboarding": 4, "profile": 3, "scan": 3,
    "onairos": 2, "derived": 2, "inferred": 1,
}


@dataclass
class _Sources:
    onboarding: dict[str, Any]
    context: dict[str, Any]
    state: dict[str, Any]            # merged_user_state(onboarding, context)
    profile_signals: dict[str, Any]  # profile_to_state_signals output (flat)
    facts: dict[str, Any]            # user_facts blob ({key: value, _stated_at})
    scan: dict[str, Any]             # scan_derived_signals(state)
    brief: Optional[str] = None


@dataclass
class KnownContext:
    prefill: dict[str, Any]                 # {field_id: value}
    provenance: dict[str, dict]             # {slot: {value, field_id, source, confidence}}
    brief: Optional[str] = None


def _is_empty(v: Any) -> bool:
    return v is None or v == "" or v == [] or v == {}


def _parse_alias(alias: str) -> tuple[str, str]:
    """`facts:equipment` -> ("facts","equipment"). Unknown kind -> ("", key)."""
    if ":" not in alias:
        return "", alias
    kind, key = alias.split(":", 1)
    return kind.strip(), key.strip()


def _read_alias(kind: str, key: str, src: _Sources) -> tuple[Any, Optional[str]]:
    """Resolve one alias to (value, stated_at_date|None). Empty -> (None, None)."""
    if kind == "onboarding":
        return src.state.get(key), None
    if kind == "facts":
        val = src.facts.get(key)
        stated = (src.facts.get("_stated_at") or {}).get(key)
        return val, stated
    if kind == "profile":
        # profile_to_state_signals is flat; accept "dim.field" or bare "field".
        last = key.split(".")[-1]
        return src.profile_signals.get(last, src.profile_signals.get(key)), None
    if kind == "scan":
        return src.scan.get(key), None
    return None, None


def _is_fresh(stated_at: Optional[str], ttl_days: int) -> bool:
    """A dated fact is fresh if within ttl_days; undated values are always fresh."""
    if not stated_at:
        return True
    try:
        d = _date.fromisoformat(str(stated_at)[:10])
    except ValueError:
        return True
    return (_date.today() - d).days <= ttl_days


def _hhmm_to_min(v: Any) -> Optional[int]:
    s = str(v or "").strip()
    if ":" not in s:
        return None
    try:
        h, m = s.split(":", 1)
        return (int(h) % 24) * 60 + int(m[:2])
    except (ValueError, TypeError):
        return None


def _apply_derive(expr: str, src: _Sources) -> Any:
    """Whitelisted, eval-free derivations. Today: span(a, b) = hour gap a->b
    (wraparound-safe). Unknown derive -> None (logged)."""
    expr = (expr or "").strip()
    if expr.startswith("span(") and expr.endswith(")"):
        inner = expr[len("span("):-1]
        parts = [p.strip() for p in inner.split(",")]
        if len(parts) != 2:
            return None
        lookup = {**src.facts, **src.state}
        a = _hhmm_to_min(lookup.get(parts[0]))
        b = _hhmm_to_min(lookup.get(parts[1]))
        if a is None or b is None:
            return None
        return round(((b - a) % (24 * 60)) / 60.0, 1)
    logger.warning("onboarding_gap: unknown derive expr %r ignored", expr)
    return None


def _resolve_slot(slot: InfoSlot, src: _Sources) -> Optional[dict]:
    """Resolve one slot from known-context. Returns {value, source, confidence}
    or None if genuinely unknown. Highest source-rank candidate wins."""
    min_conf = slot.min_confidence if slot.min_confidence is not None else settings.slot_default_min_confidence
    ttl = settings.slot_freshness_ttl_days
    candidates: list[tuple[int, Any, str, float]] = []
    for alias in slot.satisfied_by:
        kind, key = _parse_alias(alias)
        val, stated = _read_alias(kind, key, src)
        if _is_empty(val):
            continue
        source, conf = _ALIAS_META.get(kind, ("inferred", 0.5))
        if conf < min_conf:
            continue
        if not _is_fresh(stated, ttl):
            continue
        candidates.append((_SOURCE_RANK.get(source, 1), val, source, conf))
    if candidates:
        candidates.sort(key=lambda c: c[0], reverse=True)
        _, val, source, conf = candidates[0]
        return {"value": val, "source": source, "confidence": conf}
    if slot.derive:
        dv = _apply_derive(slot.derive, src)
        if not _is_empty(dv) and 0.8 >= min_conf:
            return {"value": dv, "source": "derived", "confidence": 0.8}
    return None


def resolve_prefill(schema: InfoSchema, src: _Sources) -> KnownContext:
    """Pure: resolve every slot against the gathered sources -> prefill +
    provenance. Field-backed, confidently-resolved slots feed prefill."""
    prefill: dict[str, Any] = {}
    provenance: dict[str, dict] = {}
    for slot in schema.slots:
        resolved = _resolve_slot(slot, src)
        if not resolved:
            continue
        entry = {**resolved, "field_id": slot.field}
        provenance[slot.slot] = entry
        if slot.field:
            prefill[slot.field] = resolved["value"]
    return KnownContext(prefill=prefill, provenance=provenance, brief=src.brief)


async def _gather_sources(db, user_id: str) -> _Sources:
    """Read every known-context source. Each guarded independently so one
    failing source never blanks the others (degrades toward fewer prefills)."""
    from models.sqlalchemy_models import User
    from services.user_context_service import (
        get_context, merged_user_state, scan_derived_signals,
    )
    from services.personalization import get_profile, profile_to_state_signals
    from services.user_facts_service import FACTS_KEY
    from uuid import UUID

    onboarding: dict[str, Any] = {}
    try:
        user = await db.get(User, UUID(str(user_id)))
        onboarding = dict((user.onboarding if user else None) or {})
    except Exception as e:
        logger.debug("onboarding_gap: onboarding load skipped: %s", e)

    context: dict[str, Any] = {}
    try:
        context = await get_context(user_id, db)
    except Exception as e:
        logger.debug("onboarding_gap: context load skipped: %s", e)

    state = merged_user_state(onboarding, context)

    profile_signals: dict[str, Any] = {}
    brief: Optional[str] = None
    try:
        built = await get_profile(db, user_id)
        profile_signals = profile_to_state_signals(built.get("profile") or {}, brief=built.get("brief"))
        brief = built.get("brief")
    except Exception as e:
        logger.debug("onboarding_gap: profile load skipped: %s", e)

    facts = dict(context.get(FACTS_KEY) or {})
    scan = scan_derived_signals(state)
    return _Sources(
        onboarding=onboarding, context=context, state=state,
        profile_signals=profile_signals, facts=facts, scan=scan, brief=brief,
    )


async def assemble_known_context(db, user_id: str, maxx_id: str) -> KnownContext:
    """Deterministic (NO LLM) cross-source known-context assembly for a max.

    Never raises into a chat turn: on any failure returns an empty KnownContext
    so callers fall back to today's raw `missing_required` flow.
    """
    try:
        from services.task_catalog_service import get_info_schema  # lazy: avoid import cycle
        schema = get_info_schema(maxx_id)
        if schema is None:
            return KnownContext(prefill={}, provenance={}, brief=None)
        src = await _gather_sources(db, user_id)
        return resolve_prefill(schema, src)
    except Exception:
        logger.exception("assemble_known_context failed for max=%s", maxx_id)
        return KnownContext(prefill={}, provenance={}, brief=None)
