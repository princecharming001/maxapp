"""app_users.profile lost-update safety (H11).

`user.profile` is ONE json column shared by independent writers — the streak
(/schedules/active/full), the task-XP ledger (complete_task), achievements XP +
the milestone push, and the 5-minute notification tick. Each used to
read-modify-write the whole column from its session's snapshot, so overlapping
writers dropped each other's keys (streak reset, XP gone, `sent` ledger rolled
back → the same push twice). The fix is schedule_streak.write_profile_keys:
SELECT ... FOR UPDATE on the row, mutate the FRESH profile, merge ONLY the keys
that changed, commit immediately (single-table transaction).

Two layers of tests:
  * Integration tests against a LOCAL scratch Postgres (skipped when none is
    reachable; they refuse to run against anything but localhost). These prove
    the actual lock blocks a second writer and that the targeted merge keeps a
    concurrent writer's keys — the property the mocks can't show.
  * Fallback + structural tests that run anywhere: the mock-session fallback,
    the lock statement's shape, and that every owned writer goes through the
    primitive (no whole-column `user.profile = ...` left in them).
"""

from __future__ import annotations

import asyncio
import getpass
import inspect as pyinspect
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm.attributes import flag_modified

import services.achievements as ach
import services.notification_state as ns
import services.schedule_streak as ss
import services.scheduler_job as sj
from models.sqlalchemy_models import Base, User, UserAchievement, UserSchedule
from services.gamification import TASK_LEDGER_KEY, XP_ACHIEVEMENT, XP_KEY
from services.notification_planner import PlannerConfig
from services.schedule_service import schedule_service
from services.schedule_streak import LAST_PERFECT_KEY, STREAK_KEY


# --- local scratch Postgres ---------------------------------------------------

LOCAL_PG = os.environ.get(
    "MAXAPP_TEST_PG_URL",
    f"postgresql+asyncpg://{getpass.getuser()}@localhost:5432/postgres",
)


def _refuse_remote(url: str) -> None:
    """These tests take row locks and UPDATE app_users. They must never point at
    a shared database, whatever the env var says."""
    low = url.lower()
    host = (urlparse(url).hostname or "").lower()
    if any(s in low for s in ("supabase", "pooler", "render", "amazonaws")) or host not in (
        "localhost", "127.0.0.1", "::1",
    ):
        raise RuntimeError(f"refusing to run profile-write integration tests against {host!r}")


