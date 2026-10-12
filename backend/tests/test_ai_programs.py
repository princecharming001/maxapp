"""AI programs (services/ai_programs.py): doc parsing, plan validation and
expansion, and the chat driver's intake → plan → redo flow (Claude stubbed)."""
from datetime import date

import pytest

import services.ai_programs as ap


PROFILE = {
    "wake_time": "07:00", "bed_time": "23:00", "weekend_shift": True, "weekly_timings": {},
    "minutes_per_day_total": 30,
}


def test_every_program_doc_parses_with_a_library():
    for mid in ap.AI_PROGRAMS:
        doc = ap.get_program_doc(mid)
        assert doc is not None, mid
        assert len(doc.habits) >= 8, (mid, len(doc.habits))
        ids = [h.id for h in doc.habits]
        assert len(ids) == len(set(ids)), f"duplicate habit ids in {mid}"
        assert all(h.title for h in doc.habits)


def test_goals_map_one_to_one_onto_programs():
    assert set(ap.GOAL_TO_PROGRAM) == {"sleep", "energy", "focus", "stress", "training", "skin_hair", "longevity"}
    assert ap.GOAL_TO_PROGRAM["training"] == "trainmax"
    assert ap.program_label("trainmax") == "Fitmax"
    assert ap.program_label("skinhairmax") == "Skin & Hair"
    assert not ap.is_ai_program("skinmax")


def _raw(*habits):
    return {"summary": "s", "habits": list(habits)}


def test_validate_drops_non_library_habits_but_keeps_custom():
    lib_id = ap.get_program_doc("sleepmax").habits[1].id
    t = ap.validate_template("sleepmax", _raw(
        {"habit_id": lib_id, "title": "x", "how": "", "why": "", "minutes": 5, "time": "08:00", "weekend_time": "", "days": ["mon"]},
        {"habit_id": "melatonin_5mg", "title": "pill", "how": "", "why": "", "minutes": 1, "time": "22:00", "weekend_time": "", "days": ["mon"]},
        {"habit_id": "custom_read_fiction", "title": "read", "how": "", "why": "", "minutes": 15, "time": "22:15", "weekend_time": "", "days": ["mon"]},
    ), PROFILE)
    ids = [h["habit_id"] for h in t["habits"]]
    assert lib_id in ids and "custom_read_fiction" in ids
    assert "melatonin_5mg" not in ids


def test_validate_clamps_times_into_the_waking_day_and_weekend_window():
    lib = ap.get_program_doc("sleepmax").habits
    t = ap.validate_template("sleepmax", _raw(
        {"habit_id": lib[0].id, "title": "a", "how": "", "why": "", "minutes": 10, "time": "05:00", "weekend_time": "", "days": ["mon"]},
        {"habit_id": lib[1].id, "title": "b", "how": "", "why": "", "minutes": 10, "time": "23:50", "weekend_time": "23:40", "days": ["mon", "sat"]},
    ), PROFILE)
    by = {h["habit_id"]: h for h in t["habits"]}
    assert by[lib[0].id]["time"] == "07:00"            # floored to wake
    assert by[lib[1].id]["time"] == "22:50"            # done by weekday bed
    assert by[lib[1].id]["weekend_time"] == "23:40"    # weekend bed is 00:00 (+1h shift)


def test_validate_spaces_out_same_minute_habits():
    lib = ap.get_program_doc("trainmax").habits
    t = ap.validate_template("trainmax", _raw(
        {"habit_id": lib[2].id, "title": "a", "how": "", "why": "", "minutes": 2, "time": "08:00", "weekend_time": "", "days": ["mon", "tue"]},
        {"habit_id": lib[3].id, "title": "b", "how": "", "why": "", "minutes": 2, "time": "08:00", "weekend_time": "", "days": ["tue"]},
    ), PROFILE)
    times = sorted(h["time"] for h in t["habits"])
    assert times == ["08:00", "08:05"]


