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
        assert len(doc.habits) >= (4 if mid == "skinhairmax" else 8), (mid, len(doc.habits))  # skin = whole AM/PM routines
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
    assert by[lib[0].id]["time"] == "07:00"            # fixed wake = wake
    # morning light belongs within an hour of waking, weekday and weekend
    assert by[lib[1].id]["time"] == "08:00"
    assert by[lib[1].id]["weekend_time"] == "09:00"    # weekend wake 08:00 (+1h shift)


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
    assert "does this feel like enough" in text
    assert choices == ap.AFTER_PLAN_CHOICES
    assert driver["ctx"][ap.INTAKE_KEY] is None


@pytest.mark.asyncio
async def test_non_program_starts_are_ignored(driver):
    assert await ap.chat_turn("u1", "start skinmax", _FakeDB(), start_maxx="skinmax", conversation_id="c1") is None


@pytest.mark.asyncio
async def test_prefetched_first_question_is_served_without_calling_claude(driver, monkeypatch):
    from datetime import datetime as _dt
    profile = ap.build_profile({"wake_time": "07:00", "sleep_time": "23:00"})
    pre = {"done": False, "ack": "", "question": "warm q?", "options": ["x", "y"], "multi": False, "fact_key": "kw"}
    driver["ctx"][ap.PREFETCH_KEY] = {"sleepmax": {"step": pre, "sig": ap._profile_sig(profile), "at": _dt.utcnow().timestamp()}}

    async def boom(*a, **k):
        raise AssertionError("Claude should not be called for a prefetched opener")
    monkeypatch.setattr(ap, "next_intake_step", boom)

    text, choices, _ = await ap.chat_turn("u1", "I want to start my Sleepmax plan.", _FakeDB(), start_maxx="sleepmax", conversation_id="c9")
    assert "warm q?" in text and choices == ["x", "y"]
    assert "sleepmax" not in driver["ctx"][ap.PREFETCH_KEY]          # one-shot
    assert driver["ctx"][ap.INTAKE_KEY]["asked"][0]["fact_key"] == "kw"


def test_stale_or_mismatched_prefetch_is_ignored():
    step = {"question": "q?", "options": []}
    ctx = {ap.PREFETCH_KEY: {"sleepmax": {"step": step, "sig": "abc", "at": 0}}}
    assert ap._cached_first_step(ctx, "sleepmax", "abc") is None      # expired
    from datetime import datetime as _dt
    ctx[ap.PREFETCH_KEY]["sleepmax"]["at"] = _dt.utcnow().timestamp()
    assert ap._cached_first_step(ctx, "sleepmax", "zzz") is None      # profile changed
    assert ap._cached_first_step(ctx, "sleepmax", "abc") == step


# ── fitting a plan into a real day (services/ai_fit.py) ──────────────────────
# Each test pins a bug the persona QA pass found (scripts/qa_personas.py).

import json

from services import ai_fit

ALL = list(ap.WEEKDAYS)
WKD = ALL[:5]


def _prof(wake="07:00", bed="23:00", *, minutes=30, work=None, meals=None, weekly=None, shift=False):
    return {"wake_time": wake, "bed_time": bed, "weekend_shift": shift, "weekly_timings": weekly or {},
            "minutes_per_day_total": minutes, "meals": meals or {},
            "obligations": [{"label": "Work", "start": work[0], "end": work[1], "days": "weekdays"}] if work else []}


def _h(hid, time, minutes=5, days=None, weekend_time=""):
    return {"habit_id": hid, "title": hid.replace("_", " "), "how": "", "why": "", "minutes": minutes,
            "time": time, "weekend_time": weekend_time, "days": list(days or ALL)}


def _m(hm):
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def _ids(t):
    return {h["habit_id"] for h in t["habits"]}


def _by(t):
    return {h["habit_id"]: h for h in t["habits"]}


SHIFT_WEEKEND = {"saturday": {"wake_time": "09:00", "sleep_time": "01:00"},
                 "sunday": {"wake_time": "09:00", "sleep_time": "01:00"}}


def test_profile_bedtime_is_sleep_time_not_the_wind_down_window():
    # onboarding stores the wind-down window in sleep_window; its start is not bedtime
    p = ap.build_profile({"wake_time": "06:30", "sleep_time": "21:00",
                          "sleep_window": ["20:15", "21:00"], "wind_down_window": ["20:15", "21:00"]})
    assert (p["wake_time"], p["bed_time"]) == ("06:30", "21:00")


def test_weekend_wake_habit_sits_at_weekend_wake_not_after_midnight():
    # p3: a same-every-day "06:00" on a 09:00-wake weekend was read as 30:00 and clamped to 00:59
    prof = _prof("06:00", "22:30", weekly=SHIFT_WEEKEND)
    t = ap.validate_template("sleepmax", _raw(_h("fixed_wake_time", "06:00", 0, weekend_time="06:00")), prof)
    h = t["habits"][0]
    assert (h["time"], h["weekend_time"]) == ("06:00", "09:00")


def test_a_time_before_weekend_wake_reads_as_morning():
    prof = _prof("06:00", "22:30", weekly=SHIFT_WEEKEND)
    t = ap.validate_template("calmmax", _raw(_h("box_breathing", "07:00", 3, days=["sat"], weekend_time="07:00")), prof)
    assert 9 * 60 <= _m(t["habits"][0]["time"]) <= 11 * 60


def test_wake_minute_is_left_for_the_wake_time_habit():
    # water on waking no longer takes the wake minute a later fixed-wake habit needs
    t = ap.validate_template("energymax", _raw(_h("water_on_waking", "07:00", 1)), _prof())
    assert t["habits"][0]["time"] == "07:05"


