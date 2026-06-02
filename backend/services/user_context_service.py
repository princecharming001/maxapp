"""Per-user persistent context that influences future schedule generations.

The bot writes to this whenever it learns something relevant in chat —
product preferences, dislikes, frictions, equipment owned, allergies,
etc. The schedule generator reads from this on every generation/tweak.

Storage: `user_schedule_context` table, one row per user, JSONB blob.
Updates use Postgres JSONB merge (||) so concurrent writes don't clobber.

Conventions for keys (loose, expand as needed):
    product_preferences    {"cleanser": "cerave foaming"}
    product_dislikes       ["the ordinary niacinamide"]
    timing_preferences     {"workout": "evening"}
    skipped_repeatedly     ["skin.dermastamp"]
    morning_friction       "high" | "low"
    equipment_owned        ["dermastamp", "microneedle"]
    explicit_avoidances    ["mewing"]
    reported_issues        [{"date": "...", "note": "burning"}]
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Tiny LRU-ish cache (user_id -> (loaded_at, ctx)) — context is small and
# read on every generation. 60s TTL keeps it fresh without a DB roundtrip
# on chat-burst sequences.
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_S = 60.0


async def get_context(user_id: str, db: AsyncSession) -> dict[str, Any]:
    """Read merged context. Returns {} if no row exists yet."""
    cached = _CACHE.get(user_id)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_S:
        return dict(cached[1])
    try:
        result = await db.execute(
            text("SELECT context FROM user_schedule_context WHERE user_id = :uid"),
            {"uid": UUID(user_id)},
        )
        row = result.first()
        ctx = dict(row[0]) if row and row[0] else {}
    except Exception as e:
        logger.warning("user_schedule_context fetch failed user=%s: %s", user_id, e)
        ctx = {}
    _CACHE[user_id] = (time.time(), ctx)
    return dict(ctx)


async def merge_context(user_id: str, updates: dict[str, Any], db: AsyncSession) -> dict:
    """Merge updates into the user's context (JSONB || semantics).

    Lists in `updates` REPLACE the corresponding existing list (we don't
    auto-dedupe-merge because the caller is the source of truth for
    intent — e.g. the bot *removing* a preference passes a new list).
    """
    if not updates:
        return await get_context(user_id, db)
    payload = json.dumps(updates)
    try:
        await db.execute(
            text(
                """
                INSERT INTO user_schedule_context (user_id, context)
                VALUES (:uid, CAST(:payload AS jsonb))
                ON CONFLICT (user_id) DO UPDATE
                    SET context = user_schedule_context.context || EXCLUDED.context,
                        updated_at = NOW()
                """
            ),
            {"uid": UUID(user_id), "payload": payload},
        )
    except Exception as e:
        logger.error("user_schedule_context merge failed user=%s: %s", user_id, e)
        raise
    _CACHE.pop(user_id, None)
    return await get_context(user_id, db)


async def append_to_list(user_id: str, key: str, value: Any, db: AsyncSession, *, max_len: int = 50) -> dict:
    """Append a value to a list-typed key, deduped, capped at max_len."""
    ctx = await get_context(user_id, db)
    lst = list(ctx.get(key) or [])
    if value not in lst:
        lst.append(value)
    if len(lst) > max_len:
        lst = lst[-max_len:]
    return await merge_context(user_id, {key: lst}, db)


def invalidate(user_id: str) -> None:
    _CACHE.pop(user_id, None)


# Map a face scan's recommended module ids -> the priority tokens the
# collision trimmer ranks on (see multi_module_collision._PRIORITY_TOKEN_TO_MAXX,
# the inverse mapping). Lets a scan that flagged "your jaw + skin are the weak
# links" bias which optional tasks survive when two maxxes collide.
_SCAN_MODULE_TO_PRIORITY_TOKEN = {
    "bonemax": "face_structure",
    "skinmax": "skin",
    "hairmax": "hair",
    "fitmax": "body",
    "heightmax": "height",
}


def _is_empty(v: Any) -> bool:
    """A field counts as 'unanswered' (safe to fill from a scan) when it's
    null or an empty string/list/dict — never when the user gave a real value."""
    return v is None or v == "" or v == [] or v == {}


def scan_derived_signals(state: dict | None) -> dict:
    """Gap-fill generation signals inferred from the user's latest face scan.

    Reads ONLY the headline `facial_scan_summary` that gets denormalized onto
    onboarding when the first triple scan completes (see api/scans.py), so this
    stays a pure, synchronous, DB-free function — usable on every generation
    path and in tests without a session.

    Today it maps the scan's `suggested_modules` (the analyzer emits these
    weakest / most-impactful first) into a `priority_order` so the collision
    trimmer keeps more of the work the scan actually flagged. Returns ONLY the
    keys worth filling; the caller applies them as the lowest-precedence layer
    so any explicit answer the user gave always wins.
    """
    if not state:
        return {}
    out: dict[str, Any] = {}
    summary = state.get("facial_scan_summary")
    if isinstance(summary, dict):
        mods = summary.get("suggested_modules")
        if isinstance(mods, list):
            order: list[str] = []
            for m in mods:
                tok = _SCAN_MODULE_TO_PRIORITY_TOKEN.get(str(m).strip().lower())
                if tok and tok not in order:
                    order.append(tok)
            if order:
                out["priority_order"] = order
    return out


def merged_user_state(onboarding: dict | None, context: dict | None, extras: dict | None = None) -> dict:
    """Single dict the DSL evaluates against. Precedence: extras > context > onboarding.

    Face-scan signals sit BELOW all of those — they only fill keys the user
    never answered, so an explicit choice (questionnaire, chat, manual edit)
    is never overridden by what the scan inferred."""
    out: dict[str, Any] = {}
    if onboarding:
        out.update(onboarding)
    if context:
        out.update(context)
    if extras:
        out.update(extras)
    # Lowest-precedence layer: only set keys the user left unanswered.
    for k, v in scan_derived_signals(out).items():
        if _is_empty(out.get(k)):
            out[k] = v
    return out
