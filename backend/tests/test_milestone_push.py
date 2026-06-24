"""Milestone push respects the daily ceiling (criterion 5 / review item 5).

Event-driven milestones must NOT bypass the per-user cap into a flood: if the
user is already at their daily cap, the milestone push is deferred/dropped; with
room (and in-window), it fires and deep-links to Achievements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

import services.achievements as ach
from services.notification_planner import PlannerConfig
import services.notification_state as ns


def _user(profile=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.first_name = "Anish"
    u.apns_device_token = "abc123"
    u.apns_token_updated_at = None
    u.onboarding = {
        "app_notifications_opt_in": True,
        "timezone": "America/New_York",
        "wake_time": "00:00",
        "sleep_time": "23:59",  # wide window so the test isn't clock-flaky
    }
    u.profile = profile or {}
    return u


def _today_iso():
    return datetime.now(ZoneInfo("America/New_York")).date().isoformat()


@pytest.fixture(autouse=True)
def _noop_flag(monkeypatch):
    monkeypatch.setattr(ach, "logger", ach.logger)  # keep logger
    # flag_modified is imported inside the function from sqlalchemy; patch it
    # there via the orm module so the mock user doesn't trip ORM instrumentation.
    import sqlalchemy.orm.attributes as attrs
    monkeypatch.setattr(attrs, "flag_modified", lambda *a, **k: None)


async def _run(user):
    db = MagicMock()
    db.commit = AsyncMock()
    await ach._send_milestone_push(db, user, {"current": 7})


@pytest.mark.asyncio
async def test_milestone_fires_with_room_and_routes_to_achievements():
    user = _user()
    with patch("services.apns_service.send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        await _run(user)
    assert send.await_count == 1
    custom = send.await_args.kwargs.get("custom") or {}
    assert custom.get("route") == "Achievements"


@pytest.mark.asyncio
async def test_milestone_suppressed_when_at_daily_cap():
    cap = PlannerConfig.from_settings().cap
    today = _today_iso()
    # Fill the day to the cap with unrelated sends.
    state = {}
    now = datetime.now(ZoneInfo("America/New_York"))
    for i in range(cap):
        state = ns.record_sent(state, today, f"cat:filler{i}", now)
    user = _user(profile=ns.put_state({}, state))

    with patch("services.apns_service.send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        await _run(user)
    assert send.await_count == 0  # ceiling respected — no flood


@pytest.mark.asyncio
async def test_milestone_not_sent_twice_in_one_day():
    today = _today_iso()
    now = datetime.now(ZoneInfo("America/New_York"))
    state = ns.record_sent({}, today, "cat:milestone", now)
    user = _user(profile=ns.put_state({}, state))

    with patch("services.apns_service.send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        await _run(user)
    assert send.await_count == 0