def test_meal_habit_sits_at_that_meal_even_inside_work():
    # p3: protein-at-first-meal landed at 06:35 while breakfast is 09:30 (eaten at work)
    prof = _prof("06:00", "22:30", work=("07:00", "15:00"),
                 meals={"breakfast": "09:30", "lunch": "12:00", "dinner": "19:00"})
    t = ap.validate_template("energymax", _raw(_h("protein_first_meal", "06:35", 5, days=WKD)), prof)
    assert t["habits"][0]["time"] == "09:30"


def test_no_task_starts_inside_another_task():
    # p2: a 1-minute phone-away sat inside the 25-minute deep-work block
    prof = _prof("09:30", "01:30", minutes=60, work=("11:00", "19:00"))
    days = ["mon", "wed", "fri"]
    t = ap.validate_template("focusmax", _raw(_h("deep_work_block", "11:15", 25, days=days),
                                              _h("phone_away", "11:20", 1, days=days)), prof)
    by = {k: _m(v["time"]) for k, v in _by(t).items()}
    assert not (by["deep_work_block"] <= by["phone_away"] < by["deep_work_block"] + 25)
    # across programs too
    other = {"trainmax": {"habits": [_h("strength_full_body", "18:00", 20, days=["mon"])]}}
    t = ap.validate_template("calmmax", _raw(_h("box_breathing", "18:05", 3, days=["mon"])), _prof(minutes=60),
                             others=other)
    assert not (18 * 60 <= _m(t["habits"][0]["time"]) < 18 * 60 + 20)


def test_fair_share_of_the_day_not_first_come():
    assert ai_fit.share_of_day(15, [15]) == 7.5            # the first program can't take it all
    assert ai_fit.share_of_day(15, [3]) == 12               # a light program leaves the rest
    assert ai_fit.share_of_day(60, [0, 0, 20]) == 40


def test_one_minute_reminders_cost_no_budget():
    assert ai_fit.cost({"minutes": 1}) == 0 and ai_fit.cost({"minutes": 2}) == 2


def test_budget_drops_the_one_habit_that_clears_it_before_daily_ones():
    # p4: keep daily breathing + brain dump rather than one 3x/week walk
    t = ap.validate_template("calmmax", _raw(_h("outdoor_walk", "17:30", 10, days=["mon", "wed", "fri"]),
                                             _h("box_breathing", "08:30", 3, days=WKD),
                                             _h("brain_dump", "20:15", 3)), _prof("06:30", "21:00", minutes=10))
    assert _ids(t) == {"box_breathing", "brain_dump"}


def test_budget_holds_on_every_day_across_the_stack():
    # p4: Mon/Wed/Fri reached 21 min on a 15 min/day budget (the old check was a weekly average)
    prof = _prof("06:30", "21:00", minutes=15, work=("09:00", "17:00"))
    calm = ap.validate_template("calmmax", _raw(_h("outdoor_walk", "17:30", 10, days=["mon", "wed", "fri"]),
                                                _h("box_breathing", "08:30", 2, days=WKD),
                                                _h("brain_dump", "20:15", 3)), prof)
    sleep = ap.validate_template("sleepmax", _raw(_h("fixed_wake_time", "06:30", 0), _h("morning_light", "06:35", 5),
                                                  _h("wind_down", "20:15", 10)), prof, others={"calmmax": calm})
    calm = ap.refit_template("calmmax", calm, prof, others={"sleepmax": sleep})      # the stack refit
    for d in ALL:
        assert ai_fit.day_load(calm["habits"], d) + ai_fit.day_load(sleep["habits"], d) <= 15, d


def test_library_minimum_is_never_shrunk_to_fit():
    # p1: no 2-minute deep-work block for a 5 min/day person; it is left out
    prof = _prof("05:30", "21:30", minutes=5, work=("07:30", "16:00"))
    t = ap.validate_template("focusmax", _raw(_h("top_three_plan", "07:30", 2, days=WKD),
                                              _h("deep_work_block", "08:00", 25, days=["mon", "wed", "fri"])), prof)
    assert _ids(t) == {"top_three_plan"}
    assert any("deep_work_block" in n for n in t["fit_notes"])


def test_doc_timing_rules():
    prof = _prof("07:00", "23:00", minutes=120)
    by = _by(ap.validate_template("sleepmax", _raw(_h("caffeine_cutoff", "20:00", 0), _h("wind_down", "22:55", 10),
                                                   _h("morning_light", "12:00", 10)), prof))
    assert _m(by["caffeine_cutoff"]["time"]) <= 23 * 60 - 360
    assert 22 * 60 <= _m(by["wind_down"]["time"]) <= 22 * 60 + 30
    assert 7 * 60 <= _m(by["morning_light"]["time"]) <= 8 * 60
    w = ap.validate_template("trainmax", _raw(_h("strength_full_body", "22:00", 20, days=["mon"])), prof)["habits"][0]
    assert _m(w["time"]) + 20 <= 23 * 60 - 120


def test_work_hours_hold_only_work_native_habits():
    prof = _prof(minutes=60, work=("09:00", "17:00"))
    t = ap.validate_template("focusmax", _raw(_h("deep_work_block", "09:30", 25, days=WKD)), prof)
    assert t["habits"][0]["time"] == "09:30"
    t = ap.validate_template("calmmax", _raw(_h("outdoor_walk", "10:00", 10, days=WKD)), prof)
    s = _m(t["habits"][0]["time"])
    assert s + 10 <= 9 * 60 or s >= 17 * 60


