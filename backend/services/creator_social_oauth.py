"""OAuth for creator social accounts (Instagram / TikTok).

Creators applying to own a max sign in to Instagram and/or TikTok so their
handle is VERIFIED (they proved control of the account) instead of just typed.

Providers:
  instagram — Instagram Login (Meta). Authorize on www.instagram.com, exchange
              on api.instagram.com, then upgrade to a long-lived token and read
              the profile from graph.instagram.com.
  tiktok    — TikTok Login Kit v2. Authorize on www.tiktok.com, exchange and
              read the profile on open.tiktokapis.com.

Dev mock is disabled — real OAuth credentials are required for each provider.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from config import settings
from services import social_lookup

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(15.0, connect=6.0)

PLATFORMS = ("instagram", "tiktok")


def redirect_uri(platform: str) -> str:
    base = (settings.social_oauth_redirect_base or "").strip().rstrip("/")
    if not base:
        base = "http://localhost:8000/api"
    return f"{base}/creator-social/callback/{platform}"


def _has_real_credentials(platform: str) -> bool:
    if platform == "instagram":
        return bool(settings.instagram_client_id.strip() and settings.instagram_client_secret.strip())
    if platform == "tiktok":
        return bool(settings.tiktok_client_key.strip() and settings.tiktok_client_secret.strip())
    return False


def mock_mode(platform: str) -> bool:
    """Mock consent is disabled — real OAuth credentials required."""
    return False


def platform_available(platform: str) -> bool:
    return _has_real_credentials(platform)


def build_auth_url(platform: str, state: str) -> str:
    """The URL the client opens in a browser to start the sign-in."""
    if not _has_real_credentials(platform):
        raise ValueError(f"{platform} OAuth is not configured")
    if platform == "instagram":
        scopes = ",".join(s.strip() for s in settings.instagram_scopes.split(",") if s.strip())
        return "https://www.instagram.com/oauth/authorize?" + urlencode(
            {
                "client_id": settings.instagram_client_id,
                "redirect_uri": redirect_uri("instagram"),
                "response_type": "code",
                "scope": scopes,
                "state": state,
            }
        )
    if platform == "tiktok":
        scopes = ",".join(s.strip() for s in settings.tiktok_scopes.split(",") if s.strip())
        return "https://www.tiktok.com/v2/auth/authorize/?" + urlencode(
            {
                "client_key": settings.tiktok_client_key,
                "redirect_uri": redirect_uri("tiktok"),
                "response_type": "code",
                "scope": scopes,
                "state": state,
            }
        )
    raise ValueError(f"Unknown platform: {platform}")


async def exchange_and_fetch(platform: str, code: str) -> dict[str, Any]:
    """Exchange an authorization code, then fetch the signed-in profile.

    Returns a normalized dict:
      {platform_user_id, handle, full_name, avatar_url, followers, verified,
       access_token, refresh_token, expires_at, profile_extra}
    Raises on failure — the callback turns that into a clean error page.
    """
    if code.startswith("mock:"):
        return await _mock_exchange(platform, code[len("mock:"):])
    if platform == "instagram":
        return await _instagram_exchange(code)
    if platform == "tiktok":
        return await _tiktok_exchange(code)
    raise ValueError(f"Unknown platform: {platform}")


# --- Instagram (Meta Instagram Login) ----------------------------------------

async def _instagram_exchange(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        # 1) code -> short-lived token
        resp = await client.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": settings.instagram_client_id,
                "client_secret": settings.instagram_client_secret,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri("instagram"),
                "code": code,
            },
        )
        resp.raise_for_status()
        short = resp.json()
        access_token = short["access_token"]

        # 2) short-lived -> long-lived (60 days), refreshable
        expires_at = None
        try:
            resp = await client.get(
                "https://graph.instagram.com/access_token",
                params={
                    "grant_type": "ig_exchange_token",
                    "client_secret": settings.instagram_client_secret,
                    "access_token": access_token,
                },
            )
            resp.raise_for_status()
            long_lived = resp.json()
            access_token = long_lived.get("access_token", access_token)
            if long_lived.get("expires_in"):
                expires_at = datetime.utcnow() + timedelta(seconds=int(long_lived["expires_in"]))
        except Exception as e:  # long-lived upgrade is best-effort
            logger.warning("[creator_social] IG long-lived exchange failed: %s", e)

        # 3) profile
        resp = await client.get(
            "https://graph.instagram.com/v23.0/me",
            params={
                "fields": "user_id,username,name,account_type,profile_picture_url,followers_count",
                "access_token": access_token,
            },
        )
        resp.raise_for_status()
        me = resp.json()

    return {
        "platform_user_id": str(me.get("user_id") or short.get("user_id") or ""),
        "handle": me.get("username"),
        "full_name": me.get("name"),
        "avatar_url": me.get("profile_picture_url"),
        "followers": me.get("followers_count"),
        "verified": None,
        "access_token": access_token,
        "refresh_token": None,  # IG long-lived tokens refresh via ig_refresh_token grant
        "expires_at": expires_at,
        "profile_extra": {"account_type": me.get("account_type")},
    }


# --- TikTok (Login Kit v2) ----------------------------------------------------

async def _tiktok_exchange(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "client_key": settings.tiktok_client_key,
                "client_secret": settings.tiktok_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri("tiktok"),
            },
        )
        resp.raise_for_status()
        tok = resp.json()
        if "access_token" not in tok:
            raise RuntimeError(f"TikTok token exchange failed: {tok}")
        access_token = tok["access_token"]
        expires_at = None
        if tok.get("expires_in"):
            expires_at = datetime.utcnow() + timedelta(seconds=int(tok["expires_in"]))

        resp = await client.get(
            "https://open.tiktokapis.com/v2/user/info/",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "fields": "open_id,union_id,avatar_url,display_name,username,follower_count,is_verified"
            },
        )
        resp.raise_for_status()
        user = ((resp.json() or {}).get("data") or {}).get("user") or {}

    return {
        "platform_user_id": str(tok.get("open_id") or user.get("open_id") or ""),
        "handle": user.get("username") or user.get("display_name"),
        "full_name": user.get("display_name"),
        "avatar_url": user.get("avatar_url"),
        "followers": user.get("follower_count"),
        "verified": user.get("is_verified"),
        "access_token": access_token,
        "refresh_token": tok.get("refresh_token"),
        "expires_at": expires_at,
        "profile_extra": {"union_id": user.get("union_id")},
    }


# --- Dev mock ------------------------------------------------------------------

async def _mock_exchange(platform: str, raw_handle: str) -> dict[str, Any]:
    """Turn a mock consent 'code' (the typed handle) into a connection payload.

    Enriched with PUBLIC profile data via social_lookup when reachable, so the
    dev flow shows real follower counts / avatars for real handles.
    """
    handle = social_lookup.clean_handle(raw_handle) or "creator"
    prof: Optional[dict] = None
    try:
        prof = await social_lookup.lookup_profile(platform, handle)
    except Exception:
        prof = None
    prof = prof or {}
    return {
        "platform_user_id": f"mock_{platform}_{handle}",
        "handle": handle,
        "full_name": prof.get("full_name"),
        "avatar_url": prof.get("avatar_url"),
        "followers": prof.get("followers"),
        "verified": prof.get("verified"),
        "access_token": f"mock-token-{platform}-{handle}",
        "refresh_token": None,
        "expires_at": datetime.utcnow() + timedelta(days=60),
        "profile_extra": {"mock": True},
    }
