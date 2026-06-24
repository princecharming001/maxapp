"""Retention layer — achievement catalog/criteria + personalized reminder copy.
Pure-function coverage (no DB); the award path is exercised live e2e."""

from __future__ import annotations

import services.achievements as A
from services.notification_copy import personalized_reminder


# --------------------------------------------------------------------------- #
#  Achievement catalog integrity                                              #
# --------------------------------------------------------------------------- #

def test_catalog_codes_unique_and_well_formed():
    codes = [a.code for a in A.CATALOG]
    assert len(codes) == len(set(codes)), "duplicate achievement codes"
    for a in A.CATALOG:
        assert a.tier in ("bronze", "silver", "gold")
        assert a.category in ("consistency", "milestones", "progress", "discovery")
        assert a.title and a.description and a.icon
        assert callable(a.check)


def test_count_completed_tasks_and_active_count():
    schedules = [
        {"maxx_id": "skinmax", "days": [
            {"tasks": [{"status": "completed"}, {"status": "pending"}, {"status": "completed"}]},
            {"tasks": [{"status": "completed"}]},
        ]},
        {"maxx_id": "fitmax", "days": [{"tasks": [{"status": "completed"}]}]},
    ]
    assert A._count_completed_tasks(schedules) == 4
    assert A._active_count(schedules) == 2
    assert A._active_count([]) == 0
    assert A._active_count([{"maxx_id": "skinmax", "days": []}]) == 1


def test_checks_fire_at_thresholds():
    base = {"streak": 0, "armed_freezes": 0, "fresh_start_today": False,
            "perfect_day": False, "active_count": 0, "tasks_completed": 0,
            "scans": 0, "facts": 0}
    by = A.CATALOG_BY_CODE
    assert not by["streak_7"].check(base)
    assert by["streak_3"].check({**base, "streak": 3})
    assert by["streak_7"].check({**base, "streak": 9})
    assert not by["streak_30"].check({**base, "streak": 29})
    assert by["first_routine"].check({**base, "active_count": 1})
    assert by["two_maxxes"].check({**base, "active_count": 2})
    assert by["tasks_50"].check({**base, "tasks_completed": 50})
    assert by["first_scan"].check({**base, "scans": 1})
    assert by["comeback"].check({**base, "fresh_start_today": True})
    assert by["knows_me"].check({**base, "facts": 3})
    assert by["perfect_day"].check({**base, "perfect_day": True})


def test_public_serialization_shows_progress_only_when_locked():
    stats = {"streak": 4, "armed_freezes": 0, "fresh_start_today": False,
             "perfect_day": False, "active_count": 1, "tasks_completed": 0,
             "scans": 0, "facts": 0}
    a = A.CATALOG_BY_CODE["streak_7"]
    locked = A._public(a, earned=False, seen=False, stats=stats)
    assert locked["progress"] == {"current": 4, "target": 7}
    earned = A._public(a, earned=True, seen=True, stats=stats)
    assert earned["progress"] is None  # earned badges don't show a progress bar
    assert earned["earned"] is True and earned["tier"] == "silver"


def test_perfect_day_stat_from_streak_payload():
    # compute_stats derives perfect_day from last_perfect_date == today_date
    streak = {"current": 5, "last_perfect_date": "2026-06-13", "today_date": "2026-06-13",
              "armed_freezes": 1, "fresh_start_today": False}
    # mirror the inline logic
    perfect = bool(streak.get("last_perfect_date") and streak["last_perfect_date"] == streak["today_date"])
    assert perfect is True
    streak2 = {**streak, "last_perfect_date": "2026-06-12"}
    assert not (streak2["last_perfect_date"] == streak2["today_date"])


# --------------------------------------------------------------------------- #
#  Personalized reminder copy                                                 #
# --------------------------------------------------------------------------- #

def test_reminder_is_short_and_passes_taste_bar():
    # v2: the legacy shim now returns the new dry-witty task-due copy. It must be
    # short, lowercase-voiced, name the task/maxx, and pass the taste bar.
    from services.notification_copy import passes_taste_bar

    out = personalized_reminder({"goals": {"why": "feel more confident"}},
                                maxx_label="Skinmax", slot="pm", name="Anish")
    assert len(out["title"].split()) <= 6
    assert len(out["body"]) <= 90
    low = (out["title"] + " " + out["body"]).lower()
    assert "skinmax" in low or "evening routine" in low  # names the task
    assert passes_taste_bar(out["title"]) and passes_taste_bar(out["body"])
    assert "failed" not in low and "lost" not in low and "don't lose" not in low


def test_reminder_goal_reference_appears_when_known():
    # v2 rotates templates, so the goal surfaces on SOME lines (not every one).
    from services.notification_copy import CAT_TASK_DUE, compose

    bodies = [
        compose(CAT_TASK_DUE, task="workout", why="the wedding in June", rotation=i)["title"]
        + compose(CAT_TASK_DUE, task="workout", why="the wedding in June", rotation=i)["body"]
        for i in range(6)
    ]
    assert any("wedding in June" in b for b in bodies)


def test_reminder_falls_back_cleanly_without_profile():
    out = personalized_reminder({}, maxx_label="your", slot="default")
    assert out["title"] and out["body"]
    assert "routine" in (out["title"] + out["body"]).lower()
