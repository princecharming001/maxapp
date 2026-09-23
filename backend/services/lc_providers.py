"""
LangChain LLM provider factory — single source of truth for ALL LLM access.

No direct google.generativeai / openai / mistralai SDK imports anywhere else.
Everything goes through these builders.

Supports four providers via LLM_PROVIDER env var:
  huggingface — Hugging Face Dedicated Inference Endpoint (default, model="tgi"
                 via OpenAI compat layer — used for the fine-tuned Looksmaxxing
                 chat model). No automatic fallback to other providers: the
                 whole point of using a custom fine-tune is to USE it.
  gemini   — Google Gemini (still used for vision / face scans)
  openai   — OpenAI GPT (still used for vision / face scans)
  mistral  — Mistral AI

Public API:
  get_primary_llm()                         — primary provider, no fallback
  get_chat_llm_with_fallback()              — primary + fallback chain (plain, no tools)
  get_chat_llm_with_tools_and_fallback()    — primary + fallback chain, tools bound to EACH
                                              provider before chaining (fixes the bind_tools bug)
  get_sync_json_llm()                       — synchronous, JSON-mode LLM for asyncio.to_thread
  get_sync_plain_llm()                      — synchronous plain-text LLM for asyncio.to_thread
  get_vision_llm()                          — multimodal LLM for image analysis (vision)

Fallback priority (when keys are available; a provider whose circuit breaker
is open is moved to the end of its chain — see services/provider_health.py):
  primary=huggingface → (none — fine-tuned custom model, no silent failover)
  primary=gemini      → claude → openai → mistral
  primary=claude      → gemini → openai → mistral
  primary=openai      → gemini → claude → mistral
  primary=mistral     → gemini → claude → openai

Timeout:
  LLM_TIMEOUT_SECONDS controls per-provider HTTP timeout. Default: 25 s.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from config import settings
from services.llm_provider import llm_provider
from services.provider_health import (
    HEALTH_CALLBACKS,
    healthy_first,
    provider_tags,
    resolve_gemini_model,
)

logger = logging.getLogger(__name__)


def _disable_gemini_internal_retries() -> None:
    """
    langchain-google-genai's `_create_retry_decorator` hardcodes max_retries=2
    with 1-60s exponential backoff (chat_models.py:140-155). On 429 / quota
    errors that adds 5-15s of dead time per call BEFORE our llm_router can
    fail over to OpenAI. Replace the decorator with a no-op so failures
    surface immediately and fallback fires fast.
    """
    try:
        from langchain_google_genai import chat_models as _gm

        def _noop_retry_decorator():
            def _identity(fn):
                return fn
            return _identity

        _gm._create_retry_decorator = _noop_retry_decorator
        logger.info("[lc_providers] disabled langchain-google-genai internal retry loop")
    except Exception as e:  # pragma: no cover — patch is best-effort
        logger.warning("[lc_providers] could not patch gemini retry: %s", e)


_disable_gemini_internal_retries()


def _llm_fallback_exception_types() -> tuple[type[BaseException], ...]:
    """
    Exceptions that should trigger trying the next LLM provider.

    Intentionally excludes broad ``Exception`` so programming errors surface
    instead of being masked by fallback. Network / quota / transient API
    failures from common HTTP + vendor SDKs are included.
    """
    types_list: list[type[BaseException]] = []
    try:
        import httpx

        types_list.extend(
            (
                httpx.HTTPStatusError,
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.WriteTimeout,
                httpx.ConnectTimeout,
                httpx.RemoteProtocolError,
                httpx.PoolTimeout,
            )
        )
    except Exception:
        pass
    try:
        from openai import APIConnectionError, APITimeoutError, RateLimitError

        types_list.extend((APIConnectionError, APITimeoutError, RateLimitError))
    except Exception:
        pass
    try:
        from openai import InternalServerError as OpenAIInternalServerError

        types_list.append(OpenAIInternalServerError)
    except Exception:
        pass
    try:
        from google.api_core import exceptions as google_api_exceptions

        for _name in (
            "ResourceExhausted",
            "DeadlineExceeded",
            "ServiceUnavailable",
            "TooManyRequests",
            "Aborted",
            "InternalServerError",
        ):
            _exc = getattr(google_api_exceptions, _name, None)
            if _exc is not None:
                types_list.append(_exc)
    except Exception:
        pass
    # 2026-09-22: a retired Gemini model (404 NotFound) was NOT in this list,
    # so the chain never fired and every chat turn failed for 20 hours. Any
    # error the vendor SDK raises for a call — not found, permission denied,
    # invalid argument, auth — means "this provider cannot answer right now";
    # the next provider must get the turn. Vendor BASE classes cover them all.
    try:
        import httpx

        types_list.append(httpx.HTTPError)
    except Exception:
        pass
    try:
        from google.api_core import exceptions as google_api_exceptions

        types_list.append(google_api_exceptions.GoogleAPICallError)
    except Exception:
        pass
    try:
        from langchain_google_genai._common import GoogleGenerativeAIError

        types_list.append(GoogleGenerativeAIError)
    except Exception:
        pass
    try:
        import openai

        types_list.append(openai.APIError)
    except Exception:
        pass
    try:
        import anthropic

        types_list.append(anthropic.APIError)
    except Exception:
        pass
    try:
        from mistralai.models import SDKError as _MistralSDKError

        types_list.append(_MistralSDKError)
    except Exception:
        pass
    import asyncio as _asyncio

    types_list.extend((_asyncio.TimeoutError, TimeoutError))
    if not types_list:
        return (Exception,)
    # de-dupe, keep order
    seen: set[type[BaseException]] = set()
    uniq: list[type[BaseException]] = []
    for t in types_list:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return tuple(uniq)


_LLM_FALLBACK_EXCEPTIONS = _llm_fallback_exception_types()


# ---------------------------------------------------------------------------
# Per-provider builders
# ---------------------------------------------------------------------------

def _build_gemini_llm(
    max_tokens: int, temperature: float = 0.7, model_override: Optional[str] = None
) -> BaseChatModel:
    from langchain_google_genai import ChatGoogleGenerativeAI

    key = (settings.gemini_api_key or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")

    # resolve_gemini_model applies any runtime remap learned from a "no longer
    # available … use models/<x>" 404 (services.provider_health).
    model = resolve_gemini_model(
        (model_override or settings.gemini_model or "gemini-2.5-flash").strip()
    )
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=key,
        max_output_tokens=max_tokens,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
        # Disable LangChain's internal retry loop. llm_router does provider-level
        # failover (gemini → openai), so per-call retries just add 30-90s of dead
        # time on quota / 429 errors before the fallback fires.
        max_retries=0,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("gemini", model),
    )


def _gemini_chat_primary(max_tokens: int, temperature: float = 0.7) -> Optional[BaseChatModel]:
    """The latency-tuned gemini used for the CONVERSATIONAL chat paths only.

    settings.gemini_chat_model (default flash-lite: thinking off, much faster
    end-to-end) — schedule/JSON generation keeps settings.gemini_model. Returns
    None when no distinct chat model is configured.
    """
    chat_model = (settings.gemini_chat_model or "").strip()
    if not chat_model or chat_model == (settings.gemini_model or "").strip():
        return None
    try:
        return _build_gemini_llm(max_tokens, temperature=temperature, model_override=chat_model)
    except Exception as e:
        logger.warning("[lc_providers] gemini chat-model build failed (%s); using default", e)
        return None


def _build_openai_llm(max_tokens: int, temperature: float = 0.7) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    key = (settings.openai_api_key or "").strip()
    if not key:
        raise ValueError("OPENAI_API_KEY is not set")

    model = (settings.openai_model or "gpt-4o-mini").strip()
    return ChatOpenAI(
        model=model,
        api_key=key,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("openai", model),
    )


def _build_hf_llm(max_tokens: int, temperature: float = 0.7) -> BaseChatModel:
    """Hugging Face Dedicated Inference Endpoint via OpenAI compat layer.

    The endpoint exposes /v1/chat/completions with model name "tgi"; auth is
    a bearer HF_TOKEN. We reuse ChatOpenAI by overriding base_url so all
    LangChain orchestration (tool binding, structured output, fallbacks)
    keeps working unchanged.
    """
    from langchain_openai import ChatOpenAI

    key = (settings.hf_token or "").strip()
    if not key:
        raise ValueError("HF_TOKEN is not set")

    base_url = (settings.hf_endpoint_url or "").strip()
    if not base_url:
        raise ValueError("HF_ENDPOINT_URL is not set")

    model = (settings.hf_model or "tgi").strip()
    return ChatOpenAI(
        model=model,
        api_key=key,
        base_url=base_url,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("huggingface", model),
    )


def _build_claude_llm(max_tokens: int, temperature: float = 0.7) -> BaseChatModel:
    from langchain_anthropic import ChatAnthropic

    key = (settings.anthropic_api_key or "").strip()
    if not key:
        raise ValueError("ANTHROPIC_API_KEY is not set")

    model = (settings.anthropic_model or "claude-haiku-4-5").strip()
    return ChatAnthropic(
        model=model,
        api_key=key,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("claude", model),
    )


def _build_mistral_llm(max_tokens: int, temperature: float = 0.7) -> BaseChatModel:
    from langchain_mistralai import ChatMistralAI

    key = (settings.mistral_api_key or "").strip()
    if not key:
        raise ValueError("MISTRAL_API_KEY is not set")

    model = (settings.mistral_model or "mistral-large-latest").strip()
    return ChatMistralAI(
        model=model,
        mistral_api_key=key,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("mistral", model),
    )


# ---------------------------------------------------------------------------
# Provider registry — ordered fallback chains per primary
# ---------------------------------------------------------------------------

_BUILDERS = {
    "huggingface": _build_hf_llm,
    "gemini":      _build_gemini_llm,
    "openai":      _build_openai_llm,
    "mistral":     _build_mistral_llm,
    "claude":      _build_claude_llm,
}

_FALLBACK_ORDER: dict[str, list[str]] = {
    # Custom fine-tuned model: never silently fall back to a different model.
    "huggingface": [],
    # Every keyed provider backs every other one. A provider without a key is
    # skipped at build time; a provider whose breaker is open is moved to the
    # END of the chain (services.provider_health.healthy_first) so a dead
    # vendor stops eating the timeout on every turn.
    "gemini":  ["claude", "openai", "mistral"],
    "claude":  ["openai", "gemini", "mistral"],
    "openai":  ["gemini", "claude", "mistral"],
    "mistral": ["gemini", "claude", "openai"],
}


def _try_build(provider: str, max_tokens: int, temperature: float = 0.7) -> Optional[BaseChatModel]:
    """Attempt to build a provider LLM; return None if the key is missing."""
    try:
        return _BUILDERS[provider](max_tokens, temperature=temperature)
    except ValueError as e:
        # "…_API_KEY is not set" — expected for providers without a key; a
        # per-turn WARNING here was pure log noise.
        logger.debug("[lc_providers] provider=%s skipped: %s", provider, e)
        return None
    except Exception as e:
        logger.warning("[lc_providers] build failed for provider=%s: %s", provider, e)
        return None


def _build_fallback_list(
    primary_name: str, max_tokens: int, temperature: float = 0.7
) -> List[tuple[str, BaseChatModel]]:
    """All available fallback LLMs as (provider, llm) in priority order
    (primary excluded; providers without a key are skipped)."""
    fallbacks: List[tuple[str, BaseChatModel]] = []
    for candidate in _FALLBACK_ORDER.get(primary_name, []):
        if candidate == primary_name:
            continue
        llm = _try_build(candidate, max_tokens, temperature=temperature)
        if llm is not None:
            fallbacks.append((candidate, llm))
    return fallbacks


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_primary_llm(max_tokens: int = 768, temperature: float = 0.7) -> BaseChatModel:
    """Return the primary LLM configured by LLM_PROVIDER. No fallback."""
    provider = llm_provider()
    llm = _try_build(provider, max_tokens, temperature=temperature)
    if llm is None:
        if provider == "huggingface":
            hint = "Set HF_TOKEN and HF_ENDPOINT_URL in your .env."
        elif provider == "openai":
            hint = "Set OPENAI_API_KEY in your .env."
        elif provider == "gemini":
            hint = "Set GEMINI_API_KEY in your .env."
        elif provider == "mistral":
            hint = "Set MISTRAL_API_KEY in your .env."
        else:
            hint = f"Set credentials for provider {provider!r} in your .env."
        raise ValueError(
            f"LLM_PROVIDER={provider!r} but the corresponding API key is not set. "
            f"{hint}"
        )
    return llm


def _build_chain(
    *,
    max_tokens: int,
    temperature: float,
    tools: Optional[Sequence[BaseTool]] = None,
    chat_tuned: bool = False,
) -> BaseChatModel:
    """Primary + every keyed fallback, ordered healthy-first.

    When the primary is gemini and a distinct chat model is configured, BOTH
    gemini models ride in the chain (chat model first, the default quality
    model right behind it) — a retired/quota'd chat model then fails over to
    a sibling model before leaving the vendor at all.
    """
    primary_name = llm_provider()
    # Raises the configuration error verbatim when the primary has no key.
    primary = get_primary_llm(max_tokens, temperature=temperature)
    entries: list[tuple[str, BaseChatModel]] = [(primary_name, primary)]
    if primary_name == "gemini" and chat_tuned:
        chat_llm = _gemini_chat_primary(max_tokens, temperature=temperature)
        if chat_llm is not None:
            entries.insert(0, (primary_name, chat_llm))
    entries.extend(_build_fallback_list(primary_name, max_tokens, temperature=temperature))

    order = healthy_first([n for n, _ in entries])
    # Stable re-order: keep sibling order inside a provider.
    ordered: list[BaseChatModel] = []
    for name in dict.fromkeys(order):
        ordered.extend(llm for n, llm in entries if n == name)

    if tools is not None:
        # IMPORTANT: tools are bound to EACH provider BEFORE chaining. Calling
        # .bind_tools() on a with_fallbacks() wrapper only binds the outermost
        # model — fallbacks would run without tools and could not emit calls.
        ordered = [llm.bind_tools(tools) for llm in ordered]

    head, rest = ordered[0], ordered[1:]
    if not rest:
        logger.warning(
            "[lc_providers] No fallback providers available (only %s key is set).",
            primary_name,
        )
        return head
    logger.debug("[lc_providers] chain: %s", " → ".join(dict.fromkeys(order)))
    return head.with_fallbacks(rest, exceptions_to_handle=_LLM_FALLBACK_EXCEPTIONS)


def get_chat_llm_with_fallback(max_tokens: int = 768, temperature: float = 0.7) -> BaseChatModel:
    """
    Return the primary LLM with available fallback(s) registered via
    LangChain's native .with_fallbacks(). Use for plain text generation
    (Pass 2, coaching chains) where tool binding is NOT required.
    """
    return _build_chain(max_tokens=max_tokens, temperature=temperature, chat_tuned=True)


def get_chat_llm_with_tools_and_fallback(
    tools: Sequence[BaseTool],
    max_tokens: int = 768,
) -> BaseChatModel:
    """
    Return a tool-calling LLM with fallback for the agent's tool-calling step.

    Tools are bound to each provider individually, then chained:
    primary_with_tools.with_fallbacks([fallback_with_tools, ...]).
    """
    return _build_chain(max_tokens=max_tokens, temperature=0.7, tools=tools, chat_tuned=True)


# ---------------------------------------------------------------------------
# Sync LLM factories — for use inside asyncio.to_thread (schedule gen, coaching)
# ---------------------------------------------------------------------------

def get_sync_json_llm(max_tokens: int = 4096) -> BaseChatModel:
    """
    JSON-mode LLM for schedule generation / adaptation / plan building.
    Call via asyncio.to_thread(lambda: get_sync_json_llm().invoke(prompt)).

    Returns the primary provider's JSON-mode model with every other keyed
    provider's JSON-mode model as a fallback (healthy-first order), so an
    onboarding intake that has just collected ten answers never dies on one
    vendor's retired model / quota. Providers are skipped when their key is
    missing; the primary alone is returned when nothing else is keyed.
    """
    primary = llm_provider()
    names = [primary] + [n for n in _FALLBACK_ORDER.get(primary, []) if n != primary]
    entries: list[tuple[str, BaseChatModel]] = []
    for name in names:
        try:
            entries.append((name, _build_json_llm(name, max_tokens)))
        except ValueError as e:
            logger.debug("[lc_providers] json provider=%s skipped: %s", name, e)
        except Exception as e:  # noqa: BLE001
            logger.warning("[lc_providers] json build failed for provider=%s: %s", name, e)
    if not entries:
        # Re-raise the primary's own configuration error verbatim.
        return _build_json_llm(primary, max_tokens)
    order = healthy_first([n for n, _ in entries])
    by = dict(entries)
    ordered = [by[n] for n in dict.fromkeys(order) if n in by]
    head, rest = ordered[0], ordered[1:]
    if not rest:
        return head
    return head.with_fallbacks(rest, exceptions_to_handle=_LLM_FALLBACK_EXCEPTIONS)


def _build_json_llm(provider: str, max_tokens: int) -> BaseChatModel:
    """One provider's JSON-mode model (raises ValueError when its key is missing)."""
    if provider == "huggingface":
        from langchain_openai import ChatOpenAI
        key = (settings.hf_token or "").strip()
        if not key:
            raise ValueError("HF_TOKEN is not set")
        _hf_model = (settings.hf_model or "tgi").strip()
        return ChatOpenAI(
            model=_hf_model,
            api_key=key,
            base_url=(settings.hf_endpoint_url or "").strip(),
            max_tokens=max_tokens,
            temperature=0.2,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
            model_kwargs={"response_format": {"type": "json_object"}},
            callbacks=HEALTH_CALLBACKS,
            tags=provider_tags("huggingface", _hf_model),
        )
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        key = (settings.openai_api_key or "").strip()
        if not key:
            raise ValueError("OPENAI_API_KEY is not set")
        _oa_model = (settings.openai_model or "gpt-4o-mini").strip()
        return ChatOpenAI(
            model=_oa_model,
            api_key=key,
            max_tokens=max_tokens,
            temperature=0.2,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
            model_kwargs={"response_format": {"type": "json_object"}},
            callbacks=HEALTH_CALLBACKS,
            tags=provider_tags("openai", _oa_model),
        )
    if provider == "mistral":
        from langchain_mistralai import ChatMistralAI
        key = (settings.mistral_api_key or "").strip()
        if not key:
            raise ValueError("MISTRAL_API_KEY is not set")
        _mi_model = (settings.mistral_model or "mistral-large-latest").strip()
        return ChatMistralAI(
            model=_mi_model,
            mistral_api_key=key,
            max_tokens=max_tokens,
            temperature=0.2,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
            model_kwargs={"response_format": {"type": "json_object"}},
            callbacks=HEALTH_CALLBACKS,
            tags=provider_tags("mistral", _mi_model),
        )
    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        key = (settings.anthropic_api_key or "").strip()
        if not key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        # Claude follows JSON instructions in the prompt; no response_format kwarg.
        _cl_model = (settings.anthropic_model or "claude-haiku-4-5").strip()
        return ChatAnthropic(
            model=_cl_model,
            api_key=key,
            max_tokens=max_tokens,
            temperature=0.2,
            timeout=settings.llm_timeout_seconds,
            max_retries=0,
            callbacks=HEALTH_CALLBACKS,
            tags=provider_tags("claude", _cl_model),
        )
    from langchain_google_genai import ChatGoogleGenerativeAI
    key = (settings.gemini_api_key or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")
    _json_model = resolve_gemini_model((settings.gemini_model or "gemini-2.5-flash").strip())
    return ChatGoogleGenerativeAI(
        model=_json_model,
        google_api_key=key,
        max_output_tokens=max_tokens,
        temperature=0.2,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
        generation_config={"response_mime_type": "application/json"},
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("gemini", _json_model),
    )


def get_sync_plain_llm(max_tokens: int = 512) -> BaseChatModel:
    """Synchronous plain-text LLM (with fallbacks). Call via asyncio.to_thread."""
    return get_chat_llm_with_fallback(max_tokens=max_tokens)


# ---------------------------------------------------------------------------
# Vision LLM — multimodal, for image analysis (face scans, triple photos)
# ---------------------------------------------------------------------------

def get_vision_llm(json_mode: bool = False) -> BaseChatModel:
    """
    Return a multimodal LLM for image analysis.

    Gemini is preferred for vision; falls back to OpenAI gpt-4o if Gemini key
    is missing. Mistral / huggingface (TGI text endpoint) do not support
    vision — they fall back to Gemini/OpenAI.
    json_mode=True enables structured JSON output (for scan parsing).
    """
    provider = llm_provider()

    if provider in ("mistral", "huggingface"):
        gemini_key = (settings.gemini_api_key or "").strip()
        if gemini_key:
            provider = "gemini"
        else:
            openai_key = (settings.openai_api_key or "").strip()
            if openai_key:
                provider = "openai"
            else:
                raise ValueError("Vision requires GEMINI_API_KEY or OPENAI_API_KEY")

    if provider == "claude":
        from langchain_anthropic import ChatAnthropic
        key = (settings.anthropic_api_key or "").strip()
        if not key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        return ChatAnthropic(
            model=(settings.anthropic_model or "claude-haiku-4-5").strip(),
            api_key=key,
            max_tokens=4096,
            temperature=0.1,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        key = (settings.openai_api_key or "").strip()
        if not key:
            raise ValueError("OPENAI_API_KEY is not set")
        vision_model = getattr(settings, "openai_vision_model", None) or settings.openai_model or "gpt-4o"
        kwargs: dict = dict(model=vision_model.strip(), api_key=key, max_tokens=4096, temperature=0.1)
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kwargs)

    from langchain_google_genai import ChatGoogleGenerativeAI
    key = (settings.gemini_api_key or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is not set")
    gen_cfg: dict = {}
    if json_mode:
        gen_cfg["response_mime_type"] = "application/json"
    _vision_model = resolve_gemini_model((settings.gemini_model or "gemini-2.5-flash").strip())
    return ChatGoogleGenerativeAI(
        model=_vision_model,
        google_api_key=key,
        max_output_tokens=4096,
        temperature=0.1,
        callbacks=HEALTH_CALLBACKS,
        tags=provider_tags("gemini", _vision_model),
        **({"generation_config": gen_cfg} if gen_cfg else {}),
    )
