"""Google Calendar connect / break / disconnect: the user-visible failure paths.

No live Google, no DB. Each test pins one thing a real person would otherwise
be confused by: a raw JSON error after tapping Cancel, "Connected" with the
calendar box unticked, a network blip silently disconnecting them, a revoked
grant that just looks "not connected", or a Superpower calendar left behind.
"""

from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

import api.google as g
import services.gcal_mirror as gm
import services.google_integration as gi

USER = "11111111-1111-1111-1111-111111111111"
RETURN = "cannon://google-connected"


# --------------------------------------------------------------------------- #
#  Consent URL                                                                 #
# --------------------------------------------------------------------------- #

def test_auth_url_always_shows_the_account_picker(monkeypatch):
    monkeypatch.setattr(gi.settings, "google_client_id", "cid", raising=False)
    monkeypatch.setattr(gi.settings, "google_redirect_uri", "https://x/cb", raising=False)
    q = parse_qs(urlparse(gi.build_auth_url("st", False)).query)
    assert "select_account" in q["prompt"][0]
    assert "consent" in q["prompt"][0]
    assert q["scope"][0] == gi.SCOPE_CALENDAR


def test_calendar_read_scope_check():
    assert gi.granted_calendar_read({"scope": f"{gi.SCOPE_CALENDAR} {gi.SCOPE_CALENDAR_APP}"})
    # Unticked on Google's screen: only the write scope came back.
    assert not gi.granted_calendar_read({"scope": gi.SCOPE_CALENDAR_APP})
    assert not gi.granted_calendar_read({})


# --------------------------------------------------------------------------- #
#  Callback failures go back to the app with a reason                          #
# --------------------------------------------------------------------------- #

def _error_of(resp) -> str | None:
    loc = resp.headers.get("location") or ""
    assert loc.startswith(RETURN), loc
    return (parse_qs(urlparse(loc).query).get("error") or [None])[0]


@pytest.mark.asyncio
async def test_cancel_on_google_redirects_back_with_denied():
    state = g._sign_state(USER, RETURN)
    resp = await g.callback(state=state, code=None, error="access_denied", db=None)
    assert resp.status_code == 302
    assert _error_of(resp) == "denied"


@pytest.mark.asyncio
async def test_token_exchange_failure_redirects_back_with_failed(monkeypatch):
    async def boom(code):
        raise RuntimeError("invalid_grant")
    monkeypatch.setattr(g, "exchange_code", boom)
    resp = await g.callback(state=g._sign_state(USER, RETURN), code="c", error=None, db=None)
    assert _error_of(resp) == "failed"


@pytest.mark.asyncio
async def test_unticked_calendar_scope_is_not_stored(monkeypatch):
    stored = []

    async def fake_exchange(code):
        return {"access_token": "a", "refresh_token": "r", "scope": gi.SCOPE_CALENDAR_APP}

    async def fake_store(*a, **k):
        stored.append(1)

    monkeypatch.setattr(g, "exchange_code", fake_exchange)
    monkeypatch.setattr(g, "store_connection", fake_store)
    resp = await g.callback(state=g._sign_state(USER, RETURN), code="c", error=None, db=None)
    assert _error_of(resp) == "no_calendar"
    assert stored == []          # never shows "Connected" for a useless grant


@pytest.mark.asyncio
async def test_tampered_state_shows_a_page_not_json():
    resp = await g.callback(state="nope.bad", code="c", error=None, db=None)
    assert resp.status_code == 400
    assert b"try again" in resp.body


# --------------------------------------------------------------------------- #
#  Revoked vs. a network blip                                                  #
# --------------------------------------------------------------------------- #

def test_needs_reconnect_only_for_a_dead_grant():
    live = SimpleNamespace(is_active=True, tokens_decrypted={"refresh_token": "r"})
    revoked = SimpleNamespace(is_active=False, tokens_decrypted={"refresh_token": "r"})
    user_disconnected = SimpleNamespace(is_active=False, tokens_decrypted={})
    assert g.connection_needs_reconnect(live) is False
    assert g.connection_needs_reconnect(revoked) is True
    assert g.connection_needs_reconnect(user_disconnected) is False
    assert g.connection_needs_reconnect(None) is False


def _patch_http(monkeypatch, handler):
    real = httpx.AsyncClient

    def factory(*a, **k):
        k["transport"] = httpx.MockTransport(handler)
        return real(*a, **k)

    monkeypatch.setattr(gi.httpx, "AsyncClient", factory)


def _stale_conn():
    return SimpleNamespace(tokens_decrypted={"refresh_token": "r"}, is_active=True)


