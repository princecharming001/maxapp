"""Lightweight in-process rate limiter.

A dependency-free, single-instance token-bucket / fixed-window limiter for the
most abuse-prone endpoints (login brute force, signup spam, SMS-cost abuse,
expensive LLM calls). It keeps per-key hit timestamps in memory.

SCOPE: this is correct for a SINGLE backend instance (our launch posture). When
the backend scales to multiple instances, move these counters to Redis (see the
Phase 3 plan) so the limit is shared across instances — the FastAPI dependency
surface here stays the same, only the backing store changes.
"""

from __future__ import annotations

import time
import threading
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request, HTTPException


_LOCK = threading.Lock()
_HITS: Dict[str, Deque[float]] = defaultdict(deque)
# Coarse cap so the dict can't grow unbounded under a distributed key flood.
_MAX_KEYS = 50_000


def _client_ip(request: Request) -> str:
    # Honor the first hop in X-Forwarded-For (Render/!proxies set it); fall back
    # to the socket peer. Never trust this for auth — only for coarse limiting.
    xff = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if xff:
        return xff
    return request.client.host if request.client else "unknown"


def _check(key: str, limit: int, window_s: float) -> None:
    now = time.monotonic()
    cutoff = now - window_s
    with _LOCK:
        if len(_HITS) > _MAX_KEYS:
            # Under a distributed key flood, evict stale/oldest entries instead of
            # clear() — clearing ALL state disabled every limit (incl. login
            # brute-force) for a window, which is exactly when it matters most.
            stale = [k for k, dq in _HITS.items() if not dq or dq[-1] < cutoff]
            for k in stale:
                _HITS.pop(k, None)
            if len(_HITS) > _MAX_KEYS:
                # Still over: drop the oldest-inserted tenth (approx-LRU, O(n)).
                for k in list(_HITS)[: _MAX_KEYS // 10]:
                    _HITS.pop(k, None)
        dq = _HITS[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry = max(1, int(dq[0] + window_s - now))
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down and try again shortly.",
                headers={"Retry-After": str(retry)},
            )
        dq.append(now)


def rate_limit(*, limit: int, window_s: float, scope: str):
    """FastAPI dependency factory: limit `scope` to `limit` hits per `window_s`
    seconds, keyed by client IP. Usage:

        @router.post("/login", dependencies=[Depends(rate_limit(limit=10, window_s=60, scope="login"))])
    """
    async def _dep(request: Request) -> None:
        _check(f"{scope}:{_client_ip(request)}", limit, window_s)

    return _dep
