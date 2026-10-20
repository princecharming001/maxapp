"""A push to the owner's phone for every App Store sale event.

Apple's App Store Server Notifications reach /api/payments/apple/notifications
within seconds of a purchase, renewal, cancel or refund; App Store Connect's
own reports lag a day. This turns each one into a short push ("New subscriber
· Weekly · $9.99") for the accounts in SALES_ALERT_EMAILS (default: admins),
through the app's normal APNs path. Fire-and-forget: it never slows or breaks
the webhook, and a retried notification (same notificationUUID) alerts once.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

_SEEN: dict[str, float] = {}          # notificationUUID -> when we alerted
_SEEN_TTL_S = 3 * 24 * 3600


def _plan(product_id: str) -> str:
    p = (product_id or "").lower()
    if p.startswith("com.cannon.creator."):
        return "Creator sub"
    period = next((w.title() for w in ("weekly", "monthly", "yearly", "annual") if w in p), "")
    tier = "Basic" if ".basic." in p else ""
    return " ".join(x for x in (tier, period) if x) or (product_id or "Subscription")


def _price(txn: dict) -> str:
    try:
        milli = int(txn.get("price"))
    except (TypeError, ValueError):
        return ""
    cur = str(txn.get("currency") or "USD").upper()
    amount = milli / 1000.0
    return f"${amount:.2f}" if cur == "USD" else f"{amount:.2f} {cur}"


def describe(outer: dict, txn: dict) -> Optional[tuple[str, str]]:
    """(title, body) for a notification worth a ping, else None."""
    ntype = str(outer.get("notificationType") or "").upper()
    sub = str(outer.get("subtype") or "").upper()
    plan, price = _plan(str(txn.get("productId") or "")), _price(txn)
    trial = str(txn.get("offerType") or "") == "1" and (price in ("", "$0.00"))
    if ntype == "SUBSCRIBED":
        title = "Free trial started" if trial else ("Resubscribed" if sub == "RESUBSCRIBE" else "New subscriber")
    elif ntype == "DID_RENEW":
        title = "Renewed (billing recovered)" if sub == "BILLING_RECOVERY" else "Renewed"
    elif ntype == "DID_CHANGE_RENEWAL_STATUS":
        title = "Cancelled (auto-renew off)" if sub == "AUTO_RENEW_DISABLED" else "Auto-renew back on"
    elif ntype == "REFUND":
        title = "Refund"
    elif ntype == "EXPIRED":
        title = "Expired"
    elif ntype == "DID_FAIL_TO_RENEW":
        title = "Billing failed"
    elif ntype == "OFFER_REDEEMED":
        title = "Offer redeemed"
    elif ntype == "ONE_TIME_CHARGE":
        title = "Purchase"
    elif ntype == "TEST":
        return "Sales alerts are on", "Apple test notification reached Superpower"
    else:
        return None                       # CONSUMPTION_REQUEST, PRICE_INCREASE, …
    env = str((outer.get("data") or {}).get("environment") or txn.get("environment") or "")
    if env.lower() == "sandbox":
        title = f"[Sandbox] {title}"
    body = " · ".join(x for x in (plan, "" if trial else price) if x)
    return title, body


async def _recipients(db) -> list:
    from sqlalchemy import func, select
    from config import settings
    from models.sqlalchemy_models import User
    emails = [e.strip().lower() for e in (settings.sales_alert_emails or "").split(",") if e.strip()]
    q = select(User).where(func.lower(User.email).in_(emails)) if emails else select(User).where(User.is_admin.is_(True))
    return [u for u in (await db.execute(q)).scalars().all() if (u.apns_device_token or "").strip()]


async def _send(outer: dict, txn: dict) -> None:
    from db.sqlalchemy import AsyncSessionLocal
    from services.apns_service import apns_response_should_invalidate_token, send_apns_alert
    msg = describe(outer, txn)
    if msg is None:
        return
    title, body = msg
    async with AsyncSessionLocal() as db:
        users = await _recipients(db)
        if not users:
            logger.info("sales alert '%s' has no recipient with a push token", title)
            return
        for u in users:
            ok, status = await send_apns_alert(u.apns_device_token.strip(), title, body or "App Store",
                                               thread_id="sales", collapse_id=None)
            if apns_response_should_invalidate_token(status):
                u.apns_device_token = None
                await db.commit()
            logger.info("sales alert '%s' -> %s ok=%s", title, str(u.id)[:8], ok)


def _log_failure(task: "asyncio.Task") -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.warning("sales alert failed: %s", task.exception())


def notify(outer: dict, txn: dict) -> None:
    """Schedule the alert; returns at once and never raises."""
    try:
        now = time.time()
        for k, t in list(_SEEN.items()):
            if now - t > _SEEN_TTL_S:
                _SEEN.pop(k, None)
        uid = str(outer.get("notificationUUID") or "")
        if uid:
            if uid in _SEEN:
                return
            _SEEN[uid] = now
        task = asyncio.get_running_loop().create_task(_send(dict(outer), dict(txn)))
        task.add_done_callback(_log_failure)
    except Exception as e:  # noqa: BLE001
        logger.warning("sales alert not scheduled: %s", e)
