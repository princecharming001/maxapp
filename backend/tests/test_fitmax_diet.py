"""Diet-aware FitMax nutrition — pattern-correct protein sources, allergy
swaps, cuisine framing, and strict backward-compat when diet is unknown."""

from __future__ import annotations

from services.fitmax_plan import fitmax_build_plan, fitmax_diet_block


def test_no_diet_info_returns_none_and_plan_unchanged():
    base = {"weight_kg": 75, "height_cm": 178, "age": 30, "biological_sex": "male",
            "goal": "recomp", "days_per_week": 4}
    plan = fitmax_build_plan(base)
    assert plan["diet"] is None
    # all original macro keys still present + same values as before the feature
    for k in ("bmr", "tdee", "calories", "protein_g", "carbs_g", "fat_g", "goal_label", "split"):
        assert k in plan


def test_vegetarian_uses_plant_protein_no_meat():
    d = fitmax_diet_block({"dietary_pattern": "vegetarian"})
    assert d["pattern"] == "vegetarian"
    blob = " ".join(d["protein_sources"]).lower()
    assert "chicken" not in blob and "beef" not in blob and "fish" not in blob
    assert any(x in blob for x in ("tofu", "lentils", "eggs", "paneer"))


def test_vegan_excludes_animal_products():
    d = fitmax_diet_block({"dietary_pattern": "vegan"})
    blob = " ".join(d["protein_sources"]).lower()
    assert "eggs" not in blob and "yogurt" not in blob and "whey" not in blob
    assert any(x in blob for x in ("tofu", "tempeh", "lentils", "seitan"))


def test_dairy_restriction_swaps_out_dairy_sources():
    d = fitmax_diet_block({"dietary_pattern": "vegetarian", "dietary_restrictions": ["dairy"]})
    blob = " ".join(d["protein_sources"]).lower()
    assert "yogurt" not in blob and "paneer" not in blob and "whey" not in blob and "cottage cheese" not in blob
    assert "eggs" in blob  # eggs survive a dairy restriction


def test_soy_allergy_drops_tofu_for_vegan():
    d = fitmax_diet_block({"dietary_pattern": "vegan", "food_allergies": ["soy"]})
    blob = " ".join(d["protein_sources"]).lower()
    assert "tofu" not in blob and "tempeh" not in blob and "edamame" not in blob
    assert any(x in blob for x in ("lentils", "chickpeas", "seitan"))


def test_allergies_and_cuisines_surface_in_note():
    d = fitmax_diet_block({
        "dietary_pattern": "vegetarian", "food_allergies": ["peanuts"],
        "food_cuisines": ["South Indian"],
    })
    assert d["allergies"] == ["peanuts"]
    assert d["cuisines"] == ["South Indian"]
    assert "peanuts" in d["note"]
    assert "South Indian" in d["note"]


def test_allergy_only_still_personalizes_omnivore():
    # No pattern, but a fish allergy -> omnivore sources minus fish.
    d = fitmax_diet_block({"food_allergies": ["fish"]})
    assert d is not None
    assert d["pattern"] == "omnivore"
    blob = " ".join(d["protein_sources"]).lower()
    assert "fish" not in blob and "salmon" not in blob
    assert "chicken breast" in blob


def test_string_dietary_restrictions_parse():
    d = fitmax_diet_block({"dietary_restrictions": "vegetarian, dairy"})
    assert d["pattern"] == "vegetarian"
    assert "dairy" in d["restrictions"]


def test_full_plan_embeds_diet_block():
    plan = fitmax_build_plan({
        "weight_kg": 70, "height_cm": 175, "age": 25, "biological_sex": "female",
        "goal": "fat_loss", "days_per_week": 5, "dietary_pattern": "vegan",
    })
    assert plan["diet"] is not None
    assert plan["diet"]["pattern"] == "vegan"
    assert plan["protein_g"] > 0  # macro math untouched
