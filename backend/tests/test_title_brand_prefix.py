"""Task titles never carry the program name as a prefix.

The deterministic fallback generators hard-coded "FitMax — <task>" into every
title, and the em-dash scrub turned that into "FitMax, <task>" — which the Home
card then rendered directly above a "Fitmax" module subtitle. Every task
surface already names the program beside the title, so the prefix is stripped
at the persist boundary AND on read (for rows stored before the fix).
"""

import pytest

from services.schedule_service import (
    _clean_days_em_dashes,
    _humanize_titles_in_days,
    strip_brand_prefix,
)


@pytest.mark.parametrize("raw, expected", [
    ("FitMax — Morning nutrition", "Morning nutrition"),
    ("FitMax, Morning nutrition", "Morning nutrition"),          # post em-dash scrub
    ("Skinmax — SPF reapply", "SPF reapply"),
    ("SkinMax: hydration check", "hydration check"),
    ("HeightMax — Post-sprint — eat window", "Post-sprint — eat window"),
    ("BoneMax - Mewing", "Mewing"),
    ("hairmax | Minoxidil AM", "Minoxidil AM"),
    ("  fitmax —  pre-workout (upper)", "pre-workout (upper)"),
])
def test_strips_leading_brand(raw, expected):
    assert strip_brand_prefix(raw) == expected


@pytest.mark.parametrize("raw", [
    "Morning skincare",
    "Fitmax",                       # the whole title IS the brand — leave it
    "Max out your sleep",           # "max" inside a word is not a brand prefix
    "Climax stretch",
    "",
])
def test_leaves_ordinary_titles_alone(raw):
    assert strip_brand_prefix(raw) == raw


def test_persist_boundary_strips_before_em_dash_scrub():
    days = [{"tasks": [{"title": "FitMax — Weekly weigh-in", "description": "step on — note it"}]}]
    _clean_days_em_dashes(days)
    t = days[0]["tasks"][0]
    assert t["title"] == "Weekly weigh-in"
    assert "—" not in t["description"]


def test_read_path_cleans_rows_stored_before_the_fix():
    days = [{"date": "2026-09-15", "tasks": [
        {"title": "FitMax, Morning nutrition", "catalog_id": "fit.am", "time": "07:00"},
        {"title": "Morning skincare", "catalog_id": "skin.am", "time": "07:30"},
    ]}]
    out = _humanize_titles_in_days(days)
    titles = [t["title"] for t in out[0]["tasks"]]
    assert not any(t.lower().startswith("fitmax") for t in titles)
    assert "Morning skincare" in titles or "morning skincare" in [t.lower() for t in titles]
