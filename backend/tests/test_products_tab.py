"""Products tab (api/products.py): the catalog arranged for one person."""
from api.products import _image, build_sections
from services.product_catalog import active_catalog


def _by(sections):
    return {s["program"]: s for s in sections}


def test_every_active_product_has_listing_facts():
    for p in active_catalog():
        assert p.asin, p.id
        assert p.price_usd and p.price_usd > 0, p.id
        assert p.rating and 1 <= p.rating <= 5, p.id
        assert p.rating_count and p.rating_count > 0, p.id
        assert p.image.startswith("https://m.media-amazon.com/images/I/"), p.id


def test_my_programs_come_first_in_the_order_i_started_them():
    s = build_sections([("focusmax", {}), ("sleepmax", {})], None)
    assert [x["program"] for x in s[:2]] == ["focusmax", "sleepmax"]
    assert s[0]["active"] and s[1]["active"] and not s[2]["active"]
    assert len(s) == 9


def test_products_for_a_habit_in_my_plan_lead_and_say_so():
    plan = {"habits": [{"habit_id": "morning_light", "title": "morning outdoor light"}]}
    energy = _by(build_sections([("energymax", plan)], None))["energymax"]["products"]
    assert energy[0]["id"] == "verilux-happylight-luxe"
    assert energy[0]["for_habit"] == "morning outdoor light"
    assert all(p["for_habit"] is None for p in energy[1:])


def test_supplements_only_from_my_own_screened_plan():
    none = _by(build_sections([], None))["suppmax"]
    assert none["products"] == [] and "Suppmax" in none["note"]
    plan = {"habits": [{"habit_id": "creatine", "title": "creatine daily"}]}
    supp = _by(build_sections([("suppmax", plan)], None))["suppmax"]["products"]
    assert supp and all(p["for_habit"] == "creatine daily" for p in supp)
    assert {p["id"] for p in supp} <= {"thorne-creatine", "optimum-nutrition-creatine", "now-creatine-monohydrate"}


def test_diet_facts_filter_products():
    energy = lambda facts: {p["id"] for p in _by(build_sections([], facts))["energymax"]["products"]}  # noqa: E731
    assert "premier-protein-shake-30g" in energy(None)
    assert "premier-protein-shake-30g" not in energy({"diet": ["vegan"]})


def test_cards_carry_what_the_tab_shows():
    p = _by(build_sections([], None))["sleepmax"]["products"][0]
    assert p["url"] == f"https://www.amazon.com/dp/{p['asin']}"
    assert p["image"].endswith("._AC_SL500_.jpg")
    assert p["price_usd"] and p["rating"] and p["rating_count"] and p["brand"] and p["name"]


def test_image_size_rewrite():
    assert _image("https://m.media-amazon.com/images/I/91j-EDBgLGL._AC_SX679_.jpg") == \
        "https://m.media-amazon.com/images/I/91j-EDBgLGL._AC_SL500_.jpg"
    assert _image("") == ""
