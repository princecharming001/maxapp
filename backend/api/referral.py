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
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.sqlalchemy import get_db
from middleware.auth_middleware import get_current_user
from middleware.rate_limit import rate_limit
from models.sqlalchemy_models import User
from services import referral_service
from services.referral_service import ReferralError

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
