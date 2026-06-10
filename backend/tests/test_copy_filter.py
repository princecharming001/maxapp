"""Golden tests for the outbound voice gate (services/copy_filter.py)."""

from services.copy_filter import (
    SAFE_GENERIC_FALLBACK,
    check_content,
    filter_outbound_copy,
    filter_text,
)
from services.skinmax_notification_engine import (
    SKINMAX_MIDDAY_TIPS_BY_WEEKDAY,
    skinmax_restriction_reminder_body,
)


# --- in-voice strings pass untouched ----------------------------------------

GOLDEN_IN_VOICE = [
    "Hands off your face today. That's the whole tip.",
    "AM skincare. 5 minutes, then your day's yours.",
    "Free till 2. Good window for your stretch.",
    "Look like you're at the gym. Today's lift is loaded.",
    "Used a freeze for yesterday. Streak's safe.",
    "Yesterday got away. Today's a fresh one.",
    "That's today. Nice work.",
    "Welcome back. Just today.",
    "You're offline. Today's plan is still here, changes sync when you're back.",
    "If today's heavy, take five slow breaths. That's the whole task.",
]


def test_in_voice_strings_pass_unchanged():
    for s in GOLDEN_IN_VOICE:
        result = filter_outbound_copy(s)
        assert result.clean, f"falsely flagged: {s!r} -> {result.mechanical + result.content}"
        assert result.text == s


# --- mechanical violations get sanitized in place ----------------------------

def test_em_dash_replaced():
    assert filter_text("Lock in today — full plan fits") == "Lock in today, full plan fits"


def test_curly_quotes_straightened():
    assert filter_text("it’s “fine”") == "it's \"fine\""


def test_markdown_stripped():
    assert filter_text("**Do** your _routine_ now") == "Do your routine now"


def test_emoji_removed():
    assert filter_text("Nice work \U0001f525\U0001f4aa") == "Nice work"


def test_multi_bang_collapsed():
    out = filter_text("Let's go!!!")
    assert "!!" not in out


def test_all_caps_decapitalized_but_acronyms_kept():
    out = filter_text("NEVER skip SPF before going out")
    assert "NEVER" not in out
    assert "SPF" in out


# --- content violations fall back --------------------------------------------

GOLDEN_OUT_OF_VOICE = [
    "Hands off your face, bacteria transfer causes breakouts.",
    "Stressed today? Cortisol spikes can flare skin.",
    "Added sugar drives inflammation, often shows on skin within ~48 hours.",
    "Seed oils can be pro-inflammatory in excess.",
    "You failed your routine yesterday.",
    "Don't lose your streak!",
    "You're falling behind on your plan.",
    "You lost your streak.",
    "Take 50 mg of zinc daily.",
    "Skipping this makes you look older.",
]


def test_out_of_voice_strings_blocked():
    for s in GOLDEN_OUT_OF_VOICE:
        assert check_content(s), f"should have been flagged: {s!r}"


def test_content_violation_uses_fallback():
    result = filter_outbound_copy("Don't lose your streak!", fallback="Your plan is ready.")
    assert result.used_fallback
    assert result.text == "Your plan is ready."


def test_content_violation_uses_safe_generic_without_fallback():
    result = filter_outbound_copy("You failed your routine.")
    assert result.text == SAFE_GENERIC_FALLBACK


def test_empty_string_passthrough():
    assert filter_text("") == ""


# --- the rewritten skinmax strings are clean ----------------------------------

def test_all_skinmax_midday_tips_pass_filter():
    assert len(SKINMAX_MIDDAY_TIPS_BY_WEEKDAY) == 7
    for tip in SKINMAX_MIDDAY_TIPS_BY_WEEKDAY:
        result = filter_outbound_copy(tip)
        assert result.clean, f"skinmax tip fails voice gate: {tip!r}"


def test_all_restriction_reminders_pass_filter():
    for flag in ("dairy", "sugar", "seed_oils"):
        body = skinmax_restriction_reminder_body(flag)
        result = filter_outbound_copy(body)
        assert result.clean, f"restriction reminder fails voice gate: {body!r}"
