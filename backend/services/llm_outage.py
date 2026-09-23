"""Provider-outage semantics shared by every LLM / RAG path.

A failed provider call is NOT "no evidence". Before this module, a retired
model (Gemini 404), an exhausted OpenAI balance (429) or a dead network
surfaced to the user as "i don't have that in the course material yet." —
the strict-miss copy meant for a question the docs genuinely don't cover.

One vocabulary for all callers:

  classify_llm_error(exc)  → "not_found" | "quota" | "auth" | "timeout" |
                             "unavailable" | "network" | "unknown"
  LLMOutage                → raised by the answer layers when the provider
                             (not the evidence) is what failed
  OUTAGE_REPLY             → the ONLY user-facing copy for an outage. Never
                             names a vendor, never mentions quota or keys.

Pure Python, no vendor imports at module load — safe to import anywhere.
"""

from __future__ import annotations

import asyncio
from typing import Optional

OUTAGE_REPLY = (
    "max is having trouble thinking right now. give it a minute and try again, "
    "your message is saved."
)
OUTAGE_REPLY_TIMEOUT = (
    "that took too long on my end. try again in a moment, your message is saved."
)

KINDS: tuple[str, ...] = (
    "not_found", "quota", "auth", "timeout", "unavailable", "network", "unknown",
)

# Kinds that mean "this provider will keep failing for a while" — a breaker
# opens on the first one. Soft kinds need a streak.
HARD_KINDS: frozenset[str] = frozenset({"not_found", "quota", "auth"})


class LLMOutage(Exception):
    """The model/provider failed; the caller must NOT present a content miss."""

    def __init__(
        self,
        message: str = "llm provider failure",
        *,
        provider: Optional[str] = None,
        kind: str = "unknown",
        cause: Optional[BaseException] = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.kind = kind if kind in KINDS else "unknown"
        self.cause = cause

    def __str__(self) -> str:  # pragma: no cover — cosmetic
        base = super().__str__()
        return f"{base} [provider={self.provider or '?'} kind={self.kind}]"


def _blob(exc: BaseException) -> str:
    try:
        return f"{type(exc).__name__} {exc}".lower()
    except Exception:  # noqa: BLE001 — never raise while classifying
        return type(exc).__name__.lower()


def classify_llm_error(exc: BaseException) -> str:
    """Map any provider exception to a kind. Type-first, then message text.
    Never raises; unknown shapes → "unknown"."""
    if isinstance(exc, LLMOutage):
        return exc.kind
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "timeout"
    blob = _blob(exc)
    # Order matters: a retired-model 404 mentions "no longer available" and a
    # quota 429 mentions "credits"; check the most specific signals first.
    if any(s in blob for s in (
        "no longer available", "is not found for api version", "model_not_found",
        "notfound", "not_found", " 404", "404 ", "does not exist or you do not have access",
    )):
        return "not_found"
    if any(s in blob for s in (
        "insufficient_quota", "no credits", "credit_bala", "resourceexhausted",
        "resource_exhausted", "rate_limit", "ratelimit", "rate limit", "too many requests",
        "quota", " 429", "429 ",
    )):
        return "quota"
    if any(s in blob for s in (
        "unauthenticated", "permission_denied", "permissiondenied", "authenticationerror",
        "invalid api key", "api key not valid", "incorrect api key", "tier_not_allowed",
        "forbidden", " 401", "401 ", " 403", "403 ",
    )):
        return "auth"
    if any(s in blob for s in (
        "timeout", "timed out", "deadline", "deadlineexceeded",
    )):
        return "timeout"
    if any(s in blob for s in (
        "serviceunavailable", "internalservererror", "internal server error", "overloaded",
        "bad gateway", "unavailable", " 500", "500 ", " 502", "502 ", " 503", "503 ", " 504", "504 ",
    )):
        return "unavailable"
    if any(s in blob for s in (
        "connecterror", "connection", "connect ", "remoteprotocolerror", "reset by peer",
        "name resolution", "dns", "network", "eof occurred",
    )):
        return "network"
    return "unknown"


def _vendor_error_bases() -> tuple[type[BaseException], ...]:
    bases: list[type[BaseException]] = []
    try:
        import httpx
        bases.append(httpx.HTTPError)
    except Exception:  # noqa: BLE001
        pass
    try:
        from google.api_core import exceptions as _g
        bases.append(_g.GoogleAPICallError)
    except Exception:  # noqa: BLE001
        pass
    try:
        import openai
        bases.append(openai.APIError)
    except Exception:  # noqa: BLE001
        pass
    try:
        import anthropic
        bases.append(anthropic.APIError)
    except Exception:  # noqa: BLE001
        pass
    try:
        from langchain_google_genai._common import GoogleGenerativeAIError
        bases.append(GoogleGenerativeAIError)
    except Exception:  # noqa: BLE001
        pass
    try:
        from mistralai.models import SDKError as _MistralSDKError
        bases.append(_MistralSDKError)
    except Exception:  # noqa: BLE001
        pass
    return tuple(bases)


_VENDOR_BASES: Optional[tuple[type[BaseException], ...]] = None


def is_provider_error(exc: BaseException) -> bool:
    """True when the exception came from an LLM/embedding vendor or the
    network in front of it (as opposed to a bug in our own code)."""
    global _VENDOR_BASES
    if isinstance(exc, LLMOutage):
        return True
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return True
    if _VENDOR_BASES is None:
        _VENDOR_BASES = _vendor_error_bases()
    if _VENDOR_BASES and isinstance(exc, _VENDOR_BASES):
        return True
    return classify_llm_error(exc) != "unknown"


def outage_reply_for(exc: Optional[BaseException]) -> str:
    """User-facing copy for a failed turn. Timeouts get their own line; every
    other kind shares OUTAGE_REPLY so vendor/billing details never leak."""
    if exc is not None and classify_llm_error(exc) == "timeout":
        return OUTAGE_REPLY_TIMEOUT
    return OUTAGE_REPLY


def as_outage(exc: BaseException, *, provider: Optional[str] = None) -> LLMOutage:
    """Wrap any exception as an LLMOutage (idempotent for LLMOutage)."""
    if isinstance(exc, LLMOutage):
        return exc
    return LLMOutage(str(exc)[:300] or type(exc).__name__, provider=provider,
                     kind=classify_llm_error(exc), cause=exc)
