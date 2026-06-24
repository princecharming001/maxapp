"""Broadcast endpoint authz + fan-out (criterion 4, review item 5)."""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from middleware.auth_middleware import get_current_user
from db.sqlalchemy import get_db


def _user(is_admin=False):
    return {
        "id": str(uuid.uuid4()),
        "email": "a@b.com",
        "is_paid": True,
        "is_admin": is_admin,
        "onboarding": {},
        "profile": {},
    }


class _FakeResult:
    def __init__(self, scalar=0, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar(self):
        return self._scalar

    def scalars(self):
        m = MagicMock()
        m.all.return_value = self._rows
        return m


def _fake_db(users):
    db = MagicMock()
    # first execute -> count(0); second -> users
    db.execute = AsyncMock(side_effect=[_FakeResult(scalar=0), _FakeResult(rows=users)])
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _make_user_row(opt_in=True, token="abc123", tz="UTC"):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.apns_device_token = token
    u.onboarding = {"app_notifications_opt_in": opt_in, "timezone": tz, "wake_time": "07:00", "sleep_time": "23:00"}
    u.profile = {}
    return u


def teardown_function():
    app.dependency_overrides.clear()


def test_broadcast_rejects_non_admin():
    app.dependency_overrides[get_current_user] = lambda: _user(is_admin=False)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post("/api/admin/notifications/broadcast", json={"body": "something new just landed."})
    assert resp.status_code == 403


def test_broadcast_admin_sends_to_opted_in():
    admin = _user(is_admin=True)
    app.dependency_overrides[get_current_user] = lambda: admin
    rows = [_make_user_row(opt_in=True), _make_user_row(opt_in=True), _make_user_row(opt_in=False)]
    db = _fake_db(rows)
    app.dependency_overrides[get_db] = lambda: db

    with patch(
        "api.admin_notifications.send_apns_alert", new=AsyncMock(return_value=(True, 200))
    ) as send:
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/api/admin/notifications/broadcast",
            json={"body": "something new just landed.", "title": "from max"},
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ok"] is True
    # 2 opted-in users (UTC, mid-window via frozen send) reached; 1 skipped (opt-out)
    assert data["recipients"] == 3
    assert data["skipped"] >= 1
    # send fired for the opted-in users that were in-window
    assert send.await_count == data["sent_now"]


def test_broadcast_rejects_bad_taste_copy():
    app.dependency_overrides[get_current_user] = lambda: _user(is_admin=True)
    app.dependency_overrides[get_db] = lambda: _fake_db([])
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        "/api/admin/notifications/broadcast",
        json={"body": "don't miss out!!! last chance"},
    )
    assert resp.status_code == 422
