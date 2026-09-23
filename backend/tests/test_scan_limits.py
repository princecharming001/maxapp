"""Scan allowance + in-flight guard — the one rule the upload endpoint enforces
and GET /scans/latest reports.

Regressions for the live-observed disagreement between the app's local
re-implementation of the limit (local calendar day, counted failed scans) and
the server (UTC day, failed scans never consume a slot): premium users were
either bounced out of the Scan tab when a scan was permitted, or took three
photos and were 429'd. The server now decides once; the client only reads
`can_scan_now` / `next_scan_allowed_at`.

Run:
    pytest tests/test_scan_limits.py -v
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from api.scans import (
    _STALE_PROCESSING_S,
    compute_scan_allowance,
    facial_scan_summary_from_analysis,
    has_inflight_scan,
)


NOW = datetime(2026, 9, 23, 9, 0, 0)  # 09:00Z — 02:00 PDT, i.e. "yesterday" locally


def _allow(**kw):
    base = dict(
        is_scan_user=False, is_paid=True, is_premium=True,
        first_scan_completed=True, last_scan_at=None, now=NOW,
    )
    base.update(kw)
    return compute_scan_allowance(**base)


# ---------------------------------------------------------------------------
# compute_scan_allowance — pure rule
# ---------------------------------------------------------------------------

class TestPremiumDailyRule:
    def test_scan_earlier_in_the_same_utc_day_blocks_until_utc_midnight(self):
        # 07:00Z is 00:00 PDT (a different LOCAL day than 02:00 PDT). The old
        # client compared local calendar days and let the user take 3 photos
        # before the server 429'd them. The rule is the UTC day.
        can, next_at, reason = _allow(last_scan_at=NOW.replace(hour=7))
        assert can is False
        assert reason == "daily_limit"
        assert next_at == datetime(2026, 9, 24, 0, 0, 0)

    def test_scan_late_yesterday_utc_is_allowed_even_if_same_local_day(self):
        # 23:00Z yesterday = 16:00 PDT yesterday; now 09:00Z = 02:00 PDT today —
        # a new UTC day, so the server allows it (the old local-day client
        # blocked it when the local day matched, e.g. 4pm → 6pm PST).
        can, next_at, reason = _allow(last_scan_at=NOW - timedelta(hours=10))
        assert can is True and next_at is None and reason is None

    def test_no_prior_scan_is_allowed(self):
        assert _allow(last_scan_at=None)[0] is True

    def test_tz_aware_inputs_are_normalised_to_utc(self):
        aware_last = datetime(2026, 9, 23, 7, 0, tzinfo=timezone.utc)
        aware_now = datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc)
        can, next_at, _ = _allow(last_scan_at=aware_last, now=aware_now)
        assert can is False
        assert next_at == datetime(2026, 9, 24, 0, 0, 0)


class TestBasicWeeklyRule:
    def test_within_seven_days_blocks_until_last_plus_seven(self):
        last = NOW - timedelta(days=3)
        can, next_at, reason = _allow(is_premium=False, last_scan_at=last)
        assert can is False
        assert reason == "weekly_limit"
        assert next_at == last + timedelta(days=7)

    def test_after_seven_days_is_allowed(self):
        can, _, _ = _allow(is_premium=False, last_scan_at=NOW - timedelta(days=7, seconds=1))
        assert can is True


class TestFreeAndScanUsers:
    def test_free_user_gets_one_lifetime_scan(self):
        can, next_at, reason = _allow(is_paid=False, is_premium=False, first_scan_completed=False)
        assert can is True
        can, next_at, reason = _allow(is_paid=False, is_premium=False, first_scan_completed=True)
        assert (can, next_at, reason) == (False, None, "free_limit")

    def test_scan_user_is_unlimited(self):
        can, _, _ = _allow(is_scan_user=True, is_paid=False, is_premium=False, last_scan_at=NOW)
        assert can is True


# ---------------------------------------------------------------------------
# has_inflight_scan — duplicate-upload guard window
# ---------------------------------------------------------------------------

class TestInflightGuard:
    def test_recent_processing_row_is_in_flight(self):
        assert has_inflight_scan(NOW - timedelta(seconds=30), NOW) is True

    def test_row_older_than_the_reaper_cutoff_is_stranded_not_in_flight(self):
        assert has_inflight_scan(NOW - timedelta(seconds=_STALE_PROCESSING_S + 1), NOW) is False

    def test_no_row(self):
        assert has_inflight_scan(None, NOW) is False


# ---------------------------------------------------------------------------
# facial_scan_summary_from_analysis — the denormalized headline
# ---------------------------------------------------------------------------

def test_summary_reads_psl_and_profile_insights():
    s = facial_scan_summary_from_analysis(
        {
            "overall_score": 6.1,
            "potential_score": 7.4,
            "psl_rating": {"psl_score": 6.1, "psl_tier": "MTN", "appeal": 6.0, "halo_feature": "Eyes"},
            "profile_insights": {"archetype": "Rugged", "suggested_modules": ["skinmax"], "first_move": ["skinmax"]},
        },
        now=NOW,
    )
    assert s["archetype"] == "Rugged"
    assert s["halo_feature"] == "Eyes"
    assert s["first_move"] == ["skinmax"]
    assert s["scan_completed_at"] == NOW.isoformat() + "Z"


# ---------------------------------------------------------------------------
# Stored scan images are actually deleted (storage_service.delete_by_url)
# ---------------------------------------------------------------------------

class _FakeStorage:
    def __init__(self, fail_on=None):
        self.deleted = []
        self.fail_on = fail_on

    async def delete_image(self, key):
        if key == self.fail_on:
            raise RuntimeError("boom")
        self.deleted.append(key)
        return True


def test_delete_by_url_runs_even_when_not_awaited(monkeypatch):
    """The legacy call sites (avatar replace, progress-photo delete) never
    await it; the delete used to be an un-awaited coroutine that did nothing."""
    import asyncio
    from services import storage_service as mod

    fake = _FakeStorage()
    monkeypatch.setattr(mod, "storage_service", fake)

    async def scenario():
        mod.delete_by_url("/uploads/u1/a.jpg")  # fire-and-forget, as users.py does
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert fake.deleted == ["/uploads/u1/a.jpg"]
        # And awaiting it reports the outcome.
        assert await mod.delete_by_url("/uploads/u1/b.jpg") is True
        assert fake.deleted == ["/uploads/u1/a.jpg", "/uploads/u1/b.jpg"]

    asyncio.run(scenario())


def test_delete_many_by_url_is_best_effort_and_dedupes(monkeypatch):
    import asyncio
    from services import storage_service as mod

    fake = _FakeStorage(fail_on="/uploads/u1/bad.jpg")
    monkeypatch.setattr(mod, "storage_service", fake)
    urls = ["/uploads/u1/a.jpg", "/uploads/u1/bad.jpg", "/uploads/u1/a.jpg", None, "", 42]
    removed = asyncio.run(mod.delete_many_by_url(urls))
    assert removed == 1
    assert fake.deleted == ["/uploads/u1/a.jpg"]


def test_delete_my_account_collects_scan_images_before_the_row_delete():
    import inspect
    from api import users as users_module

    src = inspect.getsource(users_module.delete_my_account)
    assert "Scan.images" in src and "UserProgressPhoto.image_url" in src and "avatar_url" in src
    assert src.index("Scan.images") < src.index("delete(User)"), (
        "images must be enumerated BEFORE the FK cascade removes the scan rows"
    )
    assert "delete_many_by_url" in src


# ---------------------------------------------------------------------------
# GET /scans/latest reports the decision (FastAPI, fake DB)
# ---------------------------------------------------------------------------

class _Result:
    def __init__(self, single=None, scalar=None, first=None):
        self._single, self._scalar, self._first = single, scalar, first

    def scalar_one_or_none(self):
        return self._single

    def scalar(self):
        return self._scalar

    def first(self):
        return self._first


class _FakeDB:
    def __init__(self, script):
        self._script = list(script)
        self.commits = 0

    async def execute(self, _stmt, *_a, **_k):
        assert self._script, "unexpected extra query"
        return self._script.pop(0)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


def _scan(status="completed", created_at=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        created_at=created_at or datetime.now(timezone.utc) - timedelta(hours=1),
        images={"front": "https://x/f.jpg"},
        processing_status=status,
        analysis=None,
    )


def _user(**overrides):
    base = {
        "id": str(uuid.uuid4()), "is_paid": True, "is_scan_user": False,
        "subscription_tier": "premium", "first_scan_completed": True,
    }
    base.update(overrides)
    return base


@pytest.fixture
def client_factory():
    from fastapi.testclient import TestClient
    from main import app
    from db import get_db
    from middleware.auth_middleware import get_current_user

    def make(user, db):
        async def _u():
            return user

        async def _db():
            yield db

        app.dependency_overrides[get_current_user] = _u
        app.dependency_overrides[get_db] = _db
        return TestClient(app, raise_server_exceptions=True)

    yield make
    app.dependency_overrides.clear()


def test_latest_reports_daily_limit_for_a_scan_earlier_today(client_factory):
    scan = _scan("completed", datetime.now(timezone.utc) - timedelta(minutes=5))
    db = _FakeDB([_Result(single=scan), _Result(scalar=1)])
    resp = client_factory(_user(), db).get("/api/scans/latest")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["can_scan_now"] is False
    assert body["scan_limit_reason"] == "daily_limit"
    assert body["next_scan_allowed_at"].endswith("T00:00:00Z")


def test_latest_looks_past_a_failed_row_when_deciding(client_factory):
    # Latest row FAILED 5 min ago; the last GOOD scan was two days ago. A failed
    # scan never consumes the daily slot, so the user may scan now — the old
    # client read latest.created_at with no status filter and said "wait".
    failed = _scan("failed", datetime.now(timezone.utc) - timedelta(minutes=5))
    two_days = (datetime.now(timezone.utc) - timedelta(days=2),)
    db = _FakeDB([_Result(single=failed), _Result(scalar=1), _Result(first=two_days)])
    body = client_factory(_user(), db).get("/api/scans/latest").json()
    assert body["processing_status"] == "failed"
    assert body["can_scan_now"] is True
    assert body["next_scan_allowed_at"] is None


def test_latest_free_user_after_first_scan_cannot_scan(client_factory):
    scan = _scan("completed", datetime.now(timezone.utc) - timedelta(days=3))
    db = _FakeDB([_Result(single=scan), _Result(scalar=1)])
    body = client_factory(_user(is_paid=False, subscription_tier=None), db).get("/api/scans/latest").json()
    assert body["can_scan_now"] is False
    assert body["scan_limit_reason"] == "free_limit"
    assert body["is_unlocked"] is False


def test_latest_no_scan_still_returns_null_body(client_factory):
    db = _FakeDB([_Result(single=None)])
    resp = client_factory(_user(), db).get("/api/scans/latest")
    assert resp.status_code == 200
    assert resp.json() is None
