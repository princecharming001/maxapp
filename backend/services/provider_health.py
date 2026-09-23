"""Per-provider circuit breakers + Gemini retired-model self-heal.

Why this exists (2026-09-22 outage): the production Gemini key was rotated
onto a project for which `gemini-2.5-flash-lite` is "no longer available to
new users" (HTTP 404). Every chat turn hit the 404, the fallback chain never
fired (404 was not a fallback-able exception), and users read a content miss.
Nothing in-process noticed for 20 hours.

Three small mechanisms, all fail-open (any bug here → "healthy"):

  1. Breakers — `record_failure(provider, kind)` opens a provider for a
     cooldown after a HARD failure (retired model that could not be remapped,
     auth, quota) or after a short streak of SOFT ones (timeouts, 5xx,
     network). `healthy_first()` re-orders a fallback chain so a known-dead
     provider stops eating the timeout on every turn. The dead provider stays
     in the chain as a later fallback and is re-tried when the cooldown ends.

  2. Gemini model remap — `note_gemini_model_failure(model, text)` parses
     Google's own "Please update your code to use models/<x>" hint (or a
     static alias table) and records a process-wide remap that every builder
     applies via `resolve_gemini_model()`. The current turn still fails over;
     the NEXT turn already uses the live model. A startup probe
     (services.llm_startup_check) pre-populates this before any user turn.

  3. ProviderHealthCallback — a LangChain callback attached to every model
     lc_providers builds, so success/failure bookkeeping needs no wrapping of
     the runnables (bind_tools / with_structured_output keep working).

Everything is in-process state; multi-instance deployments learn
independently, which is fine (each instance pays at most one failing turn).
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from services.llm_outage import HARD_KINDS, classify_llm_error

logger = logging.getLogger(__name__)

OPEN_HARD_S = 120.0
OPEN_SOFT_S = 60.0
SOFT_STREAK = 3
SOFT_WINDOW_S = 90.0

_lock = threading.Lock()


@dataclass
class _Breaker:
    provider: str
    consecutive: int = 0
    last_failure_at: float = 0.0
    open_until: float = 0.0
    last_kind: str = ""
    last_error: str = ""
    opened_count: int = 0
    successes: int = 0
    failures: int = 0
    last_success_at: float = 0.0
    models: dict[str, str] = field(default_factory=dict)  # model → last kind


_STATE: dict[str, _Breaker] = {}
_LOGGED_OPEN: set[str] = set()


def _get(provider: str) -> _Breaker:
    key = (provider or "unknown").strip().lower()
    b = _STATE.get(key)
    if b is None:
        b = _Breaker(provider=key)
        _STATE[key] = b
    return b


def record_success(provider: str) -> None:
    try:
        with _lock:
            b = _get(provider)
            b.consecutive = 0
            b.successes += 1
            b.last_success_at = time.monotonic()
            if b.open_until and b.open_until <= time.monotonic():
                b.open_until = 0.0
            if b.open_until == 0.0:
                _LOGGED_OPEN.discard(b.provider)
    except Exception:  # noqa: BLE001 — bookkeeping must never break a turn
        pass


def record_failure(
    provider: str, kind: str, *, model: Optional[str] = None, error_text: str = "",
) -> None:
    """Record a failed call. Hard kinds open the breaker at once; soft kinds
    open it after SOFT_STREAK consecutive failures inside SOFT_WINDOW_S."""
    try:
        now = time.monotonic()
        with _lock:
            b = _get(provider)
            if b.last_failure_at and now - b.last_failure_at > SOFT_WINDOW_S:
                b.consecutive = 0
            b.consecutive += 1
            b.failures += 1
            b.last_failure_at = now
            b.last_kind = kind
            b.last_error = (error_text or "")[:240]
            if model:
                b.models[str(model)] = kind
            opened_for = 0.0
            if kind in HARD_KINDS:
                opened_for = OPEN_HARD_S
            elif b.consecutive >= SOFT_STREAK:
                opened_for = OPEN_SOFT_S
            if opened_for:
                b.open_until = max(b.open_until, now + opened_for)
                b.opened_count += 1
                first = b.provider not in _LOGGED_OPEN
                _LOGGED_OPEN.add(b.provider)
        if opened_for and first:
            logger.error(
                "[llm-health] provider=%s breaker OPEN for %.0fs (kind=%s model=%s): %s",
                provider, opened_for, kind, model or "-", (error_text or "")[:200],
            )
    except Exception:  # noqa: BLE001
        pass


def is_open(provider: str) -> bool:
    try:
        b = _STATE.get((provider or "").strip().lower())
        if b is None:
            return False
        return b.open_until > time.monotonic()
    except Exception:  # noqa: BLE001
        return False


def healthy_first(providers: list[str]) -> list[str]:
    """Stable partition: providers whose breaker is closed keep their order
    and come first; open ones trail (still present as last-resort fallbacks)."""
    try:
        closed = [p for p in providers if not is_open(p)]
        opened = [p for p in providers if is_open(p)]
        return closed + opened
    except Exception:  # noqa: BLE001
        return list(providers)


# ---------------------------------------------------------------------------
# Gemini retired-model self-heal
# ---------------------------------------------------------------------------

# Last-resort aliases when Google's error text carries no "use models/<x>"
# hint. Only consulted AFTER a failure signal — never pre-emptively, so a key
# that can still use the older model keeps using it.
GEMINI_STATIC_ALIASES: dict[str, str] = {
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.5-flash": "gemini-3.5-flash",
    "gemini-2.5-pro": "gemini-3.1-pro-preview",
    "gemini-2.0-flash": "gemini-flash-latest",
    "gemini-2.0-flash-lite": "gemini-flash-lite-latest",
    "gemini-1.5-flash": "gemini-flash-latest",
    "gemini-1.5-flash-8b": "gemini-flash-lite-latest",
    "gemini-1.5-pro": "gemini-pro-latest",
}

_GEMINI_REMAP: dict[str, str] = {}
_REMAP_HINT_RE = re.compile(r"use\s+(?:models/)?([A-Za-z0-9][\w.\-]*)")
_MODEL_RETIRED_RE = re.compile(
    r"no longer available|is not found for api version|not supported for generatecontent|model_not_found",
    re.IGNORECASE,
)


def _norm_model(name: str) -> str:
    n = (name or "").strip()
    if n.startswith("models/"):
        n = n[len("models/"):]
    return n


def resolve_gemini_model(name: str) -> str:
    """Apply learned remaps (bounded chain) — the name every Gemini builder uses."""
    try:
        cur = _norm_model(name)
        for _ in range(4):
            nxt = _GEMINI_REMAP.get(cur)
            if not nxt or nxt == cur:
                break
            cur = nxt
        return cur or name
    except Exception:  # noqa: BLE001
        return name


def looks_like_retired_model_error(error_text: str) -> bool:
    return bool(_MODEL_RETIRED_RE.search(error_text or ""))


def note_gemini_model_failure(model: str, error_text: str) -> Optional[str]:
    """A Gemini call for `model` failed with a NOT_FOUND-class error. Learn a
    replacement (Google's hint first, static alias second) and return it, or
    None when nothing better is known. Idempotent; logs at ERROR once."""
    try:
        model_n = _norm_model(model)
        if not model_n:
            return None
        text = error_text or ""
        target: Optional[str] = None
        m = _REMAP_HINT_RE.search(text)
        if m and looks_like_retired_model_error(text):
            cand = _norm_model(m.group(1))
            if cand.startswith("gemini") and cand != model_n:
                target = cand
        if target is None:
            alias = GEMINI_STATIC_ALIASES.get(model_n)
            if alias and alias != model_n:
                target = alias
        if target is None:
            return None
        with _lock:
            already = _GEMINI_REMAP.get(model_n)
            _GEMINI_REMAP[model_n] = target
        if already != target:
            logger.error(
                "[llm-health] gemini model %r is unavailable for this key; remapped to %r "
                "for the rest of this process. Set GEMINI_MODEL / GEMINI_CHAT_MODEL to a "
                "current model to make this permanent. (%s)",
                model_n, target, text[:160].replace("\n", " "),
            )
        return target
    except Exception:  # noqa: BLE001
        return None


def gemini_remaps() -> dict[str, str]:
    return dict(_GEMINI_REMAP)


# ---------------------------------------------------------------------------
# Snapshot / reset
# ---------------------------------------------------------------------------

_STARTUP: dict[str, Any] = {}


def set_startup_report(report: dict[str, Any]) -> None:
    try:
        _STARTUP.clear()
        _STARTUP.update(report or {})
    except Exception:  # noqa: BLE001
        pass


def snapshot() -> dict[str, Any]:
    """Cheap, JSON-safe view for /health and logs."""
    try:
        now = time.monotonic()
        out: dict[str, Any] = {"breakers": {}, "gemini_remaps": dict(_GEMINI_REMAP)}
        for name, b in sorted(_STATE.items()):
            out["breakers"][name] = {
                "open": b.open_until > now,
                "open_for_s": round(max(0.0, b.open_until - now), 1),
                "consecutive_failures": b.consecutive,
                "failures": b.failures,
                "successes": b.successes,
                "last_kind": b.last_kind,
                "last_error": b.last_error,
                "models": dict(b.models),
            }
        if _STARTUP:
            out["startup"] = dict(_STARTUP)
        return out
    except Exception:  # noqa: BLE001
        return {"breakers": {}, "gemini_remaps": {}}


def reset() -> None:
    """Tests only."""
    with _lock:
        _STATE.clear()
        _GEMINI_REMAP.clear()
        _LOGGED_OPEN.clear()
        _STARTUP.clear()


# ---------------------------------------------------------------------------
# LangChain callback — attached to every model lc_providers builds
# ---------------------------------------------------------------------------

def _tag_value(tags: Optional[list[str]], prefix: str) -> Optional[str]:
    for t in tags or []:
        if isinstance(t, str) and t.startswith(prefix):
            return t[len(prefix):]
    return None


PROVIDER_TAG = "llm-provider:"
MODEL_TAG = "llm-model:"


def provider_tags(provider: str, model: str) -> list[str]:
    return [f"{PROVIDER_TAG}{provider}", f"{MODEL_TAG}{model}"]


def observe_failure(provider: Optional[str], model: Optional[str], error: BaseException) -> None:
    """Shared by the callback and by callers that invoke vendors directly
    (embeddings, the legacy gemini_service). Handles the remap special case:
    a retired Gemini model that could be remapped does NOT open the breaker —
    the provider is fine, only the model name was stale."""
    try:
        prov = (provider or "unknown").lower()
        kind = classify_llm_error(error)
        text = f"{type(error).__name__}: {error}"
        if prov == "gemini" and kind == "not_found" and model:
            if note_gemini_model_failure(model, text):
                return
        record_failure(prov, kind, model=model, error_text=text)
    except Exception:  # noqa: BLE001
        pass


try:
    from langchain_core.callbacks import AsyncCallbackHandler as _AsyncCB
    from langchain_core.callbacks import BaseCallbackHandler as _SyncCB

    class ProviderHealthCallback(_AsyncCB):
        """Async handler (used for ainvoke/astream). Never raises."""

        raise_error = False

        async def on_chat_model_start(self, serialized, messages, **kwargs):  # noqa: D401
            return None

        async def on_llm_start(self, serialized, prompts, **kwargs):
            return None

        async def on_llm_end(self, response, **kwargs):
            tags = kwargs.get("tags")
            prov = _tag_value(tags, PROVIDER_TAG)
            if prov:
                record_success(prov)

        async def on_llm_error(self, error, **kwargs):
            tags = kwargs.get("tags")
            observe_failure(_tag_value(tags, PROVIDER_TAG), _tag_value(tags, MODEL_TAG), error)

    class ProviderHealthSyncCallback(_SyncCB):
        """Sync twin for .invoke() paths (schedule generation runs in threads)."""

        raise_error = False

        def on_chat_model_start(self, serialized, messages, **kwargs):
            return None

        def on_llm_start(self, serialized, prompts, **kwargs):
            return None

        def on_llm_end(self, response, **kwargs):
            tags = kwargs.get("tags")
            prov = _tag_value(tags, PROVIDER_TAG)
            if prov:
                record_success(prov)

        def on_llm_error(self, error, **kwargs):
            tags = kwargs.get("tags")
            observe_failure(_tag_value(tags, PROVIDER_TAG), _tag_value(tags, MODEL_TAG), error)

    HEALTH_CALLBACKS: list[Any] = [ProviderHealthCallback(), ProviderHealthSyncCallback()]
except Exception:  # pragma: no cover — langchain missing (tooling contexts)
    HEALTH_CALLBACKS = []
