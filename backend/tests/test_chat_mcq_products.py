"""Deterministic tests for the chat MCQ / custom-option / broad-question gate
and the inline-amazon-link stripper. These cover criteria 1, 2, 5, 6 without
needing a live LLM."""
import re

from api.chat import (
    _extract_inline_choices,
    _broad_question_mcq,
    _strip_amazon_links,
)


# ---------------------------------------------------------------------------
# Marker parsing: CHOICES / CHOICES_MULTI / Other extractor
# ---------------------------------------------------------------------------

def test_extract_single_choices():
    text = "what's your skin type? [CHOICES]oily|dry|combo[/CHOICES]"
    cleaned, choices, multi = _extract_inline_choices(text)
    assert choices == ["oily", "dry", "combo"]
    assert multi is False
    assert "[CHOICES]" not in cleaned
    assert "what's your skin type?" in cleaned


def test_extract_multi_choices():
    text = "what's bugging you? [CHOICES_MULTI]acne|dryness|redness[/CHOICES_MULTI]"
    cleaned, choices, multi = _extract_inline_choices(text)
    assert choices == ["acne", "dryness", "redness"]
    assert multi is True
    assert "[CHOICES_MULTI]" not in cleaned


def test_extract_other_sentinel_passthrough():
    # The "Something else" custom sentinel survives extraction as a normal
    # option; the mobile renderer is what turns it into a focus-input chip.
    text = "what's the goal? [CHOICES]fat loss|muscle gain|Something else[/CHOICES]"
    _cleaned, choices, _multi = _extract_inline_choices(text)
    assert choices[-1] == "Something else"


def test_extract_no_marker():
    text = "5% niacinamide is plenty for most people."
    cleaned, choices, multi = _extract_inline_choices(text)
    assert choices == []
    assert multi is False
    assert cleaned == text


def test_extract_trims_overlong_and_caps_six():
    text = "[CHOICES]a|b|c|d|e|f|g|h[/CHOICES]"
    _cleaned, choices, _multi = _extract_inline_choices(text)
    assert len(choices) == 6


# ---------------------------------------------------------------------------
# Inline-amazon-link stripper (cards carry links; prose stays clean)
# ---------------------------------------------------------------------------

def test_strip_amazon_markdown_link():
    text = "grab the cerave ([CeraVe](https://www.amazon.com/Cerave/dp/B01N7T7JKJ)) cleanser"
    out = _strip_amazon_links(text)
    assert "amazon" not in out.lower()
    assert "cerave" in out.lower()
    # The enricher pill " ([Label](url))" is removed whole, no orphan "(CeraVe)"
    assert "([" not in out


def test_strip_bare_amazon_url():
    text = "see https://www.amazon.com/dp/B01N7T7JKJ for details"
    out = _strip_amazon_links(text)
    assert "amazon" not in out.lower()


def test_strip_preserves_non_amazon():
    text = "per the study at https://pubmed.gov/123 it works"
    out = _strip_amazon_links(text)
    assert "pubmed.gov/123" in out


# ---------------------------------------------------------------------------
# Broad-question gate: criterion 1 (choices) + criterion 2 (Other only when
# warranted) + criterion 5 (specific questions answer directly => None).
# These use a fake db whose .get(User, ...) returns an object with empty
# onboarding and whose context lookups return empty.
# ---------------------------------------------------------------------------

import pytest


class _FakeUser:
    onboarding: dict = {}


class _FakeDB:
    async def get(self, *a, **k):
        return _FakeUser()


@pytest.fixture(autouse=True)
def _patch_ctx(monkeypatch):
    async def _empty_ctx(user_id, db):
        return {}
    monkeypatch.setattr("services.user_context_service.get_context", _empty_ctx)
    yield


@pytest.mark.asyncio
async def test_broad_skincare_returns_choices():
    out = await _broad_question_mcq("u1", "what skincare should i use", _FakeDB())
    assert out is not None
    _text, choices, _multi = out
    assert len(choices) >= 4


@pytest.mark.asyncio
async def test_broad_workout_returns_choices():
    out = await _broad_question_mcq("u1", "build me a workout", _FakeDB())
    assert out is not None


@pytest.mark.asyncio
async def test_broad_diet_returns_choices():
    out = await _broad_question_mcq("u1", "what should i eat", _FakeDB())
    assert out is not None


@pytest.mark.asyncio
async def test_broad_hair_returns_choices():
    out = await _broad_question_mcq("u1", "help with my hair", _FakeDB())
    assert out is not None


@pytest.mark.asyncio
async def test_concern_question_has_custom_option():
    # "what's bothering you about your skin" -> open concern MCQ WITH custom.
    out = await _broad_question_mcq("u1", "what's bothering you about your skin", _FakeDB())
    assert out is not None
    _t, choices, multi = out
    assert multi is True
    assert any(c.lower() == "something else" for c in choices)


@pytest.mark.asyncio
async def test_skin_type_question_has_no_custom_option():
    # "what's your skin type" -> closed MCQ, NO custom option.
    out = await _broad_question_mcq("u1", "what's your skin type", _FakeDB())
    assert out is not None
    _t, choices, _multi = out
    assert not any(c.lower() in ("something else", "other") for c in choices)
    assert len(choices) >= 3


@pytest.mark.asyncio
async def test_specific_question_passes_through():
    # criterion 5: specific / general-knowledge questions are NOT gated.
    for q in ("what percent niacinamide should i use", "is creatine safe",
              "what skincare should i use for acne"):
        out = await _broad_question_mcq("u1", q, _FakeDB())
        assert out is None, q
