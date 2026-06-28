"""Tests for dynamic per-user onboarding gap analysis (DYNAMIC_ONBOARDING_SPEC)."""

from __future__ import annotations

import asyncio

from services.max_doc_loader import parse_all_max_docs
from services.onboarding_gap import compile_info_schema, InfoSchema, InfoSlot


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
