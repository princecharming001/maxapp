"""Engine v3 at the integration seam: scheduler_job._engine_send_for_user with
the real signal builder, a mocked DB session and a mocked APNs sender.

Proves the parts the pure engine can't: task times come from the master view
(what the app shows), statuses come from the rows loaded THIS tick, the APNs
call carries thread/category/expiry, the ledger stops a second send, and a dead
token is pruned.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

import services.scheduler_job as sj
from services import notification_engine as ne
from services import notification_signals as sig

TZ = "America/New_York"


def _now_local() -> datetime:
    return datetime.now(ZoneInfo(TZ)).replace(second=0, microsecond=0, tzinfo=None)


def _hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _user(profile=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.first_name = "Anish"
    u.apns_device_token = "abc123"
    u.apns_token_updated_at = None
    u.phone_number = None
    u.is_paid = True
    u.coaching_tone = None
    u.created_at = datetime.utcnow() - timedelta(days=20)
    u.onboarding = {
        "app_notifications_opt_in": True,
        "timezone": TZ,
        "wake_time": "00:00",
        "sleep_time": "23:59",   # whole day awake so the test is clock-independent
    }
    # active a minute ago → not lapsed; not "in the app" either (5-min window)
    u.profile = profile if profile is not None else {
        "notif_state": {"last_active_at": (datetime.utcnow() - timedelta(minutes=30)).isoformat()}
    }
    return u


def _schedule(tasks, day_iso):
    s = MagicMock()
    s.id = uuid.uuid4()
    s.maxx_id = "skinmax"
    s.course_title = None
    s.updated_at = datetime.utcnow()
    s.days = [{"date": day_iso, "tasks": tasks}]
    return s


def _task(time_str, title="morning skincare", status="pending", n=1):
    return {"task_uuid": f"uuid-{n}", "task_id": f"tid-{n}", "title": title,
            "time": time_str, "status": status, "duration_min": 7}


@pytest.fixture(autouse=True)
def _isolate(monkeypatch):
    sig.reset_caches()
    sj._reset_sent_memo()
    monkeypatch.setattr(sj, "flag_modified", lambda *a, **k: None)

    async def _no_progress(db, user, profile, today, tz):
        return ne.ProgressView()

    monkeypatch.setattr(sig, "progress_view", _no_progress)
    yield
    sig.reset_caches()


def _view_with(tasks_for_view, day_iso):
    """Stands in for master_schedule.build_master_view — like the real one, it
    stamps each task with its program's schedule_id / maxx_id."""
    async def _fake_view(uid, db, *, days=1, today_iso=None, actives=None, user_row=None):
        sched = (actives or [None])[0]
        out = []
        for t in tasks_for_view:
            t2 = dict(t)
            if sched is not None:
                t2.setdefault("schedule_id", str(sched.id))
                t2.setdefault("maxx_id", sched.maxx_id)
            out.append(t2)
        return [{"date": day_iso, "tasks": out}]
    return _fake_view


def _db(user):
    db = MagicMock()
    db.get = AsyncMock(return_value=user)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


async def _run(user, schedules):
    return await sj._engine_send_for_user(_db(user), user, schedules, ne.EngineConfig())