def test_default_plan_keeps_four_habits():
    ids = ["box_breathing", "brain_dump", "physiological_sigh", "connect_ping", "gratitude_note"]
    t = ap.validate_template("calmmax", _raw(*[_h(x, f"{8 + 2 * i:02d}:00", 3) for i, x in enumerate(ids)]),
                             _prof(minutes=120))
    assert len(t["habits"]) == 4


def test_duplicate_idea_is_parked_and_comes_back_when_the_other_program_stops():
    prof = _prof(minutes=60)
    sleep = {"habits": [_h("morning_light", "07:10", 5)]}
    t = ap.validate_template("energymax", _raw(_h("morning_light", "07:10", 5), _h("water_on_waking", "07:05", 1)),
                             prof, others={"sleepmax": sleep})
    assert "morning_light" not in _ids(t) and [p["habit_id"] for p in t["parked"]] == ["morning_light"]
    assert "morning_light" not in _ids(ap.refit_template("energymax", t, prof, others={"sleepmax": sleep}))
    back = ap.refit_template("energymax", t, prof, others={})
    assert "morning_light" in _ids(back) and not back.get("parked")


def test_hard_sessions_never_back_to_back_across_programs():
    other = {"longevitymax": {"habits": [_h("strength_2x", "18:00", 20, days=["tue", "fri"])]}}
    t = ap.validate_template("trainmax", _raw(_h("vigorous_intervals", "18:00", 10, days=["mon", "wed"])),
                             _prof(minutes=120), others=other)
    hard = sorted({ALL.index(d) for d in ["tue", "fri"]} | {ALL.index(d) for h in t["habits"] for d in h["days"]})
    gaps = [(b - a) % 7 for a, b in zip(hard, hard[1:] + hard[:1])]
    assert 1 not in gaps


def test_daily_task_cap_is_shared_fairly_and_nobody_is_starved():
    # stack-all-9: later programs came out with NO habits (first-come cap) and the
    # stack refit then emptied the person's first programs too
    prof = _prof("06:00", "23:00", minutes=120)
    five = lambda mid, ids: ap.validate_template(mid, _raw(*[_h(x, f"{8 + i:02d}:30", 1) for i, x in enumerate(ids)]),  # noqa: E731
                                                 prof, others={})
    a = five("sleepmax", ["fixed_wake_time", "caffeine_cutoff", "alcohol_buffer", "screens_off", "late_meal_buffer"])
    b = {"habits": [_h(f"x{i}", f"{12 + i:02d}:10", 1) for i in range(5)]}
    a["habits"] = a["habits"][:5]
    c = ap.validate_template("calmmax", _raw(_h("physiological_sigh", "07:30", 1), _h("box_breathing", "13:00", 3),
                                             _h("brain_dump", "21:00", 3)), prof, others={"sleepmax": a, "other": b})
    assert len(c["habits"]) == 3                        # its fair share (10/3) holds all three
    a2 = ap.refit_template("sleepmax", {**a, "habits": a["habits"]}, prof, others={"other": b, "calmmax": c})
    for d in ALL:
        n = sum(ai_fit.day_count(t, d) for t in (a2, b, c))
        assert n <= ai_fit.TASK_CAP + 1, (d, n)          # b is a stand-in that is never refit here
    assert a2["habits"]                                   # trimmed, never emptied
    # a program added to an already-full day still gets one slot
    full = {f"p{i}": {"habits": [_h(f"x{i}", f"{8 + i:02d}:00", 1)]} for i in range(ai_fit.TASK_CAP)}
    t = ap.validate_template("calmmax", _raw(_h("box_breathing", "20:00", 3)), prof, others=full)
    assert [h["habit_id"] for h in t["habits"]] == ["box_breathing"]


def test_a_program_squeezed_out_of_minutes_keeps_a_free_habit():
    # 15 min/day already used by the rest of the stack: Calmmax's 3-minute habits
    # can't fit, so it keeps a 1-minute core habit instead of going empty
    prof = _prof("06:30", "21:00", minutes=5)
    others = {"sleepmax": {"habits": [_h("wind_down", "20:00", 10)]}}
    t = ap.validate_template("calmmax", _raw(_h("brain_dump", "20:30", 3), _h("body_scan", "19:00", 10)),
                             prof, others=others)
    assert [h["habit_id"] for h in t["habits"]] == ["physiological_sigh"]
    assert t["habits"][0]["minutes"] == 1


def test_supplements_at_the_same_meal_share_one_slot():
    t = ap.validate_template("suppmax", _raw(_h("vitamin_d3", "07:35", 1), _h("omega3", "07:40", 1)),
                             _prof(minutes=30, meals={"breakfast": "07:30", "lunch": "12:30", "dinner": "19:00"}))
    times = {h["habit_id"]: h["time"] for h in t["habits"]}
    assert times["vitamin_d3"] == times["omega3"] == "07:30"
    days = ap.expand_template("suppmax", t, start_date=date(2026, 10, 12), n_days=1)
    assert len([x for x in days[0]["tasks"] if x["time"] == "07:30"]) == 1     # one visible task


