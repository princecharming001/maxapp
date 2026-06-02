"""Durable removal of a recurring routine part (#50).

The plain-language routine review lets a user prune a part they don't want.
Removing it must (a) clear EVERY day's occurrence, not just the one they
tapped, and (b) stick — a later re-expansion must not resurrect it. These
lock in the series-delete + excluded_catalog_ids behavior and guard the
default instance-delete path so existing single-occurrence deletes are
unchanged.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import services.schedule_service as sched_mod
from services.schedule_service import schedule_service
from services.schedule_runtime import _drop_excluded_tasks


def _days():
    # "spf" recurs on both days (its own task_id per day); "exfoliate" is a
    # single one-off. Mirrors the real per-day task_id-per-instance shape.
    return [
        {"day_index": 0, "date": "2026-06-01", "tasks": [
            {"task_id": "t-spf-0", "catalog_id": "spf", "title": "SPF", "status": "pending"},
            {"task_id": "t-exf-0", "catalog_id": "exfoliate", "title": "Exfoliate", "status": "pending"},
        ]},
        {"day_index": 1, "date": "2026-06-02", "tasks": [
            {"task_id": "t-spf-1", "catalog_id": "spf", "title": "SPF", "status": "completed"},
        ]},
    ]


class _FakeDB:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True


def _areturn(value):
    async def _f(*a, **k):
        return value
    return _f


@pytest.fixture(autouse=True)
def _no_flag_modified(monkeypatch):
    # flag_modified expects a real ORM-mapped instance; the fake schedule here
    # is a SimpleNamespace, so make it a no-op for these unit tests.
    monkeypatch.setattr(sched_mod, "flag_modified", lambda *a, **k: None)


@pytest.mark.asyncio
async def test_series_delete_removes_all_occurrences_and_excludes(monkeypatch):
    sched = SimpleNamespace(days=_days(), schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    db = _FakeDB()

    res = await schedule_service.delete_task(
        user_id="u1", schedule_id="s1", task_id="t-spf-0", db=db, scope="series",
    )

    remaining = [t["catalog_id"] for d in sched.days for t in d["tasks"]]
    assert "spf" not in remaining          # every SPF instance gone
    assert remaining == ["exfoliate"]      # the one-off is untouched
    assert res["scope"] == "series"
    assert res["removed_count"] == 2
    assert res["catalog_id"] == "spf"
    # Durable exclusion persisted so regen won't re-add it.
    assert sched.schedule_context["excluded_catalog_ids"] == ["spf"]
    assert db.committed is True


@pytest.mark.asyncio
async def test_instance_delete_only_removes_one_and_no_exclusion(monkeypatch):
    sched = SimpleNamespace(days=_days(), schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    db = _FakeDB()

    res = await schedule_service.delete_task(
        user_id="u1", schedule_id="s1", task_id="t-spf-0", db=db,  # default scope
    )

    day0 = [t["task_id"] for t in sched.days[0]["tasks"]]
    day1 = [t["task_id"] for t in sched.days[1]["tasks"]]
    assert "t-spf-0" not in day0   # only the tapped occurrence
    assert "t-spf-1" in day1       # the other day's copy survives
    assert res["scope"] == "instance"
    assert res["removed_count"] == 1
    assert "excluded_catalog_ids" not in (sched.schedule_context or {})


@pytest.mark.asyncio
async def test_series_delete_without_catalog_id_falls_back_to_instance(monkeypatch):
    days = [
        {"day_index": 0, "date": "2026-06-01", "tasks": [
            {"task_id": "one-off", "title": "Custom thing", "status": "pending"},
        ]},
    ]
    sched = SimpleNamespace(days=days, schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    db = _FakeDB()

    res = await schedule_service.delete_task(
        user_id="u1", schedule_id="s1", task_id="one-off", db=db, scope="series",
    )

    assert res["scope"] == "instance"  # no catalog_id → can't form a series
    assert sched.days[0]["tasks"] == []
    assert "excluded_catalog_ids" not in (sched.schedule_context or {})


def test_drop_excluded_tasks_is_the_regen_guarantee():
    days = _days()
    out = _drop_excluded_tasks(days, {"spf"})
    remaining = [t["catalog_id"] for d in out for t in d["tasks"]]
    assert "spf" not in remaining
    assert remaining == ["exfoliate"]
    # Input not mutated (shallow-copy contract).
    assert any(t["catalog_id"] == "spf" for d in days for t in d["tasks"])


def test_drop_excluded_tasks_noop_when_empty():
    days = _days()
    assert _drop_excluded_tasks(days, set()) is days
