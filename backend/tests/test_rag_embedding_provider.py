"""Embedding provider switch + circuit breaker in services.rag_service.

No network: openai.AsyncOpenAI (imported lazily by rag_service) and
httpx.AsyncClient.post are replaced with fakes, settings are patched per
test, and the module-level singletons (embed cache, OpenAI client,
provider_health breakers) are reset around every test.
"""

from __future__ import annotations

import asyncio
import logging
import types

import httpx
import openai
import pytest

from services import provider_health, rag_service
from services.rag_service import EmbeddingsUnavailable, embed_batch, embed_text, retrieve_chunks

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
DIM = 4


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    provider_health.reset()
    rag_service._EMBED_CACHE.clear()
    monkeypatch.setattr(rag_service, "_EMBEDDING_CLIENT", None)
    s = rag_service.settings
    monkeypatch.setattr(s, "rag_embedding_provider", "openai")
    monkeypatch.setattr(s, "rag_embedding_model", "text-embedding-3-small")
    monkeypatch.setattr(s, "gemini_embedding_model", "gemini-embedding-001")
    monkeypatch.setattr(s, "rag_embedding_dimensions", DIM)
    monkeypatch.setattr(s, "openai_api_key", "sk-test")
    monkeypatch.setattr(s, "gemini_api_key", "g-test")
    monkeypatch.setattr(s, "rag_hybrid_enabled", True)
    yield
    provider_health.reset()
    rag_service._EMBED_CACHE.clear()


def _install_openai(monkeypatch, *, vector=None, error=None):
    """Fake openai.AsyncOpenAI recording constructor kwargs + embeddings.create() calls."""
    calls: list[dict] = []
    ctor: dict = {}
    vector = list(vector or [1.0, 0.0, 0.0, 0.0])

    class _Embeddings:
        async def create(self, **kwargs):
            calls.append(kwargs)
            if error is not None:
                raise error
            n = len(kwargs["input"]) if isinstance(kwargs["input"], list) else 1
            return types.SimpleNamespace(
                data=[types.SimpleNamespace(embedding=list(vector)) for _ in range(n)]
            )

    class _FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            ctor.update(kwargs)
            self.embeddings = _Embeddings()

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeAsyncOpenAI)
    return calls, ctor


def _install_gemini(monkeypatch, *, vector=None, status=200, body=None, error=None):
    """Fake Gemini REST endpoint behind httpx.AsyncClient.post."""
    calls: list[dict] = []
    vector = list(vector or [0.0, 1.0, 0.0, 0.0])

    async def _fake_post(self, url, *, headers=None, json=None, **_kw):
        calls.append({"url": url, "headers": dict(headers or {}), "json": json})
        if error is not None:
            raise error
        req = httpx.Request("POST", url)
        if status != 200:
            return httpx.Response(status, request=req, json=body or {"error": {"code": status}})
        if url.endswith(":batchEmbedContents"):
            n = len((json or {}).get("requests") or [])
            return httpx.Response(
                200, request=req, json={"embeddings": [{"values": list(vector)} for _ in range(n)]}
            )
        return httpx.Response(200, request=req, json={"embedding": {"values": list(vector)}})

    monkeypatch.setattr(httpx.AsyncClient, "post", _fake_post)
    return calls


def _quota_error() -> openai.RateLimitError:
    """The production shape from 2026-09-22: 429 insufficient_quota, empty account."""
    req = httpx.Request("POST", "https://api.openai.com/v1/embeddings")
    return openai.RateLimitError(
        "Error code: 429 - {'error': {'message': 'You have no credits remaining. Add credits to "
        "continue using the API at https://platform.openai.com/settings/organization/billing/.', "
        "'type': 'insufficient_quota', 'param': None, 'code': 'credit_balance_exhausted'}}",
        response=httpx.Response(429, request=req),
        body=None,
    )


BM25_ROWS = [
    {
        "id": "routines:0:abc",
        "doc_title": "routines",
        "chunk_index": 0,
        "similarity": 0.9,
        "content": "adapalene at night",
        "metadata": {"source": "skinmax/routines.md", "section": "PM routine"},
    }
]


def _install_bm25(monkeypatch):
    calls: list[dict] = []

    async def _fake_bm25(**kwargs):
        calls.append(kwargs)
        return [dict(r) for r in BM25_ROWS]

    monkeypatch.setattr(rag_service, "_bm25_retrieve_chunks", _fake_bm25)
    return calls


