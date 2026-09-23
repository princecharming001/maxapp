"""Self-heal an Apple-billed row whose end date passed without a renewal event.

The middleware computes `is_paid = raw && !expired(subscription_end_date)`,
so the ONLY things that advance an Apple subscriber's end date are a client
verify and the DID_RENEW notification. A dropped/late notification therefore
locks a paying customer out at renewal time: /users/me says unpaid, the app
boots into the paywall, every gated endpoint 402s. Before reporting "unpaid"
for such a row, ask Apple directly (Get All Subscription Statuses) — at most
every RECHECK_INTERVAL_S per user, bounded by a short timeout — and, when
Apple says active / in grace, extend the row on the spot.

Used by /users/me (lazy, per request) and by the hourly expiry sweep (before
it flips rows to expired). Never grants on failure: an unreachable Apple
leaves the row exactly as it was.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from models.sqlalchemy_models import User

logger = logging.getLogger(__name__)

RECHECK_INTERVAL_S = 600
_last_check_at: dict[str, float] = {}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def needs_recheck(user_dict: Dict[str, Any]) -> bool:
    """Apple-billed, the column still says paid, but the end date has passed."""
    if (user_dict.get("billing_provider") or "").lower() != "apple":
        return False
    if not user_dict.get("is_paid_raw") or user_dict.get("is_paid"):
        return False
    if not user_dict.get("subscription_id"):
        return False
    end = _aware(user_dict.get("subscription_end_date"))
    return end is not None and end < datetime.now(timezone.utc)


def _throttled(user_id: str) -> bool:
    now = time.monotonic()
    last = _last_check_at.get(user_id)
    if last is not None and now - last < RECHECK_INTERVAL_S:
        return True
    _last_check_at[user_id] = now
    # keep the map bounded
    if len(_last_check_at) > 5000:
        for k in list(_last_check_at)[:1000]:
            _last_check_at.pop(k, None)
    return False


async def extend_if_apple_says_active(
    user_id: str, original_transaction_id: str, db: AsyncSession, *, timeout_s: float = 8.0,
) -> Optional[datetime]:
    """Ask Apple; when the subscription is active or in grace, advance the row's
    end date and re-mark it paid. Returns the new end date, or None when nothing
    changed (expired, revoked, unreachable, unconfigured)."""
    from services import apple_iap_service as apple

    if not apple.apple_iap_configured():
        return None
    try:
        status = await apple.fetch_subscription_status(original_transaction_id, timeout_s=timeout_s)
    except Exception as e:  # noqa: BLE001 — never a grant, never a crash
        logger.info("apple recheck: status fetch failed for user=%s oid=%s: %s", user_id, original_transaction_id, e)
        return None
    entitled, until = apple.entitlement_from_status(status)
    if not entitled or until is None:
        logger.info("apple recheck: user=%s oid=%s status=%s → not entitled", user_id, original_transaction_id, status.get("status"))
        return None
    until_aware = until.replace(tzinfo=timezone.utc)
    user = await db.get(User, UUID(user_id))
    if user is None:
        return None
    cur = _aware(user.subscription_end_date)
    if cur is not None and cur >= until_aware and user.is_paid:
        return None
    user.subscription_end_date = until_aware
    user.is_paid = True
    if (user.subscription_status or "").lower() in ("expired", "canceled", "cancelled", "past_due", ""):
        user.subscription_status = "active"
    user.updated_at = datetime.utcnow()
    await db.commit()
    logger.info(
        "apple recheck: user=%s oid=%s status=%s → entitled until %s (row extended)",
        user_id, original_transaction_id, status.get("status"), until_aware.isoformat(),
    )
    return until_aware


async def recheck_if_stale(user_dict: Dict[str, Any], db: AsyncSession) -> Dict[str, Any]:
    """Lazy per-request re-check for /users/me. Returns a fresh user dict when
    the row was extended, else the input unchanged."""
    if not needs_recheck(user_dict):
        return user_dict
    uid = str(user_dict.get("id"))
    if _throttled(uid):
        return user_dict
    new_end = await extend_if_apple_says_active(uid, str(user_dict.get("subscription_id")), db)
    if new_end is None:
        return user_dict
    from middleware.auth_middleware import _user_dict

    row = await db.get(User, UUID(uid))
    return _user_dict(row) if row is not None else user_dict
