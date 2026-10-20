"""Server-side PostHog: unhandled API errors land in PostHog error tracking
next to the same person's app session (distinct_id = the account id, the same
id the app identifies with).

Off until POSTHOG_API_KEY is set. Never sends request or response bodies:
the route pattern, method, status and the exception (type, message, stack).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger(__name__)
_client = None
_tried = False


def client():
    global _client, _tried
    if _tried:
        return _client
    _tried = True
    from config import settings
    key = (getattr(settings, "posthog_api_key", "") or "").strip()
    if not key:
        return None
    try:
        from posthog import Posthog
        _client = Posthog(key, host=(settings.posthog_host or "https://us.i.posthog.com"),
                          disable_geoip=True, sync_mode=False)
    except Exception as e:  # noqa: BLE001
        logger.warning("posthog init failed: %s", e)
        _client = None
    return _client


_ID = re.compile(r"/([0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,}|\d+)(?=/|$)", re.I)


def route_pattern(path: str) -> str:
    return _ID.sub("/:id", path or "")


def user_id_from_request(request) -> Optional[str]:
    """The account id from the bearer token, if any (no DB hit)."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    try:
        from jose import jwt
        from config import settings
        payload = jwt.decode(auth[7:].strip(), settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:  # noqa: BLE001
        return None


def capture_server_error(request, exc: BaseException, status: int) -> None:
    c = client()
    if c is None:
        return
    try:
        props: dict[str, Any] = {"endpoint": route_pattern(request.url.path), "method": request.method,
                                 "status": status, "source": "backend"}
        uid = user_id_from_request(request)
        c.capture_exception(exc, distinct_id=uid, properties=props)
    except Exception as e:  # noqa: BLE001
        logger.warning("posthog capture failed: %s", e)
