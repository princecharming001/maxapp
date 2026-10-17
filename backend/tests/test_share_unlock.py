"""Share-to-unlock (services/share_unlock_service.py): text the preset message
to N friends, get the first week free. Pure logic + a fake DB, matching
tests/test_referral.py."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

import services.share_unlock_service as S
from models.sqlalchemy_models import User


def _user(**kw) -> User:
    base = dict(id=uuid4(), email="u@x.com", password_hash="x", is_paid=False)
    base.update(kw)
    return User(**base)


# ── pure logic ──────────────────────────────────────────────────────────────

def test_phone_numbers_normalize_so_one_friend_is_one_recipient():
    assert S.normalize_phone("(415) 555-0100") == "14155550100"
    assert S.normalize_phone("+1 415 555 0100") == "14155550100"
    assert S.normalize_phone("415.555.0100") == "14155550100"
    assert S.normalize_phone("+44 7700 900123") == "447700900123"
    assert S.normalize_phone("12") is None and S.normalize_phone("") is None and S.normalize_phone(None) is None


def test_recipient_hash_is_stable_and_never_the_number(monkeypatch):
    monkeypatch.setattr(S.settings, "share_unlock_hmac_secret", "s3cret", raising=False)
    a, b = S.recipient_hmac("14155550100"), S.recipient_hmac("14155550100")
    assert a == b and len(a) == 64 and "4155550100" not in a
    assert S.recipient_hmac("14155550101") != a


def test_the_mac_key_is_derived_not_the_jwt_secret(monkeypatch):
    monkeypatch.setattr(S.settings, "share_unlock_hmac_secret", "", raising=False)
    monkeypatch.setattr(S.settings, "jwt_secret_key", "jwt-secret", raising=False)
    assert S._hmac_key() != b"jwt-secret" and len(S._hmac_key()) == 32


def test_message_fills_in_app_name_and_link(monkeypatch):
    monkeypatch.setattr(S.settings, "app_name", "Superpower", raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_link", "https://apps.apple.com/app/id1", raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_message", "Join {app} with me: {link}", raising=False)
    assert S.message_text() == "Join Superpower with me: https://apps.apple.com/app/id1"


def test_status_reasons():
    now = datetime.now(timezone.utc)
    assert S._status_dict(_user(), 0, None)["eligible"]
    paying = _user(is_paid=True, subscription_end_date=now + timedelta(days=3))
    assert S._status_dict(paying, 0, None)["reason"] == "already_entitled"
    lapsed = _user(is_paid=True, subscription_end_date=now - timedelta(days=3))
    assert S._status_dict(lapsed, 3, None)["eligible"]
    st = S._status_dict(paying, 15, now)
    assert st["reason"] == "already_claimed" and st["granted"] and st["remaining"] == 0


# ── fake DB: the one-statement seams, in memory ─────────────────────────────

class _FakeDB:
    def __init__(self):
        self.committed = 0

    async def commit(self):
        self.committed += 1


@pytest.fixture
def world(monkeypatch):
    """One user, in-memory progress + recipient table, activations recorded."""
    user = _user()
    state = {"row": None, "sends": {}, "activations": []}      # sends: hmac -> send row

    async def get_unlock(_db, uid):
        return state["row"]

    async def ensure_unlock(_db, uid, version):
        state["row"] = state["row"] or SimpleNamespace(sent_count=0, granted_at=None, message_version=version)

    async def find_send(_db, uid, h):
        return state["sends"].get(h)

    async def add_send(_db, uid, h, cid):
        if h in state["sends"]:
            return False
        state["sends"][h] = SimpleNamespace(client_send_id=cid)
        return True

    async def increment(_db, uid, now):
        state["row"].sent_count += 1
        return state["row"].sent_count

    async def claim_grant(_db, uid, now):
        if state["row"].granted_at is not None:
            return False
        state["row"].granted_at = now
        return True

    async def release_grant(_db, uid):
        state["row"].granted_at = None

    async def fresh_user(_db, uid):
        return user

    async def activate(uid, sub_id, _db, **kw):
        user.is_paid = True
        user.subscription_end_date = kw["subscription_end_date"]
        state["activations"].append(kw)

    for name, fn in (("_get_unlock", get_unlock), ("_ensure_unlock", ensure_unlock), ("_find_send", find_send),
                     ("_add_send", add_send), ("_increment", increment), ("_claim_grant", claim_grant),
                     ("_release_grant", release_grant), ("_fresh_user", fresh_user)):
        monkeypatch.setattr(S, name, fn)
    import api.payments as P
    monkeypatch.setattr(P, "_activate_user", activate)
    monkeypatch.setattr(S.settings, "share_unlock_target", 15, raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_grant_days", 7, raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_enabled", True, raising=False)
    return user, _FakeDB(), state


async def _send_14(db, user):
    for i in range(14):
        r = await S.record_send(db, user, f"+1 415 555 01{i:02d}", f"id-{i}")
        assert r["counted"] and not r["granted_now"] and r["sent"] == i + 1 and r["eligible"]


@pytest.mark.asyncio
async def test_fifteen_distinct_friends_grant_one_week_once(world):
    user, db, state = world
    await _send_14(db, user)
    assert state["activations"] == []
    r = await S.record_send(db, user, "+1 415 555 0199", "id-15")
    assert r["granted_now"] and r["granted"] and r["sent"] == 15 and r["remaining"] == 0
    (kw,) = state["activations"]
    assert kw["billing_provider"] == "referral_comp" and kw["subscription_status"] == "comped"
    assert timedelta(days=6, hours=23) < kw["subscription_end_date"] - datetime.now(timezone.utc) <= timedelta(days=7)
    assert db.committed == 15
    # a 16th friend can't earn a second week
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "+1 415 555 0300", "id-16")
    assert e.value.reason == "already_claimed"


@pytest.mark.asyncio
async def test_a_replay_of_the_completing_send_gets_the_grant_back_not_an_error(world):
    """The response to the 15th send was lost; the app retries the same request."""
    user, db, state = world
    await _send_14(db, user)
    first = await S.record_send(db, user, "+1 415 555 0199", "id-15")
    again = await S.record_send(db, user, "(415) 555-0199", "id-15")
    assert first["granted_now"]
    assert again["granted"] and again["replay"] and not again["counted"] and not again["granted_now"]
    assert len(state["activations"]) == 1


@pytest.mark.asyncio
async def test_the_same_friend_counts_once_and_a_replay_is_told_apart(world):
    user, db, state = world
    assert (await S.record_send(db, user, "(415) 555-0100", "id-a"))["sent"] == 1
    replay = await S.record_send(db, user, "+1 415-555-0100", "id-a")      # same request, lost response
    assert replay["counted"] is False and replay["replay"] is True and replay["sent"] == 1
    repeat = await S.record_send(db, user, "+1 415-555-0100", "id-b")      # texted that friend again
    assert repeat["counted"] is False and repeat["replay"] is False and repeat["sent"] == 1
    assert state["row"].sent_count == 1


@pytest.mark.asyncio
async def test_people_who_already_have_access_cannot_earn(world):
    user, db, state = world
    user.is_paid = True
    user.subscription_end_date = datetime.now(timezone.utc) + timedelta(days=2)
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "+1 415 555 0100", "id-a")
    assert e.value.reason == "already_entitled" and state["sends"] == {}


@pytest.mark.asyncio
async def test_a_contact_without_a_usable_number_is_rejected(world):
    user, db, _ = world
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "12", "id-a")
    assert e.value.reason == "bad_number"


@pytest.mark.asyncio
async def test_a_store_purchase_that_lands_mid_way_defers_the_week_until_claim(world, monkeypatch):
    user, db, state = world
    await _send_14(db, user)

    async def now_subscribed(_db, uid):       # the Apple webhook beat the 15th text
        user.is_paid = True
        user.subscription_end_date = datetime.now(timezone.utc) + timedelta(days=30)
        return user

    monkeypatch.setattr(S, "_fresh_user", now_subscribed)
    r = await S.record_send(db, user, "+1 415 555 0199", "id-15")
    assert r["counted"] and r["sent"] == 15
    assert not r["granted_now"] and not r["granted"] and r["reason"] == "already_entitled"
    assert state["activations"] == [] and state["row"].granted_at is None

    # while subscribed, claim does nothing
    assert not (await S.claim(db, user))["granted_now"]
    # the subscription lapses: the finished set pays out, no 16th text
    user.subscription_end_date = datetime.now(timezone.utc) - timedelta(days=1)
    monkeypatch.setattr(S, "_fresh_user", lambda _db, uid: _async(user))
    c = await S.claim(db, user)
    assert c["granted_now"] and c["granted"] and len(state["activations"]) == 1
    assert not (await S.claim(db, user))["granted_now"]       # and only once


async def _async(v):
    return v


@pytest.mark.asyncio
async def test_only_one_of_two_completing_sends_grants(world, monkeypatch):
    """Two requests race past the count: the conditional claim lets one through."""
    user, db, state = world
    await _send_14(db, user)

    async def lost_claim(_db, uid, now):      # the other request claimed between our count and our claim
        return False

    monkeypatch.setattr(S, "_claim_grant", lost_claim)
    r = await S.record_send(db, user, "+1 415 555 0199", "id-15")
    assert r["counted"] and r["sent"] == 15 and not r["granted_now"] and state["activations"] == []
