"""Post for Me provider for creator IG/TikTok linking.

Post for Me is a hosted social API that brings its OWN Meta/TikTok-approved apps,
so a creator can link Instagram/TikTok without maxapp registering (and getting
reviewed for) its own platform apps. The link is per-user: we mint an OAuth
`auth-url` tagged with the creator's `external_id`, the user authorizes through
Post for Me, then we look their account(s) up by `external_id` to get the
`spc_...` id we store (and can later publish to).

This mirrors the same integration Yunicorn (Marque) uses; one POSTFORME_KEY is
shared across products, with users namespaced by external_id ("maxapp:<uuid>").
The key lives only server-side (settings.postforme_key).
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)

# Platforms maxapp verifies. Post for Me supports more; we only surface these.
PLATFORMS = ("instagram", "tiktok")

_TIMEOUT = httpx.Timeout(30.0, connect=8.0)


def enabled() -> bool:
    """True when a Post for Me key is configured — then it is THE provider."""
    return bool((settings.postforme_key or "").strip())


def external_id(user_id: str, platform: str) -> str:
    """Per-(user, platform) tag. Post for Me enforces one account per external_id,
    so IG and TikTok for the same user MUST get distinct tags — otherwise the
    second link collides ("External Id already exists"). Namespaced by prefix so
    maxapp's accounts don't intermix with other products on the shared key."""
    prefix = (settings.postforme_external_id_prefix or "maxapp").strip()
    return f"{prefix}:{user_id}:{platform}"


async def _request(
    method: str,
    path: str,
    *,
    json_body: dict | None = None,
    params: dict | None = None,
) -> tuple[int, dict]:
    """One place all Post for Me calls go through. Returns (status_code, json)."""
    headers = {
        "Authorization": f"Bearer {settings.postforme_key}",
        "Content-Type": "application/json",
    }
    base = (settings.postforme_base or "").rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.request(
            method, f"{base}{path}", headers=headers, json=json_body, params=params
        )
    try:
        data = r.json()
    except (ValueError, json.JSONDecodeError):
        data = {}
    return r.status_code, data


async def auth_url(platform: str, user_id: str, redirect_url: str | None = None) -> str:
    """Mint a Post for Me OAuth URL for one IG/TikTok account link.

    Tagged with our external_id so we can find the account afterwards.
    redirect_url (the app's cannon:// deep link) bounces the user back after
    consent — but per Post for Me's flaky redirect-override we still recover the
    account by polling /social-accounts, so this is best-effort UX only.
    Raises on a non-2xx / network error (the caller maps it to a clean error).
    """
    body: dict[str, Any] = {
        "platform": platform,
        "permissions": ["posts"],
        "external_id": external_id(user_id, platform),
    }
    # Quickstart projects reject redirect_url_override (HTTP 400); only send it
    # when explicitly allowed. Otherwise the app recovers the link by polling
    # /social-accounts by external_id (see api.creator_social._sync_postforme).
    if redirect_url and settings.postforme_allow_redirect_override:
        body["redirect_url_override"] = redirect_url
    code, data = await _request("POST", "/social-accounts/auth-url", json_body=body)
    if 200 <= code < 300 and data.get("url"):
        return data["url"]
    raise RuntimeError(f"postforme auth-url failed ({code}): {data.get('message') or data}")


async def list_accounts(user_id: str, platform: str) -> list[dict]:
    """The user's linked account(s) for one platform (by our per-(user, platform)
    external_id tag), normalized to the shape creator-social stores. [] on error."""
    params: dict[str, str] = {
        "external_id": external_id(user_id, platform),
        "platform": platform,
    }
    try:
        code, data = await _request("GET", "/social-accounts", params=params)
    except httpx.HTTPError as e:
        logger.warning("[postforme] list_accounts network error: %s", e)
        return []
    if not (200 <= code < 300):
        logger.warning("[postforme] list_accounts http %s: %s", code, data)
        return []
    out: list[dict] = []
    for a in (data.get("data") or []):
        plat = a.get("platform", "")
        if plat not in PLATFORMS:
            continue
        out.append(
            {
                "id": a.get("id", ""),  # spc_... — used to publish/disconnect
                "platform": plat,
                "username": a.get("username", ""),
                "profile_photo_url": a.get("profile_photo_url", ""),
                "status": a.get("status", ""),
                "external_id": a.get("external_id", ""),
            }
        )
    return out


async def disconnect(account_id: str) -> bool:
    """Revoke a linked account at Post for Me by its spc_ id. Best-effort."""
    if not account_id:
        return False
    try:
        code, _ = await _request("POST", f"/social-accounts/{account_id}/disconnect")
    except httpx.HTTPError as e:
        logger.warning("[postforme] disconnect network error: %s", e)
        return False
    return 200 <= code < 300
