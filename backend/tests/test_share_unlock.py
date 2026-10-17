"""Share-to-unlock (services/share_unlock_service.py): text the preset message
to N friends, get the first week free. Pure logic + a fake DB, matching
tests/test_referral.py."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

import services.share_unlock_service as S
from models.sqlalchemy_models import ShareUnlock, User


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


def test_message_fills_in_app_name_and_link(monkeypatch):
    monkeypatch.setattr(S.settings, "app_name", "Superpower", raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_link", "https://apps.apple.com/app/id1", raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_message", "Join {app} with me: {link}", raising=False)
    assert S.message_text() == "Join Superpower with me: https://apps.apple.com/app/id1"


def test_status_reasons():
    now = datetime.now(timezone.utc)
    assert S._status_dict(_user(), None)["eligible"]
    paying = _user(is_paid=True, subscription_end_date=now + timedelta(days=3))
    assert S._status_dict(paying, None)["reason"] == "already_entitled"
    lapsed = _user(is_paid=True, subscription_end_date=now - timedelta(days=3))
    assert S._status_dict(lapsed, None)["eligible"]
    done = ShareUnlock(user_id=uuid4(), sent_count=15, granted_at=now)
    st = S._status_dict(paying, done)
    assert st["reason"] == "already_claimed" and st["granted"] and st["remaining"] == 0


# ── fake DB for record_send ─────────────────────────────────────────────────

class _FakeDB:
    def __init__(self, user):
        self.user = user
        self.committed = 0

    async def commit(self):
        self.committed += 1

    async def get(self, model, key):
        return self.user


@pytest.fixture
def world(monkeypatch):
    """One user, in-memory unlock row + recipient set, activation recorded."""
    user = _user()
    db = _FakeDB(user)
    state = {"row": None, "recipients": set(), "activations": []}

    async def get_unlock(_db, uid):
        return state["row"]

    async def get_or_create(_db, uid, version):
        if state["row"] is None:
            state["row"] = ShareUnlock(user_id=uid, sent_count=0, message_version=version)
        return state["row"]

    async def add_send(_db, uid, h):
        if h in state["recipients"]:
            return False
        state["recipients"].add(h)
        return True

    async def activate(uid, sub_id, _db, **kw):
        user.is_paid = True
        user.subscription_end_date = kw["subscription_end_date"]
        state["activations"].append(kw)

    monkeypatch.setattr(S, "_get_unlock", get_unlock)
    monkeypatch.setattr(S, "_get_or_create_unlock", get_or_create)
    monkeypatch.setattr(S, "_add_send", add_send)
    import api.payments as P
    monkeypatch.setattr(P, "_activate_user", activate)
    monkeypatch.setattr(S.settings, "share_unlock_target", 15, raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_grant_days", 7, raising=False)
    monkeypatch.setattr(S.settings, "share_unlock_enabled", True, raising=False)
    return user, db, state


@pytest.mark.asyncio
async def test_fifteen_distinct_friends_grant_one_week_once(world):
    user, db, state = world
    for i in range(14):
        r = await S.record_send(db, user, f"+1 415 555 01{i:02d}")
        assert r["counted"] and not r["granted_now"] and r["sent"] == i + 1
    assert state["activations"] == []
    r = await S.record_send(db, user, "+1 415 555 0199")
    assert r["granted_now"] and r["granted"] and r["sent"] == 15 and r["remaining"] == 0
    (kw,) = state["activations"]
    assert kw["billing_provider"] == "referral_comp" and kw["subscription_status"] == "comped"
    assert timedelta(days=6, hours=23) < kw["subscription_end_date"] - datetime.now(timezone.utc) <= timedelta(days=7)
    # a 16th text can't earn a second week
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "+1 415 555 0300")
    assert e.value.reason == "already_claimed"


@pytest.mark.asyncio
async def test_the_same_friend_counts_once_however_the_number_is_written(world):
    user, db, state = world
    assert (await S.record_send(db, user, "(415) 555-0100"))["sent"] == 1
    r = await S.record_send(db, user, "+1 415-555-0100")
    assert r["counted"] is False and r["sent"] == 1


@pytest.mark.asyncio
async def test_people_who_already_have_access_cannot_earn(world):
    user, db, state = world
    user.is_paid = True
    user.subscription_end_date = datetime.now(timezone.utc) + timedelta(days=2)
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "+1 415 555 0100")
    assert e.value.reason == "already_entitled" and state["recipients"] == set()


@pytest.mark.asyncio
async def test_a_contact_without_a_usable_number_is_rejected(world):
    user, db, _ = world
    with pytest.raises(S.ShareUnlockError) as e:
        await S.record_send(db, user, "12")
    assert e.value.reason == "bad_number"