def test_fit_is_idempotent_and_a_regen_matches_the_created_plan():
    prof = _prof("06:00", "22:30", minutes=25, work=("07:00", "15:00"), weekly=SHIFT_WEEKEND,
                 meals={"breakfast": "09:30", "lunch": "15:30", "dinner": "21:00"})
    others = {"sleepmax": ap.validate_template("sleepmax", _raw(
        _h("fixed_wake_time", "06:00", 0, weekend_time="06:00"), _h("caffeine_cutoff", "14:30", 0),
        _h("wind_down", "21:45", 10)), prof)}
    t1 = ap.validate_template("energymax", _raw(_h("water_on_waking", "06:00", 2), _h("protein_first_meal", "06:35", 5, WKD),
                                                _h("morning_light", "06:40", 5)), prof, others=others)
    t2 = ap.refit_template("energymax", t1, prof, others=others)
    key = lambda t: [(h["habit_id"], h["time"], h["weekend_time"], h["days"], h["minutes"]) for h in t["habits"]]  # noqa: E731
    assert key(t1) == key(t2)
    exp = lambda t: [(d["date"] if "date" in d else i, x["catalog_id"], x["time"])  # noqa: E731
                     for i, d in enumerate(ap.expand_template("energymax", t, start_date=date(2026, 10, 12), n_days=28))
                     for x in d["tasks"]]
    assert exp(t1) == exp(t2)


def test_refit_moves_wake_and_bed_habits_with_a_new_day():
    t = ap.validate_template("sleepmax", _raw(_h("morning_light", "07:20", 5), _h("wind_down", "22:15", 10),
                                              _h("caffeine_cutoff", "15:00", 0)), _prof(minutes=60))
    t2 = ap.refit_template("sleepmax", t, _prof("05:45", "22:30", minutes=60))
    by = _by(t2)
    assert by["morning_light"]["time"] == "06:05"          # still 20 min after waking
    assert by["wind_down"]["time"] == "21:45"              # still 45 min before bed
    assert by["caffeine_cutoff"]["time"] == "14:30"        # still 8 h before bed
    assert t2["fit_for"]["weekday"] == ["05:45", "22:30"]


def test_pending_intake_question_comes_back_on_its_own_thread():
    ctx = {ap.INTAKE_KEY: {"max": "sleepmax", "conv": "c1", "answers": {}, "asked": [
        {"question": "when do you usually wake up?", "fact_key": "wake", "options": ["6am", "7am"], "multi": False}]}}
    q = ap.pending_intake_question(ctx, "c1")
    assert (q["max"], q["text"], q["choices"], q["multi_choice"]) == ("sleepmax", "when do you usually wake up?",
                                                                       ["6am", "7am"], False)
    assert ap.pending_intake_question(ctx, "another-thread") is None


def _focus_5min():
    prof = _prof("05:30", "21:30", minutes=5, work=("07:30", "16:00"))
    t = ap.validate_template("focusmax", _raw(_h("top_three_plan", "07:30", 2, days=WKD),
                                              _h("deep_work_block", "08:00", 25, days=["mon", "wed", "fri"])), prof)
    t["summary"] = "a 25-minute deep-work block right at the start of work, plus your top 3."
    t["_draft"] = {"summary": t["summary"], "habits": [{"habit_id": "top_three_plan", "title": "Plan your top 3"},
                                                       {"habit_id": "deep_work_block", "title": "Deep-work block"}]}
    return t, prof


@pytest.mark.asyncio
async def test_summary_is_rewritten_when_the_fit_leaves_a_habit_out(monkeypatch):
    # p1/p2/p4/p6: the plan card promised habits the fit had dropped
    calls = []

    async def fake(system, user, tool, **k):
        calls.append(json.loads(user))
        return {"summary": "plan your top 3 when work starts. deep work can come later."}
    monkeypatch.setattr(ap, "_claude_tool", fake)
    t, prof = _focus_5min()
    out = await ap.sync_summary("focusmax", t, prof)
    assert out["summary"].startswith("plan your top 3") and "_draft" not in out
    assert calls[0]["left_out"] == ["Deep-work block"]
    assert [h["title"] for h in calls[0]["final_habits"]] == ["top three plan"]


@pytest.mark.asyncio
async def test_summary_falls_back_to_a_plain_truthful_one(monkeypatch):
    async def down(*a, **k):
        return None
    monkeypatch.setattr(ap, "_claude_tool", down)
    t, prof = _focus_5min()
    s = (await ap.sync_summary("focusmax", t, prof))["summary"]
    assert s.startswith("week 1 keeps it simple: top three plan.")
    assert "deep-work block can come in later" in s


