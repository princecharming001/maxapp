"""Tone + response-length preferences reach the assembled chat prompt
(RALPH_CHAT_DRAWER SC6 / SC7).

These are the deterministic, no-LLM proofs that the drawer's TONE and LENGTH
controls actually change what the model sees — not just a DB write. The values
asserted here are exactly what the mobile drawer sends
(`mobile/components/ChatConversationsDrawer.tsx`): tone gentle/default/hardcore,
length concise/medium/detailed.
"""

from __future__ import annotations

import asyncio

import pytest

from services.persona_prompts import tone_preamble, TONE_PROMPTS
from services.lc_agent import build_agent_system_prompt

# The exact enum values the mobile UI PATCHes to the backend.
UI_TONES = ("gentle", "default", "hardcore")
UI_LENGTHS = ("concise", "medium", "detailed")


def test_ui_tone_values_all_map_to_a_preamble_no_enum_mismatch():
    # Every value the drawer can send must resolve to a real preamble (not the
    # silent fallback) — guards against a UI/backend enum drift.
    for t in UI_TONES:
        assert t in TONE_PROMPTS, f"UI tone {t!r} has no backend preamble"


def test_tone_preamble_is_distinct_per_tone():
    g, d, h = tone_preamble("gentle"), tone_preamble("default"), tone_preamble("hardcore")
    assert g != d and d != h and g != h
    assert any(w in g.lower() for w in ("warm", "patient", "empath"))
    assert any(w in h.lower() for w in ("hard", "drill", "ruthless", "no-bullshit", "tough"))


def test_unknown_tone_falls_back_to_default_voice():
    assert tone_preamble("nonsense") == tone_preamble("default")
    assert tone_preamble(None) == tone_preamble("default")


@pytest.mark.parametrize("tone,signature", [
    # Personas rewritten (RALPH_PERSONAS): gentle -> Big Daddy, hardcore -> Goggins.
    ("gentle", "BIG DADDY"),
    ("hardcore", "GOGGINS"),
])
def test_tone_preamble_reaches_assembled_prompt(tone, signature):
    # chat.py appends tone_preamble() to coaching_context, which the prompt
    # builder renders as `## USER CONTEXT:` — so the tone really reaches the LLM.
    ctx = {"coaching_context": tone_preamble(tone), "onboarding": {}}
    prompt = asyncio.run(build_agent_system_prompt(ctx, "app"))
    assert signature in prompt


def _prompt_for_length(length: str) -> str:
    ctx = {"onboarding": {"response_length": length}}
    return asyncio.run(build_agent_system_prompt(ctx, "app"))


@pytest.mark.parametrize("length,marker", [
    ("concise", "RESPONSE LENGTH PREFERENCE: CONCISE"),
    ("medium", "RESPONSE LENGTH PREFERENCE: MEDIUM"),
    ("detailed", "RESPONSE LENGTH PREFERENCE: DETAILED"),
])
def test_length_block_reaches_agent_prompt(length, marker):
    prompt = _prompt_for_length(length)
    assert marker in prompt


def test_length_blocks_do_not_leak_across_values():
    pc = _prompt_for_length("concise")
    pd = _prompt_for_length("detailed")
    assert "Hard cap: 1 sentence" in pc
    assert "Up to ~8 sentences" in pd
    # the concise prompt must not carry the detailed rule and vice-versa
    assert "PREFERENCE: DETAILED" not in pc
    assert "PREFERENCE: CONCISE" not in pd
