"""Lighter · Balanced · More on a program plan (services/ai_programs.py): the
level scales the program's habit cap and its share of the day, survives refits,
'more' always adds something, and the plan card's control taps route to a redo."""
import asyncio

import services.ai_programs as ap

PROF = {"wake_time": "07:00", "bed_time": "23:00", "weekend_shift": False, "weekly_timings": {},
        "minutes_per_day_total": 30, "meals": {}, "obligations": []}


def _lib_habits(mid, n):
    return [{"habit_id": h.id, "title": h.title, "minutes": h.minutes_default, "time": "", "days": ap.WEEKDAYS,
             "why": h.why, "how": h.how} for h in ap.get_program_doc(mid).habits[:n]]


def test_level_changes_how_many_habits_fit():
    raw = {"summary": "s", "habits": _lib_habits("energymax", 7)}
    light = ap.validate_template("energymax", {**raw, "level": "light"}, PROF)
    bal = ap.validate_template("energymax", raw, PROF)
    full = ap.validate_template("energymax", {**raw, "level": "full"}, PROF)
    n = lambda t: len([h for h in t["habits"] if h.get("kind") != "rule"])  # noqa: E731  rules are free
    assert n(light) <= 2 < n(full)
    assert n(light) <= n(bal) <= 4 <= n(full) <= 6
    assert full["level"] == "full" and "level" not in bal and ap.plan_level(light) == "light"


def test_level_survives_a_refit():
    t = ap.validate_template("energymax", {"summary": "s", "habits": _lib_habits("energymax", 7), "level": "full"}, PROF)
    again = ap.refit_template("energymax", t, PROF)
    assert again["level"] == "full" and len(again["habits"]) == len(t["habits"])


def test_more_always_adds_a_habit_when_claude_does_not():
    t = ap.validate_template("sleepmax", {"summary": "s", "habits": _lib_habits("sleepmax", 2)}, PROF)
    more = ap._harden("sleepmax", {**t, "level": "full"}, PROF, {})
    assert ap._is_heavier(more, t)


def test_control_texts_and_typed_requests_map_to_levels():
    assert ap.control_level("Give me more") == "full"
    assert ap.control_level("lighter, please") == "light"
    assert ap.control_level("this feels right") == "balanced"
    assert ap.control_level("make it lighter") is None              # typed → normal redo
    assert ap._implied_level("make it harder", "balanced") == "full"
    assert ap._implied_level("this is too much", "full") == "balanced"
    assert ap._implied_level("move it later", "light") == "light"


def test_plan_card_carries_the_level_without_promising_a_slider():
    # beta 1 (F28): "slide it lighter" was promised on every reply, slider or not;
    # the Lighter/Balanced/More control under the card is the affordance
    t = ap.validate_template("sleepmax", {"summary": "s", "habits": _lib_habits("sleepmax", 3), "level": "light"}, PROF)
    text = ap.plan_reply("sleepmax", t)
    assert '"level":"light"' in text and "slide it lighter" not in text


def test_a_control_tap_redoes_the_plan_at_that_level(monkeypatch):
    calls = {}

    class Sched:
        maxx_id = "sleepmax"
        schedule_context = {"ai_plan": {"habits": [], "summary": ""}, "thread_id": "c1"}

    async def fake_active(uid, mid, db):
        return Sched()

    async def fake_redo(uid, mid, request, db, *, level=None):
        calls["args"] = (mid, request, level)
        return {"habits": [], "summary": "lighter now", "level": level}

    class Res:
        def scalars(self):
            return self

        def all(self):
            return [Sched()]

    class DB:
        async def execute(self, *_a, **_k):
            return Res()

    async def fake_ctx(uid, db):
        return {}

    monkeypatch.setattr(ap, "active_ai_plan", fake_active)
    monkeypatch.setattr(ap, "redo_program_plan", fake_redo)
    monkeypatch.setattr("services.user_context_service.get_context", fake_ctx)
    out = asyncio.run(ap.chat_turn("00000000-0000-0000-0000-000000000001", "lighter, please", DB(), start_maxx=None, conversation_id="c1"))
    assert calls["args"] == ("sleepmax", ap.LEVEL_REQUEST["light"], "light")
    # the reply tells what actually changed (here: nothing, the fake plan is empty),
    # never the model's own summary of the request (beta 1, F23)
    assert "lighter now" not in out[0] and "nothing in your plan changed" in out[0]
    assert '"level":"light"' in out[0]
    same = asyncio.run(ap.chat_turn("00000000-0000-0000-0000-000000000001", "this feels right", DB(), start_maxx=None, conversation_id="c1"))
    assert "keeping it as it is" in same[0]


def test_more_never_takes_days_away(monkeypatch):
    cur = ap.validate_template("sleepmax", {"summary": "s", "habits": _lib_habits("sleepmax", 3)}, PROF)

    class Sched:
        schedule_context = {"ai_plan": cur, "thread_id": "c1"}

    async def fake_active(*_a):
        return Sched()

    async def fake_state(*_a):
        return None, {}, {}

    async def fake_others(*_a, **_k):
        return {}

    async def fake_build(mid, profile, answers, others, **kw):
        hs = [dict(h, days=["mon", "thu"]) for h in cur["habits"]]        # Claude "trims"
        return ap.validate_template(mid, {"summary": "x", "habits": hs, "level": kw.get("level")}, PROF)

    async def fake_sync(mid, tmpl, profile):
        return tmpl

    async def fake_regen(**_k):
        return None

    class DB:
        async def flush(self):
            pass

        async def commit(self):
            pass

    monkeypatch.setattr(ap, "active_ai_plan", fake_active)
    monkeypatch.setattr(ap, "_user_state", fake_state)
    monkeypatch.setattr(ap, "build_profile", lambda st: PROF)
    monkeypatch.setattr(ap, "other_program_plans", fake_others)
    monkeypatch.setattr(ap, "build_plan", fake_build)
    monkeypatch.setattr(ap, "sync_summary", fake_sync)
    monkeypatch.setattr("services.schedule_runtime.regenerate_active_schedules", fake_regen)
    monkeypatch.setattr("sqlalchemy.orm.attributes.flag_modified", lambda *a: None)
    out = asyncio.run(ap.redo_program_plan("u", "sleepmax", "give me more", DB(), level="full"))
    before = {h["habit_id"]: set(h["days"]) for h in cur["habits"]}
    after = {h["habit_id"]: set(h["days"]) for h in out["habits"]}
    assert all(before[k] <= after.get(k, set()) for k in before) and out["level"] == "full"
