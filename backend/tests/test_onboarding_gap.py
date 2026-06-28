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


def test_prefill_skips_known_question(monkeypatch):
    """Flag ON + a known field => the prefill helper merges it into state so the
    questioner's next pick is NOT that field. Flag OFF => state is untouched."""
    import asyncio as _asyncio
    from config import settings
    from services import task_catalog_service as tcs
    from services.onboarding_questioner import peek_next_question
    from services.onboarding_gap import KnownContext
    import api.chat as chat

    _asyncio.run(tcs.warm_catalog())

    # Pick a real max + the field its raw questioner would ask first on a blank
    # state, then prefill exactly that field.
    maxx_id = "bonemax"
    first = peek_next_question(maxx_id, {})
    assert first is not None
    known_field = first["id"]

    async def _fake_assemble(db, user_id, mx):
        return KnownContext(prefill={known_field: _sample_value(maxx_id, known_field)}, provenance={}, brief=None)

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr(chat, "assemble_known_context", _fake_assemble, raising=False)
    # The helper imports assemble_known_context locally from onboarding_gap, so
    # patch it at the source module too.
    monkeypatch.setattr("services.onboarding_gap.assemble_known_context", _fake_assemble)
    monkeypatch.setattr("services.user_context_service.merge_context", _noop)
    monkeypatch.setattr(chat, "_mirror_intake_to_facts", _noop)

    # Flag OFF: state unchanged, raw question is still the known field.
    monkeypatch.setattr(settings, "slot_prefill_enabled", False)
    off_state = _asyncio.run(chat._apply_slot_prefill("00000000-0000-0000-0000-000000000001", maxx_id, {}, None))
    assert known_field not in off_state
    assert peek_next_question(maxx_id, off_state)["id"] == known_field

    # Flag ON: known field merged in, so it is skipped.
    monkeypatch.setattr(settings, "slot_prefill_enabled", True)
    on_state = _asyncio.run(chat._apply_slot_prefill("00000000-0000-0000-0000-000000000001", maxx_id, {}, None))
    assert known_field in on_state
    nxt = peek_next_question(maxx_id, on_state)
    assert nxt is None or nxt["id"] != known_field


def _sample_value(maxx_id: str, field_id: str):
    """A coercible-looking value for a field, derived from its spec options."""
    from services.task_catalog_service import get_doc
    doc = get_doc(maxx_id)
    spec = next((f for f in doc.required_fields if f.get("id") == field_id), {})
    if spec.get("type") == "enum" and spec.get("options"):
        return next(iter(spec["options"].keys()))
    if spec.get("type") == "yes_no":
        return True
    return "x"


def test_plan_queue_ordering():
    """A plan-pending drives the queue in order, advances on coerce, and the
    plan view exhausts at idx==len (then falls through to the raw backstop)."""
    import asyncio as _asyncio
    from services import task_catalog_service as tcs
    from services.onboarding_questioner import (
        make_plan_pending,
        advance_plan,
        peek_next_question,
        _peek_plan_field,
        PENDING_KEY,
    )

    _asyncio.run(tcs.warm_catalog())
    maxx_id = "bonemax"
    schema = tcs.get_info_schema(maxx_id)
    slots = [s.slot for s in schema.active_slots() if s.field][:3]
    assert len(slots) == 3

    def field_of(slot_id):
        s = next(x for x in schema.slots if x.slot == slot_id)
        return s.field

    adapted = {slots[0]: "custom phrased q0?"}
    pending = make_plan_pending(maxx_id, slots, idx=0, adapted=adapted)

    # idx 0 — adapted wording overrides the doc question.
    q0 = peek_next_question(maxx_id, {PENDING_KEY: pending})
    assert q0["id"] == field_of(slots[0])
    assert q0["question"] == "custom phrased q0?"

    # idx 1, 2 in order, default (non-adapted) wording.
    pending = advance_plan(pending)
    q1 = peek_next_question(maxx_id, {PENDING_KEY: pending})
    assert q1["id"] == field_of(slots[1])

    pending = advance_plan(pending)
    q2 = peek_next_question(maxx_id, {PENDING_KEY: pending})
    assert q2["id"] == field_of(slots[2])

    # Past the end — the plan view is exhausted (idx == len).
    pending = advance_plan(pending)
    assert pending["idx"] == 3
    assert _peek_plan_field(maxx_id, pending) is None


def test_get_pending_accepts_old_and_new_shape():
    """Backward compat: both the legacy {max,last_question} and the new
    plan-pending validate via get_pending."""
    from services.onboarding_questioner import get_pending, make_pending, make_plan_pending, PENDING_KEY
    old = make_pending("skinmax", "skin_type")
    assert get_pending({PENDING_KEY: old})["max"] == "skinmax"
    new = make_plan_pending("skinmax", ["a", "b"], idx=0)
    got = get_pending({PENDING_KEY: new})
    assert got["max"] == "skinmax" and got.get("plan") == ["a", "b"]
