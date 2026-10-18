"""BETA1 C7 / F43 / item 7 — progress before doing anything, and a cheap
/schedules/active/full.

* "First Steps" is earned on the first completed task (not on starting a plan).
* Day 1 is the first plan's start date, not account creation.
* The badge evaluation on the day-state endpoint is memoized per fingerprint
  so a refetch that changed nothing does no badge work — without ever
  swallowing a celebration.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import services.achievements as ach
import services.schedule_streak as ss


# --- catalog copy -------------------------------------------------------------

def test_first_steps_needs_a_completed_task():
    a = ach.CATALOG_BY_CODE["first_routine"]
    base = {"streak": 0, "armed_freezes": 0, "fresh_start_today": False, "perfect_day": False,
            "active_count": 1, "tasks_completed": 0, "facts": 0}
    assert not a.check(base)
    assert a.check({**base, "tasks_completed": 1})
    assert "task" in a.description.lower()


def test_no_user_facing_maxxes_spelling_in_the_catalog():
    for a in ach.CATALOG:
        assert "maxxes" not in a.title.lower() and "maxxes" not in a.description.lower(), a.code


# --- journey anchor -------------------------------------------------------------

def _user(created: datetime | None = datetime(2026, 1, 1, tzinfo=timezone.utc)):
    return SimpleNamespace(id="u1", created_at=created, onboarding={"timezone": "UTC"}, profile={})


def test_journey_prefers_the_first_plan_over_a_legacy_anchor():
    today = date(2026, 10, 18)
    prof = {ss.JOURNEY_START_KEY: "2026-01-01"}  # written from account creation
    assert ss._journey_start(_user(), prof, {}, today, date(2026, 10, 10)) == date(2026, 10, 10)


def test_journey_falls_back_to_account_creation_without_a_plan():
    today = date(2026, 10, 18)
    assert ss._journey_start(_user(), {}, {}, today, None) == date(2026, 1, 1)
    assert ss._journey_start(_user(created=None), {}, {}, today, None) == today


def test_journey_anchored_to_a_plan_never_moves():
    today = date(2026, 10, 18)
    prof = {ss.JOURNEY_START_KEY: "2026-10-10", ss.JOURNEY_SOURCE_KEY: ss.JOURNEY_SOURCE_FIRST_PLAN}
    assert ss._journey_start(_user(), prof, {}, today, date(2026, 10, 15)) == date(2026, 10, 10)


def test_apply_streak_rules_persists_the_plan_anchor_once():
    today = date(2026, 10, 18)
    prof: dict = {ss.JOURNEY_START_KEY: "2026-01-01"}
    changed, start = ss._apply_streak_rules(prof, [], today, _user(), {}, date(2026, 10, 16))
    assert changed and start == date(2026, 10, 16)
    assert prof[ss.JOURNEY_START_KEY] == "2026-10-16"
    assert prof[ss.JOURNEY_SOURCE_KEY] == ss.JOURNEY_SOURCE_FIRST_PLAN
    # Second pass: nothing left to write (the endpoint stays write-free).
    changed2, start2 = ss._apply_streak_rules(prof, [], today, _user(), {}, None)
    assert not changed2 and start2 == date(2026, 10, 16)


# --- the evaluation memo ----------------------------------------------------------

class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _CountingDB:
    """Just enough session for evaluate's no-award path: the earned-badges read."""

    def __init__(self, rows=None):
        self.rows = rows or []
        self.executes = 0

    async def execute(self, *a, **k):
        self.executes += 1
        return _Rows(self.rows)


def _streak(today="2026-10-18", **kw):
    return {"current": 0, "armed_freezes": 0, "fresh_start_today": False,
            "last_perfect_date": None, "today_date": today, **kw}


def _plan(status="pending", sid="s1", today="2026-10-18"):
    return [{"id": sid, "maxx_id": "sleepmax", "days": [{"date": today, "tasks": [{"task_id": "t1", "status": status}]}]}]


@pytest.fixture(autouse=True)
def _clean_memo():
    ach._eval_memo.clear()
    yield
    ach._eval_memo.clear()


@pytest.mark.asyncio
async def test_unchanged_day_state_skips_the_badge_work(monkeypatch):
    stats = AsyncMock(side_effect=ach.compute_stats)
    monkeypatch.setattr(ach, "compute_stats", stats)
    monkeypatch.setattr(ach, "_fact_count", AsyncMock(return_value=0))
    db, user = _CountingDB(), SimpleNamespace(id="u-memo")

    assert await ach.evaluate(db, user, streak=_streak(), schedules=_plan()) == []
    assert (db.executes, stats.await_count) == (1, 1)
    # Chat force-refetches /active/full after every turn: same inputs → no DB.
    for _ in range(3):
        assert await ach.evaluate(db, user, streak=_streak(), schedules=_plan()) == []
    assert (db.executes, stats.await_count) == (1, 1)


