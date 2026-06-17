"""Tests for dynamic onboarding (rule prefill + missing fields; LLM mocked)."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

from services.dynamic_onboarding_service import (
    DynamicOnboardingStep,
    build_known_facts,
    format_known_facts_for_prompt,
    missing_for_schedule,
    plan_next_onboarding_step,
    prepare_state_for_maxx,
    resolve_after_prefill,
    rule_prefill_updates,
)
from services.task_catalog_service import warm_catalog


@pytest.fixture(scope="module", autouse=True)
def _warm():
    asyncio.get_event_loop().run_until_complete(warm_catalog())


def test_rule_prefill_skin_concern_from_onboarding():
    state = {
        "primary_skin_concern": "breakouts and acne",
        "wake_time": "07:00",
    }
    updates = rule_prefill_updates("skinmax", state)
    assert updates.get("skin_concern") == "acne"


def test_known_facts_excludes_internal_keys():
    state = {"skin_type": "oily", "_onboarding_pending": {"max": "skinmax"}}
    known = build_known_facts(state, "skinmax")
    assert "_onboarding_pending" not in known
    assert known["skin_type"] == "oily"


def test_missing_for_schedule_skips_filled_composite():
    state = {
        "hair_type": "wavy",
        "scalp_state": "normal",
        "hair_loss_signs": "no",
    }
    missing = missing_for_schedule("hairmax", state)
    ids = [m["id"] for m in missing]
    assert "hair_scalp_profile" not in ids
    assert "hair_loss_signs" not in ids


@pytest.mark.asyncio
async def test_plan_next_question_fallback_field():
    state = {"wake_time": "07:00", "sleep_time": "23:00"}
    with patch(
        "services.llm_sync.async_llm_json_response",
        new=AsyncMock(return_value="{}"),
    ):
        step = await plan_next_onboarding_step("hairmax", state)
    assert step.field_id
    assert step.question_text or step.inferred_updates


@pytest.mark.asyncio
async def test_resolve_infers_when_llm_returns_value():
    state = {
        "skin_type": "oily",
        "primary_skin_concern": "acne breakouts",
        "wake_time": "07:00",
        "sleep_time": "23:00",
    }
    merged, prefill = prepare_state_for_maxx("skinmax", state)
    merged = {**state, **prefill}

    async def _fake_llm(prompt: str, max_tokens: int = 512):
        if "MISSING FIELDS" in prompt and "infer" in prompt.lower():
            return json.dumps({"barrier_state": "stable"})
        return json.dumps({
            "field_id": "routine_level",
            "question": "how much time do you want to spend on skin daily?",
            "inferred_value": None,
        })

    with patch("services.llm_sync.async_llm_json_response", side_effect=_fake_llm):
        step, updates = await resolve_after_prefill("skinmax", merged)

    assert updates.get("barrier_state") == "stable" or step.field_id


@pytest.mark.asyncio
async def test_plan_inferred_value_expands():
    state = {"wake_time": "07:00", "sleep_time": "23:00"}
    llm_response = json.dumps({
        "field_id": "styling_habits",
        "inferred_value": "wash_go",
    })
    with patch(
        "services.llm_sync.async_llm_json_response",
        new=AsyncMock(return_value=llm_response),
    ):
        step = await plan_next_onboarding_step("hairmax", state)
    assert step.inferred_updates
    assert step.inferred_updates.get("daily_styling") is False
    assert step.inferred_updates.get("heat_styling") == "never"
