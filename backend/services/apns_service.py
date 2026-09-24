"""
Direct Apple Push Notification service (HTTP/2, JWT auth).
https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any, Optional

import httpx
import jwt
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

from config import settings

logger = logging.getLogger(__name__)

_APNS_SANDBOX = "https://api.sandbox.push.apple.com"
_APNS_PRODUCTION = "https://api.push.apple.com"


def _load_private_key(pem_or_b64: str):
    raw = (pem_or_b64 or "").strip()
    if not raw:
        raise ValueError("empty APNs key")
    if "\\n" in raw:
        raw = raw.replace("\\n", "\n")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    if not raw.startswith("-----"):
        try:
            raw = base64.b64decode(raw).decode("utf-8").strip()
        except Exception:
            raise ValueError("APNs key is not valid PEM or base64")
    if "-----BEGIN" in raw:
        header = "-----BEGIN PRIVATE KEY-----"
        footer = "-----END PRIVATE KEY-----"
        body = raw.replace(header, "").replace(footer, "")
        body = body.replace("\n", "").replace(" ", "").strip()
        lines = [body[i:i+64] for i in range(0, len(body), 64)]
        raw = header + "\n" + "\n".join(lines) + "\n" + footer + "\n"
    return serialization.load_pem_private_key(
        raw.encode("utf-8"),
        password=None,
        backend=default_backend(),
    )


# Provider-token cache. Apple rejects a provider token refreshed more often
# than every 20 minutes (429 TooManyProviderTokenUpdates) and one older than
# 60 minutes (403 ExpiredProviderToken). The old code signed a fresh token for
# EVERY push — harmless at 5 pushes a day, a 429 storm once reminders go out
# per task every minute. One token, reused for 40 minutes.
_JWT_TTL_S = 40 * 60
_jwt_cache: dict[str, Any] = {"token": None, "at": 0.0, "ident": None}


def _reset_jwt_cache() -> None:
    _jwt_cache.update(token=None, at=0.0, ident=None)


def _apns_jwt() -> str:
    ident = (settings.apns_key_id, settings.apns_team_id, len(settings.apns_auth_key_p8 or ""))
    now = time.time()
    if (
        _jwt_cache["token"]
        and _jwt_cache["ident"] == ident
        and now - float(_jwt_cache["at"]) < _JWT_TTL_S
    ):
        return str(_jwt_cache["token"])
    key = _load_private_key(settings.apns_auth_key_p8)
    token = jwt.encode(
        {"iss": settings.apns_team_id, "iat": int(now)},
        key,
        algorithm="ES256",
        headers={"kid": settings.apns_key_id, "alg": "ES256"},
    )
    _jwt_cache.update(token=token, at=now, ident=ident)
    return token


# One HTTP/2 connection per event loop, reused across pushes (Apple's guidance:
# keep connections open rather than reconnecting per notification).
_client: Optional[httpx.AsyncClient] = None
_client_loop: Any = None


def _http_client() -> httpx.AsyncClient:
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop or _client.is_closed:
        _client = httpx.AsyncClient(http2=True, timeout=httpx.Timeout(15.0, connect=10.0))
        _client_loop = loop
    return _client


def _drop_http_client() -> None:
    global _client
    _client = None


def apns_configured() -> bool:
    return bool(
        settings.apns_auth_key_p8.strip()
        and settings.apns_key_id.strip()
        and settings.apns_team_id.strip()
        and settings.apns_bundle_id.strip()
    )


async def send_apns_alert(
    device_token_hex: str,
    title: str,
    body: str,
    *,
    badge: Optional[int] = None,
    custom: Optional[dict[str, Any]] = None,
    thread_id: Optional[str] = None,
    category: Optional[str] = None,
    expires_in_s: Optional[int] = None,
    collapse_id: Optional[str] = None,
) -> tuple[bool, Optional[int]]:
    """
    Send alert push. Returns (success, status_code).
    410 / BadDeviceToken → caller should clear stored token.

    thread_id    groups pushes in Notification Center (tasks stack together).
    category     the app-registered action category (e.g. TASK_REMINDER →
                 "Mark done" button); unknown categories are ignored by iOS.
    expires_in_s APNs stores a push for an offline device until then — a
                 task reminder that arrives three hours late is noise.
    collapse_id  a newer push with the same id replaces the older one.
    """
    # Global kill switch (review item 10): pause ALL outbound pushes instantly.
    if bool(getattr(settings, "notif_kill_switch", False)):
        logger.warning("APNs kill switch ON — suppressing push")
        return False, None
    if not apns_configured():
        logger.debug("APNs not configured; skip push")
        return False, None
    token_hex = (device_token_hex or "").strip().replace(" ", "")
    if not token_hex:
        return False, None

    base = _APNS_SANDBOX if settings.apns_use_sandbox else _APNS_PRODUCTION
    url = f"{base}/3/device/{token_hex}"

    try:
        auth = _apns_jwt()
    except Exception as e:
        logger.error("APNs JWT build failed: %s", e)
        return False, None

    # Voice gate: every push that leaves the server passes the copy filter.
    from services.copy_filter import filter_text

    title = filter_text(title, fallback="Max", context="apns_title")
    body = filter_text(body, context="apns_body")

    aps: dict[str, Any] = {"alert": {"title": title, "body": body}, "sound": "default"}
    if badge is not None:
        aps["badge"] = badge
    if thread_id:
        aps["thread-id"] = str(thread_id)[:64]
    if category:
        aps["category"] = str(category)[:64]
    payload: dict[str, Any] = {"aps": aps}
    if custom:
        for k, v in custom.items():
            if k != "aps":
                payload[k] = v
        # expo-notifications (iOS) exposes a REMOTE push's data to JS as
        # userInfo["body"] ONLY — the Expo push-service envelope
        # (EXNotificationSerializer.m: `isRemote ? userInfo[@"body"] : userInfo`).
        # We talk to APNs directly with route/params at the top level, so every
        # installed app version saw data = null: no push ever deep-linked and no
        # tap was ever reported as an open. Mirror the link keys into `body`.
        if "body" not in payload and any(k in custom for k in ("route", "params", "category")):
            payload["body"] = {k: custom[k] for k in ("route", "params", "category") if k in custom}

    headers = {
        "authorization": f"bearer {auth}",
        "apns-topic": settings.apns_bundle_id,
        "apns-push-type": "alert",
        "apns-priority": "10",
    }
    if expires_in_s is not None and expires_in_s > 0:
        headers["apns-expiration"] = str(int(time.time()) + int(expires_in_s))
    if collapse_id:
        headers["apns-collapse-id"] = str(collapse_id)[:64]

    try:
        r = await _http_client().post(url, headers=headers, content=json.dumps(payload))
    except Exception as e:
        logger.warning("APNs request failed (%s): %s", type(e).__name__, e)
        _drop_http_client()  # a broken connection must not poison the next push
        return False, None

    if r.status_code == 200:
        return True, 200

    text = (r.text or "")[:500]
    if r.status_code == 403 and ("ExpiredProviderToken" in text or "InvalidProviderToken" in text):
        _reset_jwt_cache()  # re-sign on the next attempt
    logger.warning("APNs HTTP %s: %s", r.status_code, text)
    return False, r.status_code


def apns_response_should_invalidate_token(status_code: Optional[int]) -> bool:
    return status_code in (400, 410)
