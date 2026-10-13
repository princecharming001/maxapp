"""Suppmax sync (services/ai_programs.py): synced picks follow the user's other
programs, kept picks stay, declined/contraindicated ones are never forced, and
Peptidemax never syncs. Uses a small stand-in supplement library."""
import pytest

import services.ai_programs as ap

DOC = """# Suppmax
## Habit library
### `melatonin` — Low-dose melatonin
- minutes: 1 / 1
- anchor: bed
- programs: sleepmax
- primary for: sleepmax
- avoid if: pregnancy, blood thinners
- timing: 30-60 min before bed
### `magnesium` — Magnesium glycinate
- minutes: 1 / 1
- anchor: dinner
- programs: sleepmax, calmmax
- primary for: calmmax
- avoid if: kidney disease
- timing: with dinner
### `creatine` — Creatine monohydrate
- minutes: 1 / 1
- anchor: breakfast
- programs: trainmax
- primary for: trainmax
- avoid if: kidney disease, under 18
- timing: any meal
### `vitamin_d` — Vitamin D3
- minutes: 1 / 1
- anchor: breakfast
- programs: none
- primary for: none
- avoid if: none
- timing: with a meal containing fat
## Safety and claims
"""

PROFILE = {"wake_time": "07:00", "bed_time": "23:00", "weekend_shift": False, "weekly_timings": {},
           "meals": {"breakfast": "07:30", "dinner": "19:00"}, "minutes_per_day_total": 30}


@pytest.fixture(autouse=True)
def supp_doc(monkeypatch):
    doc = ap.parse_program_doc("suppmax", DOC)
    real = ap.get_program_doc
    monkeypatch.setattr(ap, "get_program_doc", lambda mid: doc if mid == "suppmax" else real(mid))
    return doc


def test_link_fields_parse(supp_doc):
    mel = supp_doc.habit("melatonin")
    assert mel.programs == ["sleepmax"] and mel.primary_for == "sleepmax"
    assert mel.avoid == ["pregnancy", "blood thinners"]
    assert supp_doc.habit("vitamin_d").programs == [] and supp_doc.habit("vitamin_d").primary_for == ""


def test_required_follows_active_programs():
    ids = [h.id for h in ap.required_supplements({"sleepmax", "trainmax"}, {}, set(), set())]
    assert ids == ["melatonin", "creatine"]
    # Peptidemax never pulls anything in.
    assert ap.required_supplements({"peptidemax"}, {}, set(), set()) == []


def test_required_skips_declined_contraindicated_and_covered():
    assert ap.required_supplements({"sleepmax"}, {}, {"melatonin"}, set()) == []
    assert ap.required_supplements({"sleepmax"}, {"safety": "pregnant or breastfeeding"}, set(), set()) == []
    assert ap.required_supplements({"sleepmax"}, {"safety": "no"}, set(), set())[0].id == "melatonin"
    # Magnesium already covers sleep, so melatonin isn't forced in on top.
    assert ap.required_supplements({"sleepmax"}, {}, set(), {"magnesium"}) == []


def test_finalize_inserts_missing_and_tags_links():
    tmpl = {"summary": "s", "habits": [
        {"habit_id": "vitamin_d", "title": "Vitamin D3", "how": "", "why": "", "minutes": 1,
         "time": "07:30", "weekend_time": "", "days": ap.WEEKDAYS}]}
    out = ap._finalize_supp(tmpl, PROFILE, {}, {"sleepmax"})
    by = {h["habit_id"]: h for h in out["habits"]}
    assert set(by) == {"vitamin_d", "melatonin"}
    assert by["melatonin"]["linked_to"] == ["sleepmax"] and by["melatonin"]["keep"] is False
    assert by["melatonin"]["time"] == "22:15"            # bed - 45 min
    assert by["vitamin_d"]["linked_to"] == [] and by["vitamin_d"]["keep"] is True


class _Sched:
    def __init__(self, ctx):
        self.schedule_context = ctx


class _DB:
    async def flush(self):
        pass

    async def commit(self):
        pass


@pytest.fixture
def world(monkeypatch):
    state = {"active": {"suppmax", "trainmax"}, "regen": 0}
    plan = {"summary": "your stack.", "answers": {}, "declined": [], "habits": [
        {"habit_id": "melatonin", "title": "Low-dose melatonin", "how": "", "why": "", "minutes": 1,
         "time": "22:15", "weekend_time": "", "days": ap.WEEKDAYS, "linked_to": ["sleepmax"], "keep": False},
        {"habit_id": "magnesium", "title": "Magnesium glycinate", "how": "", "why": "", "minutes": 1,
         "time": "19:00", "weekend_time": "", "days": ap.WEEKDAYS, "linked_to": ["sleepmax"], "keep": True},
    ]}
    sched = _Sched({"ai_plan": plan})

    async def active_plan(uid, mid, db):
        return sched if mid == "suppmax" else None

    async def active_ids(uid, db):
        return set(state["active"])

    async def user_state(uid, db):
        return None, {}, {"wake_time": "07:00", "sleep_time": "23:00"}

    async def others(uid, db, except_maxx):
        return {}

    async def no_claude(*a, **k):
        return None

    async def regen(**k):
        state["regen"] += 1

    import sqlalchemy.orm.attributes as attrs
    import services.schedule_runtime as rt
    monkeypatch.setattr(attrs, "flag_modified", lambda *a, **k: None)
    monkeypatch.setattr(rt, "regenerate_active_schedules", regen)
    monkeypatch.setattr(ap, "active_ai_plan", active_plan)
    monkeypatch.setattr(ap, "_active_program_ids", active_ids)
    monkeypatch.setattr(ap, "_user_state", user_state)
    monkeypatch.setattr(ap, "other_program_plans", others)
    monkeypatch.setattr(ap, "build_plan", no_claude)
    state["sched"] = sched
    return state


@pytest.mark.asyncio
async def test_sync_removes_unlinked_keeps_chosen_and_adds_new(world):
    # Sleepmax was removed, Fitmax is running.
    out = await ap.sync_supplements("u1", _DB())
    assert out == {"added": ["Creatine monohydrate"], "removed": ["Low-dose melatonin"]}
    habits = {h["habit_id"]: h for h in world["sched"].schedule_context["ai_plan"]["habits"]}
    assert set(habits) == {"magnesium", "creatine"}
    assert habits["magnesium"]["keep"] is True           # the user's own pick stays
    assert habits["creatine"]["linked_to"] == ["trainmax"] and habits["creatine"]["keep"] is False
    assert world["regen"] == 1
    # Nothing left to change: a second sync is a no-op.
    assert await ap.sync_supplements("u1", _DB()) is None


@pytest.mark.asyncio
async def test_sync_never_readds_a_declined_pick(world):
    world["active"] = {"suppmax", "sleepmax"}
    plan = world["sched"].schedule_context["ai_plan"]
    plan["habits"] = [h for h in plan["habits"] if h["habit_id"] != "melatonin"]
    plan["habits"][0]["keep"] = False
    plan["declined"] = ["melatonin"]
    # magnesium covers sleepmax anyway; with it gone too, melatonin is still not forced back.
    plan["habits"] = []
    out = await ap.sync_supplements("u1", _DB())
    assert out is None or "Low-dose melatonin" not in out["added"]
