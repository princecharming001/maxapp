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


def test_plan_questions_fence(monkeypatch):
    """The LLM output is fenced: hallucinated slots dropped, dups removed,
    importance-ordered, capped at gap length."""
    import asyncio as _asyncio
    import json as _json
    from services import task_catalog_service as tcs
    from services import onboarding_gap as og

    _asyncio.run(tcs.warm_catalog())
    maxx_id = "bonemax"
    doc = tcs.get_doc(maxx_id)
    # Use three real required fields as the gap.
    gap_specs = [f for f in doc.required_fields if f.get("required", True)][:3]
    schema = tcs.get_info_schema(maxx_id)
    slot_ids = [schema.slot_for_field(f["id"]).slot for f in gap_specs]

    # Stub returns: a hallucinated slot, a duplicate of slot_ids[2], then the
    # real slots in REVERSE order — fence must clean all of that up.
    fake_plan = {
        "plan": [
            {"slot": "TOTALLY_FAKE_SLOT", "action": "ask", "adapted_question": "q?", "reason": "x"},
            {"slot": slot_ids[2], "action": "ask", "adapted_question": "dup", "reason": "x"},
            {"slot": slot_ids[2], "action": "ask", "adapted_question": "dup2", "reason": "x"},
            {"slot": slot_ids[1], "action": "ask", "adapted_question": "q1", "reason": "x"},
            {"slot": slot_ids[0], "action": "ask", "adapted_question": "q0", "reason": "x"},
        ],
        "skipped": [],
    }
    monkeypatch.setattr(og, "_complete_json", lambda s, u: _json.dumps(fake_plan))

    plan = og.plan_questions(maxx_id, gap_specs, provenance={}, brief=None)
    assert plan is not None
    out_slots = [it.slot for it in plan.plan]
    # No hallucinated slot, no dup, all in-gap, capped at gap length.
    assert "TOTALLY_FAKE_SLOT" not in out_slots
    assert len(out_slots) == len(set(out_slots))  # deduped
    assert set(out_slots) <= set(slot_ids)
    assert len(out_slots) <= len(gap_specs)
    # Importance-ordered (non-increasing).
    ranks = [og._IMPORTANCE_RANK.get(og._slot_importance(maxx_id, s), 0) for s in out_slots]
    assert ranks == sorted(ranks, reverse=True)


def test_plan_questions_fallback(monkeypatch):
    """Provider raising / empty output => plan_questions returns None."""
    from services import task_catalog_service as tcs
    from services import onboarding_gap as og
    import asyncio as _asyncio

    _asyncio.run(tcs.warm_catalog())
    maxx_id = "bonemax"
    gap_specs = [f for f in tcs.get_doc(maxx_id).required_fields if f.get("required", True)][:2]

    def _boom(s, u):
        raise RuntimeError("provider down")

    monkeypatch.setattr(og, "_complete_json", _boom)
    assert og.plan_questions(maxx_id, gap_specs, provenance={}, brief=None) is None

    # Empty output also -> None.
    monkeypatch.setattr(og, "_complete_json", lambda s, u: "   ")
    assert og.plan_questions(maxx_id, gap_specs, provenance={}, brief="x") is None


