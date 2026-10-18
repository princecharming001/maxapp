"""Beta-1 W3: task guides know when, how long and what the person actually uses.

The LLM is stubbed (`task_guide_service._call_llm`); nothing here talks to a
provider or a database.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

import pytest

import services.task_guide_service as tgs
from services.habit_library import library_entry, need_range, parse_strength
from services.product_catalog import active_catalog


PROFILE = {
    "wake_time": "10:00", "bed_time": "01:00",
    "meals": {"breakfast": "10:30", "lunch": "12:30", "dinner": "19:30"},
    "workout_time": None,
}


def _days(task: dict, date: str = "2026-10-19") -> list[dict]:
    return [{"day_index": 0, "date": date, "tasks": [task]}]


def _task(cid: str, title: str, time: str, minutes: int, desc: str = "", tid: str = "t1") -> dict:
    return {"task_id": tid, "catalog_id": cid, "title": title, "description": desc,
            "time": time, "duration_minutes": minutes, "duration_min": minutes}


def _inp(task: dict, *, profile: dict = PROFILE, user: str = "u1", needs=None, day_tasks=None) -> dict:
    return tgs.build_inputs(user_id=user, maxx_id=task["catalog_id"].split(".")[0], task=task,
                            days=_days(task), profile=profile, day_tasks=day_tasks or [task],
                            needs=needs or [])


D3 = _task("suppmax.vitamin_d3", "Vitamin D3 with a meal", "12:30", 1, "Take D3 with a meal.")
ELEC = _task("suppmax.electrolytes", "Electrolytes", "19:30", 1, "One sachet in water.")
LIGHT = _task("sleepmax.morning_light", "Morning outdoor light", "10:05", 6, "Step outside.")
MELA = _task("suppmax.melatonin", "Low-dose melatonin", "00:15", 1, "Take one serving.")
WATER = _task("energymax.water_on_waking", "Water on waking", "10:00", 1, "Drink a glass of water.")


# ── cache identity ───────────────────────────────────────────────────────────

def test_key_is_per_user_and_per_instance():
    base = tgs.guide_key(_inp(D3))
    assert base == tgs.guide_key(_inp(dict(D3)))                                  # same inputs: hit
    assert base.startswith("u:u1|suppmax.vitamin_d3|t12:30|d1|")
    assert base != tgs.guide_key(_inp(D3, user="u2"))                             # never shared across users
    assert base != tgs.guide_key(_inp({**D3, "time": "08:00"}))                   # retimed
    assert base != tgs.guide_key(_inp({**D3, "duration_minutes": 2}))             # resized
    assert base != tgs.guide_key(_inp(D3, profile={**PROFILE, "wake_time": "07:00"}))       # wake moved
    assert base != tgs.guide_key(_inp(D3, profile={**PROFILE, "meals": {"lunch": "13:00"}}))  # meals moved
    assert base != tgs.guide_key(_inp(D3, profile={**PROFILE, "workout_time": "18:00"}))     # workout added
    assert base != tgs.guide_key(_inp({**D3, "description": "Take it with lunch."}))       # plan text changed
    assert f"v{tgs._PAYLOAD_V}" in base and tgs._PAYLOAD_V >= 4


def test_unrelated_context_is_not_in_the_key():
    other = _task("sleepmax.wind_down", "Wind-down", "00:00", 10, tid="t2")
    assert tgs.guide_key(_inp(D3)) == tgs.guide_key(_inp(D3, day_tasks=[D3, other]))


def test_expired_or_old_version_entries_are_not_used(monkeypatch):
    fresh = {"_v": tgs._PAYLOAD_V, "generated_at": tgs.time.time()}
    assert tgs._cache_usable(fresh)
    assert not tgs._cache_usable({**fresh, "_v": 3})
    assert not tgs._cache_usable({**fresh, "generated_at": tgs.time.time() - tgs._GUIDE_TTL_S - 1})


# ── end to end through get_task_guide (fake DB, stubbed LLM) ────────────────

class _Row:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeDB:
    def __init__(self, days, maxx):
        self.days, self.maxx = days, maxx

    async def execute(self, stmt, params=None):
        return _Row((self.days, self.maxx))


@pytest.fixture
def harness(monkeypatch):
    store: dict[str, dict] = {}
    calls: list[str] = []
    state = {"profile": dict(PROFILE)}

    async def _get(k, db):
        return store.get(k)

    async def _set(k, p, db):
        store[k] = json.loads(json.dumps(p))

    async def _noop(*a, **k):
        return None

    async def _profile(uid, db):
        return state["profile"]

    async def _active(uid, db):
        return {}

    async def _items(uid, task, maxx, db):
        return []

    async def _llm(system, prompt):
        calls.append(prompt)
        return json.dumps({"overview": "Take it now.", "steps": [
            {"n": 1, "title": "Take it", "body": "Take the serving on your label with your 8am breakfast.",
             "tip": None}], "duration_minutes": 10, "why_it_matters": "It covers a common gap."})

    monkeypatch.setattr(tgs, "_cache_get", _get)
    monkeypatch.setattr(tgs, "_cache_set", _set)
    monkeypatch.setattr(tgs, "_ensure_table", _noop)
    monkeypatch.setattr(tgs, "release_conn", _noop)
    monkeypatch.setattr(tgs, "_load_profile", _profile)
    monkeypatch.setattr(tgs, "_active_days", _active)
    monkeypatch.setattr(tgs, "_task_items", _items)
    monkeypatch.setattr(tgs, "_call_llm", _llm)
    return store, calls, state


SID = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_hit_when_nothing_changed_miss_when_time_duration_or_anchors_change(harness):
    store, calls, state = harness
    task = dict(D3)
    db = _FakeDB(_days(task), "suppmax")
    g1 = await tgs.get_task_guide(SID, "t1", "u1", db)
    g2 = await tgs.get_task_guide(SID, "t1", "u1", db)
    assert len(calls) == 1 and g1["task_key"] == g2["task_key"]                    # hit
    assert g1["duration_minutes"] == 1                                            # scheduled beats the model's 10
    assert "8am" not in g1["steps"][0]["body"] and "lunch" in g1["steps"][0]["body"]

    task["time"] = "13:00"                                                        # retimed
    await tgs.get_task_guide(SID, "t1", "u1", db)
    assert len(calls) == 2
    task["duration_minutes"] = 2                                                  # resized
    await tgs.get_task_guide(SID, "t1", "u1", db)
    assert len(calls) == 3
    state["profile"] = {**PROFILE, "wake_time": "07:00"}                         # wake moved
    await tgs.get_task_guide(SID, "t1", "u1", db)
    assert len(calls) == 4
    await tgs.get_task_guide(SID, "t1", "u1", db)
    assert len(calls) == 4                                                        # and then cached again
    assert all(k.startswith("u:u1|") for k in store)


@pytest.mark.asyncio
async def test_rule_tasks_get_a_library_guide_without_an_llm_call(harness):
    store, calls, _ = harness
    rule = _task("sleepmax.caffeine_cutoff", "Caffeine cutoff", "16:15", 0,
                 "Switch to decaf, tea without caffeine, or water after this.")
    rule["kind"] = "rule"
    g = await tgs.get_task_guide(SID, "t1", "u1", _FakeDB(_days(rule), "sleepmax"))
    assert calls == [] and g["kind"] == "rule" and g["steps"] and not store


@pytest.mark.asyncio
async def test_invalidate_user_guides_deletes_only_that_users_rows():
    seen = {}

    class _DB:
        @asynccontextmanager
        async def _nested(self):
            yield

        def begin_nested(self):
            return self._nested()

        async def execute(self, stmt, params=None):
            seen.update(sql=str(stmt), params=params)

            class R:
                rowcount = 3
            return R()

    n = await tgs.invalidate_user_guides("abc-1", _DB())
    assert n == 3 and "DELETE FROM task_guides" in seen["sql"]
    assert seen["params"]["p"] == "u:abc-1|%"


# ── prompt ───────────────────────────────────────────────────────────────────

def test_prompt_has_time_minutes_library_and_their_day():
    p = tgs.build_prompt(_inp(MELA))
    assert "SCHEDULED TIME: 00:15 (12:15 am)" in p and "SCHEDULED MINUTES: 1" in p
    assert "dose note:" in p and "0.5–3 mg" in p and "avoid if:" in p and "Do not drive" in p
    assert "wake 10:00" in p and "lunch 12:30" in p
    assert "NO workout" in p
    e = tgs.build_prompt(_inp(ELEC, profile={**PROFILE, "workout_time": "18:00"}))
    assert "yes, at 18:00" in e


def test_system_rules():
    s = tgs._SYSTEM
    for phrase in ("Never write a clock time other than SCHEDULED TIME", "set an alarm", "buy, order, pick up",
                   "the night before", "not in THEIR DAY", "SCHEDULED MINUTES", "serving on your label",
                   "Check with your clinician if you take other medicines", "No claims", "ONE sentence"):
        assert phrase in s, phrase


# ── post-processing: the beta findings ──────────────────────────────────────

def _g(*steps, why="x.", overview="o."):
    return {"overview": overview, "why_it_matters": why, "duration_minutes": 10,
            "steps": [{"n": i + 1, "title": t, "body": b, "tip": tip} for i, (t, b, tip) in enumerate(steps)]}


def test_scheduled_duration_always_wins():
    out = tgs.postprocess(_g(("Go outside", "Spend the full 10 minutes outside.", None)), _inp(LIGHT))
    assert out["duration_minutes"] == 6
    assert "6 minutes" in out["steps"][0]["body"] and "10" not in out["steps"][0]["body"]
    out = tgs.postprocess(_g(("Go", "Walk for 5–15 min in daylight.", None)), _inp(LIGHT))
    assert "6 min" in out["steps"][0]["body"]
    assert tgs.minutes_ok([out["steps"][0]["body"]], 6)


def test_no_clock_time_but_the_scheduled_one_and_no_alarms():
    out = tgs.postprocess(_g(("Alarm", "Set your phone alarm for 7:00 AM.", None),
                             ("Go out", "Step outside at 10:05 am and look at the sky.", None),
                             ("Meal", "Walk until your 8am breakfast.", None)), _inp(LIGHT))
    text = " ".join(s["body"] for s in out["steps"])
    assert "alarm" not in text.lower() and "7:00" not in text and "8am" not in text
    assert "10:05" in text


def test_no_workout_or_meal_that_is_not_in_their_day():
    out = tgs.postprocess(_g(("Mix", "Right after your 7am workout, mix one sachet into water.", None),
                             ("Drink", "Drink it slowly.", None)), _inp(ELEC))
    text = " ".join(s["body"] for s in out["steps"]).lower()
    assert "workout" not in text and "7am" not in text
    d3 = tgs.postprocess(_g(("Take", "Take it with your 8am breakfast.", None)), _inp(D3))
    assert "with your lunch" in d3["steps"][0]["body"]


def test_no_shopping_or_night_before_steps_and_no_unsourced_tips():
    out = tgs.postprocess(_g(("Shop", "Buy decaf coffee beans.", None),
                             ("Tea", "Pick up herbal tea on the way home.", None),
                             ("Prep", "Lay out your mug the night before.", None),
                             ("Drink", "Drink the entire 500ml of water before you do anything else.",
                              "Cold water has maximum hydration impact.")), _inp(LIGHT))
    text = " ".join(f"{s['title']} {s['body']} {s['tip'] or ''}" for s in out["steps"]).lower()
    for bad in ("buy", "pick up", "night before", "500ml", "anything else", "maximum"):
        assert bad not in text, bad
    assert out["steps"] and out["steps"][0]["n"] == 1


def test_supplements_dose_only_from_the_library_plus_caution_and_clinician():
    out = tgs.postprocess(_g(("Take", "Take 0.5–3 mg now.", "Lower doses (0.5–1 mg) work as well."),
                             ("Rest", "Dim the lights.", None)), _inp(MELA))
    assert len(out["steps"]) == 1                                         # 1-minute habit: one step
    s = out["steps"][0]
    text = f"{s['body']} {s['tip']}"
    assert "0.5–1" not in text and "work as well" not in text
    assert "serving on your label" in text
    assert "drive" in s["tip"].lower() and "clinician" in s["tip"]
    assert out["safety"] and "clinician" in out["safety"][-1]


# ── products: gear vs consumables, strength ─────────────────────────────────

def _card(need, name, strength=None):
    return {"name": name, "brand": "B", "need_label": need, "url": "u", "image": "", "asin": "A",
            "price_usd": 1.0, "rating": 4.5, "need": need, "strength": strength}


def test_gear_is_separate_and_never_on_water_on_waking():
    g = tgs.postprocess(_g(("Drink", "Drink a glass of water now.", None)), _inp(WATER))
    tgs.attach_products(g, [("water_bottle", _card("water_bottle", "Bottle"))], "water_on_waking")
    assert g["gear"] == [] and g["ingredients"] == [] and g["steps"][0]["gear"] == []

    refill = _task("energymax.water_bottle_refill", "Refill your bottle", "13:00", 1)
    g = tgs.postprocess(_g(("Refill", "Refill your bottle at the tap.", None)), _inp(refill))
    tgs.attach_products(g, [("water_bottle", _card("water_bottle", "Bottle")),
                            ("electrolytes", _card("electrolytes", "LMNT"))], "water_bottle_refill")
    assert [x["need"] for x in g["gear"]] == ["water_bottle"]
    assert [x["need"] for x in g["ingredients"]] == ["electrolytes"]          # consumables only
    assert all(not x["gear"] for x in g["ingredients"])

    # gear the steps never use is not attached at all
    g = tgs.postprocess(_g(("Look", "Look at the sky.", None)), _inp(LIGHT))
    tgs.attach_products(g, [("light_therapy", _card("light_therapy", "Lamp"))], "morning_light")
    assert g["gear"] == [] and g["products"] == []


def test_product_cards_carry_need_and_strength_and_say_it_honestly():
    g = tgs.postprocess(_g(("Take", "Take the serving on your label.", None)), _inp(MELA))
    tgs.attach_products(g, [("melatonin", _card("melatonin", "Nature Made Melatonin 3mg", "3 mg"))], "melatonin")
    card = g["ingredients"][0]
    assert card["need"] == "melatonin" and card["strength"] == "3 mg"
    assert "this one is 3 mg" in card["strength_note"].lower()
    assert "lowest strength you can find" in card["strength_note"]
    assert card["strength_note"] in g["steps"][0]["body"]
    d3 = tgs.strength_note("vitamin_d3", "1,000 IU")
    assert d3 == "This one is 1,000 IU."
    assert "outside" in tgs.strength_note("vitamin_d3", "5,000 IU")


def test_strength_parsing():
    assert parse_strength("Nature Made Melatonin 3mg (120 Tablets)") == (3.0, "mg")
    assert parse_strength("NOW Vitamin D3 2,000 IU") == (2000.0, "iu")
    assert parse_strength("NOW Methyl B-12 1000 mcg (100 Lozenges)") == (1000.0, "mcg")
    assert parse_strength("Premier Protein 30g High Protein Shake") is None     # grams = not a serving strength
    by_id = {p.id: p for p in active_catalog()}
    assert by_id["nature-made-melatonin-3mg"].strength == "3 mg"
    assert by_id["nature-made-vitamin-d3-1000"].strength == "1,000 IU"
    rng = need_range("melatonin")
    assert (rng.lo, rng.hi, rng.unit) == (0.5, 3.0, "mg") and rng.contains(3, "mg")
    assert need_range("vitamin_d3").contains(1000, "iu")


def test_products_tab_cards_carry_need_and_strength():
    from api.products import _card as tab_card, options_for, task_products
    p = options_for({"need": "melatonin", "hints": set()}, None, {})[0]
    c = tab_card(p)
    assert c["need"] == "melatonin" and c["strength"] == "3 mg"
    supp = {"habits": [{"habit_id": "vitamin_d3", "title": "D3"}], "answers": {}}
    [(need, card)] = task_products([("suppmax", supp)], None, {}, "suppmax", "vitamin_d3", "vitamin d3 with lunch")
    assert need == card["need"] == "vitamin_d3" and card["strength"] == "1,000 IU"


def test_library_entry_reads_the_raw_fields():
    e = library_entry("suppmax", "melatonin")
    assert e["dose note"].startswith("Studied amounts") and "drive" in e["timing"]
    assert "pregnancy" in e["avoid if"]


def test_qa_script_checks_accept_a_clean_guide_and_flag_the_beta_findings():
    import sys
    sys.path.insert(0, "scripts")
    import qa_task_guides as qa
    g = tgs.postprocess(_g(("Take", "Take it with your lunch.", None)), _inp(MELA))
    tgs.attach_products(g, [("melatonin", _card("melatonin", "Nature Made Melatonin 3mg", "3 mg"))], "melatonin")
    assert qa.text_problems(g, MELA) == [] and qa.strength_problems(g) == []
    bad = {"overview": "", "why_it_matters": "", "duration_minutes": 10, "steps": [
        {"title": "Alarm", "body": "Set your phone alarm for 7:00 AM. Buy one bottle to start.", "tip": None,
         "ingredients": [{"need": "melatonin", "strength": "3 mg"}]},
        {"title": "Light", "body": "Spend the full 10 minutes outside. Take 0.5–1 mg.", "tip": None,
         "ingredients": [{"need": "melatonin", "strength": "3 mg"}]}]}
    probs = qa.text_problems(bad, LIGHT) + qa.strength_problems(bad)
    joined = " | ".join(probs)
    assert "clock time" in joined and "banned wording" in joined and "duration 10 != scheduled 6" in joined
    assert "minute counts" in joined and "outside the step's 0.5–1 mg" in joined


@pytest.mark.asyncio
async def test_prewarm_writes_the_keys_the_reader_reads(harness, monkeypatch):
    import db as dbmod
    store, calls, _ = harness
    task = dict(D3)
    fake = _FakeDB(_days(task), "suppmax")

    @asynccontextmanager
    async def _session():
        yield fake

    monkeypatch.setattr(dbmod, "AsyncSessionLocal", _session)
    await tgs.pregenerate_for_schedule(SID, "u1")
    assert len(calls) == 1 and len(store) == 1
    g = await tgs.get_task_guide(SID, "t1", "u1", fake)
    assert len(calls) == 1 and g["task_key"] in store                 # served from the pre-warmed row
