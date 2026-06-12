"""Human-time placement: the plan must read like a person planned it."""

from services.human_time import (
    friendly_time,
    hm,
    humanize_days,
    life_windows,
    nudge_out_of_protected,
    resolve_workout_window,
    why_line,
)

NINE_TO_FIVE = {
    "wake_time": "07:00",
    "sleep_time": "23:00",
    "obligations": [{"label": "Work", "start": "09:00", "end": "17:00", "days": "weekdays"}],
    "anchor_cues": ["coffee"],
}


# --- friendly grid -------------------------------------------------------------

def test_friendly_time_kills_robotic_minutes():
    assert friendly_time(7 * 60 + 23) == 7 * 60 + 25   # 7:23 -> 7:25
    assert friendly_time(21 * 60 + 48) == 21 * 60 + 45  # 9:48p -> 9:45p
    assert friendly_time(7 * 60 + 14) == 7 * 60 + 15    # 7:14 -> 7:15
    assert friendly_time(12 * 60) == 12 * 60            # noon stays noon


# --- windows -------------------------------------------------------------------

def test_nine_to_five_windows_match_real_life():
    w = life_windows(NINE_TO_FIVE)
    assert w.crunch == (8 * 60 + 15, 9 * 60)            # get-ready squeeze
    assert w.lunch is not None and w.lunch[0] >= 11 * 60
    assert w.settle_in == (17 * 60, 17 * 60 + 45)       # commute + decompress
    assert w.dinner[0] >= 18 * 60                       # dinner is protected
    assert w.wind_down == (21 * 60 + 45, 22 * 60 + 45)


def test_no_optional_lands_in_crunch_or_dinner():
    w = life_windows(NINE_TO_FIVE)
    # 8:30a is mid-crunch -> pushed past 9:00 start of work
    assert nudge_out_of_protected(8 * 60 + 30, w) >= 9 * 60
    # 7:00p is mid-dinner -> pushed past dinner's end
    assert nudge_out_of_protected(19 * 60, w) >= w.dinner[1]


# --- workouts go where workouts go ---------------------------------------------

def test_workout_after_work_lands_after_settling_in():
    lo, hi = resolve_workout_window(NINE_TO_FIVE, "after_work")
    assert lo >= 17 * 60 + 45      # NOT 5:00pm sharp - settled in first
    assert hi <= 18 * 60 + 45      # and done before dinner


def test_workout_before_work_falls_back_when_no_room():
    # Wake 7:00, work 8:00 - there is no honest before-work session.
    tight = {**NINE_TO_FIVE, "obligations": [
        {"label": "Work", "start": "08:00", "end": "17:00", "days": "weekdays"},
    ]}
    lo, hi = resolve_workout_window(tight, "before_work")
    assert lo >= 17 * 60           # honest fallback to after work


def test_workout_lunch_uses_the_real_lunch():
    lo, hi = resolve_workout_window(NINE_TO_FIVE, "lunch")
    w = life_windows(NINE_TO_FIVE)
    assert (lo, hi) == w.lunch


# --- why-lines -----------------------------------------------------------------

def test_why_lines_read_like_a_person():
    w = life_windows(NINE_TO_FIVE)
    assert why_line(7 * 60 + 5, w) == "right after you wake"
    assert why_line(7 * 60 + 20, w, ["coffee"]) == "with your morning coffee"
    assert "lunch" in why_line(12 * 60 + 45, w)
    assert why_line(17 * 60 + 30, w) == "once you're home and settled"
    assert why_line(22 * 60, w) == "wind-down before bed"


# --- the humanize pass ----------------------------------------------------------

def test_humanize_days_end_to_end():
    days = [{
        "date": "2026-06-15",
        "tasks": [
            {"title": "wash your face", "time": "07:05", "duration_min": 5},
            {"title": "moisturize", "time": "07:23", "duration_min": 3},
            {"title": "water", "time": "08:30", "duration_min": 2},   # mid-crunch
            {"title": "stretch", "time": "19:00", "duration_min": 10},  # mid-dinner
            {"title": "pm skin", "time": "21:48", "duration_min": 6},
        ],
    }]
    humanize_days(days, NINE_TO_FIVE)
    by_title = {t["title"]: t for t in days[0]["tasks"]}
    # Robotic minutes are gone.
    for t in days[0]["tasks"]:
        m = int(t["time"][:2]) * 60 + int(t["time"][3:])
        assert m % 5 == 0, t
    # Crunch + dinner stayed clear for optionals.
    water_min = int(by_title["water"]["time"][:2]) * 60 + int(by_title["water"]["time"][3:])
    assert water_min >= 9 * 60
    stretch_min = int(by_title["stretch"]["time"][:2]) * 60 + int(by_title["stretch"]["time"][3:])
    w = life_windows(NINE_TO_FIVE)
    assert not (w.dinner[0] <= stretch_min < w.dinner[1])
    # Anchor-relative why lines were filled.
    assert by_title["wash your face"]["why"] == "right after you wake"
    assert by_title["pm skin"]["why"] in ("wind-down before bed", "your evening, your time")
    # Ordering survived.
    times = [t["time"] for t in days[0]["tasks"]]
    assert times == sorted(times)


def test_humanize_is_idempotent():
    days = [{"date": "2026-06-15", "tasks": [
        {"title": "a", "time": "07:25", "duration_min": 5, "why": "right after you wake"},
    ]}]
    before = hm(7 * 60 + 25)
    humanize_days(days, NINE_TO_FIVE)
    humanize_days(days, NINE_TO_FIVE)
    assert days[0]["tasks"][0]["time"] == before