@pytest_asyncio.fixture
async def Session():
    """A throwaway database per test with just the three tables the writers
    touch, sessions configured like production (autoflush off, no expiry)."""
    _refuse_remote(LOCAL_PG)
    admin = create_async_engine(LOCAL_PG, isolation_level="AUTOCOMMIT")
    name = f"maxapp_profile_test_{os.getpid()}_{uuid.uuid4().hex[:8]}"
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'CREATE DATABASE "{name}"'))
    except Exception as e:  # no local Postgres — integration layer is skipped
        await admin.dispose()
        pytest.skip(f"local Postgres not reachable ({type(e).__name__}); skipping integration tests")
    scratch = create_async_engine(LOCAL_PG.rsplit("/", 1)[0] + "/" + name)
    try:
        async with scratch.begin() as conn:
            await conn.run_sync(
                Base.metadata.create_all,
                tables=[User.__table__, UserSchedule.__table__, UserAchievement.__table__],
            )
        yield async_sessionmaker(scratch, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    finally:
        await scratch.dispose()
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        await admin.dispose()


def _today() -> date:
    return datetime.now(ZoneInfo("UTC")).date()


async def _seed_user(Session, profile: dict, *, onboarding: dict | None = None, token: str | None = None) -> uuid.UUID:
    uid = uuid.uuid4()
    async with Session() as db:
        db.add(User(
            id=uid, email=f"{uid}@test.local", password_hash="x",
            onboarding=onboarding or {"timezone": "UTC"}, profile=profile,
            apns_device_token=token,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ))
        await db.commit()
    return uid


async def _seed_schedule(Session, uid: uuid.UUID, tasks: list[dict], *, day: str) -> uuid.UUID:
    sid = uuid.uuid4()
    async with Session() as db:
        db.add(UserSchedule(
            id=sid, user_id=uid, schedule_type="maxx", maxx_id="skinmax", is_active=True,
            days=[{"date": day, "tasks": tasks}], completion_stats={},
        ))
        await db.commit()
    return sid


async def _read_profile(Session, uid) -> dict:
    async with Session() as db:
        return dict((await db.execute(select(User.profile).where(User.id == uid))).scalar_one() or {})


async def _unlocked_whole_column_write(Session, uid, mutate) -> None:
    """What the writers we do NOT own still do (planner horizon marker,
    /notifications/activity...): read-modify-write the whole column."""
    async with Session() as db:
        u = await db.get(User, uid)
        prof = dict(u.profile or {})
        mutate(prof)
        u.profile = prof
        flag_modified(u, "profile")
        await db.commit()


def _sched(day_iso: str, tasks: list[tuple[str, str]]) -> list[dict]:
    return [{
        "id": "s1", "maxx_id": "skinmax",
        "days": [{"date": day_iso, "tasks": [
            {"task_id": tid, "status": st, "time": f"{8 + i:02d}:00", "title": f"Task {tid}", "description": ""}
            for i, (tid, st) in enumerate(tasks)
        ]}],
    }]


# --- integration: the lock + merge do what the docstring says ------------------

@pytest.mark.asyncio
async def test_streak_credit_keeps_keys_a_concurrent_writer_landed(Session):
    # Session A holds a snapshot; a concurrent unlocked writer (horizon marker
    # + notification state) commits; then A credits the streak. Before the fix
    # A's whole-column write from the snapshot erased the other writer's keys.
    today = _today()
    uid = await _seed_user(Session, {
        STREAK_KEY: 2, LAST_PERFECT_KEY: (today - timedelta(days=1)).isoformat(),
        "horizon_checked": "horizon:old",
        "notif_state": {"sent": {today.isoformat(): {"cat:tip": "t0"}}},
    })
    async with Session() as A:
        user = await A.get(User, uid)  # snapshot in A's identity map
        assert user.profile["horizon_checked"] == "horizon:old"

        def _other(p):
            p["horizon_checked"] = "horizon:new"
            p["notif_state"] = {"sent": {today.isoformat(): {"cat:tip": "t0", "task:t9": "t1"}}}
        await _unlocked_whole_column_write(Session, uid, _other)

        payload = await ss.sync_master_schedule_streak(
            user, _sched(today.isoformat(), [("t1", "completed"), ("t2", "completed")]), A,
        )
        assert payload["current"] == 3

    stored = await _read_profile(Session, uid)
    assert stored[STREAK_KEY] == 3 and stored[LAST_PERFECT_KEY] == today.isoformat()
    assert stored["horizon_checked"] == "horizon:new"                      # not clobbered
    assert "task:t9" in stored["notif_state"]["sent"][today.isoformat()]  # not clobbered
    assert user.profile == stored  # identity map adopted the merged row


@pytest.mark.asyncio
async def test_row_lock_blocks_a_second_writer_until_commit(Session):
    uid = await _seed_user(Session, {XP_KEY: 0})
    async with Session() as A, Session() as B:
        ua = await A.get(User, uid)
        await ss.lock_user_row(A, ua)  # A now holds the row lock

        ub = await B.get(User, uid)
        b_write = asyncio.create_task(ss.write_profile_keys(B, ub, lambda p: p.__setitem__("b_key", 1)))
        await asyncio.sleep(0.4)
        assert not b_write.done(), "second writer must wait for the row lock"

        await ss.write_profile_keys(A, ua, lambda p: p.__setitem__("a_key", 1))
        await A.commit()  # releases the lock -> B proceeds on the FRESH row
        await asyncio.wait_for(b_write, timeout=5)
        await B.commit()

    stored = await _read_profile(Session, uid)
    assert stored == {XP_KEY: 0, "a_key": 1, "b_key": 1}


@pytest.mark.asyncio
async def test_write_profile_keys_merges_only_changed_keys_and_leaves_instance_clean(Session):
    uid = await _seed_user(Session, {"keep": {"nested": [1, 2]}, "gone": 1, "x": 1})
    async with Session() as A:
        ua = await A.get(User, uid)

        def _mut(p):
            p.pop("gone")
            p["x"] = 2
            p["y"] = {"a": 1}
            p["keep"]["nested"].append(3)   # in-place nested edit must be seen by the diff

        out = await ss.write_profile_keys(A, ua, _mut)
        # The merge already landed via SQL; the ORM instance must NOT be dirty,
        # or the commit below would re-emit the whole column from memory.
        assert ua not in A.dirty
        await A.commit()
        stored = await _read_profile(Session, uid)
        assert stored == {"keep": {"nested": [1, 2, 3]}, "x": 2, "y": {"a": 1}} == out == ua.profile

        # A mutation that changes nothing issues no UPDATE (updated_at untouched).
        before = (await A.execute(select(User.updated_at).where(User.id == uid))).scalar_one()
        await ss.write_profile_keys(A, ua, lambda p: p.__setitem__("x", 2))
        await A.commit()
        after = (await A.execute(select(User.updated_at).where(User.id == uid))).scalar_one()
        assert before == after


@pytest.mark.asyncio
async def test_tick_replays_sends_onto_fresh_state_and_keeps_others_keys(Session, monkeypatch):
    # The tick plans from a snapshot, sends (network), then must record the
    # sends onto whatever the row holds NOW — here a milestone push + streak
    # credit that landed while APNs was in flight.
    monkeypatch.setattr(sj.settings, "sms_scheduler_test_fast_mode", True, raising=False)
    monkeypatch.setattr(sj.settings, "notif_kill_switch", False, raising=False)
    today_iso = _today().isoformat()
    uid = await _seed_user(
        Session, {"notif_state": {}, STREAK_KEY: 4},
        onboarding={"app_notifications_opt_in": True, "timezone": "UTC", "wake_time": "00:00", "sleep_time": "23:59"},
        token="abc123",
    )
    task = {"task_uuid": "t1", "task_id": "t1", "title": "morning skincare", "time": "10:00", "status": "pending"}
    sid = await _seed_schedule(Session, uid, [task], day=today_iso)

    landed = {"done": False}

    async def _apns(token, title, body, custom=None):
        if not landed["done"]:  # a concurrent writer commits mid-send, once
            landed["done"] = True
            async with Session() as C:
                uc = await C.get(User, uid)

                def _m(p):
                    p["notif_state"] = ns.record_sent(ns.get_state(p), today_iso, "cat:milestone", datetime.utcnow())
                    p[STREAK_KEY] = 5
                await ss.write_profile_keys(C, uc, _m)
                await C.commit()
        return True, 200

    async with Session() as A:  # the chunk session
        await A.execute(select(User).where(User.id == uid))  # warm identity map like the tick
        scheds = (await A.execute(select(UserSchedule).where(UserSchedule.user_id == uid))).scalars().all()
        with patch.object(sj, "send_apns_alert", new=AsyncMock(side_effect=_apns)) as push:
            await sj._plan_and_send_for_user(A, uid, scheds, PlannerConfig.from_settings(), 4)
        assert push.await_count >= 1
        assert any("skincare" in (c.args[1] + c.args[2]).lower() for c in push.await_args_list)
        assert not A.dirty and not A.in_transaction()  # committed per user, nothing left pending

    stored = await _read_profile(Session, uid)
    keys = set(stored["notif_state"]["sent"][today_iso])
    assert "cat:milestone" in keys and any(k.startswith("task:") for k in keys)  # both writers' sends
    assert stored[STREAK_KEY] == 5                                             # concurrent credit kept
    async with Session() as R:
        row = await R.get(UserSchedule, sid)
        assert row.days[0]["tasks"][0].get("notification_sent_push") is True   # flag committed too


@pytest.mark.asyncio
async def test_complete_task_xp_is_awarded_on_the_fresh_profile(Session):
    today_iso = _today().isoformat()
    uid = await _seed_user(Session, {XP_KEY: 100, STREAK_KEY: 0})
    sid = await _seed_schedule(Session, uid, [{"task_id": "t1", "title": "Task", "time": "08:00", "status": "pending"}], day=today_iso)
    async with Session() as A:
        ua = await A.get(User, uid)  # stale snapshot: XP 100
        await _unlocked_whole_column_write(Session, uid, lambda p: p.__setitem__(XP_KEY, 150))
        with patch("services.gcal_mirror.kick_gcal_mirror", lambda *a, **k: None):
            res = await schedule_service.complete_task(str(uid), str(sid), "t1", A)
        assert res["status"] == "completed"
        assert not A.in_transaction()

    stored = await _read_profile(Session, uid)
    assert stored[XP_KEY] == 150 + 15          # fresh base + one-task plan award, not 100 + 15
    assert stored[TASK_LEDGER_KEY]["ids"] == ["t1"]
    assert ua.profile[XP_KEY] == 165           # identity map coherent
    async with Session() as R:
        row = await R.get(UserSchedule, sid)
        assert row.days[0]["tasks"][0]["status"] == "completed"


@pytest.mark.asyncio
async def test_achievements_concurrent_evaluate_awards_each_badge_once(Session, monkeypatch):
    # Two /active/full in flight both see "first_routine" unearned. Under the
    # lock the loser re-reads and finds the winner's row: one badge row, +50 XP
    # once, and no unique-constraint rollback of the loser's day-state.
    monkeypatch.setattr(ach, "_scan_count", AsyncMock(return_value=0))
    monkeypatch.setattr(ach, "_fact_count", AsyncMock(return_value=0))
    monkeypatch.setattr(ach, "_send_milestone_push", AsyncMock())
    today_iso = _today().isoformat()
    streak = {"current": 0, "armed_freezes": 0, "fresh_start_today": False, "last_perfect_date": None, "today_date": today_iso}
    schedules = [{"maxx_id": "skinmax", "days": []}]
    uid = await _seed_user(Session, {XP_KEY: 0})
    async with Session() as A, Session() as B:
        ua, ub = await A.get(User, uid), await B.get(User, uid)
        ra, rb = await asyncio.gather(
            ach.evaluate(A, ua, streak=streak, schedules=schedules),
            ach.evaluate(B, ub, streak=streak, schedules=schedules),
        )
    codes = sorted(a["code"] for a in ra + rb)
    assert codes == ["first_routine"]
    async with Session() as R:
        rows = (await R.execute(select(UserAchievement.code).where(UserAchievement.user_id == uid))).scalars().all()
        assert rows == ["first_routine"]
    assert (await _read_profile(Session, uid))[XP_KEY] == XP_ACHIEVEMENT


# --- fallback + structure: run anywhere -----------------------------------------

@pytest.mark.asyncio
async def test_write_profile_keys_falls_back_to_in_memory_write_on_mock_session(caplog):
    db = MagicMock()
    db.commit = AsyncMock()
    user = MagicMock()
    user.id = uuid.uuid4()
    user.profile = {"a": 1}
    with caplog.at_level(logging.WARNING, logger=ss.__name__):
        out = await ss.write_profile_keys(db, user, lambda p: p.__setitem__("b", 2))
    assert out == {"a": 1, "b": 2} == user.profile
    assert "unlocked fallback" in caplog.text


def test_lock_statement_is_for_update_on_postgres_and_refreshes_the_identity_map():
    stmt = ss._lock_stmt(uuid.uuid4())
    assert "FOR UPDATE" in str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" not in str(stmt.compile(dialect=sqlite.dialect()))  # test dialects degrade cleanly
    assert stmt.get_execution_options().get("populate_existing") is True


def test_merge_sql_is_targeted_and_json_safe():
    sql = str(ss._PROFILE_MERGE_SQL)
    assert "RETURNING profile" in sql
    assert "::jsonb" in sql and "::json" in sql        # column is json in prod, merge happens in jsonb
    assert "- CAST(:removed AS text[])" in sql          # popped keys are removed, not nulled
    assert "|| CAST(CAST(:patch AS text) AS jsonb)" in sql
    assert re.search(r"SET profile = .*updated_at = now\(\)", sql, re.S)
    assert "SET onboarding" not in sql


def test_every_owned_writer_goes_through_the_locked_merge():
    # The whole point of H11: no owned writer may assign the whole column any
    # more. The only `user.profile =` allowed is the fallback inside the
    # primitive itself.
    writers = [
        ss.sync_master_schedule_streak,
        ach.evaluate,
        ach._send_milestone_push,
        sj._plan_and_send_for_user,
        schedule_service.complete_task,
    ]
    for fn in writers:
        src = pyinspect.getsource(fn)
        assert "write_profile_keys(" in src, fn.__qualname__
        assert not re.search(r"^\s*user\.profile\s*=", src, re.M), fn.__qualname__
    # The tick commits per user and defers the schedule-flag write past the
    # profile commit so the app_users transaction never carries another table.
    tick = pyinspect.getsource(sj._plan_and_send_for_user)
    assert tick.index("write_profile_keys(") < tick.index('flag_modified(sched, "days")')
    assert tick.count("await db.commit()") >= 2
    # complete_task persists XP AFTER the schedule commit (single-table txns).
    ct = pyinspect.getsource(schedule_service.complete_task)
    assert ct.index("await db.commit()") < ct.index("write_profile_keys(")
