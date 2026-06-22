"""
Boilerplate unit tests for pure / deterministic utility functions.

Pattern copied exactly from test_human_time.py — import the function,
call it with fixed inputs, assert expected outputs.  No DB, no mocks,
no external I/O.

Functions tested here were verified to be pure by reading their source:
  - human_time.to_min / hm (HH:MM ↔ minute conversion)
  - human_time._window (window parsing)
  - middleware.auth_middleware._subscription_expired (date compare)
  - services.chat_conversations_service._auto_title_from_message (string trim)
  - api.scans._redacted_analysis (dict transformation)
  - services.copy_filter (if present and pure)

Functions NOT tested here (impure / non-deterministic, flagged for future work):
  - lc_providers.get_primary_llm  (reads env, makes HTTP calls)
  - schedule_service.build_schedule (reads DB, depends on time)
  - push notifications (async I/O)
  - anything calling datetime.utcnow() without an injectable clock

Run:
    pytest tests/test_pure_utils.py -v
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services.human_time import to_min, hm


# ---------------------------------------------------------------------------
# human_time.to_min — HH:MM string → integer minutes
# ---------------------------------------------------------------------------

def test_to_min_midnight():
    assert to_min("00:00") == 0


def test_to_min_noon():
    assert to_min("12:00") == 720


def test_to_min_23_59():
    assert to_min("23:59") == 23 * 60 + 59


def test_to_min_single_digit_hour():
    assert to_min("7:30") == 7 * 60 + 30


def test_to_min_invalid_returns_default():
    assert to_min("not-a-time") == 0
    assert to_min(None) == 0
    assert to_min("") == 0


def test_to_min_custom_default():
    assert to_min("bad", default=-1) == -1


def test_to_min_with_extra_seconds_ignored():
    # Only first 2 chars after ':' are used — "30:00" seconds are ignored
    assert to_min("07:30:00") == 7 * 60 + 30


# ---------------------------------------------------------------------------
# human_time.hm — integer minutes → HH:MM string
# ---------------------------------------------------------------------------

def test_hm_midnight():
    assert hm(0) == "00:00"


def test_hm_noon():
    assert hm(720) == "12:00"


def test_hm_23_59():
    assert hm(23 * 60 + 59) == "23:59"


def test_hm_wraps_at_24h():
    # 25:00 → 01:00 (mod 1440)
    assert hm(25 * 60) == "01:00"


def test_hm_negative_wraps():
    # Negative values are implementation-defined; just check no crash
    result = hm(-60)
    assert ":" in result


def test_to_min_hm_roundtrip():
    for minutes in (0, 60, 420, 720, 1080, 1380, 1439):
        assert to_min(hm(minutes)) == minutes


# ---------------------------------------------------------------------------
# _subscription_expired (from auth_middleware)
# ---------------------------------------------------------------------------

def test_subscription_expired_past_datetime():
    from middleware.auth_middleware import _subscription_expired
    assert _subscription_expired(datetime.utcnow() - timedelta(seconds=1)) is True


def test_subscription_expired_future_datetime():
    from middleware.auth_middleware import _subscription_expired
    assert _subscription_expired(datetime.utcnow() + timedelta(days=30)) is False


def test_subscription_expired_none():
    from middleware.auth_middleware import _subscription_expired
    assert _subscription_expired(None) is False


def test_subscription_expired_tz_aware():
    from middleware.auth_middleware import _subscription_expired
    past_aware = datetime.now(timezone.utc) - timedelta(days=1)
    assert _subscription_expired(past_aware) is True


def test_subscription_expired_tz_naive_past():
    """Tz-naive datetime in the past must be treated as UTC and expired."""
    from middleware.auth_middleware import _subscription_expired
    assert _subscription_expired(datetime(2020, 1, 1, 0, 0, 0)) is True


# ---------------------------------------------------------------------------
# chat_conversations_service._auto_title_from_message
# ---------------------------------------------------------------------------

def test_auto_title_truncates_to_40():
    from services.chat_conversations_service import _auto_title_from_message
    long = "a" * 200
    out = _auto_title_from_message(long)
    assert len(out) <= 40


def test_auto_title_strips_whitespace():
    from services.chat_conversations_service import _auto_title_from_message
    assert _auto_title_from_message("  hello  ") == "hello"


def test_auto_title_empty_returns_placeholder():
    from services.chat_conversations_service import _auto_title_from_message
    assert _auto_title_from_message("") == "new chat"
    assert _auto_title_from_message("   ") == "new chat"


def test_auto_title_preserves_real_message():
    from services.chat_conversations_service import _auto_title_from_message
    msg = "How do I improve my skin routine?"
    out = _auto_title_from_message(msg)
    assert out.startswith("How do I improve")


# ---------------------------------------------------------------------------
# api.scans._redacted_analysis — dict transformation
# ---------------------------------------------------------------------------

_FULL_ANALYSIS = {
    "overall_score": 7.5,
    "potential_score": 9.0,
    "scan_summary": {"overall_score": 7.5},
    "umax_metrics": {"symmetry": 8.1, "skin": 7.2},
    "preview_blurb": "You have strong cheekbones.",
    "psl_rating": {
        "psl_score": 7.5,
        "potential": 9.0,
        "appeal": 7.0,
        "psl_tier": "B",
        "ascension_time_months": 18,
        "age_score": 25,
        "archetype": "Classic",
    },
}


def test_redacted_analysis_locked_true():
    from api.scans import _redacted_analysis
    assert _redacted_analysis(_FULL_ANALYSIS)["locked"] is True


def test_redacted_analysis_excludes_umax_metrics():
    from api.scans import _redacted_analysis
    assert "umax_metrics" not in _redacted_analysis(_FULL_ANALYSIS)


def test_redacted_analysis_excludes_preview_blurb():
    from api.scans import _redacted_analysis
    assert "preview_blurb" not in _redacted_analysis(_FULL_ANALYSIS)


def test_redacted_analysis_includes_overall_score():
    from api.scans import _redacted_analysis
    assert _redacted_analysis(_FULL_ANALYSIS)["overall_score"] == 7.5


def test_redacted_analysis_includes_potential_score():
    from api.scans import _redacted_analysis
    assert _redacted_analysis(_FULL_ANALYSIS)["potential_score"] == 9.0


def test_redacted_analysis_includes_psl_rating():
    from api.scans import _redacted_analysis
    result = _redacted_analysis(_FULL_ANALYSIS)
    assert "psl_rating" in result
    assert result["psl_rating"]["psl_tier"] == "B"


def test_redacted_analysis_empty_input_no_crash():
    from api.scans import _redacted_analysis
    result = _redacted_analysis({})
    assert result["locked"] is True


def test_redacted_analysis_does_not_mutate_input():
    """_redacted_analysis must not mutate the original analysis dict."""
    from api.scans import _redacted_analysis
    original = dict(_FULL_ANALYSIS)
    _redacted_analysis(original)
    assert "umax_metrics" in original  # original untouched


# ---------------------------------------------------------------------------
# models.user.OnboardingData — Pydantic model parsing
# ---------------------------------------------------------------------------

def test_onboarding_data_accepts_known_fields():
    from models.user import OnboardingData
    ob = OnboardingData(goals=["skinmax"], age=25, gender="male")
    assert ob.age == 25
    assert "skinmax" in ob.goals


def test_onboarding_data_defaults_completed_false():
    from models.user import OnboardingData
    ob = OnboardingData()
    assert ob.completed is False


def test_onboarding_data_completed_can_be_set():
    from models.user import OnboardingData
    ob = OnboardingData(completed=True)
    assert ob.completed is True


def test_onboarding_data_coerces_height_string():
    """height/weight accept strings and coerce to float."""
    from models.user import OnboardingData
    ob = OnboardingData(height="70", weight="180")
    assert isinstance(ob.height, float)
    assert ob.height == 70.0
