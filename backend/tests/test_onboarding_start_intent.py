"""Deterministic max start / switch detection + LLM-assisted answer coercion.

"hairmax", "change fitmax to hairmax" and "hairmac" must be handled by the
questioner — never routed to the agent (which cannot start an intake and,
during a provider outage, cannot answer at all).
"""

from __future__ import annotations

import asyncio

import pytest

from services import onboarding_questioner as oq


@pytest.fixture(autouse=True)
def _catalog():
    if not oq.is_loaded():
        asyncio.get_event_loop().run_until_complete(oq.warm_catalog())
    yield


@pytest.mark.parametrize("msg,expected", [
    # verbs
    ("start hairmax", "hairmax"),
    ("I want to start my SkinMax schedule.", "skinmax"),
    ("lets do bonemax", "bonemax"),
    ("give me a skin plan", "skinmax"),
    ("switch to fitmax", "fitmax"),
    # switch forms → the TARGET
    ("change fitmax to hairmax", "hairmax"),
    ("i want to change fitmax to hairmac", "hairmax"),
    ("swap skinmax for hairmax instead", "skinmax"),  # no "to": first mention wins, still deterministic
    ("hairmax instead of fitmax", "hairmax"),
    # bare names (with filler / typos)
    ("hairmax", "hairmax"),
    ("Hairmax please", "hairmax"),
    ("skin max", "skinmax"),
    ("hairmac", "hairmax"),
    ("start skinmaxx", "skinmax"),
    ("the fitmax one", "fitmax"),
    # NOT start intents
    ("what is skinmax", None),
    ("is fitmax hard?", None),
    ("should i start hairmax?", None),
    ("i love hairmax", None),
    ("hairmax is great", None),
    ("bonemax?", None),
    ("improve my posture", None),
    ("wavy, loose bends", None),
    ("Comfortable, no real issues", None),
    ("Or it's a all rounded climate", None),
    ("i dont want retinoid or any chemicals", None),
    ("no", None),
    ("", None),
])
def test_detect_max_start_intent(msg, expected):
    assert oq.detect_max_start_intent(msg) == expected, msg


def test_detect_max_switch_source():
    assert oq.detect_max_switch_source("change fitmax to hairmax", "hairmax") == "fitmax"
    assert oq.detect_max_switch_source("hairmax instead of fitmax", "hairmax") == "fitmax"
    assert oq.detect_max_switch_source("hairmax", "hairmax") is None
    assert oq.detect_max_switch_source("start hairmax and fitmax", "hairmax") is None


# ---------------------------------------------------------------------------
# LLM-assisted coercion
# ---------------------------------------------------------------------------

_YES_NO = {"id": "jaw_pain", "type": "yes_no", "question": "ever had jaw pain, clicking, or tmj issues?"}
_ENUM = {"id": "scalp", "type": "enum", "question": "how's your scalp most days?",
         "options": {"dry": "Dry, flaky or itchy sometimes", "oily": "Oily by evening", "normal": "Comfortable, no real issues"}}
_MULTI = {"id": "diet", "type": "enum", "multi": True, "question": "anything you don't eat?",
          "options": {"vegetarian": "Vegetarian", "vegan": "Vegan", "none": "I eat everything"}}
_INT = {"id": "session_minutes", "type": "int", "min": 20, "max": 120, "question": "how long per session?"}


class _LLM:
    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    async def ainvoke(self, _messages):
        self.calls += 1

        class R:
            content = self.reply
        return R()


@pytest.mark.asyncio
async def test_llm_coerce_maps_free_text_onto_schema(monkeypatch):
    llm = _LLM('{"value": false}')
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: llm)
    assert await oq.coerce_answer_llm(_YES_NO, "Not really some light weird clicking but nothing major") is False
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('```json\n{"value": "dry"}\n```'))
    assert await oq.coerce_answer_llm(_ENUM, "gets flaky in winter") == "dry"
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('{"value": ["vegetarian", "bogus"]}'))
    assert await oq.coerce_answer_llm(_MULTI, "no meat for me") == ["vegetarian"]
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('{"value": 60}'))
    assert await oq.coerce_answer_llm(_INT, "about an hour") == 60
    # label echoed instead of id still resolves
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('{"value": "Oily by evening"}'))
    assert await oq.coerce_answer_llm(_ENUM, "greasy by night") == "oily"


@pytest.mark.asyncio
async def test_llm_coerce_never_invents_and_degrades_on_outage(monkeypatch):
    # unknown option id → None (re-ask)
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('{"value": "sparkly"}'))
    assert await oq.coerce_answer_llm(_ENUM, "partly") is None
    # explicit null → None
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM('{"value": null}'))
    assert await oq.coerce_answer_llm(_YES_NO, "Partly") is None
    # garbage output → None
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _LLM("sure thing!"))
    assert await oq.coerce_answer_llm(_YES_NO, "Partly") is None

    # provider outage → None, no raise
    class _Dead:
        async def ainvoke(self, _m):
            from google.api_core import exceptions as g
            raise g.NotFound("gone")

    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _Dead())
    assert await oq.coerce_answer_llm(_YES_NO, "Partly") is None

    # timeout → None
    class _Slow:
        async def ainvoke(self, _m):
            await asyncio.sleep(1)

    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: _Slow())
    assert await oq.coerce_answer_llm(_YES_NO, "Partly", timeout_s=0.01) is None

    # str fields and the flag-off path never call the model
    llm = _LLM('{"value": "x"}')
    monkeypatch.setattr("services.lc_providers.get_chat_llm_with_fallback", lambda **_k: llm)
    assert await oq.coerce_answer_llm({"id": "notes", "type": "str"}, "anything") is None
    from config import settings
    monkeypatch.setattr(settings, "intake_llm_coerce_enabled", False)
    assert await oq.coerce_answer_llm(_YES_NO, "Partly") is None
    assert llm.calls == 0
