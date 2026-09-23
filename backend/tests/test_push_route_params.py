"""Task-reminder pushes must deep-link to a RESOLVABLE guide.

The TaskGuide route is schedule-scoped (schedules/:id/tasks/:task_id/guide) and
keyed by the per-instance task_id, while the planner tracks tasks by the
day-stable task_uuid. A push that carried only {task_uuid, maxx, title} opened
the guide screen with no schedule and dead-ended every tap. These pin the
contract at both seams: the candidate builder passes schedule_id/task_id through
to route_params, and the real send path (_plan_and_send_for_user) puts them in
the APNs custom payload.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import services.scheduler_job as sj
from services.notification_candidates import build_candidates
from services.notification_copy import CAT_TASK_DUE
from services.notification_planner import PlannerConfig


_BASE = dict(now_min=480, wake_min=420, sleep_min=1380, weekday=1,
             name="anish", why=None, streak=0, active_plans={"skinmax"})


def _task_due(cands):
    return next(c for c in cands if c.category == CAT_TASK_DUE)


def test_task_due_params_carry_schedule_and_task_ids():
    tasks = [{
        "uuid": "t1", "title": "morning skincare", "time_min": 480, "maxx": "skinmax",
        "pending": True, "schedule_id": "sched-1", "task_id": "inst-9",
    }]
    td = _task_due(build_candidates(tasks=tasks, **_BASE))
    assert td.route == "TaskGuide"
    assert td.params["task_uuid"] == "t1"
    assert td.params["schedule_id"] == "sched-1"
    assert td.params["task_id"] == "inst-9"
    # The dedup identity is unchanged — still the day-stable uuid.
    assert td.task_uuid == "t1"
    assert td.dedup_key == "task:t1"


def test_legacy_task_shape_omits_ids_rather_than_sending_null():
    # Callers that don't know the instance ids (older shape) must not produce
    # {"schedule_id": null} — the client treats a missing key as "resolve via
    # the cached schedules", but a null would be a broken link.
    tasks = [{"uuid": "t1", "title": "x", "time_min": 480, "maxx": "skinmax", "pending": True}]
    td = _task_due(build_candidates(tasks=tasks, **_BASE))
    assert "schedule_id" not in td.params
    assert "task_id" not in td.params
    assert td.params["task_uuid"] == "t1"


# --- the real send path -------------------------------------------------------

def _user():
    u = MagicMock()
    u.id = uuid.uuid4()
    u.first_name = "Anish"
    u.apns_device_token = "abc123"
    u.apns_token_updated_at = None
    u.phone_number = None
    u.onboarding = {
        "app_notifications_opt_in": True,
        "timezone": "America/New_York",
        "wake_time": "00:00",
        "sleep_time": "23:59",  # wide window so the test isn't clock-flaky
    }
    u.profile = {}
    return u


@pytest.fixture(autouse=True)
def _fast_mode_and_noop_flag(monkeypatch):
    monkeypatch.setattr(sj.settings, "sms_scheduler_test_fast_mode", True, raising=False)
    monkeypatch.setattr(sj, "flag_modified", lambda *a, **k: None)
    import datetime as _dt
    from zoneinfo import ZoneInfo
    yield _dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()


@pytest.mark.asyncio
async def test_send_path_puts_schedule_and_task_ids_in_push_payload(_fast_mode_and_noop_flag):
    sched_id = uuid.uuid4()
    task = {"task_uuid": "t1", "task_id": "inst-42", "title": "morning skincare",
            "time": "10:00", "status": "pending"}
    sched = MagicMock()
    sched.id = sched_id
    sched.maxx_id = "skinmax"
    sched.days = [{"date": _fast_mode_and_noop_flag, "tasks": [task]}]
    sched.updated_at = None
    user = _user()
    db = MagicMock()
    db.get = AsyncMock(return_value=user)
    db.commit = AsyncMock()

    with patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as push:
        await sj._plan_and_send_for_user(db, user.id, [sched], PlannerConfig.from_settings(), 4)

    task_pushes = [
        c for c in push.await_args_list
        if (c.kwargs.get("custom") or {}).get("route") == "TaskGuide"
    ]
    assert task_pushes, "expected a task-due push"
    params = task_pushes[0].kwargs["custom"]["params"]
    assert params["schedule_id"] == str(sched_id)
    assert params["task_id"] == "inst-42"
    assert params["task_uuid"] == "t1"
    assert params["maxx"] == "skinmax"