@pytest.mark.asyncio
async def test_refresh_rejected_by_google_means_reconnect(monkeypatch):
    _patch_http(monkeypatch, lambda req: httpx.Response(400, json={"error": "invalid_grant"}))
    assert await gi._fresh_access_token(_stale_conn(), db=None) is None


@pytest.mark.asyncio
async def test_google_outage_is_not_treated_as_revoked(monkeypatch):
    _patch_http(monkeypatch, lambda req: httpx.Response(503))
    with pytest.raises(gi.GoogleTransientError):
        await gi._fresh_access_token(_stale_conn(), db=None)

    def offline(req):
        raise httpx.ConnectError("offline")
    _patch_http(monkeypatch, offline)
    with pytest.raises(gi.GoogleTransientError):
        await gi._fresh_access_token(_stale_conn(), db=None)


class _Result:
    def __init__(self, obj):
        self._obj = obj

    def scalars(self):
        return self

    def first(self):
        return self._obj


class _FakeDB:
    def __init__(self, conn=None, user=None):
        self.conn, self.user, self.commits = conn, user, 0

    async def execute(self, *a, **k):
        return _Result(self.conn)

    async def get(self, *a, **k):
        return self.user

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_sync_during_outage_keeps_the_connection(monkeypatch):
    conn = _stale_conn()

    async def flaky(c, db):
        raise gi.GoogleTransientError("503")
    monkeypatch.setattr(gi, "_fresh_access_token", flaky)
    out = await gi.sync_google_calendar(USER, _FakeDB(conn))
    assert out.get("error") == 1
    assert conn.is_active is True


# --------------------------------------------------------------------------- #
#  The Superpower calendar                                                     #
# --------------------------------------------------------------------------- #

def test_calendar_deleted_only_when_every_insert_404s():
    assert gm.calendar_was_deleted(["a", "b"], {"a": (404, {}), "b": (404, {})})
    assert not gm.calendar_was_deleted(["a", "b"], {"a": (404, {}), "b": (200, {})})
    assert not gm.calendar_was_deleted([], {"x": (404, {})})


@pytest.mark.asyncio
async def test_teardown_reports_a_calendar_it_could_not_remove(monkeypatch):
    import services.gcal_write as gw

    async def ok_delete(tok, cal):
        return True
    monkeypatch.setattr(gw, "delete_calendar", ok_delete)

    # Nothing to remove.
    assert await gm.teardown_mirror(USER, SimpleNamespace(app_calendar_id=None), None, _FakeDB()) is True
    # Calendar exists but no live token (Google already cut us off).
    conn = SimpleNamespace(app_calendar_id="cal@group")
    assert await gm.teardown_mirror(USER, conn, None, _FakeDB()) is False
    assert conn.app_calendar_id is None
    # Calendar exists and we can delete it.
    conn = SimpleNamespace(app_calendar_id="cal@group")
    assert await gm.teardown_mirror(USER, conn, "tok", _FakeDB()) is True


@pytest.mark.asyncio
async def test_disconnect_tells_the_app_when_the_calendar_was_left(monkeypatch):
    conn = SimpleNamespace(
        id="c1", is_active=True, app_calendar_id="cal@group",
        tokens={"refresh_token": "r"}, tokens_encrypted=None,
        tokens_decrypted={"refresh_token": "r"},
    )

    async def no_token(c, db):
        return None

    async def no_revoke(tok):
        return None

    import services.schedule_runtime as sr

    async def no_regen(**k):
        return None

    monkeypatch.setattr(g, "_fresh_access_token", no_token)
    monkeypatch.setattr(g, "_revoke_token", no_revoke)
    monkeypatch.setattr(sr, "regenerate_active_schedules", no_regen)

    out = await g.disconnect(current_user={"id": USER}, db=_FakeDB(conn, user=None))
    assert out == {"disconnected": True, "routine_calendar_left": True}
    assert conn.is_active is False
    assert conn.app_calendar_id is None


@pytest.mark.asyncio
async def test_existing_connections_learn_their_account_email(monkeypatch):
    import json

    async def email(tok):
        return "me@example.com"
    monkeypatch.setattr(gi, "fetch_account_email", email)
    conn = SimpleNamespace(tokens_decrypted={"refresh_token": "r"}, tokens_encrypted=None, tokens={})
    await gi._backfill_account_email(conn, "tok", _FakeDB())
    from services.secrets import decrypt_token
    stored = json.loads(decrypt_token(conn.tokens_encrypted))
    assert stored["account_email"] == "me@example.com"
    assert stored["refresh_token"] == "r"   # nothing else lost
    assert conn.tokens is None
