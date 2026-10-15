"""Products tab (api/products.py): one product per need in the person's CURRENT routine."""
from datetime import date

import pytest
from fastapi import HTTPException

from api.products import _image, _their_need, build_list, options_for, plan_needs
from services import skin_routine
from services.product_catalog import active_catalog


def _items(sections):
    return {it["need"]: it for s in sections for it in s["items"]}


def _skin(goal, feel, flags="None of these"):
    t = skin_routine.build_template({"skin_goal": goal, "skin_feel": feel, "skin_flags": flags}, started_on=date.today())
    return [("skinhairmax", t)]


def test_every_active_product_has_a_need_and_listing_facts():
    for p in active_catalog():
        assert p.need, p.id
        assert p.asin and p.price_usd and p.rating and p.rating_count, p.id
        assert p.image.startswith("https://m.media-amazon.com/images/I/"), p.id


def test_nothing_without_programs_and_only_programs_i_run():
    assert build_list([], None, {}) == []
    plan = {"habits": [{"habit_id": "morning_light", "title": "morning outdoor light"}]}
    s = build_list([("energymax", plan)], None, {})
    assert [x["program"] for x in s] == ["energymax"]
    assert list(_items(s)) == ["light_therapy"]


def test_only_needs_my_current_habits_have_one_product_each():
    plan = {"habits": [{"habit_id": "bedroom_setup", "title": "bedroom setup"},
                       {"habit_id": "fixed_wake_time", "title": "same wake time daily"}]}
    items = _items(build_list([("sleepmax", plan)], None, {}))
    assert set(items) == {"dark_room", "quiet_room", "wake_light"}      # mask/curtains are ONE need
    assert items["quiet_room"]["options"] == 3 and items["quiet_room"]["for"] == ["bedroom setup"]


def test_tweaking_the_schedule_changes_the_list():
    before = {"habits": [{"habit_id": "deep_work_block", "title": "deep work"}]}
    after = {"habits": [{"habit_id": "phone_away", "title": "phone in another room"}]}
    assert "focus_timer" in _items(build_list([("focusmax", before)], None, {}))
    assert set(_items(build_list([("focusmax", after)], None, {}))) == {"phone_lockbox"}


def test_supplements_only_from_my_suppmax_plan_never_from_a_sleep_habit():
    sleep = {"habits": [{"habit_id": "wind_down", "title": "wind-down"}]}
    assert "melatonin" not in _items(build_list([("sleepmax", sleep)], None, {}))
    supp = {"habits": [{"habit_id": "melatonin", "title": "melatonin before bed"}]}
    assert "melatonin" in _items(build_list([("suppmax", supp)], None, {}))


def test_skin_products_follow_the_routine_and_skin_type():
    oily = _items(build_list(_skin("Clear breakouts", "Shiny all over"), None, {}))
    assert oily["face_cleanser"]["product"]["id"] == "cerave-foaming-cleanser"
    assert {"adapalene", "niacinamide_serum", "sunscreen"} <= set(oily)
    assert oily["sunscreen"]["for"] == ["AM skin routine"]
    dry = _items(build_list(_skin("Fix dryness", "Tight, dry or flaky", "Eczema or rosacea"), None, {}))
    assert dry["moisturizer"]["product"]["id"] == "cerave-moisturizing-cream"
    assert "mineral" in dry["sunscreen"]["product"]["name"].lower()
    assert dry["face_cleanser"]["for"] == ["PM skin routine"]           # AM is a water rinse
    preg = _items(build_list(_skin("Smooth fine lines", "Comfortable", "Pregnant, trying, or breastfeeding"), None, {}))
    assert not {"adapalene", "retinol_serum"} & set(preg)


def test_my_pick_wins_and_alternatives_are_only_my_needs():
    plan = {"habits": [{"habit_id": "creatine", "title": "creatine daily"}]}
    active = [("suppmax", plan)]
    need = _their_need(active, "creatine")
    assert len(options_for(need, None, {})) == 3
    items = _items(build_list(active, None, {"creatine": "thorne-creatine"}))
    assert items["creatine"]["product"]["id"] == "thorne-creatine" and items["creatine"]["picked"]
    with pytest.raises(HTTPException):
        _their_need(active, "melatonin")


def test_diet_facts_filter_options():
    plan = {"habits": [{"habit_id": "protein_powder", "title": "protein shake"}]}
    need = plan_needs([("suppmax", plan)])[0]
    vegan = {p.id for p in options_for(need, {"diet": ["vegan"]}, {})}
    assert vegan and all("vegan" in i for i in vegan)


def test_image_size_rewrite():
    assert _image("https://m.media-amazon.com/images/I/91j-EDBgLGL._AC_SX679_.jpg") == \
        "https://m.media-amazon.com/images/I/91j-EDBgLGL._AC_SL500_.jpg"


def test_task_products_match_the_tab_and_cover_folded_rows():
    from api.products import task_products
    supp = {"habits": [{"habit_id": "creatine", "title": "creatine"}, {"habit_id": "l_theanine", "title": "theanine"}],
            "answers": {}}
    active = [("suppmax", supp)]
    got = task_products(active, None, {"creatine": "thorne-creatine"}, "suppmax", "creatine",
                        "creatine daily + L-theanine: stir 3-5 g of creatine ...")
    assert [n for n, _ in got] == ["creatine", "l_theanine"]
    assert got[0][1]["id"] == "thorne-creatine"                      # their Swap wins here too


def test_task_products_for_skin_follow_that_routine_step_only():
    from api.products import task_products
    active = _skin("Fix dryness", "Tight, dry or flaky")
    am = next(h for h in active[0][1]["habits"] if h["habit_id"] == "am_routine")
    needs = [n for n, _ in task_products(active, None, {}, "skinhairmax", "am_routine", am["how"])]
    assert "face_cleanser" not in needs                               # AM is a water rinse for dry skin
    assert {"moisturizer", "sunscreen"} <= set(needs)


def test_no_gear_habits_get_no_products():
    from api.products import task_products
    plan = {"habits": [{"habit_id": "posture_break", "title": "desk posture reset"}]}
    assert task_products([("trainmax", plan)], None, {}, "trainmax", "posture_break", "roll shoulders") == []
