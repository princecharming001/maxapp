"""Provider-outage failsafes (2026-09-22 incident).

A retired Gemini model (404), an OpenAI account with no credits (429) and a
dead network must never reach the user as "i don't have that in the course
material yet." — and must fail over to the next vendor.
"""

from __future__ import annotations

import asyncio

import pytest

from services import provider_health as ph
from services.llm_outage import (
    OUTAGE_REPLY,
    OUTAGE_REPLY_TIMEOUT,
    LLMOutage,
    as_outage,
    classify_llm_error,
    is_provider_error,
    outage_reply_for,
)


@pytest.fixture(autouse=True)
def _reset_health():
    ph.reset()
    yield
    ph.reset()


# ---------------------------------------------------------------------------
# classification
# ---------------------------------------------------------------------------

class _Err(Exception):
    pass


@pytest.mark.parametrize("msg,kind", [
    ("404 This model models/gemini-2.5-flash-lite is no longer available to new users. "
     "Please update your code to use models/gemini-3.5-flash-lite", "not_found"),
    ("Error code: 429 - {'error': {'message': 'You have no credits remaining.', 'type': 'insufficient_quota'}}", "quota"),
    ("403 Method doesn't allow unregistered callers", "auth"),
    ("This model is not available in your subscription tier tier_not_allowed", "auth"),
    ("503 Service Unavailable", "unavailable"),
    ("ConnectError: [Errno 61] Connection refused", "network"),
    ("KeyError: 'x'", "unknown"),
])
def test_classify_llm_error(msg, kind):
    assert classify_llm_error(_Err(msg)) == kind


def test_classify_timeouts_and_vendor_types():
    assert classify_llm_error(asyncio.TimeoutError()) == "timeout"
    assert classify_llm_error(TimeoutError()) == "timeout"
    from google.api_core import exceptions as g

    assert classify_llm_error(g.NotFound("models/x is not found for API version v1beta")) == "not_found"
    assert is_provider_error(g.NotFound("x"))
    assert is_provider_error(LLMOutage())
    assert not is_provider_error(KeyError("x"))


def test_outage_copy_never_names_a_vendor():
    for copy in (OUTAGE_REPLY, OUTAGE_REPLY_TIMEOUT):
        low = copy.lower()
        for banned in ("gemini", "openai", "anthropic", "quota", "api", "billing", "key", "course material"):
            assert banned not in low, (banned, copy)
    assert outage_reply_for(asyncio.TimeoutError()) == OUTAGE_REPLY_TIMEOUT
    assert outage_reply_for(_Err("429 quota")) == OUTAGE_REPLY
    wrapped = as_outage(_Err("429 no credits"), provider="openai")
    assert wrapped.kind == "quota" and wrapped.provider == "openai"
    assert as_outage(wrapped) is wrapped


# ---------------------------------------------------------------------------
# provider_health: breakers + gemini remap
# ---------------------------------------------------------------------------

def test_hard_failure_opens_breaker_and_reorders_chain():
    assert ph.healthy_first(["gemini", "claude", "openai"]) == ["gemini", "claude", "openai"]
    ph.record_failure("gemini", "quota", model="gemini-3.5-flash-lite", error_text="429")
    assert ph.is_open("gemini")
    assert ph.healthy_first(["gemini", "claude", "openai"]) == ["claude", "openai", "gemini"]
    snap = ph.snapshot()["breakers"]["gemini"]
    assert snap["open"] and snap["last_kind"] == "quota" and snap["models"] == {"gemini-3.5-flash-lite": "quota"}


def test_soft_failures_need_a_streak_and_success_resets():
    ph.record_failure("openai", "timeout")
    ph.record_failure("openai", "timeout")
    assert not ph.is_open("openai")
    ph.record_success("openai")
    ph.record_failure("openai", "timeout")
    ph.record_failure("openai", "timeout")
    assert not ph.is_open("openai")
    ph.record_failure("openai", "timeout")
    assert ph.is_open("openai")


def test_gemini_remap_from_google_hint_and_static_alias():
    hint = ("404 This model models/gemini-2.5-flash-lite is no longer available to new users. "
            "Please update your code to use models/gemini-3.5-flash-lite for the latest features")
    assert ph.note_gemini_model_failure("gemini-2.5-flash-lite", hint) == "gemini-3.5-flash-lite"
    assert ph.resolve_gemini_model("gemini-2.5-flash-lite") == "gemini-3.5-flash-lite"
    assert ph.resolve_gemini_model("models/gemini-2.5-flash-lite") == "gemini-3.5-flash-lite"
    # untouched models resolve to themselves
    assert ph.resolve_gemini_model("gemini-2.5-flash") == "gemini-2.5-flash"
    # no hint in the text → static alias table
    assert ph.note_gemini_model_failure("gemini-2.5-pro", "404 models/gemini-2.5-pro is not found for API version v1beta") == "gemini-3.1-pro-preview"
    # unknown model, no hint → nothing learned
    assert ph.note_gemini_model_failure("gemini-9-ultra", "404 not found") is None
    assert ph.gemini_remaps() == {"gemini-2.5-flash-lite": "gemini-3.5-flash-lite", "gemini-2.5-pro": "gemini-3.1-pro-preview"}