@pytest.mark.asyncio
async def test_task_push_uses_the_displayed_time_not_the_stored_one():
    now = _now_local()
    day_iso = now.date().isoformat()
    stored = _task(_hhmm(now - timedelta(minutes=40)))     # stored time: 40 min ago
    shown = dict(stored, time=_hhmm(now))                  # collision pass moved it to now
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([shown], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        sent = await _run(user, [_schedule([stored], day_iso)])
    assert [p.lane for p in sent] == ["task"]
    args, kwargs = push.await_args
    assert "morning skincare" in (args[1] + " " + args[2]).lower()
    assert kwargs["thread_id"] == "tasks"
    assert kwargs["category"] == "TASK_REMINDER"
    assert kwargs["expires_in_s"] == 3600
    custom = kwargs["custom"]
    assert custom["route"] == "TaskGuide"
    assert custom["params"]["task_id"] == "tid-1" and custom["params"]["schedule_id"]
    assert not any(str(k).startswith("_") for k in custom["params"])
    # recorded in the task ledger on the (in-memory, mock-session) profile
    st = user.profile["notif_state"]
    assert list(st[ne.TASK_SENT_KEY][day_iso]) == [f"{day_iso}:uuid-1"]


@pytest.mark.asyncio
async def test_same_task_is_not_pushed_twice_across_ticks():
    now = _now_local()
    day_iso = now.date().isoformat()
    t = _task(_hhmm(now))
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([t], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        await _run(user, [_schedule([t], day_iso)])
        await _run(user, [_schedule([t], day_iso)])
    assert push.await_count == 1


@pytest.mark.asyncio
async def test_task_completed_this_second_is_not_pushed():
    now = _now_local()
    day_iso = now.date().isoformat()
    shown = _task(_hhmm(now))                      # cached view still says pending
    row = dict(shown, status="completed")          # the row loaded this tick says done
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([shown], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        sent = await _run(user, [_schedule([row], day_iso)])
    assert sent == [] and push.await_count == 0


@pytest.mark.asyncio
async def test_task_the_v2_planner_already_pushed_today_is_not_pushed_again():
    # Deploy day: v2 pushed this task minutes ago (row flag), v3 takes over.
    now = _now_local()
    day_iso = now.date().isoformat()
    shown = _task(_hhmm(now - timedelta(minutes=3)))
    row = dict(shown, notification_sent_push=True)
    other = _task(_hhmm(now), title="evening skincare", n=2)
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([shown, other], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        sent = await _run(user, [_schedule([row, other], day_iso)])
    assert [p.task_keys for p in sent] == [("uuid-2",)], sent
    assert push.await_count == 1


@pytest.mark.asyncio
async def test_failed_send_is_not_recorded_so_the_next_tick_retries():
    now = _now_local()
    day_iso = now.date().isoformat()
    t = _task(_hhmm(now))
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([t], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(side_effect=[(False, 503), (True, 200)])) as push:
        first = await _run(user, [_schedule([t], day_iso)])
        second = await _run(user, [_schedule([t], day_iso)])
    assert first == [] and [p.lane for p in second] == ["task"] and push.await_count == 2


@pytest.mark.asyncio
async def test_lost_ledger_write_does_not_resend_every_tick():
    # APNs accepted, then the ledger write failed: the next tick rebuilds the
    # same push — the in-process memo must stop it going out once a minute.
    now = _now_local()
    day_iso = now.date().isoformat()
    t = _task(_hhmm(now))
    user = _user()

    async def _write_fails(*a, **k):
        raise RuntimeError("row lock timeout")

    with patch("services.master_schedule.build_master_view", new=_view_with([t], day_iso)), \
         patch.object(sj, "write_profile_keys", new=_write_fails), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        first = await _run(user, [_schedule([t], day_iso)])
        second = await _run(user, [_schedule([t], day_iso)])
        third = await _run(user, [_schedule([t], day_iso)])
    assert [p.lane for p in first] == ["task"]
    assert second == [] and third == [] and push.await_count == 1


def test_sent_memo_blocks_only_what_already_went_out():
    day = "2026-09-24"
    a = ne.Push(category="task_due", lane="task", dedup_key="task:A", title="t", body="b",
                route="TaskGuide", params={}, thread_id="tasks", task_keys=["A"])
    ab = ne.Push(category="task_due", lane="task", dedup_key="task:A", title="t", body="b",
                 route="TaskGuide", params={}, thread_id="tasks", task_keys=["A", "B"])
    amb = ne.Push(category="streak_protection", lane="ambient", dedup_key="cat:streak_protection",
                  title="t", body="b", route="Home", params={}, thread_id="streak")
    sj._memo_add("u1", day, a, 1000.0)
    assert sj._memo_blocks("u1", day, a, 1001.0)
    assert not sj._memo_blocks("u1", day, ab, 1001.0), "a group with an unsent task still goes"
    assert not sj._memo_blocks("u2", day, a, 1001.0), "per user"
    assert not sj._memo_blocks("u1", "2026-09-25", a, 1001.0), "per logical day"
    assert not sj._memo_blocks("u1", day, amb, 1001.0), "per key"
    assert not sj._memo_blocks("u1", day, a, 1000.0 + sj._SENT_MEMO_TTL_S + 1), "expires"


@pytest.mark.asyncio
async def test_dead_token_is_pruned():
    now = _now_local()
    day_iso = now.date().isoformat()
    t = _task(_hhmm(now))
    user = _user()
    with patch("services.master_schedule.build_master_view", new=_view_with([t], day_iso)), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(False, 410))):
        await _run(user, [_schedule([t], day_iso)])
    assert user.apns_device_token is None and user.apns_token_updated_at is None


@pytest.mark.asyncio
async def test_master_view_failure_falls_back_to_stored_times():
    now = _now_local()
    day_iso = now.date().isoformat()
    t = _task(_hhmm(now))
    user = _user()

    async def _boom(*a, **k):
        raise RuntimeError("collision pass exploded")

    with patch("services.master_schedule.build_master_view", new=_boom), \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        sent = await _run(user, [_schedule([t], day_iso)])
    assert [p.lane for p in sent] == ["task"] and push.await_count == 1


def test_push_users_go_to_v3_and_sms_users_stay_on_the_planner(monkeypatch):
    push_user = _user()
    sms_user = _user()
    sms_user.apns_device_token = None
    assert sj._engine_v3_for(push_user) is True
    assert sj._engine_v3_for(sms_user) is False
    monkeypatch.setattr(sj.settings, "notif_engine_v3_enabled", False, raising=False)
    assert sj._engine_v3_for(push_user) is False


def test_streak_view_counts_an_unsynced_closed_yesterday():
    """The user finished yesterday but never reopened the app, so the stored
    streak still points at the day before. They must NOT get a 'fresh start'."""
    from datetime import date

    today = date(2026, 9, 24)
    y, yy = today - timedelta(days=1), today - timedelta(days=2)
    profile = {"master_schedule_streak": 4, "master_schedule_streak_last_perfect_date": yy.isoformat()}
    sd = [{"id": "s1", "maxx_id": "skinmax", "days": [
        {"date": y.isoformat(), "tasks": [{"task_id": "a", "title": "a", "time": "09:00", "status": "completed"}]},
        {"date": today.isoformat(), "tasks": [{"task_id": "b", "title": "b", "time": "09:00", "status": "pending"}]},
    ]}]
    v = sig.streak_view(profile, sd, today)
    assert v.current == 5 and v.last_close_yesterday and not v.fresh_start_today
    assert v.needed_to_close == 1 and not v.closed_today


def test_streak_view_fresh_start_after_a_real_miss():
    from datetime import date

    today = date(2026, 9, 24)
    y, yy = today - timedelta(days=1), today - timedelta(days=2)
    profile = {"master_schedule_streak": 4, "master_schedule_streak_last_perfect_date": yy.isoformat()}
    sd = [{"id": "s1", "maxx_id": "skinmax", "days": [
        {"date": y.isoformat(), "tasks": [{"task_id": "a", "title": "a", "time": "09:00", "status": "pending"}]},
        {"date": today.isoformat(), "tasks": [{"task_id": "b", "title": "b", "time": "09:00", "status": "pending"}]},
    ]}]
    v = sig.streak_view(profile, sd, today)
    assert v.current == 0 and v.fresh_start_today


def test_wake_sleep_prefers_the_weekday_override():
    ob = {"wake_time": "07:00", "sleep_time": "23:00",
          "weekly_timings": {"saturday": {"wake_time": "09:30", "sleep_time": "01:00"}}}
    assert sig.wake_sleep_for(ob, "saturday") == (570, 60)
    assert sig.wake_sleep_for(ob, "monday") == (420, 1380)
    assert sig.wake_sleep_for({}, None) == (420, 1380)
    assert sig.parse_hhmm("7:30 PM") == 1170 and sig.parse_hhmm("bad") is None


@pytest.mark.asyncio
async def test_apns_payload_carries_link_keys_where_expo_reads_them(monkeypatch):
    """expo-notifications reads a remote push's data from userInfo['body'];
    the route/params must be there (and still at the top level)."""
    import json as _json
    import services.apns_service as apns

    monkeypatch.setattr(apns.settings, "notif_kill_switch", False, raising=False)
    monkeypatch.setattr(apns, "apns_configured", lambda: True)
    monkeypatch.setattr(apns, "_apns_jwt", lambda: "jwt")
    captured = {}

    class _Resp:
        status_code = 200
        text = ""

    class _Client:
        async def post(self, url, headers=None, content=None):
            captured["url"], captured["headers"], captured["payload"] = url, headers, _json.loads(content)
            return _Resp()

    monkeypatch.setattr(apns, "_http_client", lambda: _Client())
    ok, status = await apns.send_apns_alert(
        "deadbeef", "morning skincare", "time for it",
        custom={"category": "task_due", "route": "TaskGuide", "params": {"task_id": "t1", "schedule_id": "s1"}},
        thread_id="tasks", category="TASK_REMINDER", expires_in_s=3600,
    )
    assert ok and status == 200
    pl = captured["payload"]
    assert pl["body"] == {"route": "TaskGuide", "params": {"task_id": "t1", "schedule_id": "s1"}, "category": "task_due"}
    assert pl["route"] == "TaskGuide"                      # top level kept for the new client
    assert pl["aps"]["thread-id"] == "tasks" and pl["aps"]["category"] == "TASK_REMINDER"
    assert pl["aps"]["alert"] == {"title": "morning skincare", "body": "time for it"}
    assert int(captured["headers"]["apns-expiration"]) > 0


def test_provider_token_is_cached(monkeypatch):
    import services.apns_service as apns

    calls = []
    monkeypatch.setattr(apns, "_load_private_key", lambda raw: calls.append(raw) or "k")
    monkeypatch.setattr(apns.jwt, "encode", lambda *a, **k: f"tok{len(calls)}")
    apns._reset_jwt_cache()
    first, second = apns._apns_jwt(), apns._apns_jwt()
    assert first == second and len(calls) == 1
    apns._reset_jwt_cache()


@pytest.mark.asyncio
async def test_registering_a_token_takes_it_from_any_other_account():
    """One phone, one account: the latest registrant owns the device token, so
    a previous account's reminders never land on the new user's lock screen."""
    from api import users as users_api

    me = MagicMock()
    me.id = uuid.uuid4()
    db = MagicMock()
    db.get = AsyncMock(return_value=me)
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    raw = "<" + " ".join(["ABCDEF0123456789"] * 4) + ">"   # a real 64-hex APNs token, iOS-style
    body = users_api.PushTokenBody(token=raw)
    out = await users_api.register_push_token(body, current_user={"id": str(me.id), "is_paid": False}, db=db)
    assert out == {"message": "ok"}                       # unpaid accounts are accepted now
    stmt = db.execute.await_args.args[0]
    sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
    flat = sql.replace("\n", " ")
    assert flat.startswith("UPDATE app_users SET") and "apns_device_token=NULL" in flat
    assert "apns_token_updated_at=NULL" in flat and "app_users.id !=" in flat
    assert users_api._normalize_apns_device_token(raw) in sql
    assert me.apns_device_token and me.apns_device_token == users_api._normalize_apns_device_token(body.token)
