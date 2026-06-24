"""Queued-broadcast worker: delivers at next in-window slot, respects the cap.

Covers the delivery half of the spec's window test — a broadcast queued while a
user was asleep is delivered once they're in-window, and NEVER pushes a user past
their daily cap (review item 5).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

import pytest

import services.scheduler_job as sj
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


def _row():
    r = MagicMock()
    r.id = 1
    r.user_id = uuid.uuid4()
    r.message = "something new just landed."
    r.category_id = "broadcast"
    r.status = "pending"
    r.sent_at = None
    return r


def _today_iso():
    return datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def _db(user, rows):
    db = MagicMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    db.execute = AsyncMock(return_value=result)
    db.get = AsyncMock(return_value=user)
    db.commit = AsyncMock()
    return db


@pytest.fixture(autouse=True)
def _noop_flag(monkeypatch):
    monkeypatch.setattr(sj, "flag_modified", lambda *a, **k: None)


@pytest.mark.asyncio
async def test_queued_broadcast_delivers_in_window():
    user = _user()
    row = _row()
    db = _db(user, [row])
    with patch.object(sj, "AsyncSessionLocal") as Session, \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        Session.return_value.__aenter__ = AsyncMock(return_value=db)
        Session.return_value.__aexit__ = AsyncMock(return_value=False)
        await sj.send_queued_notifications()
    assert send.await_count == 1
    custom = send.await_args.kwargs.get("custom") or {}
    assert custom.get("route") == "Home"          # broadcast deep-link
    assert row.status == "sent"
    state = ns.get_state(user.profile)
    assert ns.sent_count_today(state, _today_iso()) >= 1


@pytest.mark.asyncio
async def test_queued_broadcast_deferred_when_at_cap():
    cap = PlannerConfig.from_settings().cap
    today = _today_iso()
    now = datetime.now(ZoneInfo("America/New_York"))
    state = {}
    for i in range(cap):
        state = ns.record_sent(state, today, f"cat:filler{i}", now)
    user = _user(profile=ns.put_state({}, state))
    row = _row()
    db = _db(user, [row])
    with patch.object(sj, "AsyncSessionLocal") as Session, \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        Session.return_value.__aenter__ = AsyncMock(return_value=db)
        Session.return_value.__aexit__ = AsyncMock(return_value=False)
        await sj.send_queued_notifications()
    assert send.await_count == 0       # ceiling respected
    assert row.status == "pending"     # left queued for a later tick


@pytest.mark.asyncio
async def test_queued_broadcast_cancelled_when_category_muted():
    user = _user()
    user.onboarding = {**user.onboarding, "notif_category_prefs": {"broadcast": False}}
    row = _row()
    db = _db(user, [row])
    with patch.object(sj, "AsyncSessionLocal") as Session, \
         patch.object(sj, "send_apns_alert", new=AsyncMock(return_value=(True, 200))) as send:
        Session.return_value.__aenter__ = AsyncMock(return_value=db)
        Session.return_value.__aexit__ = AsyncMock(return_value=False)
        await sj.send_queued_notifications()
    assert send.await_count == 0
    assert row.status == "cancelled"   # honors per-category mute
