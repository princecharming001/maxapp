"""Unit tests for the Post for Me creator-social provider.

Mocks the single _request chokepoint so we exercise URL selection, the
external_id namespacing, response normalization, and error handling without a
network. Mirrors Yunicorn's Post for Me contract.
"""
from __future__ import annotations

import pytest

from services import creator_social_postforme as pfm


@pytest.fixture(autouse=True)
def _key(monkeypatch):
    # enabled() and _request read settings; give them a deterministic key/base.
    from config import settings
    monkeypatch.setattr(settings, "postforme_key", "test-key", raising=False)
    monkeypatch.setattr(settings, "postforme_base", "https://api.postforme.dev/v1", raising=False)
    monkeypatch.setattr(settings, "postforme_external_id_prefix", "maxapp", raising=False)


def _mock_request(monkeypatch, capture: dict):
    async def fake(method, path, *, json_body=None, params=None):
        capture["method"] = method
        capture["path"] = path
        capture["json_body"] = json_body
        capture["params"] = params
        return capture["status"], capture["data"]

    monkeypatch.setattr(pfm, "_request", fake)


def test_enabled_and_external_id():
    assert pfm.enabled() is True
    assert pfm.external_id("abc-123", "instagram") == "maxapp:abc-123:instagram"


@pytest.mark.asyncio
async def test_auth_url_tags_external_id(monkeypatch):
    cap = {"status": 200, "data": {"url": "https://connect.postforme.dev/xyz"}}
    _mock_request(monkeypatch, cap)

    url = await pfm.auth_url("instagram", "user-1", "cannon://creator-social-connected")

    assert url == "https://connect.postforme.dev/xyz"
    assert cap["path"] == "/social-accounts/auth-url"
    assert cap["json_body"]["platform"] == "instagram"
    assert cap["json_body"]["external_id"] == "maxapp:user-1:instagram"
    # Quickstart default: redirect override is NOT sent (would 400).
    assert "redirect_url_override" not in cap["json_body"]


@pytest.mark.asyncio
async def test_auth_url_sends_redirect_when_allowed(monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "postforme_allow_redirect_override", True, raising=False)
    cap = {"status": 200, "data": {"url": "https://connect.postforme.dev/xyz"}}
    _mock_request(monkeypatch, cap)

    await pfm.auth_url("tiktok", "user-1", "cannon://creator-social-connected")

    assert cap["json_body"]["redirect_url_override"] == "cannon://creator-social-connected"


@pytest.mark.asyncio
async def test_auth_url_raises_on_error(monkeypatch):
    cap = {"status": 400, "data": {"message": "bad platform"}}
    _mock_request(monkeypatch, cap)
    with pytest.raises(RuntimeError):
        await pfm.auth_url("myspace", "user-1")


@pytest.mark.asyncio
async def test_list_accounts_normalizes_and_filters(monkeypatch):
    cap = {
        "status": 200,
        "data": {
            "data": [
                {
                    "id": "spc_ig1",
                    "platform": "instagram",
                    "username": "creator.ig",
                    "profile_photo_url": "https://img/ig.jpg",
                    "status": "connected",
                    "external_id": "maxapp:user-1",
                },
                {
                    "id": "spc_yt1",
                    "platform": "youtube",  # not one of ours — filtered out
                    "username": "creator.yt",
                },
            ]
        },
    }
    _mock_request(monkeypatch, cap)

    accts = await pfm.list_accounts("user-1", "instagram")

    assert cap["params"]["external_id"] == "maxapp:user-1:instagram"
    assert len(accts) == 1
    a = accts[0]
    assert a["id"] == "spc_ig1"
    assert a["platform"] == "instagram"
    assert a["username"] == "creator.ig"
    assert a["profile_photo_url"] == "https://img/ig.jpg"


@pytest.mark.asyncio
async def test_list_accounts_empty_on_http_error(monkeypatch):
    cap = {"status": 500, "data": {"message": "server"}}
    _mock_request(monkeypatch, cap)
    assert await pfm.list_accounts("user-1", "instagram") == []


@pytest.mark.asyncio
async def test_disconnect(monkeypatch):
    cap = {"status": 204, "data": {}}
    _mock_request(monkeypatch, cap)
    ok = await pfm.disconnect("spc_ig1")
    assert ok is True
    assert cap["path"] == "/social-accounts/spc_ig1/disconnect"

    assert await pfm.disconnect("") is False
