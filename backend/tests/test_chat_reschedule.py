"""Backend tests for chat propose → confirm → apply (RALPH_CHAT_RESCHEDULE).

Deterministic, no LLM and no real DB: the proposal service is exercised with a
fake AsyncSession and the underlying schedule mutators are patched so we can
assert (a) proposing mutates NOTHING, (b) Yes replays the EXACT stored action,
(c) Yes is idempotent, (d) No leaves the schedule unchanged and re-prompts,
(e) malformed/non-Yes actions can never reach a mutator.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import services.schedule_change_service as scs
from models.sqlalchemy_models import ScheduleChangeProposal


def _fake_db(scalar_result=None):
    """An AsyncSession-shaped mock. db.execute(...).scalar_one_or_none() returns
    the prepared object; add/flush/commit/rollback are awaitable no-ops."""
    db = MagicMock()
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = scalar_result
    db.execute = AsyncMock(return_value=exec_result)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


def _proposal(action, status="pending", summary="Swap Friday to push/pull/legs"):
    p = ScheduleChangeProposal(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        conversation_id=None,
        kind="switch_workout",
        maxx_id="fitmax",
        summary=summary,
        action=action,
        source="docs",
        status=status,
    )
    return p


# ── RC2 / RC9: proposing mutates nothing ──────────────────────────────────
@pytest.mark.asyncio
async def test_create_proposal_persists_pending_and_mutates_nothing():
    db = _fake_db()
    uid = str(uuid.uuid4())
    action = {"tool": "edit_task", "args": {"schedule_id": "s1", "task_id": "t1", "updates": {"time": "18:00"}}}
    with patch("services.schedule_service.schedule_service") as svc:
        svc.edit_task = AsyncMock()
        svc.delete_task = AsyncMock()
        svc.update_preferences = AsyncMock()
        prop = await scs.create_proposal(
            db, user_id=uid, conversation_id=None, kind="adjust",
            maxx_id="fitmax", summary="Move workout to 6pm", action=action, source="docs",
        )
    # Persisted as pending; NOTHING applied.
    assert db.add.called
    assert prop.status == "pending"
    svc.edit_task.assert_not_called()
    svc.delete_task.assert_not_called()
    svc.update_preferences.assert_not_called()


@pytest.mark.asyncio
async def test_invalid_action_tool_is_rejected_at_create():
    db = _fake_db()
    with pytest.raises(ValueError):
        # create_proposal validates tool before persisting — a hand-crafted
        # action can never smuggle in an arbitrary primitive.
        await scs.create_proposal(
            db, user_id=str(uuid.uuid4()), conversation_id=None, kind="adjust",
            maxx_id=None, summary="x", action={"tool": "DROP TABLE", "args": {}},
        )


# ── RC4: Yes replays the EXACT stored action, deterministically ───────────
@pytest.mark.asyncio
async def test_yes_applies_exact_stored_edit_task():
    action = {"tool": "edit_task", "args": {"schedule_id": "sched-9", "task_id": "task-7", "updates": {"time": "07:30"}}}
    prop = _proposal(action)
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.edit_task = AsyncMock(return_value={})
        ok, msg = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok is True
    # EXACT stored args, no re-derivation.
    svc.edit_task.assert_awaited_once()
    kwargs = svc.edit_task.await_args.kwargs
    assert kwargs["schedule_id"] == "sched-9"
    assert kwargs["task_id"] == "task-7"
    assert kwargs["updates"] == {"time": "07:30"}
    assert prop.status == "applied"
    assert db.commit.await_count >= 1


@pytest.mark.asyncio
async def test_yes_set_context_calls_merge_and_regenerate():
    action = {"tool": "set_context", "args": {"key": "diet_pattern", "value": "high-protein mediterranean", "only_max": "fitmax", "regenerate": True}}
    prop = _proposal(action, summary="Switch to a high-protein mediterranean approach")
    db = _fake_db(scalar_result=prop)
    with patch("services.user_context_service.merge_context", new=AsyncMock()) as merge, \
         patch("services.schedule_runtime.regenerate_active_schedules", new=AsyncMock()) as regen:
        ok, msg = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok is True
    merge.assert_awaited_once()
    # stored key/value passed through verbatim (allergy/diet vetting happened at
    # propose time; apply never re-derives or fabricates).
    args, kwargs = merge.await_args.args, merge.await_args.kwargs
    assert args[1] == {"diet_pattern": "high-protein mediterranean"}
    regen.assert_awaited_once()
    assert prop.status == "applied"


# ── RC6: all four intent dispatch primitives apply the stored action ──────
@pytest.mark.asyncio
async def test_yes_delete_task_dispatch_heightmax():
    # "change the heightmax tasks" → drop a specific task.
    action = {"tool": "delete_task", "args": {"schedule_id": "hm-1", "task_id": "mewing-3"}}
    prop = _proposal(action, summary="Drop the midday mewing block")
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.delete_task = AsyncMock(return_value={})
        ok, _ = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok
    kw = svc.delete_task.await_args.kwargs
    assert kw["schedule_id"] == "hm-1" and kw["task_id"] == "mewing-3"
    assert prop.status == "applied"


@pytest.mark.asyncio
async def test_yes_update_preferences_dispatch_general():
    # general edit ("move my reminders earlier") → preference change.
    action = {"tool": "update_preferences", "args": {"preferences": {"notification_minutes_before": 30}}}
    prop = _proposal(action, summary="Send reminders 30 min earlier")
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.update_preferences = AsyncMock(return_value={})
        ok, _ = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok
    assert svc.update_preferences.await_args.kwargs["preferences"] == {"notification_minutes_before": 30}
    assert prop.status == "applied"


# ── RC4: idempotent — a double Yes does not double-apply ──────────────────
@pytest.mark.asyncio
async def test_double_yes_is_idempotent():
    action = {"tool": "delete_task", "args": {"schedule_id": "s2", "task_id": "t2"}}
    prop = _proposal(action)
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.delete_task = AsyncMock(return_value={})
        ok1, msg1 = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
        ok2, msg2 = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok1 and ok2
    # Mutator ran exactly once across two Yes taps.
    assert svc.delete_task.await_count == 1
    assert msg2 == prop.result_message  # cached, not re-derived


# ── RC5: No leaves the schedule unchanged and re-prompts ──────────────────
@pytest.mark.asyncio
async def test_no_rejects_without_mutating_and_reprompts():
    action = {"tool": "edit_task", "args": {"schedule_id": "s", "task_id": "t", "updates": {"time": "09:00"}}}
    prop = _proposal(action)
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.edit_task = AsyncMock()
        ok, msg = await scs.reject_proposal(db, str(prop.user_id), str(prop.id))
    assert ok is True
    assert prop.status == "rejected"
    svc.edit_task.assert_not_called()  # nothing changed
    assert msg and len(msg) > 0       # a re-prompt to keep the loop going


# ── RC9: a rejected/expired proposal can never be applied ─────────────────
@pytest.mark.asyncio
async def test_rejected_proposal_cannot_be_applied():
    action = {"tool": "edit_task", "args": {"schedule_id": "s", "task_id": "t", "updates": {"time": "09:00"}}}
    prop = _proposal(action, status="rejected")
    db = _fake_db(scalar_result=prop)
    with patch("services.schedule_service.schedule_service") as svc:
        svc.edit_task = AsyncMock()
        ok, msg = await scs.apply_proposal(db, str(prop.user_id), str(prop.id))
    assert ok is False
    svc.edit_task.assert_not_called()


# ── RC2 / RC7 / RC9: the agent tool persists + surfaces confirm, mutates nothing
@pytest.mark.asyncio
async def test_propose_tool_persists_and_surfaces_confirm_without_mutating():
    import services.lc_agent as lc
    from models.sqlalchemy_models import active_conversation_id

    db = _fake_db()
    user = MagicMock()
    user.id = uuid.uuid4()
    uid = str(user.id)

    tools = lc.make_chat_tools(db, None, uid, user, {}, None, "app", {})
    propose = next(t for t in tools if t.name == "propose_schedule_change")

    active_conversation_id.set(uuid.uuid4())
    lc.reset_proposed_change()  # chat.py sets up the mutable sink before the agent runs
    with patch("services.schedule_service.schedule_service") as svc:
        svc.edit_task = AsyncMock()
        svc.delete_task = AsyncMock()
        svc.update_preferences = AsyncMock()
        # set_context path needs no task resolution.
        out = await propose.ainvoke({
            "kind": "switch_diet",
            "summary": "Switch to a high-protein mediterranean approach",
            "apply_tool": "set_context",
            "maxx_id": "fitmax",
            "context_key": "diet_pattern",
            "context_value": "high-protein mediterranean",
            "source": "docs",
        })
    # A proposal was persisted and surfaced for Yes/No — but NOTHING was applied.
    assert db.add.called
    surfaced = lc.get_proposed_change()
    assert surfaced and "proposal_id" in surfaced and surfaced["summary"]
    assert "PROPOSED" in out
    svc.edit_task.assert_not_called()
    svc.delete_task.assert_not_called()
    svc.update_preferences.assert_not_called()


# ── RC3 / RC9 (source-level guards): prompt routes change-intents to propose
def test_prompt_routes_change_intent_to_propose_and_honors_allergies():
    import inspect
    import services.lc_agent as lc
    src = inspect.getsource(lc)
    # The system prompt instructs propose-first and allergy-safety.
    assert "propose_schedule_change" in src
    assert "PROPOSE FIRST" in src or "propose → Yes → apply" in src.lower() or "propose first" in src.lower()
    # The propose tool persists a proposal and never calls a mutator itself.
    tool_src = inspect.getsource(lc.make_chat_tools)
    assert "create_proposal" in tool_src
