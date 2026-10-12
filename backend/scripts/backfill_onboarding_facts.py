"""Idempotent backfill: replay existing users' `User.onboarding` answers into
durable keyed facts (`remember_fact(source="onboarding")`).

WHY: new per-maxx intake answers are mirrored to facts live (see
`_mirror_intake_to_facts`), but users who onboarded BEFORE dynamic onboarding
shipped have answers sitting only in `User.onboarding`. The `onboarding:<id>`
slot alias already reads those directly, but replaying them as keyed facts also
populates the profile / `facts:<id>` surface so cross-Max dedup is uniform.

IDEMPOTENT: every fact is keyed `onboarding.<field>` with source `onboarding`.
`remember_fact`'s keyed-conflict resolution dedupes a re-run at equal source
rank, so running this twice yields exactly one fact per key (it only refreshes
`last_seen_at`).

NOT auto-run anywhere (not imported by the app, not wired into the Ralph loop).
Run manually:  `.venv312/bin/python -m scripts.backfill_onboarding_facts [--dry-run] [--user <id>]`

The mapping (`onboarding_to_fact_calls`) is pure and unit-tested.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# Stable dimension hints per onboarding key; everything else -> "lifestyle"
# (a valid dimension that `_coerce_dimension` accepts). Kept deliberately small;
# the precise dimension only affects how the fact is grouped in the profile.
_DIMENSION_BY_KEY: dict[str, str] = {
    "age": "identity",
    "gender": "identity",
    "biological_sex": "identity",
    "skin_type": "body",
    "skin_concern": "body",
    "hair_type": "body",
    "scalp_state": "body",
    "barrier_state": "body",
    "injury_history": "constraints",
    "spine_health": "constraints",
    "tmj_history": "constraints",
    "dietary_restrictions": "diet",
    "equipment": "constraints",
    "equipment_access": "constraints",
}


def _known_onboarding_keys() -> set[str]:
    """Every onboarding-answer key that some compiled slot resolves from
    (`satisfied_by: onboarding:<id>`), across all docs. Lazy import to avoid a
    catalog dependency at module import time."""
    from services.max_doc_loader import parse_all_max_docs
    from services.onboarding_gap import compile_info_schema

    keys: set[str] = set()
    for doc in parse_all_max_docs():
        schema = compile_info_schema(doc)
        for slot in schema.slots:
            if slot.field:
                keys.add(slot.field)
            for alias in slot.satisfied_by:
                if alias.startswith("onboarding:"):
                    keys.add(alias.split(":", 1)[1])
    return keys


def onboarding_to_fact_calls(
    onboarding: dict, *, known_keys: Optional[set[str]] = None
) -> list[dict]:
    """PURE: map an onboarding dict to an ordered, de-duplicated list of keyed
    `remember_fact` kwargs. One entry per real answer that maps to a known slot;
    internal `_`-prefixed and empty values are skipped. Stable keys
    (`onboarding.<field>`) make a replay idempotent at the DB layer."""
    keys = known_keys if known_keys is not None else _known_onboarding_keys()
    calls: list[dict] = []
    seen: set[str] = set()
    for k, v in (onboarding or {}).items():
        if not k or k.startswith("_"):
            continue
        if v is None or v == "" or v == [] or v == {}:
            continue
        if k not in keys:
            continue
        fact_key = f"onboarding.{k}"
        if fact_key in seen:
            continue
        seen.add(fact_key)
        calls.append({
            "key": fact_key,
            "dimension": _DIMENSION_BY_KEY.get(k, "lifestyle"),
            "value": v,
            "text": f"{k.replace('_', ' ')}: {v}",
            "source": "onboarding",
            "confidence": 0.85,
        })
    return calls


async def backfill_user(db, user_id: str, *, dry_run: bool = False) -> int:
    """Replay one user's onboarding into keyed facts. Returns the count of
    mapped facts. `dry_run` computes the mapping without writing."""
    from models.sqlalchemy_models import User
    from services.personalization import remember_fact

    user = await db.get(User, UUID(str(user_id)))
    onboarding = dict((user.onboarding if user else None) or {})
    calls = onboarding_to_fact_calls(onboarding)
    if dry_run:
        return len(calls)
    for c in calls:
        await remember_fact(
            db, user_id,
            dimension=c["dimension"], text=c["text"], key=c["key"],
            value=c["value"], source=c["source"], confidence=c["confidence"],
            rebuild=False,
        )
    # One profile rebuild at the end (cheaper than per-fact).
    try:
        from services.personalization import _safe_rebuild
        if calls:
            await _safe_rebuild(user_id, db)
    except Exception as e:  # pragma: no cover - non-fatal
        logger.warning("profile rebuild after backfill failed user=%s: %s", user_id, e)
    return len(calls)


async def _main(dry_run: bool, only_user: Optional[str]) -> None:
    from sqlalchemy import select
    from db.sqlalchemy import AsyncSessionLocal
    from models.sqlalchemy_models import User

    async with AsyncSessionLocal() as db:
        if only_user:
            n = await backfill_user(db, only_user, dry_run=dry_run)
            logger.info("backfill user=%s facts=%d dry_run=%s", only_user, n, dry_run)
            return
        ids = (await db.execute(select(User.id))).scalars().all()
        total = 0
        for uid in ids:
            total += await backfill_user(db, str(uid), dry_run=dry_run)
        logger.info("backfill users=%d facts=%d dry_run=%s", len(ids), total, dry_run)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--user", default=None, help="backfill a single user id")
    args = ap.parse_args()
    asyncio.run(_main(args.dry_run, args.user))
