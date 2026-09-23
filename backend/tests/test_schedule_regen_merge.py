"""Schedule regeneration merge: date-aligned + history-preserving (P0 H1),
per-instance overrides (H9), horizon no-op guard (H12).

The bug: regenerate_active_schedules re-anchors the fresh expansion so its
day 0 == today, then merged completion state POSITIONALLY (old[i] <-> new[i]).
Every regen on day D0+k therefore shifted the user's completions k days into
the future (pre-checked tomorrows), un-ticked the tasks they really did today,
and dropped every past day from the row. The live DB carried tasks with
status="completed" on dates that had not happened yet.

Covered (DB-free, LLM-free; the end-to-end case runs the real skinmax
skeleton through regenerate_active_schedules against a fake session):
  - generate on D0, complete D0..D0+k, regenerate on D0+k -> no 'completed'
    after today, history retained verbatim, today's real completions kept by
    (date, catalog_id), task ids stable for matched occurrences.
  - a done-but-no-longer-scheduled task on TODAY is kept; pending ones drop.
  - identity / notification markers / timestamps carry; skeleton fields win.
  - undated (legacy) input keeps the positional behavior.
  - _days_differ sees a pure re-anchor as a change (horizon can't no-op).
  - instance edit/delete recorded at edit time, re-applied after expansion,
    superseded by a series edit, pruned once the date is in the past.
  - ensure_plan_horizon reports still_short when the regen did not extend.

Run: pytest backend/tests/test_schedule_regen_merge.py -q
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import services.schedule_service as sched_mod
from services.schedule_runtime import (
    INSTANCE_OVERRIDES_KEY,
    _apply_instance_overrides,
    _days_differ,
    _merge_positional,
    _merge_preserving_status,
    _prune_instance_overrides,
    _split_days_by_date,
    instance_override_key,
)
from services.schedule_service import schedule_service


D0 = date(2026, 9, 1)


def _task(cid: str, time: str, tid: str, **extra) -> dict:
    return {"task_id": tid, "catalog_id": cid, "title": cid, "time": time, "status": "pending", **extra}


def _expand(anchor: date, n: int = 14, prefix: str = "n") -> list[dict]:
    """A deterministic stand-in for expand_skeleton + date stamping: two daily
    parts plus an every-other-day one, fresh task ids per instance."""
    days: list[dict] = []
    for i in range(n):
        d = anchor + timedelta(days=i)
        tasks = [
            _task("skin.am", "07:00", f"{prefix}-am-{d}"),
            _task("skin.pm", "21:00", f"{prefix}-pm-{d}"),
        ]
        if i % 2 == 0:
            tasks.append(_task("skin.exfoliate", "20:30", f"{prefix}-exf-{d}"))
        days.append({"day_index": i, "date": d.isoformat(), "tasks": tasks})
    return days


def _complete_through(days: list[dict], last: date) -> None:
    for d in days:
        if date.fromisoformat(d["date"]) <= last:
            for t in d["tasks"]:
                t["status"] = "completed"
                t["completed_at"] = f"{d['date']}T08:00:00"


def _by_date(days: list[dict]) -> dict[str, dict]:
    return {d["date"]: d for d in days}


def _completed_dates(days: list[dict]) -> set[str]:
    return {d["date"] for d in days for t in d["tasks"] if t.get("status") == "completed"}


# --- P0: no future completions, history retained ------------------------------


def test_regen_on_day_k_keeps_history_and_never_completes_the_future():
    k = 3
    today = D0 + timedelta(days=k)
    old = _expand(D0, prefix="o")
    _complete_through(old, today)            # user did D0..D0+3 (incl. today)
    new = _expand(today, prefix="n")          # regen re-anchored on today

    merged = _merge_preserving_status(old_days=old, new_days=new, today=today)

    # No completion may land after today.
    assert all(d <= today.isoformat() for d in _completed_dates(merged)), (
        "completions shifted into the future"
    )
    # Every past day is history, kept verbatim and first.
    assert merged[:k] == old[:k]
    assert len(merged) == k + len(new)
    # Today: what the user did stays done, on the SAME task ids the client holds.
    t_today = _by_date(merged)[today.isoformat()]["tasks"]
    # Old today (index 3, odd) had am+pm only; the new expansion (index 0,
    # even) adds exfoliate — new to the day, so it starts pending.
    assert {t["catalog_id"]: t["status"] for t in t_today} == {
        "skin.am": "completed", "skin.pm": "completed", "skin.exfoliate": "pending",
    }
    am_today = next(t for t in t_today if t["catalog_id"] == "skin.am")
    assert am_today["task_id"] == f"o-am-{today}"
    assert am_today["completed_at"] == f"{today}T08:00:00"
    # Tomorrow onwards: all pending. An occurrence that already existed on
    # that date keeps the id the client holds; one new to the date is fresh.
    old_pairs = {(d["date"], t["catalog_id"]) for d in old for t in d["tasks"]}
    for d in merged[k + 1:]:
        assert all(t["status"] == "pending" for t in d["tasks"])
        assert all("completed_at" not in t for t in d["tasks"])
        for t in d["tasks"]:
            want = "o-" if (d["date"], t["catalog_id"]) in old_pairs else "n-"
            assert t["task_id"].startswith(want), (d["date"], t["catalog_id"], t["task_id"])


def test_positional_merge_is_the_bug_this_replaces():
    """Documents the failure the date-aligned merge fixes: positionally,
    the k completed days slide onto today..today+k-1."""
    k = 3
    today = D0 + timedelta(days=k)
    old = _expand(D0, prefix="o")
    _complete_through(old, today - timedelta(days=1))
    new = _expand(today, prefix="n")
    positional = _merge_positional(old_days=old, new_days=new)
    assert _completed_dates(positional) & {(today + timedelta(days=1)).isoformat()}, (
        "positional merge should demonstrate the shift (test fixture sanity)"
    )
    aligned = _merge_preserving_status(old_days=old, new_days=new, today=today)
    assert max(_completed_dates(aligned)) < today.isoformat()


def test_whole_old_window_in_the_past_is_kept_as_history():
    today = D0 + timedelta(days=20)
    old = _expand(D0, prefix="o")
    _complete_through(old, D0 + timedelta(days=13))
    new = _expand(today, prefix="n")
    merged = _merge_preserving_status(old_days=old, new_days=new, today=today)
    assert merged[:14] == old
    assert merged[14:] == new
    assert all(t["status"] == "pending" for d in merged[14:] for t in d["tasks"])


def test_today_done_task_no_longer_in_skeleton_is_kept_pending_one_drops():
    today = D0 + timedelta(days=2)
    old = _expand(D0, prefix="o")
    od = _by_date(old)[today.isoformat()]
    # User completed exfoliate today; skipped one too; a third they never touched.
    od["tasks"].append(_task("skin.mask", "20:00", "o-mask", status="skipped"))
    od["tasks"].append(_task("skin.serum", "20:10", "o-serum"))
    for t in od["tasks"]:
        if t["catalog_id"] == "skin.exfoliate":
            t["status"] = "completed"
    new = _expand(today, prefix="n")
    # Today's re-expansion dropped exfoliate/mask/serum (context change).
    new[0]["tasks"] = [t for t in new[0]["tasks"] if t["catalog_id"] in ("skin.am", "skin.pm")]
    # And tomorrow's old day has a stray completed orphan that must NOT survive.
    _by_date(old)[(today + timedelta(days=1)).isoformat()]["tasks"].append(
        _task("skin.mask", "20:00", "o-mask-tmrw", status="completed")
    )

    merged = _merge_preserving_status(old_days=old, new_days=new, today=today)
    today_cids = {t["catalog_id"]: t["status"] for t in _by_date(merged)[today.isoformat()]["tasks"]}
    assert today_cids["skin.exfoliate"] == "completed"
    assert today_cids["skin.mask"] == "skipped"
    assert "skin.serum" not in today_cids           # untouched orphan drops
    tmrw = _by_date(merged)[(today + timedelta(days=1)).isoformat()]["tasks"]
    assert all(t["catalog_id"] != "skin.mask" for t in tmrw)  # future orphans drop


def test_carry_preserves_identity_and_markers_but_not_skeleton_fields():
    today = D0
    old = _expand(D0, prefix="o")
    o_am = old[0]["tasks"][0]
    o_am.update({
        "status": "completed", "completed_at": "2026-09-01T07:05:00",
        "task_uuid": "uuid-am", "notification_sent": True,
        "notification_sent_push": True, "notification_sent_sms": False,
        "title": "old title", "time": "06:30",
    })
    new = _expand(today, prefix="n")
    new[0]["tasks"][0].update({"title": "new title", "time": "07:15", "description": "fresh"})
    merged = _merge_preserving_status(old_days=old, new_days=new, today=today)
    m_am = merged[0]["tasks"][0]
    assert m_am["task_id"] == "o-am-2026-09-01"
    assert m_am["task_uuid"] == "uuid-am"
    assert m_am["status"] == "completed" and m_am["completed_at"] == "2026-09-01T07:05:00"
    assert m_am["notification_sent"] is True and m_am["notification_sent_push"] is True
    assert m_am["notification_sent_sms"] is False
    # Skeleton-owned fields come from the new expansion.
    assert m_am["title"] == "new title" and m_am["time"] == "07:15" and m_am["description"] == "fresh"
    # Inputs are not mutated.
    assert old[0]["tasks"][0]["title"] == "old title"
    assert new[0]["tasks"][0]["status"] == "pending"


def test_unresolved_old_status_normalises_to_pending_without_timestamps():
    old = _expand(D0, prefix="o")
    old[0]["tasks"][0].update({"status": "in_progress", "completed_at": "stale"})
    merged = _merge_preserving_status(old_days=old, new_days=_expand(D0, prefix="n"), today=D0)
    assert merged[0]["tasks"][0]["status"] == "pending"
    assert "completed_at" not in merged[0]["tasks"][0]


def test_undated_input_falls_back_to_positional():
    old = [{"tasks": [_task("a", "07:00", "o1", status="completed")]}, {"tasks": [_task("a", "07:00", "o2")]}]
    new = [{"tasks": [_task("a", "07:00", "n1")]}, {"tasks": [_task("a", "07:00", "n2")]}]
    merged = _merge_preserving_status(old_days=old, new_days=new)
    assert [t["status"] for d in merged for t in d["tasks"]] == ["completed", "pending"]
    assert merged[0]["tasks"][0]["task_id"] == "o1"


def test_today_defaults_to_first_new_day():
    today = D0 + timedelta(days=2)
    old = _expand(D0, prefix="o")
    _complete_through(old, today)
    merged = _merge_preserving_status(old_days=old, new_days=_expand(today, prefix="n"))
    assert merged[:2] == old[:2]
    assert max(_completed_dates(merged)) == today.isoformat()


def test_split_days_by_date_keeps_undated_days_live():
    days = _expand(D0, 3) + [{"tasks": []}]
    hist, live = _split_days_by_date(days, D0 + timedelta(days=1))
    assert [d["date"] for d in hist] == [D0.isoformat()]
    assert len(live) == 3 and live[-1] == {"tasks": []}


# --- H12: a re-anchor is a change ---------------------------------------------


def test_days_differ_sees_reanchor_with_identical_positional_tuples():
    a = _expand(D0)
    b = _expand(D0 + timedelta(days=1))
    # Same (catalog_id, time) per index (daily-only pattern lines up) ...
    assert [[(t["catalog_id"], t["time"]) for t in d["tasks"]] for d in a] == \
           [[(t["catalog_id"], t["time"]) for t in d["tasks"]] for d in b]
    # ... but the dates moved, so it IS a change (horizon extension must write).
    assert _days_differ(a, b) is True
    assert _days_differ(a, _expand(D0)) is False
    c = _expand(D0)
    c[3]["tasks"][0]["status"] = "completed"
    assert _days_differ(a, c) is True


# --- H9: instance overrides ---------------------------------------------------


def test_instance_override_key_requires_both_halves():
    assert instance_override_key("2026-09-04", "skin.am") == "2026-09-04|skin.am"
    assert instance_override_key(None, "skin.am") is None
    assert instance_override_key("2026-09-04", None) is None


def test_apply_instance_overrides_edit_and_delete():
    days = _expand(D0, 3)
    d1 = (D0 + timedelta(days=1)).isoformat()
    d2 = (D0 + timedelta(days=2)).isoformat()
    for t in days[1]["tasks"]:
        t["notification_sent"] = True
    out = _apply_instance_overrides(days, {
        f"{d1}|skin.am": {"time": "09:30", "title": "Morning face", "duration_minutes": 12},
        f"{d2}|skin.pm": {"deleted": True},
        "garbage": "not a dict",
    })
    am = next(t for t in out[1]["tasks"] if t["catalog_id"] == "skin.am")
    assert am["time"] == "09:30" and am["title"] == "Morning face" and am["duration_minutes"] == 12
    assert am["notification_sent"] is False              # moved time re-arms the reminder
    pm = next(t for t in out[1]["tasks"] if t["catalog_id"] == "skin.pm")
    assert pm["time"] == "21:00" and pm["notification_sent"] is True   # untouched sibling
    assert all(t["catalog_id"] != "skin.pm" for t in out[2]["tasks"])  # deleted day stays gone
    assert any(t["catalog_id"] == "skin.pm" for t in out[0]["tasks"])  # other days keep it
    # No input mutation.
    assert days[1]["tasks"][0]["time"] == "07:00"
    assert _apply_instance_overrides(days, {}) is days


def test_prune_instance_overrides_drops_past_and_malformed():
    today = D0 + timedelta(days=5)
    overrides = {
        f"{D0}|skin.am": {"time": "09:00"},                       # past -> gone
        f"{today}|skin.am": {"time": "09:00"},                    # today -> kept
        f"{today + timedelta(days=1)}|skin.pm": {"deleted": True},  # future -> kept
        "not-a-date|skin.am": {"time": "09:00"},                  # malformed -> gone
        f"{today}|skin.pm": "junk",                               # not a dict -> gone
    }
    kept = _prune_instance_overrides(overrides, today)
    assert set(kept) == {f"{today}|skin.am", f"{today + timedelta(days=1)}|skin.pm"}


class _FakeDB:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True


def _areturn(value):
    async def _f(*a, **k):
        return value
    return _f


@pytest.fixture
def _no_flag_modified(monkeypatch):
    # flag_modified expects a real ORM-mapped instance; the fake schedule is a
    # SimpleNamespace, so make it a no-op for these unit tests.
    monkeypatch.setattr(sched_mod, "flag_modified", lambda *a, **k: None)


@pytest.mark.asyncio
async def test_instance_edit_and_delete_are_recorded_and_survive_regen(monkeypatch, _no_flag_modified):
    days = _expand(D0, 3, prefix="o")
    d1 = (D0 + timedelta(days=1)).isoformat()
    d2 = (D0 + timedelta(days=2)).isoformat()
    sched = SimpleNamespace(days=days, schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    db = _FakeDB()

    # Move tomorrow's AM instance, then rename it (edits accumulate).
    await schedule_service.edit_task(
        user_id="u1", schedule_id="s1", task_id=f"o-am-{d1}", db=db, updates={"time": "09:30"},
    )
    await schedule_service.edit_task(
        user_id="u1", schedule_id="s1", task_id=f"o-am-{d1}", db=db, updates={"title": "Morning face"},
    )
    # Delete the day-after's PM instance.
    res = await schedule_service.delete_task(
        user_id="u1", schedule_id="s1", task_id=f"o-pm-{d2}", db=db,
    )
    assert res["scope"] == "instance"
    ov = sched.schedule_context[INSTANCE_OVERRIDES_KEY]
    assert ov[f"{d1}|skin.am"] == {"time": "09:30", "title": "Morning face"}
    assert ov[f"{d2}|skin.pm"] == {"deleted": True}
    assert "excluded_catalog_ids" not in sched.schedule_context   # instance != series

    # A later silent regen re-expands from the skeleton default ...
    fresh = _expand(D0, 3, prefix="n")
    reapplied = _apply_instance_overrides(fresh, ov)
    am = next(t for t in _by_date(reapplied)[d1]["tasks"] if t["catalog_id"] == "skin.am")
    assert am["time"] == "09:30" and am["title"] == "Morning face"      # edit survives
    assert all(t["catalog_id"] != "skin.pm" for t in _by_date(reapplied)[d2]["tasks"])  # stays deleted
    assert any(t["catalog_id"] == "skin.pm" for t in _by_date(reapplied)[d1]["tasks"])


@pytest.mark.asyncio
async def test_series_edit_supersedes_instance_time_but_keeps_deleted(monkeypatch, _no_flag_modified):
    days = _expand(D0, 3, prefix="o")
    d1 = (D0 + timedelta(days=1)).isoformat()
    d2 = (D0 + timedelta(days=2)).isoformat()
    sched = SimpleNamespace(days=days, schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    db = _FakeDB()

    await schedule_service.edit_task(
        user_id="u1", schedule_id="s1", task_id=f"o-am-{d1}", db=db,
        updates={"time": "09:30", "title": "Morning face"},
    )
    await schedule_service.delete_task(user_id="u1", schedule_id="s1", task_id=f"o-am-{d2}", db=db)
    # Now the user moves the whole AM series: that is their newest intent for
    # every day, so the per-day time pin goes; the rename and the deletion stay.
    await schedule_service.edit_task(
        user_id="u1", schedule_id="s1", task_id=f"o-am-{D0}", db=db, updates={"time": "08:00"}, scope="series",
    )
    ov = sched.schedule_context[INSTANCE_OVERRIDES_KEY]
    assert ov[f"{d1}|skin.am"] == {"title": "Morning face"}
    assert ov[f"{d2}|skin.am"] == {"deleted": True}
    assert sched.schedule_context["time_overrides"] == {"skin.am": "08:00"}

    # A series delete wipes every per-day entry for that part (it's excluded now).
    await schedule_service.delete_task(
        user_id="u1", schedule_id="s1", task_id=f"o-am-{D0}", db=db, scope="series",
    )
    assert sched.schedule_context[INSTANCE_OVERRIDES_KEY] == {}
    assert sched.schedule_context["excluded_catalog_ids"] == ["skin.am"]


@pytest.mark.asyncio
async def test_instance_edit_of_one_off_task_records_nothing(monkeypatch, _no_flag_modified):
    days = [{"date": D0.isoformat(), "tasks": [{"task_id": "one-off", "title": "Custom", "status": "pending"}]}]
    sched = SimpleNamespace(days=days, schedule_context={}, updated_at=None)
    monkeypatch.setattr(schedule_service, "_load_schedule", _areturn(sched))
    await schedule_service.edit_task(
        user_id="u1", schedule_id="s1", task_id="one-off", db=_FakeDB(), updates={"time": "10:00"},
    )
    assert INSTANCE_OVERRIDES_KEY not in sched.schedule_context  # no catalog_id -> never re-expanded


# --- end-to-end: real skinmax skeleton through regenerate_active_schedules ----


@pytest.fixture(scope="module", autouse=True)
def _catalog():
    # has_skeleton / expand_skeleton read the on-disk max docs; warm once.
    from services.task_catalog_service import is_loaded, warm_catalog
    if not is_loaded():
        asyncio.run(warm_catalog())


SKIN_STATE = {
    "skin_concern": ["acne", "pigmentation"],
    "barrier_state": "stable",
    "skin_type": "oily",
    "routine_level": "advanced",
    "outdoor_exposure": "moderate",
    "tret_history": "never",
    "climate": "temperate",
    "diet_open": "yes_some",
    "wake_time": "07:00",
    "sleep_time": "23:00",
    "timezone": "UTC",
}


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class _RegenDB:
    def __init__(self, user, scheds):
        self.user, self.scheds = user, scheds
        self.flushed = self.committed = False

    async def get(self, model, key):
        return self.user

    async def execute(self, stmt, *a, **k):
        return _Rows(self.scheds)

    async def flush(self):
        self.flushed = True

    async def commit(self):
        self.committed = True


def _real_skinmax_days(anchor: date) -> list[dict]:
    from services.schedule_skeleton import expand_skeleton
    days = expand_skeleton(
        maxx_id="skinmax", user_state=SKIN_STATE, wake="07:00", sleep="23:00",
        cadence_days=14, start_date=anchor,
    )
    for i, d in enumerate(days):
        d["date"] = (anchor + timedelta(days=i)).isoformat()
        for t in d["tasks"]:
            t.setdefault("task_id", f"gen-{i}-{t['catalog_id']}")
            t.setdefault("status", "pending")
    return days


def _patch_regen_env(monkeypatch, today: date):
    import services.calendar_busy as cal
    import services.gcal_mirror as gm
    import services.schedule_streak as st
    import services.user_context_service as ucs
    monkeypatch.setattr(ucs, "get_context", _areturn({}))
    monkeypatch.setattr(cal, "calendar_busy_by_date", _areturn({}))
    monkeypatch.setattr(st, "local_today_date", lambda _ob: today)
    monkeypatch.setattr(gm, "kick_gcal_mirror", lambda *a, **k: None)


@pytest.mark.asyncio
async def test_end_to_end_regen_on_real_skeleton(monkeypatch):
    from services.schedule_runtime import regenerate_active_schedules

    k = 2
    today = D0 + timedelta(days=k)
    old = _real_skinmax_days(D0)
    _complete_through(old, today)
    old_today_cids = {t["catalog_id"] for t in _by_date(old)[today.isoformat()]["tasks"]}
    old_today_ids = {t["catalog_id"]: t["task_id"] for t in _by_date(old)[today.isoformat()]["tasks"]}
    uid = uuid4()
    user = SimpleNamespace(id=uid, onboarding=dict(SKIN_STATE), profile={})
    sched = SimpleNamespace(
        id=uuid4(), user_id=uid, maxx_id="skinmax", days=old, schedule_context={},
        is_active=True, updated_at=None,
    )
    db = _RegenDB(user, [sched])
    _patch_regen_env(monkeypatch, today)

    out = await regenerate_active_schedules(user_id=str(uid), db=db, reason="horizon_extension")

    assert out == [{"maxx_id": "skinmax", "schedule_id": str(sched.id), "changed": True}]
    assert db.flushed
    days = sched.days
    # History retained: the row still starts on the generation date.
    assert days[0]["date"] == D0.isoformat()
    assert days[:k] == old[:k]
    # Runway extended from today: today + 13 is the last day.
    assert days[-1]["date"] == (today + timedelta(days=13)).isoformat()
    # No completion after today.
    assert max(_completed_dates(days)) == today.isoformat()
    # Today's real completions kept, on the same ids, for every part still scheduled.
    t_today = {t["catalog_id"]: t for t in _by_date(days)[today.isoformat()]["tasks"]}
    for cid in old_today_cids:
        assert t_today[cid]["status"] == "completed", cid
        assert t_today[cid]["task_id"] == old_today_ids[cid]
    # Everything after today starts pending.
    for d in days[k + 1:]:
        assert all(t["status"] == "pending" for t in d["tasks"]), d["date"]
    assert sched.schedule_context["last_regen_reason"] == "horizon_extension"


@pytest.mark.asyncio
async def test_end_to_end_regen_applies_instance_override_and_prunes_past(monkeypatch):
    from services.schedule_runtime import regenerate_active_schedules

    today = D0 + timedelta(days=1)
    old = _real_skinmax_days(D0)
    tomorrow = (today + timedelta(days=1)).isoformat()
    cid = next(t["catalog_id"] for t in _by_date(old)[tomorrow]["tasks"])
    uid = uuid4()
    user = SimpleNamespace(id=uid, onboarding=dict(SKIN_STATE), profile={})
    sched = SimpleNamespace(
        id=uuid4(), user_id=uid, maxx_id="skinmax", days=old, is_active=True, updated_at=None,
        schedule_context={INSTANCE_OVERRIDES_KEY: {
            f"{tomorrow}|{cid}": {"time": "12:34", "title": "My way"},
            f"{D0}|{cid}": {"deleted": True},   # yesterday: history now, prune it
        }},
    )
    db = _RegenDB(user, [sched])
    _patch_regen_env(monkeypatch, today)

    await regenerate_active_schedules(user_id=str(uid), db=db, reason="edit_lifestyle")

    t = next(t for t in _by_date(sched.days)[tomorrow]["tasks"] if t["catalog_id"] == cid)
    assert t["time"] == "12:34" and t["title"] == "My way"
    assert set(sched.schedule_context[INSTANCE_OVERRIDES_KEY]) == {f"{tomorrow}|{cid}"}


@pytest.mark.asyncio
async def test_regen_is_a_noop_write_when_nothing_changed(monkeypatch):
    """Second regen on the same day with the same state must not rewrite the
    row (the changed flag is what gates last_regen_at and the gcal kick)."""
    from services.schedule_runtime import regenerate_active_schedules

    today = D0 + timedelta(days=1)
    uid = uuid4()
    user = SimpleNamespace(id=uid, onboarding=dict(SKIN_STATE), profile={})
    sched = SimpleNamespace(
        id=uuid4(), user_id=uid, maxx_id="skinmax", days=_real_skinmax_days(D0),
        schedule_context={}, is_active=True, updated_at=None,
    )
    db = _RegenDB(user, [sched])
    _patch_regen_env(monkeypatch, today)
    first = await regenerate_active_schedules(user_id=str(uid), db=db, reason="x")
    assert first[0]["changed"] is True
    snapshot = [dict(d) for d in sched.days]
    second = await regenerate_active_schedules(user_id=str(uid), db=db, reason="x")
    assert second[0]["changed"] is False
    assert sched.days == snapshot


# --- H12: horizon keeper reports when the runway did not grow -----------------


def _horizon_env(monkeypatch, today: date, sched, regen_impl):
    import services.calendar_busy as cal
    import services.gcal_mirror as gm
    import services.schedule_runtime as rt
    import services.schedule_streak as st
    monkeypatch.setitem(sys.modules, "api.marketplace", SimpleNamespace(_SEED_COURSES=[]))
    monkeypatch.setattr(cal, "calendar_busy_by_date", _areturn({}))
    monkeypatch.setattr(st, "local_today_date", lambda _ob: today)
    monkeypatch.setattr(gm, "kick_gcal_mirror", lambda *a, **k: None)
    monkeypatch.setattr(rt, "regenerate_active_schedules", regen_impl)
    user = SimpleNamespace(id=uuid4(), onboarding={"timezone": "UTC"}, profile={})
    return user, _RegenDB(user, [sched])


@pytest.mark.asyncio
async def test_horizon_reports_still_short_when_regen_does_not_extend(monkeypatch):
    from services.horizon import ensure_plan_horizon

    today = D0 + timedelta(days=12)
    sched = SimpleNamespace(
        id=uuid4(), maxx_id="skinmax", schedule_type="maxx", days=_expand(D0), is_active=True,
        schedule_context={}, updated_at=None,
    )

    async def _noop_regen(**kw):
        return [{"maxx_id": "skinmax", "schedule_id": "s", "changed": False}]

    user, db = _horizon_env(monkeypatch, today, sched, _noop_regen)
    out = await ensure_plan_horizon(user, db)
    assert out["native_regens"] == 1
    assert out["still_short"] == 1          # the runway did NOT grow -> caller must not stamp the day
    assert db.committed


@pytest.mark.asyncio
async def test_horizon_reports_zero_short_when_regen_extends(monkeypatch):
    from services.horizon import ensure_plan_horizon

    today = D0 + timedelta(days=12)
    sched = SimpleNamespace(
        id=uuid4(), maxx_id="skinmax", schedule_type="maxx", days=_expand(D0), is_active=True,
        schedule_context={}, updated_at=None,
    )

    async def _extending_regen(**kw):
        sched.days = _merge_preserving_status(old_days=sched.days, new_days=_expand(today), today=today)
        return [{"maxx_id": "skinmax", "schedule_id": "s", "changed": True}]

    user, db = _horizon_env(monkeypatch, today, sched, _extending_regen)
    out = await ensure_plan_horizon(user, db)
    assert out["native_regens"] == 1
    assert out["still_short"] == 0
    assert sched.days[-1]["date"] == (today + timedelta(days=13)).isoformat()


@pytest.mark.asyncio
async def test_horizon_skips_schedules_with_enough_runway(monkeypatch):
    from services.horizon import ensure_plan_horizon

    today = D0 + timedelta(days=2)
    sched = SimpleNamespace(
        id=uuid4(), maxx_id="skinmax", schedule_type="maxx", days=_expand(D0), is_active=True,
        schedule_context={}, updated_at=None,
    )
    calls: list = []

    async def _regen(**kw):
        calls.append(kw)
        return []

    user, db = _horizon_env(monkeypatch, today, sched, _regen)
    out = await ensure_plan_horizon(user, db)
    assert calls == [] and out["native_regens"] == 0 and out["still_short"] == 0
