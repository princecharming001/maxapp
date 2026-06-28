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
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

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
