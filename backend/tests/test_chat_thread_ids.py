"""Thread-integrity invariants for the in-app chat send path (H2 / H3).

Every ChatHistory row an app turn writes must carry the conversation it was
written in — /history filters by conversation_id, so a NULL row is invisible in
EVERY thread (the live DB had 86 of the last 102 app rows NULL, a whole fitmax
intake among them). These tests drive `_send_message_locked` through each
non-agent branch with the heavy collaborators stubbed and assert the rows'
thread id, plus the per-thread pending-question scoping helpers.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import BackgroundTasks

from api import chat as chat_api
from models.leaderboard import ChatRequest
from models.sqlalchemy_models import ChatHistory, active_conversation_id
from services import chat_conversations_service as conv_svc


USER_ID = "11111111-1111-1111-1111-111111111111"


# --------------------------------------------------------------------------- #
#  Minimal async DB stub: records adds + commits; every query is empty.       #
# --------------------------------------------------------------------------- #

class _Result:
    def scalars(self):
        return self

    def all(self):
        return []

    def scalar_one_or_none(self):
        return None


class _FakeDB:
    def __init__(self):
        self.added: list = []
        self.commits = 0
        self.rollbacks = 0

    def add(self, obj):
        self.added.append(obj)

    async def execute(self, _stmt, *_a, **_k):
        return _Result()

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    async def get(self, _model, _pk):
        return None


def _conv(conv_id=None, archived=False):
    return SimpleNamespace(id=conv_id or uuid4(), is_archived=archived, title="Fitmax plan")


@pytest.fixture
def clean_contextvar():
    token = active_conversation_id.set(None)
    try:
        yield
    finally:
        active_conversation_id.reset(token)


@pytest.fixture
def stubbed_turn(monkeypatch):
    """Stub everything around the branch dispatch so a turn runs in-process.

    Returns a dict the test mutates to pick the branch that answers.
    """
    conv = _conv()
    calls = {"resolve": [], "touch": []}

    async def _resolve(db, *, user_id, conversation_id, channel="app"):
        calls["resolve"].append(conversation_id)
        return conv

    async def _touch(db, *, conversation_id, first_user_message=None, commit=True):
        calls["touch"].append(conversation_id)

    async def _release(_db):
        return None

    async def _no_facts(_msg):
        return {}

    async def _no_sched(_uid, _db):
        return set()

    async def _no_picker(*_a, **_k):
        return None

    branch = {"ctx": None, "questioner": None, "mcq": None, "generic": None, "agent": None}

    async def _ctx(**_k):
        return branch["ctx"]

    async def _questioner(**_k):
        return branch["questioner"]

    async def _mcq(**_k):
        return branch["mcq"]

    async def _generic(**_k):
        return branch["generic"]

    async def _agent(**kw):
        # Mimic process_chat_message: rows constructed WITHOUT an explicit
        # conversation_id — they must inherit the contextvar pinned up front.
        db = kw["db"]
        uid = UUID(kw["user_id"])
        db.add(ChatHistory(user_id=uid, role="user", content=kw["message_text"], channel="app"))
        db.add(ChatHistory(user_id=uid, role="assistant", content="agent says hi", channel="app"))
        branch["agent_seen_conversation_id"] = kw.get("conversation_id")
        return "agent says hi", []

    monkeypatch.setattr(conv_svc, "resolve_active_conversation", _resolve)
    monkeypatch.setattr(conv_svc, "touch_last_message", _touch)
    monkeypatch.setattr(chat_api, "release_conn", _release)
    monkeypatch.setattr("services.user_facts_service.extract_facts_from_message", lambda _m: {})
    monkeypatch.setattr(chat_api, "_active_schedule_ids", _no_sched)
    monkeypatch.setattr(chat_api, "_habit_picker_for_new_schedule", _no_picker)
    monkeypatch.setattr(chat_api, "_handle_context_change", _ctx)
    monkeypatch.setattr(chat_api, "_run_onboarding_questioner", _questioner)
    monkeypatch.setattr(chat_api, "_broad_question_mcq", _mcq)
    monkeypatch.setattr(chat_api, "_handle_generic_schedule_modification", _generic)
    monkeypatch.setattr(chat_api, "process_chat_message", _agent)
    return {"conv": conv, "calls": calls, "branch": branch}


async def _send(message="Basics, protein and creatine", conversation_id=None):
    db = _FakeDB()
    data = ChatRequest(message=message, conversation_id=conversation_id)
    resp = await chat_api._send_message_locked(
        data, BackgroundTasks(), {"id": USER_ID}, db, None,
    )
    return db, resp


def _rows(db):
    return [r for r in db.added if isinstance(r, ChatHistory)]


# --------------------------------------------------------------------------- #
#  H2: every branch persists its rows under the resolved thread               #
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_context_change_branch_rows_carry_thread_id(clean_contextvar, stubbed_turn):
    stubbed_turn["branch"]["ctx"] = ("done, moved your wake time", [], None)
    db, resp = await _send("i wake up at 7 now")
    rows = _rows(db)
    assert [r.role for r in rows] == ["user", "assistant"]
    assert all(r.conversation_id == stubbed_turn["conv"].id for r in rows)
    assert resp.conversation_id == str(stubbed_turn["conv"].id)
    # Recency bump happens for the non-agent branch too (thread sorts to top).
    assert stubbed_turn["calls"]["touch"] == [str(stubbed_turn["conv"].id)]


@pytest.mark.asyncio
async def test_questioner_intake_answer_rows_carry_thread_id(clean_contextvar, stubbed_turn):
    stubbed_turn["branch"]["questioner"] = (
        "got it. how do you feel about supplements?", ["Basics", "None"], None, False, None,
    )
    db, resp = await _send("I eat everything")
    rows = _rows(db)
    assert len(rows) == 2
    assert all(r.conversation_id == stubbed_turn["conv"].id for r in rows)
    assert resp.conversation_id == str(stubbed_turn["conv"].id)
    assert resp.choices == ["Basics", "None"]


@pytest.mark.asyncio
async def test_broad_mcq_branch_rows_carry_thread_id(clean_contextvar, stubbed_turn):
    stubbed_turn["branch"]["mcq"] = ("which do you mean?", ["a", "b"], False)
    db, resp = await _send("how do i get better skin")
    rows = _rows(db)
    assert len(rows) == 2
    assert all(r.conversation_id == stubbed_turn["conv"].id for r in rows)
    assert resp.conversation_id == str(stubbed_turn["conv"].id)


@pytest.mark.asyncio
async def test_generic_modification_branch_rows_carry_thread_id(clean_contextvar, stubbed_turn):
    stubbed_turn["branch"]["generic"] = ("skipping gym on tuesdays", [], None)
    db, resp = await _send("skip gym tuesdays")
    rows = _rows(db)
    assert len(rows) == 2
    assert all(r.conversation_id == stubbed_turn["conv"].id for r in rows)
    assert resp.conversation_id == str(stubbed_turn["conv"].id)


@pytest.mark.asyncio
async def test_agent_path_inherits_pinned_thread_and_same_id_is_passed_down(clean_contextvar, stubbed_turn):
    db, resp = await _send("tell me about creatine")
    rows = _rows(db)
    assert len(rows) == 2
    assert all(r.conversation_id == stubbed_turn["conv"].id for r in rows)
    # data.conversation_id was mirrored so process_chat_message resolves the SAME thread.
    assert stubbed_turn["branch"]["agent_seen_conversation_id"] == str(stubbed_turn["conv"].id)
    assert resp.conversation_id == str(stubbed_turn["conv"].id)


@pytest.mark.asyncio
async def test_explicit_conversation_id_is_offered_to_the_resolver(clean_contextvar, stubbed_turn):
    stubbed_turn["branch"]["ctx"] = ("ok", [], None)
    requested = str(uuid4())
    await _send("i sleep at 11", conversation_id=requested)
    assert stubbed_turn["calls"]["resolve"][0] == requested


@pytest.mark.asyncio
async def test_persist_turn_passes_explicit_thread_and_rolls_back_on_failure(clean_contextvar):
    conv_id = uuid4()
    db = _FakeDB()
    await chat_api._persist_turn(
        db, user_id=USER_ID, user_message="hi", assistant_text="hello", conversation_id=conv_id,
    )
    rows = _rows(db)
    assert [r.conversation_id for r in rows] == [conv_id, conv_id]
    assert db.commits == 1

    class _Boom(_FakeDB):
        async def commit(self):
            raise RuntimeError("db down")

    boom = _Boom()
    await chat_api._persist_turn(
        db=boom, user_id=USER_ID, user_message="hi", assistant_text="hello", conversation_id=conv_id,
    )
    assert boom.rollbacks == 1  # never raises into the turn


# --------------------------------------------------------------------------- #
#  H3: the pending intake is scoped to ONE thread                             #
# --------------------------------------------------------------------------- #

def test_stamp_pending_thread_tags_the_pinned_thread(clean_contextvar):
    from services.onboarding_questioner import get_pending, make_pending, PENDING_KEY

    pending = make_pending("fitmax", "supplements")
    # No thread pinned → unchanged (legacy per-user scope, SMS/tests).
    assert chat_api._stamp_pending_thread(pending) == pending
    assert chat_api._stamp_pending_thread(None) is None

    conv_id = uuid4()
    token = active_conversation_id.set(conv_id)
    try:
        stamped = chat_api._stamp_pending_thread(pending)
    finally:
        active_conversation_id.reset(token)
    assert stamped["conversation_id"] == str(conv_id)
    assert stamped["max"] == "fitmax" and stamped["last_question"] == "supplements"
    assert "conversation_id" not in pending  # pure: input untouched
    # The questioner's reader still accepts the stamped shape.
    assert get_pending({PENDING_KEY: stamped})["conversation_id"] == str(conv_id)


@pytest.mark.asyncio
async def test_pending_thread_scope(monkeypatch, clean_contextvar):
    here = uuid4()
    other = _conv()
    lookups = {}

    async def _get(db, *, conversation_id, user_id):
        lookups["asked"] = conversation_id
        return lookups.get("answer")

    monkeypatch.setattr(conv_svc, "get_conversation", _get)
    db = _FakeDB()

    # Unstamped state: legacy.
    scope, conv = await chat_api._pending_thread_scope({"max": "hairmax", "last_question": "q"}, USER_ID, db)
    assert (scope, conv) == ("unstamped", None)

    token = active_conversation_id.set(here)
    try:
        scope, _ = await chat_api._pending_thread_scope(
            {"max": "hairmax", "last_question": "q", "conversation_id": str(here)}, USER_ID, db
        )
        assert scope == "match"

        lookups["answer"] = other
        scope, conv = await chat_api._pending_thread_scope(
            {"max": "hairmax", "last_question": "q", "conversation_id": str(other.id)}, USER_ID, db
        )
        assert scope == "other" and conv is other
        assert lookups["asked"] == str(other.id)

        lookups["answer"] = None  # thread deleted
        scope, conv = await chat_api._pending_thread_scope(
            {"max": "hairmax", "last_question": "q", "conversation_id": str(uuid4())}, USER_ID, db
        )
        assert (scope, conv) == ("orphan", None)

        lookups["answer"] = _conv(archived=True)
        scope, _ = await chat_api._pending_thread_scope(
            {"max": "hairmax", "last_question": "q", "conversation_id": str(uuid4())}, USER_ID, db
        )
        assert scope == "orphan"
    finally:
        active_conversation_id.reset(token)


def test_pending_belongs_to_thread_rules():
    hair = str(uuid4())
    fit = str(uuid4())
    recent = str(uuid4())
    stamped = {"max": "hairmax", "last_question": "q", "conversation_id": hair}

    # Stamped + alive: ONLY its own thread.
    assert chat_api._pending_belongs_to_thread(
        stamped, target_id=hair, stamped_alive=True, maxx_thread_id=None, most_recent_id=recent)
    assert not chat_api._pending_belongs_to_thread(
        stamped, target_id=fit, stamped_alive=True, maxx_thread_id=None, most_recent_id=recent)

    # Orphaned stamp → anchored to the max's plan thread, else most-recent.
    assert chat_api._pending_belongs_to_thread(
        stamped, target_id=fit, stamped_alive=False, maxx_thread_id=fit, most_recent_id=recent)
    assert not chat_api._pending_belongs_to_thread(
        stamped, target_id=recent, stamped_alive=False, maxx_thread_id=fit, most_recent_id=recent)
    assert chat_api._pending_belongs_to_thread(
        stamped, target_id=recent, stamped_alive=False, maxx_thread_id=None, most_recent_id=recent)

    # Unstamped (pre-fix state): same anchoring, never every thread.
    legacy = {"max": "hairmax", "last_question": "q"}
    assert chat_api._pending_belongs_to_thread(
        legacy, target_id=hair, stamped_alive=None, maxx_thread_id=hair, most_recent_id=recent)
    assert not chat_api._pending_belongs_to_thread(
        legacy, target_id=fit, stamped_alive=None, maxx_thread_id=hair, most_recent_id=recent)
    # Nothing to anchor to at all → legacy behaviour (attach).
    assert chat_api._pending_belongs_to_thread(
        legacy, target_id=fit, stamped_alive=None, maxx_thread_id=None, most_recent_id=None)
    assert chat_api._pending_belongs_to_thread(
        legacy, target_id=None, stamped_alive=None, maxx_thread_id=None, most_recent_id=None)


# --------------------------------------------------------------------------- #
#  Backfill report heuristic (scripts/backfill_chat_conversation_ids.py)      #
# --------------------------------------------------------------------------- #

def test_backfill_assignment_heuristic_is_temporal_and_never_writes():
    from datetime import datetime, timedelta, timezone
    from scripts.backfill_chat_conversation_ids import NullRow, ThreadRow, assign_rows

    t0 = datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc)
    general = ThreadRow("general", "new chat", t0 - timedelta(days=3), False)
    fit = ThreadRow("fit", "Fitmax plan", t0, False)
    threads = [general, fit]
    # Threaded rows: chit-chat in the general thread days ago, then the fitmax
    # opener (agent path → threaded) at t0.
    marks = [(t0 - timedelta(days=3), "general"), (t0, "fit")]
    null_rows = [
        NullRow("r1", "u", "assistant", "let's get your fitmax schedule going. how old are you?", t0 + timedelta(seconds=2)),
        NullRow("r2", "u", "user", "8", t0 + timedelta(seconds=40)),
        NullRow("r0", "u", "user", "i wake up at 7 now", t0 - timedelta(days=1)),
    ]
    out = assign_rows(null_rows, threads, marks)
    assert [(a.row.id, a.thread_id) for a in out] == [("r0", "general"), ("r1", "fit"), ("r2", "fit")]
    assert all(a.reason == "active thread at write time" for a in out)

    # No threaded row before it: earliest thread existing at that time.
    early = [NullRow("e", "u", "user", "hi", t0 - timedelta(days=2))]
    out = assign_rows(early, threads, [(t0, "fit")])
    assert out[0].thread_id == "general" and "earliest thread existing" in out[0].reason
    # Thread created only later: still the user's earliest thread.
    out = assign_rows(early, [fit], [])
    assert out[0].thread_id == "fit" and "created later" in out[0].reason
    # No conversation at all: reported, not invented.
    out = assign_rows(early, [], [])
    assert out[0].thread_id is None and out[0].reason.startswith("UNASSIGNABLE")


def test_backfill_script_refuses_apply_flags(capsys):
    from scripts.backfill_chat_conversation_ids import main

    assert main(["--apply"]) == 2
    assert "dry-run only" in capsys.readouterr().err
