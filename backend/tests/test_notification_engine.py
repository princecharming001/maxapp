"""Push engine v3 — minute-by-minute day simulations through the real decide().

Each simulation walks a user's day one minute at a time, feeding every push the
engine emits back into its ledger exactly as the scheduler does, then asserts
on the resulting push timeline.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pytest

from services import notification_engine as ne
from services.notification_copy import (
    CAT_COMEBACK,
    CAT_EVENING_RECAP,
    CAT_JOURNEY,
    CAT_MISSED,
    CAT_MORNING_PREVIEW,
    CAT_PROGRESS_PHOTO,
    CAT_REENGAGE,
    CAT_SCAN_READY,
    CAT_STREAK,
    CAT_STREAK_FREEZE,
    CAT_STREAK_LAST_CALL,
    CAT_STREAK_MILESTONE,
    CAT_TASK_DUE,
    CAT_WEEKLY,
    validate_all_templates,
)

WED = date(2026, 9, 23)   # a Wednesday
SUN = date(2026, 9, 27)
THU = date(2026, 9, 24)   # not a tip day


def _m(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _clock(minute: int) -> str:
    return f"{(minute // 60) % 24:02d}:{minute % 60:02d}"


# The owner's real Thursday: 8 tasks across 3 programs, wake 05:00, sleep 23:00.
OWNER_DAY = [
    ("05:05", "mew 60s hold", 2),
    ("05:22", "morning skincare", 7),
    ("06:03", "get 10 min of morning sun", 10),
    ("06:30", "skip seed oils + sugar today", 1),
    ("21:00", "face pulls 3x12", 5),
    ("21:30", "evening skincare", 5),
    ("21:50", "PM face massage", 6),
    ("22:28", "start winding down", 1),
]


def _tasks(spec, wake_min, sleep_min, done=None, now_min=None):
    done = done or {}
    out = []
    for i, (hhmm, title, dur) in enumerate(spec):
        key = f"t{i}"
        status = "pending"
        if key in done and now_min is not None and now_min >= done[key][0]:
            status = done[key][1]
        out.append(ne.EngineTask(
            key=key, title=title, at=ne.task_ext_min(_m(hhmm), wake_min, sleep_min),
            status=status, maxx="skinmax", schedule_id="sched-1", task_id=f"id-{i}",
            task_uuid=f"uuid-{i}", duration_min=dur,
        ))
    return out


def _input(day, minute, spec, *, wake="07:00", sleep="23:00", state=None, done=None,
           streak=None, progress=None, week=None, hours_since_active=1.0,
           last_active_date=None, muted=(), fg=False):
    wake_min, sleep_min = _m(wake), _m(sleep)
    now = datetime.combine(day, time()) + timedelta(minutes=minute)
    logical, now_ext = ne.logical_day(now, wake_min)
    return ne.EngineInput(
        now=now, logical_date=logical, now_ext=now_ext, wake_min=wake_min,
        sleep_ext=ne.sleep_ext_min(wake_min, sleep_min),
        tasks=_tasks(spec, wake_min, sleep_min, done=done, now_min=now_ext),
        state=state if state is not None else {},
        streak=streak or ne.StreakView(), progress=progress or ne.ProgressView(),
        week=week or ne.WeekView(), hours_since_active=hours_since_active,
        last_active_date=last_active_date, foreground_recent=fg, muted=frozenset(muted),
        name="anish",
    )


def simulate(day, spec, *, start="04:00", minutes=20 * 60, cfg=None, **kw):
    """Walk `minutes` minutes from `start` on `day`; return [(clock, push)] and state."""
    cfg = cfg or ne.EngineConfig()
    state: dict = kw.pop("state", {}) or {}
    out = []
    for off in range(minutes):
        minute = _m(start) + off
        cur_day = day + timedelta(days=minute // 1440)
        inp = _input(cur_day, minute % 1440, spec, state=state, **kw)
        for p in ne.decide(inp, cfg):
            state = ne.record_push(state, p, inp.logical_date.isoformat(), inp.now)
            out.append((_clock(minute), p))
    return out, state


def test_templates_still_self_validate():
    assert validate_all_templates() == []


# --- task lane -------------------------------------------------------------

def test_every_task_gets_its_own_push_at_its_own_minute():
    sent, _ = simulate(THU, OWNER_DAY, wake="05:00", sleep="23:00")
    task_pushes = [(c, p) for c, p in sent if p.lane == "task"]
    assert [c for c, _ in task_pushes] == [t for t, _, _ in OWNER_DAY]
    # every push names its task and deep-links to that task's guide
    for (clock, p), (_, title, _) in zip(task_pushes, OWNER_DAY):
        assert title.lower() in (p.title + " " + p.body).lower()
        assert p.route == "TaskGuide"
        assert p.params["schedule_id"] == "sched-1" and p.params["task_id"].startswith("id-")
        assert p.apns_category == "TASK_REMINDER"
    # v2 sent 3 pushes for this exact day; v3 sends one per task
    assert len(task_pushes) == 8


def test_tasks_within_three_minutes_share_one_push():
    spec = [("09:00", "mew 60s hold", 2), ("09:02", "morning skincare", 7), ("09:30", "sun", 10)]
    sent, _ = simulate(WED, spec)
    tasks = [(c, p) for c, p in sent if p.lane == "task"]
    assert [c for c, _ in tasks] == ["09:00", "09:30"]
    first = tasks[0][1]
    assert set(first.task_keys) == {"t0", "t1"}
    assert "mew 60s hold" in first.body and "morning skincare" in first.body
    assert first.route == "Home" and first.apns_category is None


def test_completed_or_skipped_tasks_are_never_pushed():
    spec = [("09:00", "a", 5), ("10:00", "b", 5), ("11:00", "c", 5)]
    sent, _ = simulate(WED, spec, done={"t0": (_m("08:50"), "completed"), "t1": (0, "skipped")})
    assert [c for c, p in sent if p.lane == "task"] == ["11:00"]


def test_task_push_goes_late_at_most_the_grace_window():
    # the scheduler was down 10:00-10:20: the 10:00 task is not pushed at 10:20
    spec = [("10:00", "a", 5)]
    inp = _input(WED, _m("10:14"), spec)
    assert [p.lane for p in ne.decide(inp)] == ["task"]
    inp = _input(WED, _m("10:16"), spec)
    assert [p.lane for p in ne.decide(inp) if p.lane == "task"] == []


def test_task_pushes_ignore_foreground_but_ambient_waits():
    spec = [("09:00", "a", 5), ("13:00", "b", 5)]
    inp = _input(WED, _m("09:00"), spec, fg=True)
    assert [p.lane for p in ne.decide(inp)] == ["task"]
    # a follow-up would be due at 10:00 for task a, but the user is in the app
    st = ne.record_push({}, ne.decide(_input(WED, _m("09:00"), spec))[0], "2026-09-23",
                        datetime(2026, 9, 23, 9, 0))
    inp = _input(WED, _m("10:30"), spec, state=st, fg=True)
    assert ne.decide(inp) == []
    inp = _input(WED, _m("10:30"), spec, state=st, fg=False)
    assert [p.category for p in ne.decide(inp)] == [CAT_MISSED]


def test_task_lane_pauses_for_a_lapsed_user():
    spec = [("09:00", "a", 5)]
    inp = _input(WED, _m("09:00"), spec, hours_since_active=49.0,
                 last_active_date=WED - timedelta(days=2))
    assert [p.lane for p in ne.decide(inp)] == []


def test_night_owl_task_after_midnight_is_pushed_on_time():
    spec = [("23:30", "face massage 30s", 1), ("01:07", "wind down", 1)]
    sent, _ = simulate(WED, spec, wake="09:00", sleep="02:00", start="22:00", minutes=5 * 60)
    tasks = [(c, p) for c, p in sent if p.lane == "task"]
    assert [c for c, _ in tasks] == ["23:30", "01:07"]


def test_implausible_times_are_skipped():
    # a garbage 03:00 task for a 07:00-23:00 user
    spec = [("03:00", "stray", 5), ("09:00", "real", 5)]
    sent, _ = simulate(WED, spec, start="00:00", minutes=24 * 60 - 1)
    assert [c for c, p in sent if p.lane == "task"] == ["09:00"]


# --- ambient lane ----------------------------------------------------------

def _ambient(sent):
    return [(c, p) for c, p in sent if p.lane == "ambient"]


def test_ambient_never_crowds_a_task_push_and_respects_window_gap_and_cap():
    sent, _ = simulate(THU, OWNER_DAY, wake="05:00", sleep="23:00")
    amb = _ambient(sent)
    task_minutes = [_m(c) for c, p in sent if p.lane == "task"]
    amb_minutes = [_m(c) for c, _ in amb]
    assert len(amb) <= ne.EngineConfig().ambient_daily_cap
    for a in amb_minutes:
        assert _m("05:00") <= a <= _m("22:45")
        assert all(abs(a - t) >= 15 for t in task_minutes), (a, task_minutes)
    for x, y in zip(amb_minutes, amb_minutes[1:]):
        assert y - x >= ne.EngineConfig().ambient_min_gap_min


def test_missed_follow_up_names_overdue_tasks_twice_a_day_at_most():
    sent, _ = simulate(THU, OWNER_DAY, wake="05:00", sleep="23:00")
    fus = [(c, p) for c, p in _ambient(sent) if p.category == CAT_MISSED]
    assert 1 <= len(fus) <= 2
    first_clock, first = fus[0]
    # the morning cluster is still open → the first follow-up names it
    assert "mew 60s hold" in first.body or "morning skincare" in first.body
    assert _m(first_clock) >= _m("05:50")
    if len(fus) == 2:
        assert _m(fus[1][0]) - _m(first_clock) >= 150
        assert not set(fus[0][1].task_keys) & set(fus[1][1].task_keys)  # never the same task twice


def test_no_nagging_once_the_day_already_counts():
    spec = [("09:00", "a", 5), ("12:00", "b", 5)]
    sent, _ = simulate(WED, spec, streak=ne.StreakView(current=4, closed_today=True))
    assert [p.category for _, p in _ambient(sent)
            if p.category in (CAT_MISSED, CAT_EVENING_RECAP, CAT_STREAK)] == []


def test_streak_saver_then_last_call_when_earlier_tasks_are_open():
    spec = [("09:00", "morning skincare", 7), ("13:00", "sun", 10)]
    streak = ne.StreakView(current=6, needed_to_close=2, last_close_yesterday=True)
    sent, _ = simulate(WED, spec, streak=streak, muted={CAT_MISSED})
    cats = [(c, p.category) for c, p in _ambient(sent)]
    saver = [c for c, cat in cats if cat == CAT_STREAK]
    last = [c for c, cat in cats if cat == CAT_STREAK_LAST_CALL]
    assert saver == ["20:30"] and last == ["22:20"]
    p = next(p for _, p in _ambient(sent) if p.category == CAT_STREAK)
    assert "day 7" in (p.title + p.body) and "2" in p.body
    # the saver replaces the evening wrap-up — never both
    assert CAT_EVENING_RECAP not in [cat for _, cat in cats]


def test_no_streak_saver_while_everything_left_is_still_ahead():
    spec = [("21:00", "face pulls", 5), ("22:00", "evening skincare", 5)]
    streak = ne.StreakView(current=6, needed_to_close=2, last_close_yesterday=True)
    # both evening tasks get done on time → no saver at all
    done = {"t0": (_m("21:05"), "completed"), "t1": (_m("22:03"), "completed")}
    sent, _ = simulate(WED, spec, streak=streak, done=done)
    assert CAT_STREAK not in [p.category for _, p in _ambient(sent)]
    # face pulls never happens → one saver, only once it is 45 min overdue
    sent, _ = simulate(WED, spec, streak=streak, done={"t1": (_m("22:03"), "completed")})
    savers = [c for c, p in _ambient(sent) if p.category == CAT_STREAK]
    assert len(savers) == 1 and _m(savers[0]) >= _m("21:45")


def test_evening_close_lists_what_is_still_open_after_the_last_task():
    spec = [("09:00", "morning skincare", 7), ("18:00", "workout", 45)]
    sent, _ = simulate(WED, spec, muted={CAT_MISSED})
    closes = [(c, p) for c, p in _ambient(sent) if p.category == CAT_EVENING_RECAP]
    assert [c for c, _ in closes] == ["21:00"]
    body = closes[0][1].body
    if "workout" in body:
        # most recent first, and no "52 min" ask at bedtime
        assert body.index("workout") < body.index("morning skincare") and "52 min" not in body


def test_morning_brief_never_follows_the_first_task_push():
    # the first task is 10 min after wake → the brief would arrive after it
    spec = [("07:10", "mew", 1), ("07:30", "skincare", 7), ("17:00", "gum", 12)]
    sent, _ = simulate(WED, spec)
    assert CAT_MORNING_PREVIEW not in [p.category for _, p in _ambient(sent)]


def test_regular_morning_brief_only_when_the_first_task_is_not_imminent():
    spec = [("09:30", "morning skincare", 7)]
    sent, _ = simulate(WED, spec)
    briefs = [(c, p) for c, p in _ambient(sent) if p.category == CAT_MORNING_PREVIEW]
    assert [c for c, _ in briefs] == ["07:10"]
    assert "morning skincare" in briefs[0][1].body and "9:30am" in briefs[0][1].body
    # the owner's first task is 5 minutes after wake → the task push opens the day
    sent, _ = simulate(THU, OWNER_DAY, wake="05:00", sleep="23:00")
    assert CAT_MORNING_PREVIEW not in [p.category for _, p in _ambient(sent)]


@pytest.mark.parametrize("streak,progress,expected", [
    (ne.StreakView(current=7, last_close_yesterday=True), ne.ProgressView(), CAT_STREAK_MILESTONE),
    (ne.StreakView(current=5, freeze_used_yesterday=True, last_close_yesterday=True), ne.ProgressView(), CAT_STREAK_FREEZE),
    (ne.StreakView(current=0, fresh_start_today=True), ne.ProgressView(), CAT_COMEBACK),
    (ne.StreakView(), ne.ProgressView(journey_day=30), CAT_JOURNEY),
])
def test_special_mornings(streak, progress, expected):
    spec = [("09:30", "morning skincare", 7)]
    sent, _ = simulate(WED, spec, streak=streak, progress=progress)
    mornings = [p for _, p in _ambient(sent) if p.dedup_key == ne.MORNING_KEY]
    assert [p.category for p in mornings] == [expected]  # one morning push, the special one


def test_muted_special_morning_falls_back_to_the_regular_brief():
    spec = [("09:30", "morning skincare", 7)]
    sent, _ = simulate(WED, spec, streak=ne.StreakView(current=7, last_close_yesterday=True),
                       muted={CAT_STREAK_MILESTONE})
    assert [p.category for _, p in _ambient(sent) if p.dedup_key == ne.MORNING_KEY] == [CAT_MORNING_PREVIEW]


def test_muting_the_streak_saver_also_mutes_its_last_call():
    spec = [("09:00", "morning skincare", 7)]
    streak = ne.StreakView(current=6, needed_to_close=1, last_close_yesterday=True)
    sent, _ = simulate(WED, spec, streak=streak, muted={CAT_STREAK})
    assert {CAT_STREAK, CAT_STREAK_LAST_CALL}.isdisjoint(p.category for _, p in _ambient(sent))


def test_weekly_recap_on_sunday_once():
    spec = [("09:00", "a", 5)]
    week = ne.WeekView(closed_days=5, active_days=7, done=38, total=45)
    sent, state = simulate(SUN, spec, week=week, done={"t0": (0, "completed")})
    weekly = [(c, p) for c, p in _ambient(sent) if p.category == CAT_WEEKLY]
    assert len(weekly) == 1 and weekly[0][1].route == "WeeklyReview"
    assert "5 of 7" in weekly[0][1].body and "38" in weekly[0][1].body
    # same Sunday again (ledger persisted) → nothing new
    again, _ = simulate(SUN, spec, week=week, done={"t0": (0, "completed")}, state=state)
    assert [p for _, p in _ambient(again) if p.category == CAT_WEEKLY] == []
    # not on a weekday
    sent, _ = simulate(WED, spec, week=week, done={"t0": (0, "completed")})
    assert CAT_WEEKLY not in [p.category for _, p in _ambient(sent)]


def test_progress_photo_weekly_and_scan_ready_once_per_unlock():
    spec = [("09:00", "a", 5)]
    progress = ne.ProgressView(journey_day=12, has_scanned=True, days_since_scan=8,
                               scan_ready=True, days_since_photo=9)
    sent, state = simulate(WED, spec, progress=progress, done={"t0": (0, "completed")})
    cats = [p.category for _, p in _ambient(sent)]
    assert cats.count(CAT_PROGRESS_PHOTO) == 1 and cats.count(CAT_SCAN_READY) == 1
    scan = next(p for _, p in _ambient(sent) if p.category == CAT_SCAN_READY)
    assert scan.route == "FaceScan" and "8 days" in scan.body
    photo = next(p for _, p in _ambient(sent) if p.category == CAT_PROGRESS_PHOTO)
    assert photo.route == "ProgressArchive"
    # the next day (every count one higher): the photo prompt is weekly and the
    # scan unlock was already announced
    tomorrow = ne.ProgressView(journey_day=13, has_scanned=True, days_since_scan=9,
                               scan_ready=True, days_since_photo=10)
    next_day, _ = simulate(THU, spec, progress=tomorrow, done={"t0": (0, "completed")}, state=state)
    assert {CAT_PROGRESS_PHOTO, CAT_SCAN_READY}.isdisjoint(p.category for _, p in _ambient(next_day))


def test_reengagement_ladder_is_sparse_and_ends():
    spec = [("09:00", "a", 5)]
    anchor = date(2026, 9, 1)
    state: dict = {}
    got = {}
    for day_offset in range(2, 50):  # lapsed from 48 h on
        day = anchor + timedelta(days=day_offset)
        hours = day_offset * 24 + 3
        sent, state = simulate(day, spec, hours_since_active=float(hours), last_active_date=anchor,
                               state=state, start="00:00", minutes=24 * 60)
        for c, p in sent:
            assert p.lane == "ambient" and p.category == CAT_REENGAGE
            got[day_offset] = p
    assert sorted(got) == [3, 6, 10, 14, 21, 30]
    assert "last check-in" in got[30].body


def test_ledger_is_idempotent_and_pruned():
    spec = [("09:00", "a", 5)]
    p = ne.decide(_input(WED, _m("09:00"), spec))[0]
    st = {}
    for d in range(6):
        day = WED + timedelta(days=d)
        st = ne.record_push(st, p, day.isoformat(), datetime.combine(day, time(9, 0)))
        st = ne.record_push(st, p, day.isoformat(), datetime.combine(day, time(9, 1)))
    assert len(st[ne.TASK_SENT_KEY]) == 3               # last 3 days kept
    last_day = (WED + timedelta(days=5)).isoformat()
    assert list(st[ne.TASK_SENT_KEY][last_day].values()) == [f"{last_day}T09:00:00"]


def test_needed_to_close_matches_the_streak_rule():
    # 80% resolved AND at least one completion
    assert ne.needed_to_close(10, 0, 0, 0.8) == 8
    assert ne.needed_to_close(10, 5, 2, 0.8) == 1
    assert ne.needed_to_close(10, 8, 0, 0.8) == 0
    assert ne.needed_to_close(5, 0, 4, 0.8) == 1     # skips alone never close a day
    assert ne.needed_to_close(0, 0, 0, 0.8) == 0


def test_a_full_realistic_day_timeline():
    """The owner's Thursday, with the morning done late and one evening task
    skipped — the whole push timeline, as a user would feel it."""
    done = {
        "t0": (_m("05:40"), "completed"),
        "t1": (_m("07:10"), "completed"),
        "t2": (_m("07:10"), "completed"),
        "t3": (_m("07:10"), "completed"),
        "t4": (_m("21:05"), "completed"),
        "t5": (_m("21:40"), "completed"),
        "t6": (0, "skipped"),
    }
    streak = ne.StreakView(current=4, needed_to_close=6, last_close_yesterday=True)
    sent, _ = simulate(THU, OWNER_DAY, wake="05:00", sleep="23:00", done=done, streak=streak)
    timeline = [(c, p.category) for c, p in sent]
    # task pushes for every task not already resolved at its minute
    assert [c for c, cat in timeline if cat == CAT_TASK_DUE] == [
        "05:05", "05:22", "06:03", "06:30", "21:00", "21:30", "22:28"]
    # one catch-up for the morning block, sent before it was done at 07:10
    fus = [c for c, cat in timeline if cat == CAT_MISSED]
    assert len(fus) == 1 and _m("06:45") <= _m(fus[0]) < _m("07:10")
    # nothing ambient in the evening: the evening tasks had their own pushes
    assert all(_m(c) < _m("20:00") for c, cat in timeline if cat != CAT_TASK_DUE)
