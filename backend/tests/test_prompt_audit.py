"""Deterministic gate for the prompt audit (RALPH_PROMPT_AUDIT RC4/RC8).

Reuses the user-POV harness (scripts/prompt_eval.py): for the whole
persona x intent x edge matrix it assembles the REAL system prompt and asserts
the audit invariants hold (em-dash stated once, persona reaches the prompt,
length honored, persona<->length reconciled, allergy rules + humane override
present, no cold-start dangling blocks). No LLM needed — this is the always-green
backstop; live judging is the harness's optional layer.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import prompt_eval as PE  # noqa: E402


MATRIX = PE.build_matrix()


@pytest.mark.parametrize("cell", MATRIX, ids=[c.key for c in MATRIX])
def test_assembled_prompt_passes_audit(cell):
    prompt = asyncio.run(PE.build_agent_system_prompt(PE._ctx(cell), "app"))
    problems = PE.assert_cell(prompt, cell)
    assert not problems, f"{cell.key}: " + "; ".join(problems)


def test_em_dash_stated_exactly_once_per_persona():
    for persona in PE.PERSONAS:
        cell = PE.Cell(key=f"{persona}:probe", persona=persona, message="hi",
                       onboarding=PE.RICH_ONBOARDING)
        prompt = asyncio.run(PE.build_agent_system_prompt(PE._ctx(cell), "app"))
        assert prompt.lower().count("em-dash") == 1, f"{persona}: em-dash not stated once"


def test_realistic_prompt_not_gutted_by_trim():
    # A fully-loaded real user must keep persona + voice + product rules (the old
    # 3200-token budget trimmed them out).
    cell = PE.Cell(key="hardcore:loaded", persona="hardcore",
                   message="build my routine", onboarding=PE.RICH_ONBOARDING,
                   user_facts=PE.ALLERGY_FACTS, length="detailed")
    prompt = asyncio.run(PE.build_agent_system_prompt(PE._ctx(cell), "app"))
    assert "GOGGINS" in prompt           # persona survived
    assert "recommend_product" in prompt  # product rules survived
    assert "ABSOLUTE RULES" in prompt     # diet safety survived
    assert "peanuts" in prompt.lower()    # allergen surfaced


def test_cold_start_no_dangling_placeholder_blocks():
    for ctx in (
        {"latest_scan": {"focus_areas": []}, "onboarding": {}},
        {"active_schedule": {"foo": 1}, "onboarding": {}},
        {"onboarding": {}},
    ):
        prompt = asyncio.run(PE.build_agent_system_prompt(ctx, "app"))
        assert "score=?" not in prompt
        assert "SCHEDULE: ?" not in prompt
        assert PE.check_no_dangling_blocks(prompt) is None
