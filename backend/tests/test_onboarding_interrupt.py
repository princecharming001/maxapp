"""Tests for _looks_like_onboarding_interrupt — the gate that escapes the
intake re-ask loop when the user asks a genuine off-topic question."""

from __future__ import annotations

import pytest


def _fn():
    from api.chat import _looks_like_onboarding_interrupt
    return _looks_like_onboarding_interrupt


@pytest.mark.parametrize("msg,expected", [
    # Genuine questions → interrupt (return to agent)
    ("wait — does minoxidil have side effects?", True),
    ("does minoxidil cause shedding", True),
    ("what's the difference between minoxidil and finasteride?", True),
    ("how long does it take to work?", True),
    ("is this safe for me?", True),
    ("can I use it if I have high blood pressure?", True),
    ("why does it cause shedding?", True),
    ("hold on, what does that mean?", True),
    ("actually — quick question", True),
    ("should I use minoxidil or finasteride?", True),
    # Valid intake answers → should NOT interrupt (let re-ask fire)
    ("wavy, loose bends", False),
    ("less thinning", False),
    ("straight", False),
    ("yeah and i want to get ahead of it", False),
    ("not yet but it runs in my family", False),
    ("acne", False),
    ("oily skin", False),
    ("", False),
])
def test_looks_like_onboarding_interrupt(msg, expected):
    fn = _fn()
    assert fn(msg) is expected, f"msg={msg!r}: expected {expected}"
