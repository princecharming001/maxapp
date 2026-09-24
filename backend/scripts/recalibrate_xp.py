"""One-time XP recalibration for the 2026-09-24 economy (services/gamification.py).

Old economy: every badge paid a flat 50 XP, and a stored-level floor kept
levels minted by an older curve. New economy: badge XP scales by tier (setup
badges 10, bronze 25, silver 75, gold 200, Centurion 500) and the level is a
pure function of XP.

For each user with XP: re-price the badges earned since XP launched
(2026-07-04 — earlier badges never paid XP) from 50 to their new value, then
store the level the new curve gives. Task / perfect-day / streak XP is left
exactly as earned. The previous values are kept in profile["xp_legacy_v1"], so
the change is reversible.

Dry run by default. Apply with:  REPRICE_APPLY_CONFIRM=yes python scripts/recalibrate_xp.py --apply
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from db.sqlalchemy import AsyncSessionLocal  # noqa: E402
from services.gamification import (  # noqa: E402
    LEVEL_KEY, XP_KEY, achievement_xp, level_from_xp, rank_for_level,
)

XP_LAUNCH = datetime(2026, 7, 4, tzinfo=timezone.utc)
OLD_BADGE_XP = 50
BACKUP_KEY = "xp_legacy_v1"


async def main(apply: bool) -> None:
    if apply and os.environ.get("REPRICE_APPLY_CONFIRM") != "yes":
        raise SystemExit("refusing to write: set REPRICE_APPLY_CONFIRM=yes")
    async with AsyncSessionLocal() as db:
        users = (await db.execute(text(
            "select id::text from app_users where (profile->>'xp_total') is not null"
        ))).scalars().all()
        changed = 0
        for uid in users:
            row = (await db.execute(text(
                "select profile::text from app_users where id = cast(:u as uuid) for update"
            ), {"u": uid})).scalar()
            profile = json.loads(row or "{}")
            if BACKUP_KEY in profile:
                await db.rollback()
                continue  # already recalibrated — idempotent
            old_xp = int(profile.get(XP_KEY) or 0)
            old_lvl = profile.get(LEVEL_KEY)
            badges = (await db.execute(text(
                "select code, earned_at from user_achievements where user_id = cast(:u as uuid)"
            ), {"u": uid})).all()
            delta = sum(achievement_xp(code) - OLD_BADGE_XP for code, at in badges
                        if at is not None and at >= XP_LAUNCH)
            new_xp = max(0, old_xp + delta)
            new_lvl = level_from_xp(new_xp)
            print(f"{uid[:8]}  xp {old_xp:>5} -> {new_xp:>5}   level {str(old_lvl):>3} -> {new_lvl:>2} ({rank_for_level(new_lvl)})   badges={len(badges)}")
            if not apply:
                await db.rollback()
                continue
            profile[BACKUP_KEY] = {"xp_total": old_xp, "xp_level": old_lvl,
                                   "recalibrated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            profile[XP_KEY] = new_xp
            profile[LEVEL_KEY] = new_lvl
            await db.execute(text(
                "update app_users set profile = cast(:p as json) where id = cast(:u as uuid)"
            ), {"p": json.dumps(profile), "u": uid})
            await db.commit()
            changed += 1
        print(f"{'APPLIED' if apply else 'DRY RUN'}: {len(users)} users scanned, {changed} written")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    asyncio.run(main(ap.parse_args().apply))
