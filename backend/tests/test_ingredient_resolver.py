"""Hermetic tests for the deterministic, facts-filtered ingredient resolver (SC5).

These cover the pure selection/canonicalisation logic (no DB). The DB persistence +
end-to-end cross-task consistency is proven separately by scripts/verify_sc5.py against
the real database.
"""
from __future__ import annotations

from services import ingredient_resolver as ir


def test_canonical_strips_quantities_and_filler():
    assert ir.canonical_ingredient("Vitamin C serum (2 drops)") == "vitamin_c_serum"
    assert ir.canonical_ingredient("30g of coconut yogurt") == "coconut_yogurt"
    assert ir.canonical_ingredient("100ml almond milk") == "almond_milk"
    assert ir.canonical_ingredient("a pea-size amount of moisturizer") == "moisturizer"
    # letter-led tokens with digits survive (e.g. vitamin B5)
    assert "b5" in ir.canonical_ingredient("hyaluronic acid + B5").split("_")


def test_canonical_stable_across_phrasings():
    a = ir.canonical_ingredient("Vitamin C Serum")
    b = ir.canonical_ingredient("vitamin c serum, 2 drops")
    assert a == b == "vitamin_c_serum"


def test_pick_is_deterministic():
    """Same inputs -> same product, every call (no randomness)."""
    key = ir.canonical_ingredient("vitamin C serum")
    picks = {ir._pick_product("skinmax", key, None).id for _ in range(5)}
    assert len(picks) == 1


def test_facts_filter_vegan():
    """A vegan user never gets a product tagged vegan=False."""
    key = ir.canonical_ingredient("vitamin C serum")
    default = ir._pick_product("skinmax", key, None)
    vegan = ir._pick_product("skinmax", key, {"diet": ["vegan"]})
    assert default is not None and vegan is not None
    assert vegan.tags.get("vegan") is True
    # The vegan-filtered pick differs from the unconstrained default here.
    assert vegan.id != default.id


def test_facts_hash_changes_with_relevant_facts_only():
    base = ir._facts_hash(None)
    same = ir._facts_hash({"goals": ["look good"]})  # not a selection-driving category
    diff = ir._facts_hash({"diet": ["vegan"]})
    assert base == same
    assert diff != base


def test_unmatched_ingredient_returns_none():
    """A non-product ingredient (e.g. warm water) yields no product (generic card)."""
    key = ir.canonical_ingredient("warm water")
    assert ir._pick_product("skinmax", key, None) is None


def test_budget_tier_order_signal():
    assert ir._budget_tier_order(None)["budget"] == 0  # accessible default
    premium = ir._budget_tier_order({"budget": ["premium, money no object"]})
    assert premium["premium"] == 0
