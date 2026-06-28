"""Tests for dynamic per-user onboarding gap analysis (DYNAMIC_ONBOARDING_SPEC)."""

from __future__ import annotations

import asyncio

from services.max_doc_loader import parse_all_max_docs
from services.onboarding_gap import (
    compile_info_schema,
    resolve_prefill,
    InfoSchema,
    InfoSlot,
    _Sources,
)


def test_compile_autoderive_and_deadscan():
    """Every doc compiles; every active slot's field is a real required field;
    the dead-scan runs without raising."""
    docs = parse_all_max_docs()
    assert docs, "expected at least one max doc on disk"

    for doc in docs:
        schema = compile_info_schema(doc)
        assert isinstance(schema, InfoSchema)
        assert schema.maxx_id == doc.maxx_id

        required_ids = {str(f["id"]) for f in (doc.required_fields or []) if f.get("id")}

        # Auto-derive fallback: docs without an explicit info_schema still get
        # one slot per required field.
        if not doc.info_schema:
            assert len(schema.slots) == len(required_ids)

        for slot in schema.active_slots():
            assert isinstance(slot, InfoSlot)
            # An active, field-backed slot must reference a real required field.
            if slot.field is not None:
                assert slot.field in required_ids, (
                    f"{doc.maxx_id}: active slot {slot.slot} -> unknown field {slot.field}"
                )

        # Dead-scan produced a (possibly empty) consumed-field set without error.
        assert isinstance(schema.consumed_fields, set)


def test_get_info_schema_cached():
    """After warm_catalog, the compiled InfoSchema is cached and retrievable."""
    from services import task_catalog_service as tcs

    asyncio.run(tcs.warm_catalog())
    schema = tcs.get_info_schema("bonemax")
    assert schema is not None
    assert schema.maxx_id == "bonemax"
    assert schema.slots, "expected a non-empty compiled slot list for bonemax"
    # Unknown max -> None, not an error.
    assert tcs.get_info_schema("nope_not_a_max") is None


def _sources(*, onboarding=None, facts=None, profile=None, scan=None):
    from services.user_context_service import merged_user_state, scan_derived_signals
    onboarding = onboarding or {}
    context = {}
    state = merged_user_state(onboarding, context)
    return _Sources(
        onboarding=onboarding,
        context=context,
        state=state,
        profile_signals=profile or {},
        facts=facts or {},
        scan=scan or {},
        brief=None,
    )


def test_assemble_prefill_dedup():
    """Cross-source dedup: a derived slot (span over onboarding times) and a
    facts-backed slot both prefill, keyed by their field ids."""
    schema = InfoSchema(
        maxx_id="testmax",
        slots=[
            InfoSlot(
                slot="sleep_hours",
                field="sleep_hours",
                satisfied_by=["onboarding:sleep_hours", "facts:sleep_hours"],
                derive="span(sleep_time, wake_time)",
            ),
            InfoSlot(
                slot="equipment",
                field="equipment",
                satisfied_by=["facts:equipment"],
            ),
        ],
    )
    src = _sources(
        onboarding={"sleep_time": "23:00", "wake_time": "07:00"},
        facts={"equipment": "full_gym"},
    )
    known = resolve_prefill(schema, src)

    # Derived sleep duration: 23:00 -> 07:00 = 8h.
    assert "sleep_hours" in known.prefill
    assert known.prefill["sleep_hours"] == 8.0
    assert known.provenance["sleep_hours"]["source"] == "derived"

    # Facts-backed equipment prefilled under its field id.
    assert known.prefill["equipment"] == "full_gym"
    assert known.provenance["equipment"]["source"] == "chat"


def test_resolve_respects_source_rank():
    """When multiple aliases resolve, the higher source-rank wins (chat>onboarding)."""
    schema = InfoSchema(
        maxx_id="t",
        slots=[
            InfoSlot(
                slot="age",
                field="age",
                satisfied_by=["onboarding:age", "facts:age"],
            )
        ],
    )
    src = _sources(onboarding={"age": 30}, facts={"age": 28})
    known = resolve_prefill(schema, src)
    assert known.prefill["age"] == 28  # facts (chat rank 5) beats onboarding (4)
