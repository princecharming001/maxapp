"""Additive migration: referral_codes + referral_redemptions tables and the
two additive app_users columns (RALPH_REFERRAL Phase 1).

Idempotent (IF NOT EXISTS everywhere) so it is safe to re-run and never touches
existing rows. Run:  cd backend && .venv312/bin/python scripts/add_referral_tables.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from sqlalchemy import text
from db.sqlalchemy import engine


DDL = [
    # Additive app_users columns (nullable -> existing rows safe).
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by_code_id UUID",
    "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_source TEXT",
    # referral_codes
    """
    CREATE TABLE IF NOT EXISTS referral_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        granted_tier TEXT,
        discount_kind TEXT,
        discount_value NUMERIC,
        stripe_promotion_code TEXT,
        stripe_coupon_id TEXT,
        stripe_price_id TEXT,
        apple_offer_code TEXT,
        apple_offer_id TEXT,
        max_redemptions INTEGER,
        per_user_limit INTEGER NOT NULL DEFAULT 1,
        redemption_count INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        owner_user_id UUID,
        campaign TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes (code)",
    "CREATE INDEX IF NOT EXISTS idx_referral_codes_campaign ON referral_codes (campaign)",
    # referral_redemptions (one-per-user enforced at the DB layer)
    """
    CREATE TABLE IF NOT EXISTS referral_redemptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code_id UUID NOT NULL,
        user_id UUID NOT NULL,
        kind_at_redemption TEXT NOT NULL,
        result TEXT NOT NULL,
        platform TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_referral_redemption_code_user UNIQUE (code_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_referral_redemptions_user_id ON referral_redemptions (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code_id ON referral_redemptions (code_id)",
]


async def main():
    async with engine.begin() as conn:
        await conn.execute(text("SET lock_timeout = '10s'"))
        for stmt in DDL:
            await conn.execute(text(stmt))
    print("[OK] referral_codes + referral_redemptions + app_users columns ensured")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