@pytest.mark.asyncio
async def test_any_relevant_change_forces_a_full_evaluation(monkeypatch):
    stats = AsyncMock(side_effect=ach.compute_stats)
    monkeypatch.setattr(ach, "compute_stats", stats)
    monkeypatch.setattr(ach, "_fact_count", AsyncMock(return_value=0))
    db, user = _CountingDB(), SimpleNamespace(id="u-change")
    await ach.evaluate(db, user, streak=_streak(), schedules=_plan())
    # a new day
    await ach.evaluate(db, user, streak=_streak(today="2026-10-19"), schedules=_plan(today="2026-10-19"))
    # a second plan
    await ach.evaluate(db, user, streak=_streak(today="2026-10-19"),
                       schedules=_plan(today="2026-10-19") + _plan(sid="s2", today="2026-10-19"))
    # a streak change
    await ach.evaluate(db, user, streak=_streak(today="2026-10-19", current=3),
                       schedules=_plan(today="2026-10-19") + _plan(sid="s2", today="2026-10-19"))
    assert stats.await_count == 4


@pytest.mark.asyncio
async def test_unseen_badges_are_never_memoized_away(monkeypatch):
    # An earned-but-unseen badge must come back on every call until marked seen.
    monkeypatch.setattr(ach, "_fact_count", AsyncMock(return_value=0))
    db = _CountingDB(rows=[("first_routine", False)])
    user = SimpleNamespace(id="u-unseen")
    for _ in range(3):
        out = await ach.evaluate(db, user, streak=_streak(), schedules=_plan("completed"))
        assert [a["code"] for a in out] == ["first_routine"]
    assert db.executes == 3


@pytest.mark.asyncio
async def test_memo_expires(monkeypatch):
    monkeypatch.setattr(ach, "_fact_count", AsyncMock(return_value=0))
    db, user = _CountingDB(), SimpleNamespace(id="u-ttl")
    await ach.evaluate(db, user, streak=_streak(), schedules=_plan())
    fp, ts = ach._eval_memo["u-ttl"]
    ach._eval_memo["u-ttl"] = (fp, ts - ach._EVAL_MEMO_TTL_S - 1)
    await ach.evaluate(db, user, streak=_streak(), schedules=_plan())
    assert db.executes == 2


# --- calendar sync reports whether anything changed -------------------------------

def test_events_fingerprint_is_order_free_and_sees_free_events():
    import services.google_integration as gi

    a = {"external_event_id": "a", "starts_at": "s1", "ends_at": "e1", "all_day": False, "is_busy": True, "title": "Standup"}
    b = {"external_event_id": "b", "starts_at": "s2", "ends_at": "e2", "all_day": False, "is_busy": False, "title": "Lunch"}
    assert gi.events_fingerprint([a, b]) == gi.events_fingerprint([b, a])
    assert gi.events_fingerprint([a, b]) != gi.events_fingerprint([a, {**b, "title": "Lunch w/ Sam"}])
    assert gi.events_fingerprint([a]) != gi.events_fingerprint([a, b])


class _SyncDB:
    def __init__(self, user):
        self.user, self.commits = user, 0

    async def get(self, *a, **k):
        return self.user

    async def execute(self, *a, **k):  # the profile lock path: unavailable here
        raise RuntimeError("no lock on a fake session")

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_drift_check_reports_no_change_for_an_unchanged_calendar():
    import services.google_integration as gi
    from services.calendar_busy import busy_fingerprint

    rows = [{"external_event_id": "a", "starts_at": datetime(2026, 10, 20, 9, tzinfo=timezone.utc),
             "ends_at": datetime(2026, 10, 20, 10, tzinfo=timezone.utc), "status": "confirmed",
             "is_busy": True, "all_day": False, "title": "Standup", "raw": {}}]
    efp = gi.events_fingerprint(rows)
    user = SimpleNamespace(id="u-cal", profile={"gcal_busy_fp": busy_fingerprint(rows), "gcal_events_fp": efp})
    db = _SyncDB(user)
    assert await gi._maybe_regen_on_calendar_drift("u-cal", rows, db, events_fp=efp) == {"changed": False, "replanned": False}
    # A free event renamed: busy time is the same (no reflow) but there is something new to show.
    out = await gi._maybe_regen_on_calendar_drift("u-cal", rows, db, events_fp="different")
    assert out == {"changed": True, "replanned": False}
    assert user.profile["gcal_events_fp"] == "different"
