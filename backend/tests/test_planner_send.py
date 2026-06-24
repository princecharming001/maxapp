"""Integration test for the planner-driven send path (_plan_and_send_for_user).

Exercises the real flow end-to-end with a mocked DB/APNs: channel selection
(cross-channel dedup), candidate build -> plan -> deliver, task marking, and
notif_state recording. Covers criteria 3, 10 at the integration seam.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import services.scheduler_job as sj
from services.notification_planner import PlannerConfig
from services.notification_prefs import schedule_push_marked_sent, schedule_sms_marked_sent
import services.notification_state as ns


def _task(status="pending", time="10:00", title="morning skincare"):
    return {"task_uuid": "t1", "title": title, "time": time, "status": status}


def _schedule(task):
    s = MagicMock()
    s.maxx_id = "skinmax"
    s.days = [{"date": "_TODAY_", "tasks": [task]}]
    s.updated_at = None
    return s


def _user(*, push=True, sms=False):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.first_name = "Anish"
    u.apns_device_token = "abc123" if push else None
    u.apns_token_updated_at = None
    u.phone_number = "+15551234567" if sms else None
    u.onboarding = {
        "app_notifications_opt_in": push,
        "sendblue_sms_opt_in": sms,
        "sendblue_sms_engaged": sms,   # gate requires the user has texted our line
        "timezone": "America/New_York",
        "wake_time": "00:00",
        "sleep_time": "23:59",   # wide window so the test isn't clock-flaky
    }
    u.profile = {}
    return u


@pytest.fixture(autouse=True)
def _fast_mode_and_noop_flag(monkeypatch):
    # Fast mode bypasses the time-of-day "due now" gate so the test is
    # deterministic; flag_modified is a SQLAlchemy ORM call we stub on mocks.
    monkeypatch.setattr(sj.settings, "sms_scheduler_test_fast_mode", True, raising=False)
    monkeypatch.setattr(sj, "flag_modified", lambda *a, **k: None)
    # Make "today" match the schedule day.
    import datetime as _dt
    from zoneinfo import ZoneInfo
    today = _dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    yield today


async def _run(user, schedules):
    db = MagicMock()
    db.get = AsyncMock(return_value=user)
    db.commit = AsyncMock()
    await sj._plan_and_send_for_user(db, user.id, schedules, PlannerConfig.from_settings(), 4)


@pytest.mark.asyncio
async def test_push_user_gets_task_push_and_task_marked(_fast_mode_and_noop_flag):
    task = _task()
    sched = _schedule(task)
    sched.days[0]["date"] = _fast_mode_and_noop_flag
    user = _user(push=True, sms=True)  # both available -> push must win

    with patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push, \
         patch.object(sj.sendblue_service, "send_coaching_sms", new=AsyncMock(return_value=True)) as sms:
        await _run(user, [sched])

    # Push fired; SMS did NOT (cross-channel dedup — never both).
    assert push.await_count >= 1
    assert sms.await_count == 0
    # One of the sends is the task-due push that names the task.
    assert any(
        "skincare" in (c.args[1] + c.args[2]).lower() for c in push.await_args_list
    )
    # Every send carries a deep-link route in its custom payload.
    for c in push.await_args_list:
        custom = c.kwargs.get("custom") or {}
        assert custom.get("route") in {"Home", "TaskGuide", "Achievements", "Profile", "ProgressArchive"}
    # Task marked push-sent; not sms-sent.
    assert schedule_push_marked_sent(task) is True
    assert schedule_sms_marked_sent(task) is False
    # notif_state recorded a send.
    state = ns.get_state(user.profile)
    assert ns.sent_count_today(state, _fast_mode_and_noop_flag) >= 1


@pytest.mark.asyncio
async def test_sms_only_user_gets_sms_not_push(_fast_mode_and_noop_flag):
    task = _task()
    sched = _schedule(task)
    sched.days[0]["date"] = _fast_mode_and_noop_flag
    user = _user(push=False, sms=True)

    with patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push, \
         patch.object(sj.sendblue_service, "send_coaching_sms", new=AsyncMock(return_value=True)) as sms:
        await _run(user, [sched])

    assert push.await_count == 0
    assert sms.await_count >= 1
    assert schedule_sms_marked_sent(task) is True


@pytest.mark.asyncio
async def test_already_pushed_task_not_resent(_fast_mode_and_noop_flag):
    task = _task()
    task["notification_sent_push"] = True  # already nudged on push
    sched = _schedule(task)
    sched.days[0]["date"] = _fast_mode_and_noop_flag
    user = _user(push=True)

    with patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        await _run(user, [sched])

    # No task-due re-send (the only candidate task was already nudged). Broad
    # categories may still be muted/empty, but the task push must not repeat.
    for call in push.await_args_list:
        body = (call.args[1] + call.args[2]).lower()
        assert "skincare" not in body
