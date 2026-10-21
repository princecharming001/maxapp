"""The person's own tasks (services/custom_tasks.py): input is validated with
messages a person can read, templates expand to dated tasks on the right
weekdays at exactly the person's time, and the collision passes never move,
defer or hold one back."""
from datetime import date

import pytest

import services.custom_tasks as ct
from services.multi_module_collision import reconcile_schedules
from services.task_fields import normalize_days


def _ok(**kw):
    base = {"title": "Gym - push day", "time": "18:00", "minutes": 60, "days": ["mon", "wed", "fri"]}
    return ct.clean_task_input({**base, **kw})


def test_clean_input_normalizes():
    out = _ok(title="  Gym —  push   day ", time="6:05", days=["FRI", "monday", "wed", "wed"], note=" heavy ")
    assert out == {"title": "Gym - push day", "time": "06:05", "minutes": 60,
                   "days": ["mon", "wed", "fri"], "note": "heavy"}


@pytest.mark.parametrize("bad,msg", [
    ({"title": "   "}, "name"),
    ({"title": None}, "name"),
    ({"time": "25:00"}, "time"),
    ({"time": "18:60"}, "time"),
    ({"time": "6pm"}, "time"),
    ({"time": ""}, "time"),
    ({"minutes": 0}, "between"),
    ({"minutes": 481}, "between"),
    ({"minutes": "abc"}, "long"),
    ({"days": []}, "day"),
    ({"days": ["funday"]}, "day"),
    ({"days": "mon"}, "day"),
])
def test_clean_input_rejects_with_a_readable_message(bad, msg):
    with pytest.raises(ct.CustomTaskError) as e:
        _ok(**bad)
    assert msg in str(e.value).lower()


def test_long_text_is_capped_and_control_chars_dropped():
    out = _ok(title="x" * 200 + "\x07", note="n" * 1000)
    assert len(out["title"]) == ct.TITLE_MAX and len(out["note"]) == ct.NOTE_MAX
    assert "\x07" not in out["title"]


def test_emoji_and_non_biohacking_titles_are_the_persons_call():
    assert _ok(title="Journal \U0001F4D3")["title"] == "Journal \U0001F4D3"


def test_partial_edit_keeps_other_fields():
    base = _ok()
    out = ct.clean_task_input({"time": "07:30"}, partial=True, base=base)
    assert out["time"] == "07:30" and out["title"] == base["title"] and out["days"] == base["days"]


def _ctx(*tasks):
    return {ct.PLAN_KEY: {"version": 1, "tasks": list(tasks)}}


GYM = {"id": "gym1", "title": "Gym", "time": "18:00", "minutes": 60, "days": ["mon", "wed", "fri"], "note": "legs"}
RUN = {"id": "run1", "title": "Run", "time": "06:30", "minutes": 30, "days": list(ct.DAYS), "note": ""}


def test_expand_puts_tasks_on_their_weekdays_at_their_time():
    start = date(2026, 10, 19)  # a Monday
    days = ct.expand_custom(_ctx(GYM, RUN), start_date=start, n_days=14)
    assert len(days) == 14 and [d["date"] for d in days][:2] == ["2026-10-19", "2026-10-20"]
    for d in days:
        wd = date.fromisoformat(d["date"]).weekday()
        titles = [t["title"] for t in d["tasks"]]
        assert ("Gym" in titles) == (wd in (0, 2, 4))
        assert "Run" in titles
        assert [t["time"] for t in d["tasks"]] == sorted(t["time"] for t in d["tasks"])
    gym = next(t for t in days[0]["tasks"] if t["title"] == "Gym")
    assert gym["catalog_id"] == "custom.gym1" and gym["time"] == "18:00"
    assert gym["duration_minutes"] == 60 and gym["description"] == "legs"
    assert gym["user_requested"] is True and gym["kind"] == "action"
    ids = [t["task_id"] for d in days for t in d["tasks"]]
    assert len(ids) == len(set(ids))


def test_expand_with_no_tasks_still_returns_days():
    days = ct.expand_custom(_ctx(), start_date=date(2026, 10, 19), n_days=28)
    assert len(days) == 28 and all(d["tasks"] == [] for d in days)
    assert ct.expand_custom(None, start_date=date(2026, 10, 19), n_days=3)[0]["tasks"] == []


