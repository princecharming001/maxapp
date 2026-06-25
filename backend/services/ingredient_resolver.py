"""ingredient_resolver.py — deterministic, user-scoped ingredient → product mapping.

The task-guide text (steps, overview) is shared across users and cached globally by
`task_guide_service`. The *products* a guide references must NOT be shared: SC5 requires
that for a given user the same ingredient always resolves to the same specific product
*everywhere it appears, across every task guide*, and that the choice respects what we
know about that user (diet / allergies / sensitivities / budget) via
`product_catalog._passes_user_facts`.

This module:

  1. Normalises a free-form ingredient name ("Vitamin C serum, 2 drops") to a canonical
     key ("vitamin_c_serum").
  2. Picks a product DETERMINISTICALLY from the user-facts-filtered catalog candidates
     (stable ranking: concern-overlap → budget-fit tier → product id). No randomness,
     no per-call LLM.
  3. PERSISTS the (user, canonical-ingredient) → product_id mapping in
     `user_ingredient_products`, stamped with a hash of the facts that drove the choice.
     The mapping is reused by every task guide and only recomputed if the user's facts
     change (facts_hash mismatch) or the product leaves the catalog.

Public API:
    async resolve_products_for_user(db, user_id, module, items) -> list[dict]
        items: [{"name": str, "note": str}, ...]
        returns: [{"name", "note", "brand", "url", "image", "generic_name"}, ...]
            (order preserved; unresolved items keep their generic name, empty url/image)
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonicalisation
# ---------------------------------------------------------------------------

# Quantity / filler tokens stripped from ingredient names so "30g of coconut yogurt"
# and "coconut yogurt" share a canonical key.
_DROP_TOKENS = {
    "of", "the", "a", "an", "and", "with", "to", "for", "your", "some", "few",
    "drop", "drops", "dab", "pump", "pumps", "tablespoon", "tablespoons", "tbsp",
    "teaspoon", "teaspoons", "tsp", "cup", "cups", "scoop", "scoops", "ml", "g",
    "gram", "grams", "mg", "oz", "spray", "sprays", "amount", "small", "thin",
    "layer", "pea", "sized", "size",
}
# A pure quantity token: digit-led, optional unit suffix. Drops "30g", "100ml", "6",
# "2x" but keeps letter-led tokens like "b5" (vitamin B5) or "spf50".
_QTY_RE = re.compile(r"^\d+(g|kg|mg|ml|l|oz|tbsp|tsp|x)?$")
_TOKEN_RE = re.compile(r"[a-z0-9%+]+")


def canonical_ingredient(name: str) -> str:
    """Lowercase, drop quantities / filler words, join significant tokens with '_'.

    "Vitamin C serum (2 drops)" -> "vitamin_c_serum"
    "30g of coconut yogurt"     -> "coconut_yogurt"
    """
    if not name:
        return ""
    s = name.lower()
    s = re.sub(r"\([^)]*\)", " ", s)          # drop parentheticals
    toks = _TOKEN_RE.findall(s)
    keep = [t for t in toks if t not in _DROP_TOKENS and not _QTY_RE.match(t)]
    return "_".join(keep)[:64]


def _concerns_for(canonical_key: str) -> list[str]:
    """Tokens fed to product_catalog concern matching (synonym-expanded downstream)."""
    return [t for t in canonical_key.split("_") if t]


# ---------------------------------------------------------------------------
# Facts hashing + budget signal
# ---------------------------------------------------------------------------

# Only the facts that actually drive product selection participate in the hash, so an
# unrelated fact edit doesn't churn every mapping.
_FACT_CATEGORIES = ("diet", "allergies", "health", "budget")


def _facts_hash(user_facts: Optional[dict]) -> str:
    subset = {}
    for cat in _FACT_CATEGORIES:
        vals = (user_facts or {}).get(cat)
        if isinstance(vals, list):
            subset[cat] = sorted(str(v).lower().strip() for v in vals)
        elif vals:
            subset[cat] = str(vals).lower().strip()
    blob = json.dumps(subset, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]


def _budget_tier_order(user_facts: Optional[dict]) -> dict[str, int]:
    """Map price_tier -> sort priority (lower = preferred) from the user's budget signal.

    Default: budget-first (accessible). A user who signals a premium budget gets
    premium-first; a user who signals a tight budget keeps budget-first.
    """
    blob = " ".join(
        str(v).lower()
        for v in ((user_facts or {}).get("budget") or [])
        if v
    )
    if any(w in blob for w in ("premium", "high", "splurge", "luxury", "no budget", "money no")):
        return {"premium": 0, "mid": 1, "budget": 2}
    # budget-first accessible default (also for explicit "tight"/"cheap"/unknown)
    return {"budget": 0, "mid": 1, "premium": 2}


# ---------------------------------------------------------------------------
# Deterministic candidate selection
# ---------------------------------------------------------------------------

def _pick_product(module: Optional[str], canonical_key: str, user_facts: Optional[dict]):
    """Return the single deterministically-chosen Product for this ingredient, or None.

    Ranking: concern-overlap (desc) -> budget-fit tier (asc priority) -> product id (asc).
    The id tie-break makes the choice fully deterministic regardless of catalog file order.
    """
    from services import product_catalog as pc

    catalog = pc.load_catalog()
    if not catalog:
        return None

    target_module = (module or "").strip().lower() or None
    concern_set = pc._expand_concerns(_concerns_for(canonical_key))
    tier_order = _budget_tier_order(user_facts)

    scored = []
    for p in catalog:
        if target_module and p.module != target_module and p.module != "general":
            continue
        if not pc._passes_user_facts(p, user_facts):
            continue
        overlap = len(concern_set & set(p.concerns)) if concern_set else 0
        scored.append((overlap, tier_order.get(p.price_tier, 1), p.id, p))

    if not scored:
        return None

    # Require at least one concern hit when we have concern tokens — otherwise an
    # ingredient like "warm water" would grab an arbitrary in-module product.
    if concern_set and not any(s[0] > 0 for s in scored):
        return None

    scored.sort(key=lambda t: (-t[0], t[1], t[2]))
    return scored[0][3]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

_TABLE_INIT = """
CREATE TABLE IF NOT EXISTS user_ingredient_products (
    user_id        TEXT NOT NULL,
    ingredient_key TEXT NOT NULL,
    product_id     TEXT NOT NULL,
    facts_hash     TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, ingredient_key)
);
"""
_TABLE_READY = False


async def _ensure_table(db: AsyncSession) -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    await db.execute(text(_TABLE_INIT))
    await db.commit()
    _TABLE_READY = True


async def _get_mapping(db: AsyncSession, user_id: str, key: str) -> Optional[tuple[str, str]]:
    row = await db.execute(
        text(
            "SELECT product_id, facts_hash FROM user_ingredient_products "
            "WHERE user_id = :u AND ingredient_key = :k"
        ),
        {"u": str(user_id), "k": key},
    )
    r = row.fetchone()
    return (r[0], r[1]) if r else None


async def _set_mapping(db: AsyncSession, user_id: str, key: str, product_id: str, facts_hash: str) -> None:
    await db.execute(
        text(
            """
            INSERT INTO user_ingredient_products (user_id, ingredient_key, product_id, facts_hash)
            VALUES (:u, :k, :p, :h)
            ON CONFLICT (user_id, ingredient_key)
            DO UPDATE SET product_id = :p, facts_hash = :h, created_at = NOW()
            """
        ),
        {"u": str(user_id), "k": key, "p": product_id, "h": facts_hash},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def resolve_product_for_user(
    db: AsyncSession,
    user_id: str,
    module: Optional[str],
    name: str,
    user_facts: Optional[dict] = None,
    facts_hash: Optional[str] = None,
):
    """Resolve a single ingredient name to a Product for this user (or None).

    Stable across calls: reads a persisted mapping first, only recomputing when the
    user's facts changed or the previously-chosen product left the catalog.
    """
    key = canonical_ingredient(name)
    if not key:
        return None
    await _ensure_table(db)
    if facts_hash is None:
        facts_hash = _facts_hash(user_facts)

    from services import product_catalog as pc
    by_id = {p.id: p for p in pc.load_catalog()}

    existing = await _get_mapping(db, user_id, key)
    if existing:
        product_id, stored_hash = existing
        if stored_hash == facts_hash and product_id in by_id:
            return by_id[product_id]
        # facts changed or product gone — fall through to recompute.

    pick = _pick_product(module, key, user_facts)
    if pick is None:
        return None
    await _set_mapping(db, user_id, key, pick.id, facts_hash)
    return pick


async def resolve_products_for_user(
    db: AsyncSession,
    user_id: str,
    module: Optional[str],
    items: list[dict],
) -> list[dict]:
    """Resolve a list of generic ingredients to user-specific product cards.

    Each item is {"name", "note"}; returns the same order with a specific product
    attached when one resolves. Unresolved items keep their generic name and empty
    url/image (the card still renders, just not tappable).
    """
    if not items:
        return []

    # Load the user's facts once; one facts_hash drives the whole batch.
    user_facts: dict = {}
    try:
        from services.personalization import _load_user_facts
        user_facts = await _load_user_facts(db, user_id) or {}
    except Exception as e:
        logger.debug("[ingredient_resolver] user_facts load skipped: %s", e)
    facts_hash = _facts_hash(user_facts)

    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        generic = str(it.get("name", "")).strip()
        if not generic:
            continue
        note = str(it.get("note", "")).strip()
        product = None
        try:
            product = await resolve_product_for_user(
                db, user_id, module, generic, user_facts=user_facts, facts_hash=facts_hash
            )
        except Exception as e:
            logger.debug("[ingredient_resolver] resolve failed for %r: %s", generic, e)

        if product is not None:
            out.append({
                "name": product.name,
                "generic_name": generic,
                "note": note,
                "brand": product.brand,
                "url": product.display_url,
                "image": product.image,
            })
        else:
            out.append({
                "name": generic,
                "generic_name": generic,
                "note": note,
                "brand": "",
                "url": "",
                "image": "",
            })
    return out