def test_ladder_degrades(monkeypatch):
    """The three-rung ladder each produces a valid next-question payload:
    (a) LLM plan OK, (b) LLM None -> deterministic prefill/raw, (c) all off -> raw."""
    import asyncio as _asyncio
    from config import settings
    from services import task_catalog_service as tcs
    from services import onboarding_gap as og
    from services.onboarding_questioner import (
        peek_next_question, field_to_question_payload, PENDING_KEY,
    )
    import api.chat as chat

    _asyncio.run(tcs.warm_catalog())
    maxx_id = "bonemax"
    doc = tcs.get_doc(maxx_id)
    schema = tcs.get_info_schema(maxx_id)
    gap_specs = [f for f in doc.required_fields if f.get("required", True)][:3]
    slot_ids = [schema.slot_for_field(f["id"]).slot for f in gap_specs]

    uid = "00000000-0000-0000-0000-000000000009"

    async def _noop(*a, **k):
        return None

    async def _empty_known(db, u, mx):
        return _make_empty_known()

    monkeypatch.setattr("services.user_context_service.merge_context", _noop)
    monkeypatch.setattr(chat, "_mirror_intake_to_facts", _noop)
    monkeypatch.setattr("services.onboarding_gap.assemble_known_context", _empty_known)

    # (a) LLM plan OK -> plan-pending -> valid payload (adapted wording rides).
    monkeypatch.setattr(settings, "dynamic_questions_enabled", True)
    monkeypatch.setattr(settings, "dynamic_questions_shadow", False)
    monkeypatch.setattr(settings, "slot_prefill_enabled", False)
    good_plan = og.QuestionPlan(
        plan=[og.QuestionPlanItem(slot=s, action="ask", adapted_question=f"adapted {s}?") for s in slot_ids],
        skipped=[],
    )
    monkeypatch.setattr(og, "plan_questions", lambda *a, **k: good_plan)
    pending = _asyncio.run(chat._try_build_llm_plan(uid, maxx_id, {}, None))
    assert pending is not None and pending["generated_by"] == "llm"
    nf = peek_next_question(maxx_id, {PENDING_KEY: pending})
    payload_a = field_to_question_payload(nf)
    assert payload_a["text"].startswith("adapted ")
    assert payload_a["field_id"]

    # (b) LLM returns None -> _try_build_llm_plan None -> deterministic peek works.
    monkeypatch.setattr(og, "plan_questions", lambda *a, **k: None)
    pending_b = _asyncio.run(chat._try_build_llm_plan(uid, maxx_id, {}, None))
    assert pending_b is None
    nf_b = peek_next_question(maxx_id, {})  # raw rung
    assert field_to_question_payload(nf_b)["field_id"]

    # (c) all flags off -> _try_build_llm_plan None -> raw rung valid.
    monkeypatch.setattr(settings, "dynamic_questions_enabled", False)
    monkeypatch.setattr(settings, "dynamic_questions_shadow", False)
    pending_c = _asyncio.run(chat._try_build_llm_plan(uid, maxx_id, {}, None))
    assert pending_c is None
    nf_c = peek_next_question(maxx_id, {})
    assert field_to_question_payload(nf_c)["field_id"]


def _make_empty_known():
    from services.onboarding_gap import KnownContext
    return KnownContext(prefill={}, provenance={}, brief=None)


def test_plan_dirty_recompute():
    """A queued slot satisfied by a (volunteered) fact is dropped on recompute,
    the cursor re-anchors, and plan_dirty clears — no LLM involved."""
    import asyncio as _asyncio
    from services import task_catalog_service as tcs
    from services.onboarding_questioner import (
        make_plan_pending, recompute_dirty_plan, peek_next_question, PENDING_KEY,
    )

    _asyncio.run(tcs.warm_catalog())
    maxx_id = "bonemax"
    schema = tcs.get_info_schema(maxx_id)
    slots = [s.slot for s in schema.active_slots() if s.field][:3]
    assert len(slots) == 3
    A, B, C = slots

    def field_of(slot_id):
        return next(s for s in schema.slots if s.slot == slot_id).field

    pending = make_plan_pending(maxx_id, [A, B, C], idx=0)
    pending["plan_dirty"] = True

    # A chat-volunteered fact satisfies B's field.
    state = {field_of(B): _sample_value(maxx_id, field_of(B))}
    new_pending = recompute_dirty_plan(maxx_id, pending, state)

    assert new_pending["plan_dirty"] is False
    assert B not in new_pending["plan"]
    assert A in new_pending["plan"] and C in new_pending["plan"]

    # The dropped slot never surfaces on peek.
    nf = peek_next_question(maxx_id, {PENDING_KEY: new_pending})
    assert nf is None or nf["id"] != field_of(B)


def test_mark_plan_dirty_only_when_plan(monkeypatch):
    """mark_onboarding_plan_dirty flips the flag for an active plan, and is a
    no-op (no write) for legacy/no pending."""
    import asyncio as _asyncio
    from services.onboarding_questioner import (
        mark_onboarding_plan_dirty, make_plan_pending, make_pending, PENDING_KEY,
    )

    writes = {}

    async def _get_ctx_with(pending):
        async def _g(uid, db):
            return {PENDING_KEY: pending} if pending else {}
        return _g

    async def _merge(uid, updates, db):
        writes["last"] = updates
        return updates

    # Active plan -> writes plan_dirty True.
    monkeypatch.setattr("services.user_context_service.get_context",
                        _asyncio.run(_get_ctx_with(make_plan_pending("bonemax", ["a", "b"]))))
    monkeypatch.setattr("services.user_context_service.merge_context", _merge)
    writes.clear()
    _asyncio.run(mark_onboarding_plan_dirty("u", None))
    assert writes["last"][PENDING_KEY]["plan_dirty"] is True

    # Legacy pending (no plan) -> no write.
    monkeypatch.setattr("services.user_context_service.get_context",
                        _asyncio.run(_get_ctx_with(make_pending("bonemax", "workout_frequency"))))
    writes.clear()
    _asyncio.run(mark_onboarding_plan_dirty("u", None))
    assert "last" not in writes