def test_reconcile_never_touches_custom_tasks():
    start = date(2026, 10, 19)
    mine = ct.expand_custom(_ctx(GYM, RUN), start_date=start, n_days=3)
    normalize_days(mine, "custom")
    # A program crowding the same minutes: the passes may move IT, never ours.
    prog = [{"day_index": i, "date": d["date"], "tasks": [
        {"task_id": f"p{i}{k}", "catalog_id": f"x.h{k}", "title": f"H{k}", "time": "18:00",
         "duration_minutes": 20, "status": "pending"} for k in range(9)]} for i, d in enumerate(mine)]
    other = [{"day_index": i, "date": d["date"], "tasks": [
        {"task_id": f"o{i}", "catalog_id": "y.h", "title": "Other", "time": "06:30",
         "duration_minutes": 10, "status": "pending"}]} for i, d in enumerate(mine)]
    before = [[(t["task_id"], t["time"]) for t in d["tasks"]] for d in mine]
    out = reconcile_schedules({"custom": mine, "x": prog, "y": other},
                              user_ctx={"wake_time": "06:00", "sleep_time": "23:00"}, start_date=start)
    assert [[(t["task_id"], t["time"]) for t in d["tasks"]] for d in out["custom"]] == before
    assert set(out) == {"custom", "x", "y"}


def test_reconcile_with_only_custom_is_identity():
    mine = ct.expand_custom(_ctx(GYM), start_date=date(2026, 10, 19), n_days=2)
    assert reconcile_schedules({"custom": mine})["custom"] is mine


class _Row:
    def __init__(self, ctx):
        self.schedule_context = ctx


def test_public_tasks_shows_pinned_time_and_hides_series_deleted():
    ctx = {**_ctx(GYM, RUN), "time_overrides": {"custom.gym1": "19:15"},
           "excluded_catalog_ids": ["custom.run1"]}
    out = ct.public_tasks(_Row(ctx))
    assert [t["id"] for t in out] == ["gym1"] and out[0]["time"] == "19:15"


def test_forget_overrides_clears_every_pin_for_one_task():
    ctx = {"time_overrides": {"custom.gym1": "19:00", "custom.run1": "07:00"},
           "excluded_catalog_ids": ["custom.gym1"],
           "instance_overrides": {"2026-10-20|custom.gym1": {"deleted": True},
                                  "2026-10-20|custom.run1": {"time": "07:10"}}}
    out = ct._forget_overrides(ctx, "custom.gym1")
    assert out["time_overrides"] == {"custom.run1": "07:00"}
    assert out["excluded_catalog_ids"] == []
    assert out["instance_overrides"] == {"2026-10-20|custom.run1": {"time": "07:10"}}


def test_template_id_from_catalog():
    assert ct.template_id_from_catalog("custom.ab12") == "ab12"
    assert ct.template_id_from_catalog("sleepmax.morning_light") is None
    assert ct.template_id_from_catalog(None) is None
    assert ct.is_custom("Custom") and not ct.is_custom("fitmax") and not ct.is_custom(None)


def _push_minutes(maxx: str, hhmm: str, wake="07:00", sleep="23:00"):
    from datetime import datetime, time, timedelta
    import services.notification_engine as ne
    m = lambda s: int(s[:2]) * 60 + int(s[3:])  # noqa: E731
    wake_min, sleep_min = m(wake), m(sleep)
    task = ne.EngineTask(key="k", title="Gym", at=ne.task_ext_min(m(hhmm), wake_min, sleep_min), status="pending",
                         maxx=maxx, schedule_id="s", task_id="t", task_uuid="u", duration_min=60)
    state, hits = {}, []
    day = date(2026, 10, 21)
    for minute in range(4 * 60, 24 * 60):
        now = datetime.combine(day, time()) + timedelta(minutes=minute)
        logical, now_ext = ne.logical_day(now, wake_min)
        inp = ne.EngineInput(now=now, logical_date=logical, now_ext=now_ext, wake_min=wake_min,
                             sleep_ext=ne.sleep_ext_min(wake_min, sleep_min), tasks=[task], state=state,
                             streak=ne.StreakView(), progress=ne.ProgressView(), week=ne.WeekView(),
                             hours_since_active=1.0, last_active_date=None, foreground_recent=False,
                             muted=frozenset(), name="a")
        for p in ne.decide(inp, ne.EngineConfig()):
            state = ne.record_push(state, p, logical.isoformat(), now)
            if p.lane == "task":
                hits.append(minute)
    return hits


def test_a_custom_task_before_the_usual_wake_window_still_reminds():
    assert _push_minutes("custom", "05:30") == [5 * 60 + 30]
    assert _push_minutes("custom", "23:50") == [23 * 60 + 50]
    # program tasks keep the old guard against stray times
    assert _push_minutes("sleepmax", "05:30") == []