def test_observe_failure_remaps_instead_of_opening_gemini_breaker():
    from google.api_core import exceptions as g

    err = g.NotFound("This model models/gemini-2.5-flash-lite is no longer available to new users. "
                     "Please update your code to use models/gemini-3.5-flash-lite")
    ph.observe_failure("gemini", "gemini-2.5-flash-lite", err)
    # the provider is fine — only the model name was stale
    assert not ph.is_open("gemini")
    assert ph.resolve_gemini_model("gemini-2.5-flash-lite") == "gemini-3.5-flash-lite"
    # a quota error on the same provider DOES open it
    ph.observe_failure("gemini", "gemini-3.5-flash-lite", g.ResourceExhausted("429 quota"))
    assert ph.is_open("gemini")


@pytest.mark.asyncio
async def test_langchain_callback_records_by_tag():
    cb = ph.ProviderHealthCallback()
    from google.api_core import exceptions as g

    await cb.on_llm_error(g.PermissionDenied("403 key"), run_id=None, tags=ph.provider_tags("gemini", "gemini-3.5-flash"))
    assert ph.is_open("gemini")
    await cb.on_llm_end(None, run_id=None, tags=ph.provider_tags("claude", "claude-haiku-4-5"))
    assert ph.snapshot()["breakers"]["claude"]["successes"] == 1


# ---------------------------------------------------------------------------
# lc_providers: fallback exceptions, chain composition
# ---------------------------------------------------------------------------

def test_fallback_exception_types_cover_not_found_and_auth():
    from google.api_core import exceptions as g
    import anthropic
    import openai

    from services.lc_providers import _LLM_FALLBACK_EXCEPTIONS as T

    for exc in (g.NotFound, g.PermissionDenied, g.InvalidArgument, g.ResourceExhausted,
                openai.NotFoundError, openai.AuthenticationError, openai.RateLimitError,
                anthropic.AuthenticationError, anthropic.RateLimitError, asyncio.TimeoutError):
        assert issubclass(exc, T), exc


def _keyed(monkeypatch, provider="gemini", **keys):
    from config import settings

    monkeypatch.setattr(settings, "llm_provider", provider)
    monkeypatch.setattr(settings, "gemini_api_key", keys.get("gemini", ""))
    monkeypatch.setattr(settings, "anthropic_api_key", keys.get("claude", ""))
    monkeypatch.setattr(settings, "openai_api_key", keys.get("openai", ""))
    monkeypatch.setattr(settings, "mistral_api_key", keys.get("mistral", ""))
    monkeypatch.setattr(settings, "hf_token", "")


def _chain_models(chain) -> list[str]:
    """Flatten a RunnableWithFallbacks into the ordered model names."""
    from langchain_core.runnables import RunnableBinding

    def _name(r):
        if isinstance(r, RunnableBinding):
            r = r.bound
        n = getattr(r, "model", None) or getattr(r, "model_name", None) or ""
        return n[len("models/"):] if n.startswith("models/") else n  # gemini prefixes its ids

    if hasattr(chain, "fallbacks"):
        return [_name(chain.runnable)] + [_name(f) for f in chain.fallbacks]
    return [_name(chain)]


def test_chain_includes_both_gemini_models_then_other_vendors(monkeypatch):
    from config import settings
    from services import lc_providers as lp

    _keyed(monkeypatch, "gemini", gemini="g", claude="c", openai="o")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_chat_model", "gemini-3.5-flash-lite")
    names = _chain_models(lp.get_chat_llm_with_fallback(max_tokens=16))
    assert names == ["gemini-3.5-flash-lite", "gemini-2.5-flash", settings.anthropic_model, settings.openai_model]


def test_chain_moves_open_provider_to_the_end(monkeypatch):
    from config import settings
    from services import lc_providers as lp

    _keyed(monkeypatch, "gemini", gemini="g", claude="c", openai="o")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_chat_model", "gemini-3.5-flash-lite")
    ph.record_failure("gemini", "quota")
    names = _chain_models(lp.get_chat_llm_with_fallback(max_tokens=16))
    assert names[:2] == [settings.anthropic_model, settings.openai_model]
    assert set(names[2:]) == {"gemini-3.5-flash-lite", "gemini-2.5-flash"}


