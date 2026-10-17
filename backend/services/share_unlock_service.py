"""Share-to-unlock: text the preset message to N friends, get the first week free.

The app opens the system Messages composer once per friend (contact picked in
the system contact picker, message prefilled). iOS reports whether the user
tapped Send; the app posts each sent message here with the recipient's number.
This module is the only place that counts and grants:

  * a recipient counts once per user (HMAC of the number, never the number)
  * the grant is one per account, ever, through the shared `_activate_user`
    path (same 7-day comp shape as the CASH99 code, so expiry handling is
    identical)
  * nothing is granted to an account that already has access

Honest limit: the "sent" result is reported by the client, so this proves the
person went through the composer N times with N different saved contacts; it
cannot prove delivery. One free week per account bounds the downside.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.sqlalchemy_models import ShareUnlock, ShareUnlockSend, User

logger = logging.getLogger(__name__)


class ShareUnlockError(Exception):
    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


_REASON_MESSAGE = {
    "disabled": "this isn't available right now.",
    "already_entitled": "you already have access, so there's nothing to unlock.",
    "already_claimed": "you've already earned your free week.",
    "bad_number": "that contact doesn't have a usable phone number.",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def target() -> int:
    return max(1, int(getattr(settings, "share_unlock_target", 15) or 15))


def grant_days() -> int:
    return max(1, int(getattr(settings, "share_unlock_grant_days", 7) or 7))


def message_text() -> str:
    """The preset text, with the app name and store link filled in."""
    tmpl = str(getattr(settings, "share_unlock_message", "") or "Join {app} with me: {link}")
    return tmpl.format(app=getattr(settings, "app_name", "Superpower"),
                       link=getattr(settings, "share_unlock_link", "")).strip()


def message_version(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def normalize_phone(raw: object) -> Optional[str]:
    """Digits only, US numbers get their country code, so the same friend
    saved as (415) 555-0100 and +1 415 555 0100 is one recipient."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 10:
        digits = "1" + digits
    if not 7 <= len(digits) <= 15:
        return None
    return digits


def recipient_hmac(digits: str) -> str:
    secret = getattr(settings, "share_unlock_hmac_secret", "") or getattr(settings, "jwt_secret_key", "")
    return hmac.new(secret.encode("utf-8"), f"share-unlock:{digits}".encode("utf-8"), hashlib.sha256).hexdigest()


def currently_entitled(user: User) -> bool:
    end = _as_aware(user.subscription_end_date)
    return bool(user.is_paid) and (end is None or end > _utcnow())


# ── DB ops (small so tests can patch them) ──────────────────────────────────

async def _get_unlock(db: AsyncSession, uid: UUID) -> Optional[ShareUnlock]:
    return (await db.execute(select(ShareUnlock).where(ShareUnlock.user_id == uid))).scalar_one_or_none()


async def _get_or_create_unlock(db: AsyncSession, uid: UUID, version: str) -> ShareUnlock:
    row = await _get_unlock(db, uid)
    if row is None:
        row = ShareUnlock(user_id=uid, sent_count=0, message_version=version)
        db.add(row)
        await db.flush()
    return row


async def _add_send(db: AsyncSession, uid: UUID, h: str) -> bool:
    """Insert the recipient; False when this friend was already counted."""
    try:
        async with db.begin_nested():
            db.add(ShareUnlockSend(user_id=uid, recipient_hmac=h))
            await db.flush()
        return True
    except IntegrityError:
        return False


# ── public API ──────────────────────────────────────────────────────────────

def _status_dict(user: User, row: Optional[ShareUnlock]) -> dict:
    enabled = bool(getattr(settings, "share_unlock_enabled", True))
    sent = int(row.sent_count or 0) if row else 0
    granted = bool(row and row.granted_at)
    reason = None
    if not enabled:
        reason = "disabled"
    elif granted:
        reason = "already_claimed"
    elif currently_entitled(user):
        reason = "already_entitled"
    text = message_text()
    return {
        "enabled": enabled,
        "eligible": reason is None,
        "reason": reason,
        "reason_message": _REASON_MESSAGE.get(reason) if reason else None,
        "target": target(),
        "sent": sent,
        "remaining": max(0, target() - sent),
        "granted": granted,
        "granted_at": row.granted_at.isoformat() if granted else None,
        "grant_days": grant_days(),
        "message": text,
        "link": getattr(settings, "share_unlock_link", ""),
    }


async def status(db: AsyncSession, user: User) -> dict:
    uid = user.id if isinstance(user.id, UUID) else UUID(str(user.id))
    return _status_dict(user, await _get_unlock(db, uid))


async def record_send(db: AsyncSession, user: User, phone: object) -> dict:
    """Count one sent text. Returns the status plus `counted` (False when the
    friend was already counted) and `granted_now` (True on the send that
    completed the set). Raises ShareUnlockError when the person can't earn."""
    uid = user.id if isinstance(user.id, UUID) else UUID(str(user.id))
    current = _status_dict(user, await _get_unlock(db, uid))
    if not current["eligible"]:
        raise ShareUnlockError(current["reason"], current["reason_message"])
    digits = normalize_phone(phone)
    if digits is None:
        raise ShareUnlockError("bad_number", _REASON_MESSAGE["bad_number"])

    text = message_text()
    row = await _get_or_create_unlock(db, uid, message_version(text))
    counted = await _add_send(db, uid, recipient_hmac(digits))
    now = _utcnow()
    if counted:
        row.sent_count = int(row.sent_count or 0) + 1
        row.last_send_at = now
    granted_now = False
    if counted and row.sent_count >= target() and row.granted_at is None:
        from api.payments import _activate_user
        await _activate_user(
            str(uid), None, db,
            subscription_tier="premium",
            billing_provider="referral_comp",      # same comp shape as CASH99
            subscription_status="comped",
            subscription_end_date=now + timedelta(days=grant_days()),
        )
        row.granted_at = now
        granted_now = True
        logger.info("share-unlock granted user=%s sends=%s", uid, row.sent_count)
    await db.commit()
    fresh = await db.get(User, uid) or user
    return {**_status_dict(fresh, row), "counted": counted, "granted_now": granted_now}