@pytest.mark.asyncio
async def test_summary_untouched_when_nothing_was_left_out(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("no rewrite needed")
    monkeypatch.setattr(ap, "_claude_tool", boom)
    t = ap.validate_template("focusmax", _raw(_h("top_three_plan", "07:30", 2, days=WKD)), _prof())
    t["summary"] = "your top 3, every workday."
    t["_draft"] = {"summary": t["summary"], "habits": [{"habit_id": "top_three_plan", "title": "x"}]}
    assert (await ap.sync_summary("focusmax", t, _prof()))["summary"] == "your top 3, every workday."


def test_refit_rewrites_the_summary_when_the_stack_trims_the_plan():
    prof = _prof("06:30", "21:00", minutes=15)
    calm = ap.validate_template("calmmax", _raw(_h("outdoor_walk", "17:30", 10, days=["mon", "wed", "fri"]),
                                                _h("box_breathing", "08:30", 2, days=WKD),
                                                _h("brain_dump", "20:15", 3)), prof)
    calm["summary"] = "walks after work, box breathing and a brain dump."
    sleep = {"habits": [_h("wind_down", "20:15", 10)]}
    out = ap.refit_template("calmmax", calm, prof, others={"sleepmax": sleep})
    assert "outdoor_walk" not in _ids(out)
    assert out["summary"] != calm["summary"] and "outdoor walk can come in later" in out["summary"]


def test_stack_order_sorts_fresh_and_stored_rows_together():
    # a just-created row (naive utcnow) next to rows loaded from the DB (tz-aware)
    # crashed the stack refit after every second program start
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from services.schedule_runtime import created_order
    rows = [SimpleNamespace(created_at=datetime(2026, 10, 14, 12, 0)),
            SimpleNamespace(created_at=datetime(2026, 10, 14, 11, 0, tzinfo=timezone.utc)),
            SimpleNamespace(created_at=None)]
    assert [r.created_at for r in sorted(rows, key=created_order)] == [None, rows[1].created_at, rows[0].created_at]


def test_profile_spells_out_weekends_so_intake_never_asks():
    # sim: Claude asked "how much later do you wake on weekends?" right after onboarding said "same rhythm"
    base = {"wake_time": "06:30", "sleep_time": "21:00"}
    assert ap.build_profile({**base, "weekend_shift": False})["weekends"] == \
        "same wake and bed times on weekends as on weekdays"
    assert "an hour later" in ap.build_profile({**base, "weekend_shift": True})["weekends"]
    p = ap.build_profile({**base, "weekly_timings": {"saturday": {"wake_time": "09:00", "sleep_time": "01:00"}}})
    assert p["weekends"] == "wakes 09:00, bed 01:00 on weekends"


def test_week_one_cap_keeps_the_persons_priorities():
    # sim: "falling asleep" + a 9 pm bedtime lost its wind-down to the 3-habit cap because the cap
    # ignored Claude's order; it now cuts from the end of Claude's (most important first) list
    t = ap.validate_template("sleepmax", _raw(_h("wind_down", "20:15", 10), _h("fixed_wake_time", "06:30", 0),
                                              _h("caffeine_cutoff", "13:00", 0), _h("morning_light", "07:30", 5),
                                              _h("bedroom_setup", "20:00", 5)),
                             _prof("06:30", "21:00", minutes=30))
    assert _ids(t) == {"wind_down", "fixed_wake_time", "caffeine_cutoff", "morning_light"}


def test_a_minutes_only_refit_rewrites_the_stored_days():
    # p3: the stack refit trimmed bedroom setup 8 -> 5 min in the template, but the
    # change check only compared (catalog_id, time, status) so the rows kept 8
    from services.schedule_runtime import _days_differ
    day = lambda mins, how="x": [{"date": "2026-10-17", "tasks": [  # noqa: E731
        {"catalog_id": "sleepmax.bedroom_setup", "time": "10:00", "status": "pending",
         "duration_minutes": mins, "title": "Cool, dark room", "description": how, "why": ""}]}]
    assert _days_differ(day(8), day(5))
    assert _days_differ(day(5), day(5, "new wording"))
    assert not _days_differ(day(5), day(5))


def test_summary_rewrite_triggers_when_the_fit_moves_a_time_or_minutes():
    # p2: "move things later" reply said the top-3 plan moved to ~14:00; the fit kept it at work start
    t = ap.validate_template("focusmax", _raw(_h("top_three_plan", "14:00", 2, days=WKD)),
                             _prof("09:30", "01:30", minutes=60, work=("11:00", "19:00")))
    draft = {"summary": "s", "habits": [{"habit_id": "top_three_plan", "time": "14:00", "minutes": 2, "days": WKD}]}
    assert "11:00" <= t["habits"][0]["time"] <= "11:15" and not ap._draft_matches(draft, t)
    # p5: Claude wrote 15-minute strength sessions; the library floor kept them at 20
    t = ap.validate_template("trainmax", _raw(_h("strength_full_body", "19:00", 15, days=["mon", "thu"])),
                             _prof("06:30", "23:00", minutes=60))
    draft = {"habits": [{"habit_id": "strength_full_body", "time": "19:00", "minutes": 15, "days": ["mon", "thu"]}]}
    assert t["habits"][0]["minutes"] == 20 and not ap._draft_matches(draft, t)
    draft["habits"][0]["minutes"] = 20
    assert ap._draft_matches(draft, t)


def test_make_it_lighter_always_gets_lighter():
    old = ap.validate_template("trainmax", _raw(_h("strength_full_body", "19:00", 20, days=["mon", "thu"]),
                                                _h("mobility_flow", "07:00", 5, days=["tue", "fri", "sun"])),
                               _prof("06:30", "23:00", minutes=60))
    same = {**old, "habits": [dict(h) for h in old["habits"]]}
    assert not ap._is_lighter(same, old)
    lighter = ap._lighten("trainmax", same, old, _prof("06:30", "23:00", minutes=60), {})
    assert ap._is_lighter(lighter, old)
    assert [h["habit_id"] for h in lighter["habits"]] == ["strength_full_body"]



def test_priority_survives_storage_so_later_trims_cut_the_right_habit():
    # the stored template is time-sorted; without a stored priority a later refit
    # (stack change, "make it lighter") treated the latest habit as least important
    t = ap.validate_template("sleepmax", _raw(_h("wind_down", "20:15", 10), _h("fixed_wake_time", "06:30", 0),
                                              _h("caffeine_cutoff", "13:00", 0)), _prof("06:30", "21:00", minutes=30))
    assert [h["habit_id"] for h in t["habits"]] == ["fixed_wake_time", "caffeine_cutoff", "wind_down"]  # by time
    assert {h["habit_id"]: h["priority"] for h in t["habits"]} == {"wind_down": 0, "fixed_wake_time": 1,
                                                                    "caffeine_cutoff": 2}
    t2 = ap.refit_template("sleepmax", t, _prof("06:30", "21:00", minutes=30))
    assert {h["habit_id"]: h["priority"] for h in t2["habits"]} == {"wind_down": 0, "fixed_wake_time": 1,
                                                                     "caffeine_cutoff": 2}


def test_push_engine_reads_a_slept_in_weekend_like_the_plan_does():
    # weekend_shift moves a 23:30 bedtime to 00:30 in the plan; the push engine kept
    # 23:30, so a 00:05 Saturday wind-down would have fired the night before
    from services import notification_engine as ne
    from services.notification_signals import wake_sleep_for
    ob = {"wake_time": "07:30", "sleep_time": "23:30", "weekend_shift": True}
    assert wake_sleep_for(ob, "friday") == (450, 1410)
    wake, sleep = wake_sleep_for(ob, "saturday")
    assert (wake, sleep) == (510, 30)
    assert ne.task_ext_min(5, wake, sleep) == 1445              # 00:05 = Saturday night
    # a per-day override still wins
    ob["weekly_timings"] = {"saturday": {"wake_time": "09:00", "sleep_time": "01:00"}}
    assert wake_sleep_for(ob, "saturday") == (540, 60)


def test_clock_times_in_text_never_contradict_the_card():
    # sim: morning light at 7:30 (fit moved it to wake+60) but its steps said "alarm for 08:00"
    raw = _raw({**_h("morning_light", "08:00", 5), "how": "Set a phone or clock alarm for 08:00 so you don't miss "
                "your light window.", "title": "Morning light"},
               {**_h("caffeine_cutoff", "15:30", 0), "title": "Last coffee by 3:30pm",
                "how": "Make 3:30pm your last coffee."})
    t = ap.validate_template("sleepmax", raw, _prof("06:30", "21:00", minutes=30))
    by = _by(t)
    assert by["morning_light"]["time"] == "07:30"
    assert "08:00" not in by["morning_light"]["how"] and "the time on your plan" in by["morning_light"]["how"]
    assert by["caffeine_cutoff"]["title"] == "Last coffee"
    assert by["caffeine_cutoff"]["time"] <= "15:00" and "3:30" not in by["caffeine_cutoff"]["how"]
    # a time that matches the card stays
    t = ap.validate_template("sleepmax", _raw({**_h("morning_light", "07:30", 5), "how": "Go out at 7:30am."}),
                             _prof("06:30", "21:00", minutes=30))
    assert t["habits"][0]["how"] == "Go out at 7:30am."


def test_supplements_share_one_meal_and_caffeine_stays_before_the_cutoff():
    # p4 all-9: six separate supplement reminders, and caffeine + theanine at 21:40 (bed 22:30)
    prof = _prof("05:45", "22:30", minutes=15,
                 meals={"breakfast": "07:00", "lunch": "12:30", "dinner": "18:00"})
    t = ap.validate_template("suppmax", _raw(*[_h(x, "21:40", 1) for x in
                             ("caffeine_theanine", "vitamin_d3", "collagen_peptides", "creatine", "melatonin")]),
                             prof, keep_ids={"caffeine_theanine", "vitamin_d3", "collagen_peptides", "creatine",
                                             "melatonin"})
    by = {h["habit_id"]: h["time"] for h in t["habits"]}
    assert by["caffeine_theanine"] <= "16:30"                       # 6 h before a 22:30 bed
    assert by["caffeine_theanine"] == by["vitamin_d3"] == by["collagen_peptides"] == by["creatine"] == "07:00"
    assert "21:30" <= by["melatonin"] <= "22:15"                    # still pre-bed
    day = ap.expand_template("suppmax", t, start_date=date(2026, 10, 12), n_days=1)[0]
    assert len(day["tasks"]) == 2                                   # breakfast stack + melatonin


def test_fit_says_why_a_habit_stayed_where_it_is():
    # p3: "move protein at breakfast to 7:15pm" was answered "moved to dinner at 9:30 pm"
    t = ap.validate_template("energymax", _raw(_h("protein_first_meal", "19:15", 5, days=WKD)),
                             _prof("06:00", "22:30", work=("07:00", "15:00"),
                                   meals={"breakfast": "09:30", "lunch": "15:30", "dinner": "21:00"}))
    assert t["habits"][0]["time"] == "09:30"
    assert "kept protein_first_meal at 09:30: it goes with breakfast" in t["fit_notes"]


def test_plan_card_header_is_the_weekly_average_in_waking_order():
    # sim: "1 min a day" on a card with a 5-min habit 3x/week and 20-min strength 2x/week;
    # a night owl's 00:45 wind-down sorted first
    t = {"fit_for": {"weekday": ["09:30", "01:30"]}, "habits": [
        {"habit_id": "daily_steps", "title": "Daily step goal", "minutes": 1, "time": "10:00", "days": ALL},
        {"habit_id": "mobility_flow", "title": "5-minute mobility", "minutes": 5, "time": "09:40",
         "days": ["tue", "fri", "sun"]},
        {"habit_id": "strength_full_body", "title": "Strength", "minutes": 20, "time": "21:30", "days": ["mon", "thu"]},
        {"habit_id": "wind_down", "title": "Wind-down", "minutes": 10, "time": "00:45", "days": ALL}]}
    block = json.loads(ap.plan_block("trainmax", t).split("[VISUAL_BLOCK]")[1].split("[/VISUAL_BLOCK]")[0])
    assert block["data"]["total_minutes"] == round((7 + 15 + 40 + 70) / 7)
    assert [i["title"] for i in block["data"]["items"]] == ["5-minute mobility", "Daily step goal", "Strength",
                                                            "Wind-down"]
    # morning habits never take a work-break slot at the start of work (sim: mobility at 11:00, work 11-19)
    prof = _prof("09:30", "01:30", minutes=60, work=("11:00", "19:00"),
                 meals={"breakfast": "10:00", "lunch": "14:30", "dinner": "20:30"})
    prof["obligations"].append({"label": "Commute", "start": "10:00", "end": "11:00", "days": "weekdays"})
    m = ap.validate_template("trainmax", _raw(_h("mobility_flow", "11:00", 5, days=["tue", "fri"])), prof)
    assert m["habits"][0]["time"] < "10:00"


def test_intake_never_asks_what_onboarding_already_answered():
    # sim (twice): "how much later do you wake on weekends?" after onboarding answered it
    for q in ("how much later do you wake on weekends?", "What time do you go to bed?",
              "when do you usually eat lunch? meal times", "how long is your commute?"):
        assert ap.asks_known_fact(q), q
    for q in ("what's the biggest sleep thing you'd like to fix?", "when's your last caffeine on a typical day?",
              "what can you train with?", "any of these apply to you?"):
        assert not ap.asks_known_fact(q), q


@pytest.mark.asyncio
async def test_intake_known_fact_question_is_retried_then_dropped(monkeypatch):
    calls = []

    async def fake(system, user, tool, **k):
        calls.append(json.loads(user))
        return {"done": False, "ack": "", "question": "how much later do you wake on weekends?",
                "options": ["same", "1h"], "fact_key": "weekend"}
    monkeypatch.setattr(ap, "_claude_tool", fake)
    # (the six habit programs use fixed quizzes now; Claude still runs Peptidemax's intake)
    step = await ap.next_intake_step("peptidemax", {"wake_time": "07:00"}, {"a": "b"}, [{"question": "x"}])
    assert step["done"] is True and len(calls) == 2
    assert calls[1]["rejected_question"].startswith("how much later")


def test_multi_select_intake_always_has_a_none_answer():
    # sim (Suppmax safety question): no "none" chip, so a healthy person couldn't tap through
    opts = ap.tidy_options(["something else", "pregnant, trying, or breastfeeding", "kidney or liver condition",
                            "surgery in the next 2 weeks", "under 18"], multi=True)
    assert opts[0] == "none of these" and opts[-1] == "something else"
    assert opts[1] == "pregnant, trying, or breastfeeding"
    assert ap.tidy_options(["Heart condition", "None"], multi=True) == ["None", "Heart condition"]
    assert ap.tidy_options(["Falling asleep", "Waking at night"], multi=False) == ["Falling asleep", "Waking at night"]
    # a single-choice screening question needs a way to say no too
    assert ap.tidy_options(["Blood thinners", "Antidepressants"], multi=False,
                           question="do you take any of these regularly?")[0] == "none of these"


def test_daily_cap_holds_with_suppmax_rows_pinned():
    # flows4 all-9: 11 rows a day; Suppmax's synced picks (breakfast stack, post-workout,
    # pre-bed) can't be trimmed, so the other programs share what's left of the cap
    prof = _prof("07:00", "23:00", minutes=120)
    supp = {"habits": [{"habit_id": h, "minutes": 1, "time": tm, "days": ALL}
                       for h, tm in (("vitamin_d3", "08:00"), ("electrolytes", "19:00"), ("melatonin", "22:15"))]}
    five_others = {f"p{i}": {"habits": [_h(f"x{i}", f"{9 + i:02d}:00", 1)]} for i in range(5)}
    t = ap.validate_template("sleepmax", _raw(_h("fixed_wake_time", "07:00", 0), _h("morning_light", "07:20", 5),
                                              _h("wind_down", "22:15", 10)), prof,
                             others={"suppmax": supp, **five_others})
    for d in ALL:
        n = ai_fit.day_count(supp, d, supp=True) + sum(ai_fit.day_count(o, d) for o in five_others.values()) \
            + ai_fit.day_count(t, d)
        assert n <= ai_fit.TASK_CAP, (d, n)
    assert t["habits"]                          # still keeps at least one habit


def test_crowded_day_folds_flexible_supplements_into_existing_stacks():
    # flows5 all-9: every program at its 1-task floor + Suppmax on 4 rows = 12 a day
    prof = _prof("05:45", "21:00", minutes=15, meals={"breakfast": "07:00", "lunch": "12:30", "dinner": "18:00"})
    others = {f"p{i}": {"habits": [_h(f"x{i}", f"{8 + i:02d}:10", 1)]} for i in range(8)}
    picks = ["vitamin_d3", "collagen_peptides", "l_theanine", "melatonin", "electrolytes"]
    t = ap.validate_template("suppmax", _raw(*[_h(x, "14:00", 1) for x in picks]), prof,
                             others=others, keep_ids=set(picks))
    assert {h["habit_id"] for h in t["habits"]} == set(picks)          # nothing synced is dropped
    assert len({h["time"] for h in t["habits"]}) <= 2                  # breakfast stack + pre-bed


@pytest.mark.asyncio
async def test_swap_trades_one_habit_for_one():
    # flows5: "swap plan your top 3 for something else" added deep work, notification cleanup AND phone away
    prof = _prof("09:30", "01:30", minutes=60, work=("11:00", "19:00"))
    current = ap.validate_template("focusmax", _raw(_h("top_three_plan", "11:00", 2, days=WKD)), prof)
    claude = ap.validate_template("focusmax", _raw(_h("deep_work_block", "11:15", 25, days=["mon", "wed", "fri"]),
                                                   _h("notification_cleanup", "10:00", 5, days=["sat"]),
                                                   _h("phone_away", "11:10", 1, days=["mon", "wed", "fri"])), prof)
    out = ap._limit_swap("focusmax", claude, current, "swap plan your top 3 for something else", prof, {})
    assert [h["habit_id"] for h in out["habits"]] == ["deep_work_block"]
    assert ap._limit_swap("focusmax", claude, current, "make it harder", prof, {}) is claude


def test_supplement_stack_is_one_row_on_weekends_too_and_refits_in_place():
    # flows6 p2: weekday stack at 10:05, but Saturday split into 10:30 / 11:00 / 11:20 and
    # electrolytes' weekend time flipped on the first refit (drift)
    prof = _prof("09:30", "01:30", minutes=60, shift=True, work=("11:00", "19:00"),
                 meals={"breakfast": "10:00", "lunch": "14:30", "dinner": "20:30"})
    picks = ["collagen_peptides", "vitamin_d3", "creatine", "electrolytes", "melatonin"]
    raw = _raw(*[{**_h(x, "10:05", 1), "weekend_time": wt, "linked_to": ["x"]} for x, wt in
                 zip(picks, ["11:00", "11:20", "10:30", "11:00", "01:40"])])
    t1 = ap.validate_template("suppmax", raw, prof, keep_ids=set(picks))
    day = ap.expand_template("suppmax", t1, start_date=date(2026, 10, 17), n_days=1)[0]     # a Saturday
    assert len(day["tasks"]) <= 2
    t2 = ap.refit_template("suppmax", t1, prof)
    key = lambda t: [(h["habit_id"], h["time"], h["weekend_time"]) for h in t["habits"]]  # noqa: E731
    assert key(t1) == key(t2)


def test_weekday_only_pick_does_not_drag_the_weekend_stack_before_wake():
    # flows6 p2: a Tue/Thu-only pick's empty weekend_time read as 10:05, before the 10:30 weekend wake
    prof = _prof("09:30", "01:30", minutes=60, weekly={"saturday": {"wake_time": "10:30", "sleep_time": "02:30"},
                                                       "sunday": {"wake_time": "10:30", "sleep_time": "02:30"}},
                 meals={"breakfast": "10:00", "lunch": "14:30", "dinner": "20:30"})
    picks = [("vitamin_d3", ALL), ("collagen_peptides", ALL), ("caffeine_theanine", ["tue", "thu"])]
    t = ap.validate_template("suppmax", _raw(*[{**_h(x, "10:05", 1, days=d), "linked_to": ["x"]} for x, d in picks]),
                             prof, keep_ids={p for p, _ in picks})
    for h in t["habits"]:
        if set(h["days"]) & {"sat", "sun"}:
            assert (h["weekend_time"] or h["time"]) >= "10:30", h


def test_flexible_pick_joining_a_stack_takes_its_real_weekend_time():
    prof = _prof("09:30", "01:30", minutes=60, weekly={"saturday": {"wake_time": "10:30", "sleep_time": "02:30"},
                                                       "sunday": {"wake_time": "10:30", "sleep_time": "02:30"}},
                 meals={"breakfast": "10:00", "lunch": "14:30", "dinner": "20:30"})
    picks = [("vitamin_d3", ALL), ("caffeine_theanine", ["tue", "thu"]), ("electrolytes", ["tue", "sat"])]
    t = ap.validate_template("suppmax", _raw(*[{**_h(x, "10:05", 1, days=d), "linked_to": ["x"]} for x, d in picks]),
                             prof, keep_ids={p for p, _ in picks})
    by = _by(t)
    assert by["electrolytes"]["time"] == by["vitamin_d3"]["time"]
    assert (by["electrolytes"]["weekend_time"] or by["electrolytes"]["time"]) >= "10:30"


def test_push_engine_keeps_a_midnight_weekend_bedtime():
    # flows5 p2: weekly_timings Saturday bed "00:00" parsed to 0 and fell back to the weekday 23:00,
    # so the 23:15 wind-down looked like it was after bed
    from services.notification_signals import wake_sleep_for
    ob = {"wake_time": "07:00", "sleep_time": "23:00",
          "weekly_timings": {"saturday": {"wake_time": "08:00", "sleep_time": "00:00"}}}
    assert wake_sleep_for(ob, "saturday") == (480, 0)


def test_steps_never_tell_people_to_set_alarms_to_remember_a_habit():
    # owner: "the instructions have too much about setting alarms" (sim: morning light said
    # "Set a phone or clock alarm for 08:00 so you don't miss your light window")
    how = ("1) Set a phone or clock alarm for 08:00 so you don't miss your light window. 2) Step outside "
           "within an hour of waking. 3) Walk or have coffee in daylight for 5-15 min.")
    out = ap.drop_reminder_steps("morning_light", how)
    assert "alarm" not in out.lower()
    assert out == "1) Step outside within an hour of waking. 2) Walk or have coffee in daylight for 5-15 min."
    assert ap.drop_reminder_steps("caffeine_cutoff", "Set a reminder on your phone. Make this your last coffee.") == \
        "Make this your last coffee."
    nap = "1) Only nap if needed. 2) Set a 20-min alarm. 3) No naps within 7 hours of bed."
    assert ap.drop_reminder_steps("nap_rule", nap) == nap            # the alarm IS the tool here
    t = ap.validate_template("sleepmax", _raw({**_h("morning_light", "07:30", 5), "how": how}), _prof())
    assert "alarm" not in t["habits"][0]["how"].lower()
    for mid in ap.AI_PROGRAMS:                                       # library defaults are clean too
        for h in ap.get_program_doc(mid).habits:
            assert ap.drop_reminder_steps(h.id, h.how) == h.how, (mid, h.id)