def test_expand_respects_weekdays_and_weekend_times():
    tmpl = {"habits": [
        {"habit_id": "morning_light", "title": "light", "how": "go out", "why": "clock", "minutes": 5,
         "time": "07:10", "weekend_time": "08:10", "days": ["mon", "sat"]},
    ]}
    days = ap.expand_template("sleepmax", tmpl, start_date=date(2026, 10, 12), n_days=7)  # a Monday
    assert len(days) == 7
    assert [len(d["tasks"]) for d in days] == [1, 0, 0, 0, 0, 1, 0]
    mon, sat = days[0]["tasks"][0], days[5]["tasks"][0]
    assert mon["time"] == "07:10" and sat["time"] == "08:10"
    assert mon["catalog_id"] == "sleepmax.morning_light"
    assert mon["duration_minutes"] == 5 and mon["status"] == "pending" and mon["task_id"]


def test_change_request_detection():
    assert ap.looks_like_change_request("make it lighter")
    assert ap.looks_like_change_request("move things later")
    assert ap.looks_like_change_request("can you swap the journaling for a walk")
    assert not ap.looks_like_change_request("looks good")
    assert not ap.looks_like_change_request("thanks")


# ── chat driver flow (Claude + DB stubbed) ──────────────────────────────────

class _FakeDB:
    async def commit(self):
        pass


@pytest.fixture
def driver(monkeypatch):
    store: dict = {"ctx": {}, "built": [], "redo": []}

    async def get_context(uid, db):
        return dict(store["ctx"])

    async def merge_context(uid, upd, db):
        store["ctx"].update(upd)
        return store["ctx"]

    async def user_state(uid, db):
        return None, {}, {"wake_time": "07:00", "sleep_time": "23:00"}

    async def active_plan(uid, mid, db):
        return None

    steps = iter([
        {"done": False, "ack": "", "question": "q1?", "options": ["a", "b"], "multi": False, "fact_key": "k1"},
        {"done": False, "ack": "got it.", "question": "q2?", "options": ["c", "d"], "multi": True, "fact_key": "k2"},
        {"done": True, "ack": "nice.", "question": "", "options": [], "multi": False, "fact_key": ""},
    ])

    async def next_step(mid, profile, answers, asked):
        return next(steps)

    async def create(uid, mid, db, *, answers):
        store["built"].append((mid, dict(answers)))
        return {"schedule_id": "s1", "template": {"summary": "your plan.", "habits": [
            {"habit_id": "morning_light", "title": "Morning light", "minutes": 5, "time": "07:10", "days": ap.WEEKDAYS}]}}

    import services.user_context_service as ucs
    monkeypatch.setattr(ucs, "get_context", get_context)
    monkeypatch.setattr(ucs, "merge_context", merge_context)
    monkeypatch.setattr(ap, "_user_state", user_state)
    monkeypatch.setattr(ap, "active_ai_plan", active_plan)
    monkeypatch.setattr(ap, "next_intake_step", next_step)
    monkeypatch.setattr(ap, "create_program_schedule", create)
    return store


@pytest.mark.asyncio
async def test_intake_asks_claudes_questions_then_builds_the_plan(driver):
    db = _FakeDB()
    out = await ap.chat_turn("u1", "I want to start my Sleepmax plan.", db, start_maxx="sleepmax", conversation_id="c1")
    text, choices, multi = out
    assert "q1?" in text and choices == ["a", "b"] and multi is False
    assert driver["ctx"][ap.INTAKE_KEY]["conv"] == "c1"

    # A message in a DIFFERENT thread is ordinary chat.
    assert await ap.chat_turn("u1", "what's for dinner", db, start_maxx=None, conversation_id="other") is None

    text, choices, multi = await ap.chat_turn("u1", "a", db, start_maxx=None, conversation_id="c1")
    assert text.startswith("got it.") and "q2?" in text and multi is True

    text, choices, multi = await ap.chat_turn("u1", "c, d", db, start_maxx=None, conversation_id="c1")
    assert driver["built"] == [("sleepmax", {"k1": "a", "k2": "c, d"})]
    assert "anything you want to change" in text
    assert choices == ap.AFTER_PLAN_CHOICES
    assert driver["ctx"][ap.INTAKE_KEY] is None


@pytest.mark.asyncio
async def test_non_program_starts_are_ignored(driver):
    assert await ap.chat_turn("u1", "start skinmax", _FakeDB(), start_maxx="skinmax", conversation_id="c1") is None
