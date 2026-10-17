"""Referral / promo code endpoints (RALPH_REFERRAL Phases 2-4).

`POST /referral/validate` — pure check (no side effects), used by the client to
show "code applied" before purchase.
`POST /referral/redeem`   — server-authoritative, atomic, one-per-user, audited
grant. Free comps unlock premium server-side and the client routes past the
paywall; discount codes return platform-split targets (inert when the discount
seam/ids are unset).

Both are gated by `settings.referrals_enabled` (404 when off → byte-identical to
today) and rate-limited. Entitlement is granted ONLY server-side here.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.sqlalchemy import get_db
from middleware.auth_middleware import get_current_user
from middleware.rate_limit import rate_limit
from models.sqlalchemy_models import User
from services import referral_service, share_unlock_service
from services.referral_service import ReferralError
from services.share_unlock_service import ShareUnlockError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/referral", tags=["Referral"])


class ValidateBody(BaseModel):
    code: str


class RedeemBody(BaseModel):
    code: str
    platform: str | None = None  # 'ios' | 'web'


def _require_enabled() -> None:
    # Feature flag is the gate: when OFF the endpoints behave as if absent.
    if not getattr(settings, "referrals_enabled", False):
        raise HTTPException(status_code=404, detail="Not found")


@router.post(
    "/validate",
    dependencies=[Depends(rate_limit(limit=20, window_s=300, scope="referral_validate"))],
)
async def validate_referral(
    body: ValidateBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    return await referral_service.validate_code(db, body.code, user_id=current_user["id"])


@router.post(
    "/redeem",
    dependencies=[Depends(rate_limit(limit=10, window_s=300, scope="referral_redeem"))],
)
async def redeem_referral(
    body: RedeemBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_enabled()
    user = await db.get(User, UUID(str(current_user["id"])))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    platform = (body.platform or "").lower() or None
    if platform not in (None, "ios", "web"):
        platform = None
    try:
        result = await referral_service.redeem_code(db, user, body.code, platform)
    except ReferralError as e:
        # 409 for "can't redeem" rule failures (used/expired/max/self/entitled),
        # 400 for a bad/disabled code — the client maps these to clean states.
        status = 409 if e.reason in (
            "already_used", "expired", "max_reached", "self_referral",
            "already_entitled", "not_started", "inactive",
        ) else 400
        try:
            await db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=status, detail={"reason": e.reason, "message": e.message})
    except Exception as e:  # noqa: BLE001
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error("referral redeem failed: %s", e)
        raise HTTPException(status_code=500, detail="redeem_failed")
    return result


# ── Share-to-unlock: text N friends, get the first week free ────────────────
# The client opens the system Messages composer per friend and reports each
# send; counting and the grant live in services/share_unlock_service.py.

class ShareSendBody(BaseModel):
    phone: str = Field(min_length=1, max_length=64)
    result: str | None = None   # the composer's result; only 'sent' counts
    client_send_id: str | None = Field(default=None, max_length=64)


def _require_share_unlock() -> None:
    if not getattr(settings, "share_unlock_enabled", True):
        raise HTTPException(status_code=404, detail="Not found")


async def _share_unlock_user(current_user: dict, db: AsyncSession) -> User:
    _require_share_unlock()
    user = await db.get(User, UUID(str(current_user["id"])))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _share_unlock_call(db: AsyncSession, coro):
    try:
        return await coro
    except ShareUnlockError as e:
        try:
            await db.rollback()
        except Exception:
            pass
        status = 400 if e.reason == "bad_number" else 409
        raise HTTPException(status_code=status, detail={"reason": e.reason, "message": e.message})
    except Exception as e:  # noqa: BLE001
        try:
            await db.rollback()
        except Exception:
            pass
        logger.error("share-unlock failed: %s", e)
        raise HTTPException(status_code=500, detail="share_unlock_failed")


@router.get("/share-unlock")
async def share_unlock_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await _share_unlock_user(current_user, db)
    return await share_unlock_service.status(db, user)


@router.post(
    "/share-unlock/sends",
    dependencies=[Depends(rate_limit(limit=30, window_s=600, scope="share_unlock_send"))],
)
async def share_unlock_send(
    body: ShareSendBody,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (body.result or "sent").lower() != "sent":
        raise HTTPException(status_code=400, detail={"reason": "not_sent", "message": "that message wasn't sent."})
    user = await _share_unlock_user(current_user, db)
    return await _share_unlock_call(db, share_unlock_service.record_send(db, user, body.phone, body.client_send_id))


@router.post(
    "/share-unlock/claim",
    dependencies=[Depends(rate_limit(limit=10, window_s=600, scope="share_unlock_claim"))],
)
async def share_unlock_claim(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """A set finished while a subscription was live is paid out here once
    they're eligible again (the app calls this when the count is complete)."""
    user = await _share_unlock_user(current_user, db)
    return await _share_unlock_call(db, share_unlock_service.claim(db, user))
