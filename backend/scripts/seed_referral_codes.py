"""Create / seed referral codes (RALPH_REFERRAL Phase 7 admin path).

Reusable helper + a small CLI. Example:
  # free comp, unlimited
  python scripts/seed_referral_codes.py --code FRIENDS --kind free_comp --tier premium
  # influencer comp capped at 100 uses, expires in 30 days
  python scripts/seed_referral_codes.py --code ANISHVIP --kind free_comp --tier premium \
      --max 100 --days 30 --campaign launch
  # 20% discount (Stripe promo on web, Apple offer on iOS) — placeholders until wired in
  python scripts/seed_referral_codes.py --code SAVE20 --kind discount --discount-kind percent \
      --discount-value 20 --stripe-promo PROMO_PLACEHOLDER --apple-offer OFFER_PLACEHOLDER

Counters: python scripts/seed_referral_codes.py --stats
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from sqlalchemy import func, select
from db.sqlalchemy import AsyncSessionLocal
from models.sqlalchemy_models import ReferralCode, ReferralRedemption
from services.referral_service import normalize_code


async def create_code(session, **kw) -> ReferralCode:
    """Idempotent-ish create: returns the existing row if the (normalized) code
    already exists, else inserts a new one. Server is the source of truth."""
    code = normalize_code(kw.pop("code"))
    if not code:
        raise ValueError("code required")
    existing = (await session.execute(select(ReferralCode).where(ReferralCode.code == code))).scalar_one_or_none()
    if existing:
        print(f"[skip] {code} already exists ({existing.kind})")
        return existing
    days = kw.pop("days", None)
    expires_at = datetime.now(timezone.utc) + timedelta(days=days) if days else None
    row = ReferralCode(code=code, expires_at=expires_at, **kw)
    session.add(row)
    await session.commit()
    print(f"[ok] created {code} kind={row.kind} tier={row.granted_tier} "
          f"max={row.max_redemptions} discount={row.discount_kind}:{row.discount_value}")
    return row


async def print_stats(session) -> None:
    rows = (await session.execute(
        select(ReferralCode.code, ReferralCode.kind, ReferralCode.campaign,
               ReferralCode.redemption_count, ReferralCode.max_redemptions)
    )).all()
    print("code               kind        campaign     redemptions")
    for code, kind, campaign, count, mx in rows:
        print(f"{code:<18} {kind:<11} {str(campaign or '-'):<12} {count}/{mx if mx is not None else '∞'}")
    by_result = (await session.execute(
        select(ReferralRedemption.result, func.count()).group_by(ReferralRedemption.result)
    )).all()
    print("\nredemptions by result:", dict(by_result) or "(none)")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--code")
    ap.add_argument("--kind", choices=["free_comp", "discount", "referral"])
    ap.add_argument("--tier", choices=["basic", "premium"], default="premium")
    ap.add_argument("--discount-kind", choices=["percent", "fixed", "price_id"])
    ap.add_argument("--discount-value", type=float)
    ap.add_argument("--stripe-promo")
    ap.add_argument("--stripe-coupon")
    ap.add_argument("--stripe-price")
    ap.add_argument("--apple-offer")
    ap.add_argument("--apple-offer-id")
    ap.add_argument("--max", type=int, dest="max_redemptions")
    ap.add_argument("--per-user", type=int, default=1, dest="per_user_limit")
    ap.add_argument("--days", type=int)
    ap.add_argument("--campaign")
    ap.add_argument("--owner")
    ap.add_argument("--notes")
    ap.add_argument("--stats", action="store_true")
    args = ap.parse_args()

    async with AsyncSessionLocal() as session:
        if args.stats:
            await print_stats(session)
            return
        if not (args.code and args.kind):
            ap.error("--code and --kind are required (or use --stats)")
        await create_code(
            session,
            code=args.code, kind=args.kind,
            granted_tier=args.tier if args.kind == "free_comp" else None,
            discount_kind=args.discount_kind, discount_value=args.discount_value,
            stripe_promotion_code=args.stripe_promo, stripe_coupon_id=args.stripe_coupon,
            stripe_price_id=args.stripe_price, apple_offer_code=args.apple_offer,
            apple_offer_id=args.apple_offer_id, max_redemptions=args.max_redemptions,
            per_user_limit=args.per_user_limit, days=args.days,
            campaign=args.campaign, notes=args.notes,
            owner_user_id=args.owner,
        )


if __name__ == "__main__":
    asyncio.run(main())
