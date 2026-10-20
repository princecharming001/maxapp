"""Owner push for every App Store sale event (services/sales_alerts.py)."""
import asyncio

import pytest

from services import sales_alerts as sa

WEEKLY = "com.cannon.mobile.subscribe.premium.weekly"


@pytest.mark.parametrize("ntype,sub,txn,want", [
    ("SUBSCRIBED", "INITIAL_BUY", {"productId": WEEKLY, "price": 9990, "currency": "USD"}, ("New subscriber", "Weekly · $9.99")),
    ("SUBSCRIBED", "INITIAL_BUY", {"productId": WEEKLY, "price": 0, "currency": "USD", "offerType": 1}, ("Free trial started", "Weekly")),
    ("SUBSCRIBED", "RESUBSCRIBE", {"productId": WEEKLY, "price": 9990}, ("Resubscribed", "Weekly · $9.99")),
    ("DID_RENEW", "", {"productId": WEEKLY, "price": 9990}, ("Renewed", "Weekly · $9.99")),
    ("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", {"productId": WEEKLY}, ("Cancelled (auto-renew off)", "Weekly")),
    ("REFUND", "", {"productId": "com.cannon.mobile.subscribe.basic.weekly", "price": 4990}, ("Refund", "Basic Weekly · $4.99")),
    ("DID_FAIL_TO_RENEW", "", {"productId": WEEKLY}, ("Billing failed", "Weekly")),
    ("SUBSCRIBED", "INITIAL_BUY", {"productId": WEEKLY, "price": 8990, "currency": "EUR"}, ("New subscriber", "Weekly · 8.99 EUR")),
])
def test_each_sale_event_reads_plainly(ntype, sub, txn, want):
    assert sa.describe({"notificationType": ntype, "subtype": sub, "data": {}}, txn) == want


def test_noise_and_sandbox():
    assert sa.describe({"notificationType": "TEST", "data": {}}, {})[0] == "Sales alerts are on"
    assert sa.describe({"notificationType": "CONSUMPTION_REQUEST", "data": {}}, {}) is None
    t, _ = sa.describe({"notificationType": "SUBSCRIBED", "data": {"environment": "Sandbox"}}, {"productId": WEEKLY})
    assert t.startswith("[Sandbox] ")


def test_a_retried_notification_alerts_once(monkeypatch):
    sent = []

    async def fake_send(outer, txn):
        sent.append(outer["notificationUUID"])
    monkeypatch.setattr(sa, "_send", fake_send)
    sa._SEEN.clear()

    async def run():
        o = {"notificationType": "DID_RENEW", "notificationUUID": "abc", "data": {}}
        sa.notify(o, {"productId": WEEKLY})
        sa.notify(o, {"productId": WEEKLY})          # Apple retry
        await asyncio.sleep(0)
    asyncio.run(run())
    assert sent == ["abc"]


def test_notify_never_raises_outside_a_loop():
    sa._SEEN.clear()
    sa.notify({"notificationType": "DID_RENEW", "notificationUUID": "x"}, {})   # no running loop: logged, not raised
