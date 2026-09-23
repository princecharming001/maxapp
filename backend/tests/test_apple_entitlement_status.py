"""Apple entitlement truth: revocation, grace periods, and the lazy re-check gate.

Pure-function tests (no DB, no Apple). They pin the rules that decide whether
a paying customer sees the app or the paywall:

- a refunded/revoked transaction is NOT active even with a future expiresDate;
- Apple's subscription `status` (active / expired / billing retry / grace /
  revoked) maps to (entitled, until) the way Apple documents it;
- /users/me only re-asks Apple for an Apple-billed row that still says paid
  but whose end date has passed.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services import apple_iap_service as apple
from services.apple_entitlement_recheck import needs_recheck


def _ms(dt: datetime) -> int:
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _future(hours: float = 24) -> datetime:
    return datetime.utcnow() + timedelta(hours=hours)


def _past(hours: float = 24) -> datetime:
    return datetime.utcnow() - timedelta(hours=hours)


# ── subscription_active_from_claims ─────────────────────────────────────────

def test_future_expiry_is_active():
    assert apple.subscription_active_from_claims({"expiresDate": _ms(_future())}) is True


def test_past_expiry_is_inactive():
    assert apple.subscription_active_from_claims({"expiresDate": _ms(_past())}) is False


def test_revoked_transaction_is_inactive_even_with_future_expiry():
    claims = {"expiresDate": _ms(_future()), "revocationDate": _ms(_past(1))}
    assert apple.revoked_from_claims(claims) is True
    assert apple.subscription_active_from_claims(claims) is False


def test_missing_expiry_is_treated_as_active_legacy():
    assert apple.subscription_active_from_claims({}) is True


# ── entitlement_from_status ────────────────────────────────────────────────

def _status(st, *, exp=None, grace=None, revoked=False):
    txn = {}
    if exp is not None:
        txn["expiresDate"] = _ms(exp)
    if revoked:
        txn["revocationDate"] = _ms(_past(1))
    ren = {}
    if grace is not None:
        ren["gracePeriodExpiresDate"] = _ms(grace)
    return {"status": st, "transaction": txn, "renewal": ren, "environment": "Production"}


def test_active_status_entitled_until_expiry():
    exp = _future(48)
    entitled, until = apple.entitlement_from_status(_status(apple.SUB_STATUS_ACTIVE, exp=exp))
    assert entitled is True
    assert until is not None and abs((until - exp).total_seconds()) < 1


def test_active_status_with_past_expiry_is_not_entitled():
    entitled, _ = apple.entitlement_from_status(_status(apple.SUB_STATUS_ACTIVE, exp=_past()))
    assert entitled is False


def test_expired_and_revoked_statuses_are_not_entitled():
    for st in (apple.SUB_STATUS_EXPIRED, apple.SUB_STATUS_REVOKED):
        entitled, _ = apple.entitlement_from_status(_status(st, exp=_future()))
        assert entitled is False, st


def test_grace_period_entitled_until_grace_end():
    exp, grace = _past(2), _future(72)
    entitled, until = apple.entitlement_from_status(_status(apple.SUB_STATUS_GRACE_PERIOD, exp=exp, grace=grace))
    assert entitled is True
    assert until is not None and abs((until - grace).total_seconds()) < 1


def test_billing_retry_without_grace_date_is_not_entitled():
    entitled, _ = apple.entitlement_from_status(_status(apple.SUB_STATUS_BILLING_RETRY, exp=_past(2)))
    assert entitled is False


def test_billing_retry_with_future_grace_is_entitled():
    entitled, until = apple.entitlement_from_status(_status(apple.SUB_STATUS_BILLING_RETRY, exp=_past(2), grace=_future(24)))
    assert entitled is True and until is not None


def test_revoked_transaction_wins_over_active_status():
    entitled, _ = apple.entitlement_from_status(_status(apple.SUB_STATUS_ACTIVE, exp=_future(), revoked=True))
    assert entitled is False


def test_unknown_status_falls_back_to_transaction_dates():
    assert apple.entitlement_from_status(_status(None, exp=_future()))[0] is True
    assert apple.entitlement_from_status(_status(None, exp=_past()))[0] is False
    assert apple.entitlement_from_status(_status(None))[0] is False


# ── needs_recheck (the /users/me gate) ─────────────────────────────────────

def _row(**over):
    base = {
        "id": "u1",
        "billing_provider": "apple",
        "is_paid_raw": True,
        "is_paid": False,
        "subscription_id": "2000000123",
        "subscription_end_date": datetime.now(timezone.utc) - timedelta(hours=3),
    }
    base.update(over)
    return base


def test_recheck_only_for_apple_rows_that_lapsed_by_date():
    assert needs_recheck(_row()) is True
    assert needs_recheck(_row(billing_provider="referral_comp")) is False
    assert needs_recheck(_row(billing_provider="stripe")) is False
    assert needs_recheck(_row(is_paid=True)) is False            # still entitled
    assert needs_recheck(_row(is_paid_raw=False)) is False       # already expired by the sweep / a webhook
    assert needs_recheck(_row(subscription_id=None)) is False    # nothing to ask Apple about
    assert needs_recheck(_row(subscription_end_date=None)) is False
    assert needs_recheck(_row(subscription_end_date=datetime.now(timezone.utc) + timedelta(hours=1))) is False


def test_recheck_tolerates_naive_end_dates():
    assert needs_recheck(_row(subscription_end_date=datetime.utcnow() - timedelta(hours=1))) is True