def test_chain_applies_learned_gemini_remap(monkeypatch):
    from config import settings
    from services import lc_providers as lp

    _keyed(monkeypatch, "gemini", gemini="g", claude="c")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_chat_model", "gemini-2.5-flash-lite")
    ph.note_gemini_model_failure("gemini-2.5-flash-lite", "no longer available … use models/gemini-3.5-flash-lite")
    names = _chain_models(lp.get_chat_llm_with_fallback(max_tokens=16))
    assert names[0] == "gemini-3.5-flash-lite"
    json_names = _chain_models(lp.get_sync_json_llm(64))
    assert json_names == ["gemini-2.5-flash", settings.anthropic_model]


def test_single_keyed_provider_returns_bare_model(monkeypatch):
    from services import lc_providers as lp

    _keyed(monkeypatch, "claude", claude="c")
    chain = lp.get_chat_llm_with_fallback(max_tokens=16)
    assert not hasattr(chain, "fallbacks")
    assert _chain_models(chain) == [__import__("config").settings.anthropic_model]


@pytest.mark.asyncio
async def test_tool_chain_falls_over_on_not_found(monkeypatch):
    """End-to-end: primary raises NotFound → LangChain hands the call to the
    next bound model (tools stay bound on the fallback)."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    from langchain_core.tools import tool
    from google.api_core import exceptions as g
    from services import lc_providers as lp

    @tool
    def noop(x: str) -> str:
        """noop"""
        return x

    class Broken(FakeListChatModel):
        def _call(self, *a, **k):  # pragma: no cover - sync path unused
            raise g.NotFound("models/dead is no longer available")

        async def _acall(self, *a, **k):
            raise g.NotFound("models/dead is no longer available")

        def bind_tools(self, tools, **kwargs):
            return self

    class Healthy(FakeListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    monkeypatch.setattr(lp, "_try_build", lambda name, max_tokens, temperature=0.7: {
        "gemini": Broken(responses=["never"]), "claude": Healthy(responses=["fallback answer"]),
    }.get(name))
    monkeypatch.setattr(lp, "llm_provider", lambda: "gemini")
    monkeypatch.setattr(lp, "_gemini_chat_primary", lambda *a, **k: None)
    chain = lp.get_chat_llm_with_tools_and_fallback([noop], max_tokens=16)
    out = await chain.ainvoke("hi")
    assert out.content == "fallback answer"


# ---------------------------------------------------------------------------
# fast_rag: a failed answer is an outage, never the miss copy
# ---------------------------------------------------------------------------

class _DeadLLM:
    async def ainvoke(self, _messages):
        from google.api_core import exceptions as g

        raise g.NotFound("This model models/gemini-2.5-flash-lite is no longer available to new users.")


@pytest.mark.asyncio
async def test_answer_from_chunks_raises_outage_when_model_dies(monkeypatch):
    from services import fast_rag_answer as fr

    monkeypatch.setattr(fr, "get_chat_llm_with_fallback", lambda **_k: _DeadLLM())
    retrieved = [{"content": "use spf daily", "doc_title": "routines", "_maxx": "skinmax", "metadata": {}}]
    with pytest.raises(LLMOutage) as ei:
        await fr.answer_from_chunks(message="spf?", retrieved=retrieved, maxx_hints=["skinmax"])
    assert ei.value.kind == "not_found"


@pytest.mark.asyncio
async def test_answer_from_rag_propagates_outage_instead_of_miss_copy(monkeypatch):
    from services import fast_rag_answer as fr

    async def _evidence(**_k):
        return [{"content": "use spf daily", "doc_title": "routines", "_maxx": "skinmax", "metadata": {}}]

    monkeypatch.setattr(fr, "gather_rag_evidence", _evidence)
    monkeypatch.setattr(fr, "get_chat_llm_with_fallback", lambda **_k: _DeadLLM())
    with pytest.raises(LLMOutage):
        await fr.answer_from_rag(message="spf?", maxx_hints=["skinmax"])


@pytest.mark.asyncio
async def test_web_failsafe_outage_propagates_but_search_failure_degrades(monkeypatch):
    from services import fast_rag_answer as fr
    import services.web_search as ws

    async def _snips(_q, max_results=3):
        return "snippet one\n\nsnippet two"

    monkeypatch.setattr(ws, "search", _snips)
    monkeypatch.setattr(fr, "get_chat_llm_with_fallback", lambda **_k: _DeadLLM())
    with pytest.raises(LLMOutage):
        await fr._answer_from_web(message="new ingredient?")

    async def _boom(_q, max_results=3):
        raise RuntimeError("search vendor down")

    monkeypatch.setattr(ws, "search", _boom)
    assert await fr._answer_from_web(message="new ingredient?") == ""


@pytest.mark.asyncio
async def test_answer_from_rag_still_returns_miss_copy_for_genuine_miss(monkeypatch):
    """The strict miss copy survives — for a question nothing covers."""
    from services import fast_rag_answer as fr

    async def _none(**_k):
        return []

    async def _broad(_m, k_total=5):
        return []

    async def _no_web(**_k):
        return ""

    monkeypatch.setattr(fr, "gather_rag_evidence", _none)
    monkeypatch.setattr(fr, "_broad_fanout_retrieval", _broad)
    monkeypatch.setattr(fr, "_answer_from_web", _no_web)
    text, chunks = await fr.answer_from_rag(message="quantum knitting?", maxx_hints=["skinmax"])
    assert text == "i don't have that in the course material yet." and chunks == []


# ---------------------------------------------------------------------------
# chat.py: the friendly error is the outage copy
# ---------------------------------------------------------------------------

def test_friendly_llm_error_message_is_outage_copy():
    from api.chat import _friendly_llm_error_message

    assert _friendly_llm_error_message(_Err("429 insufficient_quota")) == OUTAGE_REPLY
    assert _friendly_llm_error_message(_Err("404 no longer available")) == OUTAGE_REPLY
    assert _friendly_llm_error_message(asyncio.TimeoutError()) == OUTAGE_REPLY_TIMEOUT


# ---------------------------------------------------------------------------
# startup probe
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_startup_check_learns_remap_from_probe(monkeypatch):
    from config import settings
    from services import llm_startup_check as sc

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(settings, "gemini_chat_model", "gemini-2.5-flash-lite")
    monkeypatch.setattr(settings, "anthropic_api_key", "c")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "mistral_api_key", "")
    monkeypatch.setattr(settings, "hf_token", "")
    monkeypatch.setattr(settings, "llm_provider", "gemini")

    class _Resp:
        def __init__(self, code, text=""):
            self.status_code, self.text = code, text

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            assert url.endswith(":generateContent"), url  # metadata GET is not a valid probe
            if "/gemini-2.5-flash-lite:" in url:
                return _Resp(404, "This model models/gemini-2.5-flash-lite is no longer available to new users. "
                                  "Please update your code to use models/gemini-3.5-flash-lite")
            return _Resp(200, "{}")

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    report = await sc.run_llm_startup_check()
    assert report["gemini"]["gemini-2.5-flash"] == {"status": "ok"}
    assert report["gemini"]["gemini-2.5-flash-lite"]["remapped_to"] == "gemini-3.5-flash-lite"
    assert report["gemini"]["gemini-2.5-flash-lite"]["remap_status"] == "ok"
    assert ph.resolve_gemini_model("gemini-2.5-flash-lite") == "gemini-3.5-flash-lite"
    assert "startup" in ph.snapshot()
    assert report["problems"] == []


@pytest.mark.asyncio
async def test_reply_with_outage_reshows_pending_question(monkeypatch):
    """A failed turn mid-intake returns the outage line PLUS the parked
    question and its chips, and persists user + assistant rows."""
    from uuid import uuid4

    import api.chat as chat

    async def _pending(_uid, _db):
        return ("what're you working with up top?", ["Straight, no curl", "Wavy, loose bends"], False)

    monkeypatch.setattr(chat, "_pending_question_for_current_thread", _pending)

    class _DB:
        def __init__(self):
            self.rows = []
            self.committed = False

        async def rollback(self):
            pass

        def add(self, row):
            self.rows.append(row)

        async def commit(self):
            self.committed = True

    db = _DB()
    text, choices = await chat._reply_with_outage(
        _Err("404 no longer available"), user_id=str(uuid4()), user_uuid=uuid4(), channel="app", db=db,
        persist_user_message="is minoxidil safe?",
    )
    assert text.startswith(OUTAGE_REPLY)
    assert "where we left off: what're you working with up top?" in text
    assert choices == ["Straight, no curl", "Wavy, loose bends"]
    assert [r.role for r in db.rows] == ["user", "assistant"] and db.committed
    assert "course material" not in text

    async def _none(_uid, _db):
        return None

    monkeypatch.setattr(chat, "_pending_question_for_current_thread", _none)
    db2 = _DB()
    text2, choices2 = await chat._reply_with_outage(
        _Err("429 quota"), user_id=str(uuid4()), user_uuid=uuid4(), channel="app", db=db2,
    )
    assert text2 == OUTAGE_REPLY and choices2 == [] and [r.role for r in db2.rows] == ["assistant"]
