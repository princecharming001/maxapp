"""db.best_effort — the onboarding-completion durability guarantee.

Regression for the live-observed bug: a best-effort side-effect (schedule regen,
context sync) raised a DB error, which aborted the shared transaction, so the
request's final commit SILENTLY rolled back the critical `completed: true` write
and stranded the user mid-onboarding. best_effort must isolate each side-effect
so a failure can neither undo an already-committed write nor poison the next step.
"""
from __future__ import annotations

import asyncio

from db.tx import best_effort


class FakeTxSession:
    """Models commit/rollback against staged vs durable state so a test can prove
    a committed write survives a later best-effort failure. commit() promotes
    staged→durable; rollback() discards ONLY the uncommitted staged work."""

    def __init__(self):
        self.durable: dict = {}
        self.staged: dict = {}
        self.commits = 0
        self.rollbacks = 0

    def stage(self, key, value):
        self.staged[key] = value

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1
        self.durable.update(self.staged)
        self.staged.clear()

    async def rollback(self):
        self.rollbacks += 1
        self.staged.clear()


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_committed_write_survives_a_failing_side_effect():
    db = FakeTxSession()
    # The handler now commits the critical onboarding write FIRST.
    db.stage("completed", True)
    _run(db.commit())
    assert db.durable["completed"] is True

    # A best-effort step that stages junk then raises a DB error (e.g. a missing
    # table poisoning the transaction) — exactly what happened live.
    async def failing_side_effect():
        db.stage("junk", 1)
        raise RuntimeError('relation "user_schedule_context" does not exist')

    ok = _run(best_effort(db, "regen", failing_side_effect))

    assert ok is False                       # reported as failed
    assert db.rollbacks == 1                 # its own work was rolled back
    assert "junk" not in db.durable          # partial work discarded
    assert db.durable["completed"] is True   # CRITICAL: onboarding save survives


def test_successful_side_effect_commits():
    db = FakeTxSession()

    async def ok_step():
        db.stage("ctx", "x")

    ok = _run(best_effort(db, "sync", ok_step))
    assert ok is True
    assert db.commits == 1
    assert db.durable["ctx"] == "x"


def test_never_raises_on_failure():
    db = FakeTxSession()

    async def boom():
        raise ValueError("boom")

    # Must swallow the error (best-effort contract) rather than 500 the request.
    assert _run(best_effort(db, "x", boom)) is False


def test_one_failure_does_not_poison_the_next_step():
    """The 3-side-effect onboarding path: an early failure must not block a later
    step from committing (before the fix, the aborted txn poisoned everything)."""
    db = FakeTxSession()
    db.stage("completed", True)
    _run(db.commit())

    async def failing():
        raise RuntimeError("current transaction is aborted")

    async def succeeding():
        db.stage("ctx", "y")

    _run(best_effort(db, "regen", failing))
    ok = _run(best_effort(db, "personalization", succeeding))

    assert ok is True
    assert db.durable["ctx"] == "y"          # next step ran clean
    assert db.durable["completed"] is True   # critical write still intact
