"""Share-to-unlock: text the preset message to N friends, get the first week free.

The app opens the system Messages composer once per friend (contact picked in
the system contact picker, message prefilled). iOS reports whether the user
tapped Send; the app posts each sent message here with the recipient's number
and a per-send id it made up when the composer closed. This module is the
only place that counts and grants:

  * a recipient counts once per user (HMAC of the number, never the number;
    the unique constraint is the dedupe). A request replayed after a lost
    response carries the same send id and is answered with the outcome it
    already had, never an error and never a second count.
  * the count is an atomic UPDATE and the grant a conditional UPDATE
    (granted_at IS NULL), so two sends at once can't both grant; no row is
    held locked beyond the one statement
  * the grant is one per account, ever, through the shared `_activate_user`
    path (same 7-day comp shape as the CASH99 code, so expiry handling is
    identical), and never over a live store subscription: the user row is
    locked for the grant, so a webhook can't slip in between the check and
    the write. A set completed while a subscription was live is paid out by
    `claim` once they're eligible again.

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

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
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


def _hmac_key() -> bytes:
    """A key of its own, derived from SHARE_UNLOCK_HMAC_SECRET (or the JWT
    secret as the fallback), so the JWT key is never used directly as a MAC
    key. Rotating the secret resets dedupe: an old friend could count again."""
    secret = getattr(settings, "share_unlock_hmac_secret", "") or getattr(settings, "jwt_secret_key", "")
    return hashlib.sha256(b"share-unlock-key:" + secret.encode("utf-8")).digest()


def recipient_hmac(digits: str) -> str:
    return hmac.new(_hmac_key(), digits.encode("utf-8"), hashlib.sha256).hexdigest()


def currently_entitled(user: User) -> bool:
    end = _as_aware(user.subscription_end_date)
    return bool(user.is_paid) and (end is None or end > _utcnow())


# ── DB ops (one statement each, so tests can patch them) ────────────────────

async def _get_unlock(db: AsyncSession, uid: UUID) -> Optional[ShareUnlock]:
    return (await db.execute(select(ShareUnlock).where(ShareUnlock.user_id == uid))).scalar_one_or_none()


async def _ensure_unlock(db: AsyncSession, uid: UUID, version: str) -> None:
    """The person's progress row, created on their first send (a concurrent
    first send is a no-op, not an error)."""
    stmt = pg_insert(ShareUnlock).values(user_id=uid, sent_count=0, message_version=version)
    await db.execute(stmt.on_conflict_do_nothing(index_elements=["user_id"]))


async def _find_send(db: AsyncSession, uid: UUID, h: str) -> Optional[ShareUnlockSend]:
    stmt = select(ShareUnlockSend).where(ShareUnlockSend.user_id == uid, ShareUnlockSend.recipient_hmac == h)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _add_send(db: AsyncSession, uid: UUID, h: str, client_send_id: Optional[str]) -> bool:
    """Insert the recipient; False when this friend was already counted."""
    stmt = pg_insert(ShareUnlockSend).values(user_id=uid, recipient_hmac=h, client_send_id=client_send_id)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_share_unlock_send_user_recipient").returning(ShareUnlockSend.id)
    return (await db.execute(stmt)).first() is not None


async def _increment(db: AsyncSession, uid: UUID, now: datetime) -> int:
    """Atomic count; returns the new value."""
    stmt = (update(ShareUnlock).where(ShareUnlock.user_id == uid)
            .values(sent_count=ShareUnlock.sent_count + 1, last_send_at=now, updated_at=now)
            .returning(ShareUnlock.sent_count))
    return int((await db.execute(stmt)).scalar_one())


async def _claim_grant(db: AsyncSession, uid: UUID, now: datetime) -> bool:
    """Exactly one request gets to grant: the conditional UPDATE is the gate."""
    stmt = (update(ShareUnlock).where(ShareUnlock.user_id == uid, ShareUnlock.granted_at.is_(None))
            .values(granted_at=now, updated_at=now).returning(ShareUnlock.id))
    return (await db.execute(stmt)).first() is not None


async def _release_grant(db: AsyncSession, uid: UUID) -> None:
    await db.execute(update(ShareUnlock).where(ShareUnlock.user_id == uid).values(granted_at=None))


async def _fresh_user(db: AsyncSession, uid: UUID) -> Optional[User]:
    """The row as it is NOW, locked until this transaction commits: a store
    webhook that lands at the same moment either shows up here (no comp) or
    waits for our commit and then writes its real subscription over the comp."""
    stmt = select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True)
    return (await db.execute(stmt)).scalar_one_or_none()


# ── public API ──────────────────────────────────────────────────────────────

def _status_dict(user: User, sent: int, granted_at: Optional[datetime]) -> dict:
    enabled = bool(getattr(settings, "share_unlock_enabled", True))
    goal = target()
    granted = granted_at is not None
    reason = None
    if not enabled:
        reason = "disabled"
    elif granted:
        reason = "already_claimed"
    elif currently_entitled(user):
        reason = "already_entitled"
    return {
        "enabled": enabled,
        "eligible": reason is None,
        "reason": reason,
        "reason_message": _REASON_MESSAGE.get(reason) if reason else None,
        "target": goal,
        "sent": sent,
        "remaining": max(0, goal - sent),
        "granted": granted,
        "granted_at": granted_at.isoformat() if granted else None,
        "grant_days": grant_days(),
        "message": message_text(),
        "link": getattr(settings, "share_unlock_link", ""),
    }


def _row_status(user: User, row: Optional[ShareUnlock]) -> dict:
    return _status_dict(user, int(row.sent_count or 0) if row else 0, row.granted_at if row else None)


def _same_request(existing: Optional[ShareUnlockSend], client_send_id: Optional[str]) -> bool:
    """A replay (same send id) rather than the same friend texted again."""
    return bool(client_send_id) and existing is not None and existing.client_send_id == client_send_id


async def status(db: AsyncSession, user: User) -> dict:
    uid = user.id if isinstance(user.id, UUID) else UUID(str(user.id))
    return _row_status(user, await _get_unlock(db, uid))


async def _try_grant(db: AsyncSession, user: User, uid: UUID, now: datetime) -> tuple[User, bool]:
    """The one place a week is minted. Returns (user as of now, granted)."""
    if not await _claim_grant(db, uid, now):
        return user, False                       # another request got there first
    user = await _fresh_user(db, uid) or user
    if currently_entitled(user):
        # A store purchase landed while they were texting: the sends count,
        # the week waits for `claim` once that subscription lapses.
        await _release_grant(db, uid)
        logger.info("share-unlock complete but user=%s is entitled; comp deferred", uid)
        return user, False
    from api.payments import _activate_user
    await _activate_user(
        str(uid), None, db,
        subscription_tier="premium",
        billing_provider="referral_comp",          # same comp shape as CASH99
        subscription_status="comped",
        subscription_end_date=now + timedelta(days=grant_days()),
    )
    logger.info("share-unlock granted user=%s", uid)
    return user, True


async def record_send(db: AsyncSession, user: User, phone: object, client_send_id: Optional[str] = None) -> dict:
    """Count one sent text. Returns the status plus `counted` (False for a
    friend already counted), `replay` (that uncounted send was this very
    request, seen before) and `granted_now` (True on the send that completed
    the set). Raises ShareUnlockError when the person can't earn."""
    uid = user.id if isinstance(user.id, UUID) else UUID(str(user.id))
    row = await _get_unlock(db, uid)
    current = _row_status(user, row)
    digits = normalize_phone(phone)
    if digits is None:
        raise ShareUnlockError("bad_number", _REASON_MESSAGE["bad_number"])
    h = recipient_hmac(digits)
    if not current["eligible"]:
        # A replay of a send that already went through (the one that earned
        # the week, say) gets its outcome back, not an error.
        existing = await _find_send(db, uid, h)
        if existing is None:
            raise ShareUnlockError(current["reason"], current["reason_message"])
        return {**current, "counted": False, "granted_now": False, "replay": _same_request(existing, client_send_id)}

    now = _utcnow()
    if row is None:
        await _ensure_unlock(db, uid, message_version(message_text()))
    counted = await _add_send(db, uid, h, client_send_id)
    replay = False
    granted_now = False
    granted_at: Optional[datetime] = None
    if counted:
        sent = await _increment(db, uid, now)
        if sent >= target():
            user, granted_now = await _try_grant(db, user, uid, now)
            if granted_now:
                granted_at = now
    else:
        replay = _same_request(await _find_send(db, uid, h), client_send_id)
        row = await _get_unlock(db, uid)          # the values the earlier request wrote
        sent = int(row.sent_count or 0) if row else 0
        granted_at = row.granted_at if row else None
    result = {**_status_dict(user, sent, granted_at), "counted": counted, "granted_now": granted_now, "replay": replay}
    await db.commit()
    return result


async def claim(db: AsyncSession, user: User) -> dict:
    """Pay out a set that was completed while a subscription was live: once
    they're eligible again the week is theirs, no 16th text needed."""
    uid = user.id if isinstance(user.id, UUID) else UUID(str(user.id))
    row = await _get_unlock(db, uid)
    current = _row_status(user, row)
    if not current["eligible"] or current["sent"] < target():
        return {**current, "counted": False, "granted_now": False, "replay": False}
    now = _utcnow()
    user, granted_now = await _try_grant(db, user, uid, now)
    result = {**_status_dict(user, current["sent"], now if granted_now else None),
              "counted": False, "granted_now": granted_now, "replay": False}
    await db.commit()
    return result