# ---------------------------------------------------------------------------
# provider paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_openai_path_unchanged(monkeypatch):
    calls, ctor = _install_openai(monkeypatch, vector=[1.0, 0.0, 0.0, 0.0])
    vec = await embed_text("  acne at night ")
    assert vec == [1.0, 0.0, 0.0, 0.0]
    assert ctor == {"api_key": "sk-test", "timeout": 15.0}
    assert calls == [{"model": "text-embedding-3-small", "input": "acne at night", "dimensions": DIM}]
    # same text again: served from the cache, no second vendor call
    assert await embed_text("acne at night") == vec
    assert len(calls) == 1
    b = provider_health.snapshot()["breakers"]["openai-embeddings"]
    assert b["successes"] == 1 and b["open"] is False


@pytest.mark.asyncio
async def test_openai_embed_batch_unchanged(monkeypatch):
    calls, _ = _install_openai(monkeypatch)
    out = await embed_batch(["a", "", "b"])
    assert len(out) == 2
    # one list-input call, no bootstrap single-text embed
    assert calls == [{"model": "text-embedding-3-small", "input": ["a", "b"], "dimensions": DIM}]


@pytest.mark.asyncio
async def test_gemini_embed_text_builds_request_and_parses_values(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    calls = _install_gemini(monkeypatch, vector=[3.0, 4.0, 0.0, 0.0])
    vec = await embed_text("acne at night")
    # truncated Gemini outputs are not unit length; the service normalises them
    assert vec == pytest.approx([0.6, 0.8, 0.0, 0.0])
    assert len(calls) == 1
    call = calls[0]
    assert call["url"] == f"{GEMINI_BASE}/models/gemini-embedding-001:embedContent"
    assert call["headers"]["x-goog-api-key"] == "g-test"
    assert call["json"] == {
        "content": {"parts": [{"text": "acne at night"}]},
        "taskType": "RETRIEVAL_QUERY",
        "outputDimensionality": DIM,
    }
    assert rag_service._EMBEDDING_CLIENT is None  # OpenAI client never built
    b = provider_health.snapshot()["breakers"]["gemini-embeddings"]
    assert b["successes"] == 1 and b["open"] is False


@pytest.mark.asyncio
async def test_gemini_embed_batch_uses_batch_endpoint_and_chunks_at_96(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    calls = _install_gemini(monkeypatch)
    texts = [f"chunk {i}" for i in range(100)]
    out = await embed_batch(texts)
    assert len(out) == 100
    assert [len(c["json"]["requests"]) for c in calls] == [96, 4]
    for c in calls:
        assert c["url"] == f"{GEMINI_BASE}/models/gemini-embedding-001:batchEmbedContents"
        assert c["headers"]["x-goog-api-key"] == "g-test"
    assert calls[0]["json"]["requests"][0] == {
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": "chunk 0"}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": DIM,
    }
    # a larger caller batch size is still clamped to the Gemini limit
    calls.clear()
    await embed_batch(texts, batch_size=500)
    assert [len(c["json"]["requests"]) for c in calls] == [96, 4]


@pytest.mark.asyncio
async def test_gemini_wrong_dims_is_rejected(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    _install_gemini(monkeypatch, vector=[1.0, 2.0, 3.0])  # 3 dims, settings say 4
    with pytest.raises(RuntimeError, match="returned 3 dims, expected 4"):
        await embed_text("acne at night")


@pytest.mark.asyncio
async def test_cache_key_includes_provider(monkeypatch):
    oa_calls, _ = _install_openai(monkeypatch, vector=[1.0, 0.0, 0.0, 0.0])
    g_calls = _install_gemini(monkeypatch, vector=[0.0, 1.0, 0.0, 0.0])
    assert await embed_text("same text") == [1.0, 0.0, 0.0, 0.0]
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    # the flip must NOT serve the cached OpenAI vector
    assert await embed_text("same text") == [0.0, 1.0, 0.0, 0.0]
    assert len(oa_calls) == 1 and len(g_calls) == 1
    assert {k.split("|")[0] for k in rag_service._EMBED_CACHE} == {"openai", "gemini"}
    # and flipping back finds the OpenAI entry again
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "openai")
    assert await embed_text("same text") == [1.0, 0.0, 0.0, 0.0]
    assert len(oa_calls) == 1


# ---------------------------------------------------------------------------
# breaker
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_quota_error_opens_breaker_and_retrieve_falls_back_to_bm25(monkeypatch, caplog):
    caplog.set_level(logging.DEBUG, logger="services.rag_service")
    calls, _ = _install_openai(monkeypatch, error=_quota_error())
    bm25_calls = _install_bm25(monkeypatch)

    # First turn: pays the vendor round trip once, logs ONE warning, opens the breaker.
    rows = await retrieve_chunks(None, "skinmax", "what should i do for acne at night", k=3, min_similarity=0.0)
    assert rows == BM25_ROWS
    assert len(calls) == 1
    assert provider_health.is_open("openai-embeddings")
    warnings = [
        r for r in caplog.records
        if r.levelno == logging.WARNING and "RAG hybrid retrieve failed" in r.getMessage()
    ]
    assert len(warnings) == 1 and "insufficient_quota" in warnings[0].getMessage()

    # Every later turn inside the window: no vendor call, nothing above DEBUG, BM25 still answers.
    caplog.clear()
    rows = await retrieve_chunks(None, "skinmax", "does adapalene help acne", k=3, min_similarity=0.0)
    assert rows == BM25_ROWS
    assert len(calls) == 1
    assert len(bm25_calls) == 2
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    debug = [r for r in caplog.records if r.levelno == logging.DEBUG and "falling back to BM25" in r.getMessage()]
    assert len(debug) == 1 and "breaker open" in debug[0].getMessage()

    # Direct callers see the dedicated exception, still without a vendor call.
    with pytest.raises(EmbeddingsUnavailable):
        await embed_text("anything else")
    assert len(calls) == 1
    b = provider_health.snapshot()["breakers"]["openai-embeddings"]
    assert b["last_kind"] == "quota" and b["failures"] == 1


@pytest.mark.asyncio
async def test_gemini_quota_opens_its_own_breaker(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    calls = _install_gemini(
        monkeypatch,
        status=429,
        body={"error": {"code": 429, "message": "You exceeded your current quota", "status": "RESOURCE_EXHAUSTED"}},
    )
    with pytest.raises(Exception) as ei:
        await embed_text("acne at night")
    assert not isinstance(ei.value, EmbeddingsUnavailable)
    assert "429" in str(ei.value)
    assert provider_health.is_open("gemini-embeddings")
    assert not provider_health.is_open("openai-embeddings")
    with pytest.raises(EmbeddingsUnavailable):
        await embed_text("acne at night")
    assert len(calls) == 1
    assert provider_health.snapshot()["breakers"]["gemini-embeddings"]["last_kind"] == "quota"


@pytest.mark.asyncio
async def test_gemini_timeouts_open_breaker_after_soft_streak(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    calls = _install_gemini(monkeypatch, error=httpx.ReadTimeout("timed out"))
    for n in (1, 2):
        with pytest.raises(httpx.ReadTimeout):
            await embed_text(f"q{n}")
        assert not provider_health.is_open("gemini-embeddings")
    with pytest.raises(httpx.ReadTimeout):
        await embed_text("q3")
    assert provider_health.is_open("gemini-embeddings")
    assert len(calls) == 3
    with pytest.raises(EmbeddingsUnavailable):
        await embed_batch(["q4"])
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_breaker_retries_vendor_after_cooldown(monkeypatch):
    monkeypatch.setattr(provider_health, "OPEN_HARD_S", 0.05)
    calls, _ = _install_openai(monkeypatch, error=_quota_error())
    with pytest.raises(openai.RateLimitError):
        await embed_text("q1")
    with pytest.raises(EmbeddingsUnavailable):
        await embed_text("q2")
    assert len(calls) == 1
    await asyncio.sleep(0.1)
    with pytest.raises(openai.RateLimitError):  # cooldown over: the vendor is tried again
        await embed_text("q3")
    assert len(calls) == 2


# ---------------------------------------------------------------------------
# configuration errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_key_is_a_config_error_not_a_breaker_event(monkeypatch):
    oa_calls, _ = _install_openai(monkeypatch)
    g_calls = _install_gemini(monkeypatch)
    monkeypatch.setattr(rag_service.settings, "openai_api_key", "")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY") as ei:
        await embed_text("acne at night")
    assert not isinstance(ei.value, EmbeddingsUnavailable)

    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "gemini")
    monkeypatch.setattr(rag_service.settings, "gemini_api_key", "  ")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY") as ei:
        await embed_batch(["acne at night"])
    assert not isinstance(ei.value, EmbeddingsUnavailable)

    assert oa_calls == [] and g_calls == []
    assert provider_health.snapshot()["breakers"] == {}


@pytest.mark.asyncio
async def test_unknown_provider_rejected(monkeypatch):
    monkeypatch.setattr(rag_service.settings, "rag_embedding_provider", "cohere")
    with pytest.raises(RuntimeError, match="RAG_EMBEDDING_PROVIDER"):
        await embed_text("acne at night")
