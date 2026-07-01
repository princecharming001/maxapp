"""Public social-profile lookup for creator applications.

Given an Instagram or TikTok handle, fetch the PUBLIC profile signal we use to
gauge a creator: follower count, avatar, display name, verified badge. Read-only
enrichment — we never authenticate as the user.

Two tiers, tried in order:
  1. FREE / keyless — Instagram's public `web_profile_info` JSON endpoint and
     TikTok's public profile page (the embedded rehydration JSON). No key, no
     signup. Works reliably from a residential IP; datacenter IPs (e.g. a cloud
     host) can get rate-limited/blocked, which is why tier 2 exists.
  2. RapidAPI fallback — only if RAPIDAPI_KEY is set. Used when the free tier
     returns nothing (e.g. blocked in prod).

If everything fails we still return the handle + canonical profile URL (found =
False) so the application flow degrades to "handle only" rather than erroring.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(12.0, connect=6.0)

# A real browser UA — IG/TikTok serve the public payloads to these, not to bots.
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15"
)

# Field-name candidates we accept from whatever source is wired up.
_FOLLOWER_KEYS = (
    "follower_count", "followers_count", "followers", "edge_followed_by",
    "fans", "followerCount", "follower",
)
_AVATAR_KEYS = (
    "avatarLarger", "avatarMedium", "profile_pic_url_hd", "profile_pic_url",
    "profile_picture", "avatar", "avatar_larger", "avatarThumb",
    "profilePicUrl", "profile_image",
)
_NAME_KEYS = ("full_name", "fullname", "nickname", "display_name", "name", "fullName")
_VERIFIED_KEYS = ("is_verified", "verified", "isVerified")


def clean_handle(raw: Optional[str]) -> Optional[str]:
    """Bare handle from a handle / @handle / URL. Letters, digits, dot, _ only."""
    if not raw:
        return None
    s = str(raw).strip()
    if "://" in s or ".com/" in s.lower():
        m = re.search(r"(?:tiktok\.com/@|instagram\.com/)([^/?#]+)", s, re.IGNORECASE)
        s = m.group(1) if m else s.rstrip("/").split("/")[-1]
    s = s.lstrip("@").strip()
    s = re.sub(r"[^A-Za-z0-9._]", "", s)
    return s or None


def canonical_url(platform: str, handle: str) -> Optional[str]:
    if platform == "instagram":
        return f"https://instagram.com/{handle}"
    if platform == "tiktok":
        return f"https://www.tiktok.com/@{handle}"
    return None


def _deep_find(obj: Any, keys: tuple[str, ...]) -> Any:
    """First value under any of `keys`, searched breadth-first through the JSON."""
    queue = [obj]
    while queue:
        cur = queue.pop(0)
        if isinstance(cur, dict):
            for k in keys:
                if k in cur and cur[k] not in (None, "", {}, []):
                    return cur[k]
            queue.extend(cur.values())
        elif isinstance(cur, list):
            queue.extend(cur)
    return None


def _coerce_count(val: Any) -> Optional[int]:
    """Followers may be an int, a {'count': N} dict, or a '1.2M' string."""
    if val is None:
        return None
    if isinstance(val, dict):
        return _coerce_count(val.get("count"))
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip().replace(",", "")
    m = re.match(r"^([\d.]+)\s*([kKmMbB]?)$", s)
    if not m:
        try:
            return int(float(s))
        except Exception:
            return None
    num = float(m.group(1))
    mult = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get(m.group(2).lower(), 1)
    return int(num * mult)


def _coerce_url(val: Any) -> Optional[str]:
    if isinstance(val, dict):
        for k in ("url", "uri"):
            if val.get(k):
                return str(val[k])
        lst = val.get("url_list") or val.get("urls")
        if isinstance(lst, list) and lst:
            return str(lst[0])
        return None
    if isinstance(val, list) and val:
        return _coerce_url(val[0])
    s = str(val).strip()
    return s if s.startswith("http") else None


def _build(platform: str, handle: str, found: bool = False, **over) -> dict:
    out = {
        "platform": platform,
        "handle": handle,
        "url": canonical_url(platform, handle),
        "followers": None,
        "avatar_url": None,
        "full_name": None,
        "verified": False,
        "found": found,
    }
    out.update({k: v for k, v in over.items() if v is not None})
    return out


def _parse(platform: str, handle: str, data: Any) -> dict:
    followers = _coerce_count(_deep_find(data, _FOLLOWER_KEYS))
    avatar = _coerce_url(_deep_find(data, _AVATAR_KEYS))
    name = _deep_find(data, _NAME_KEYS)
    verified = _deep_find(data, _VERIFIED_KEYS)
    found = followers is not None or avatar is not None or bool(name)
    return _build(
        platform, handle, found=found,
        followers=followers,
        avatar_url=avatar,
        full_name=str(name) if name else None,
        verified=bool(verified) if verified is not None else None,
    )


# --- Tier 1: free / keyless -------------------------------------------------

async def _ig_keyless(handle: str) -> Optional[dict]:
    """Instagram public web_profile_info JSON (no auth, no key)."""
    url = "https://www.instagram.com/api/v1/users/web_profile_info/"
    headers = {
        "User-Agent": _BROWSER_UA,
        "x-ig-app-id": "936619743392459",  # the public web app id IG's own site sends
        "Accept": "application/json",
        "Referer": f"https://www.instagram.com/{handle}/",
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, params={"username": handle}, headers=headers)
        if resp.status_code != 200:
            return None
        user = (resp.json() or {}).get("data", {}).get("user")
        if not user:
            return None
        return _parse("instagram", handle, user)
    except Exception as e:
        logger.info("[social_lookup] ig keyless %s failed: %s", handle, e)
        return None


async def _tt_keyless(handle: str) -> Optional[dict]:
    """TikTok public profile page → embedded rehydration JSON (no auth, no key)."""
    url = f"https://www.tiktok.com/@{handle}"
    headers = {"User-Agent": _BROWSER_UA, "Accept": "text/html"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        m = re.search(
            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
            resp.text, re.DOTALL,
        )
        if not m:
            return None
        data = json.loads(m.group(1))
        scope = data.get("__DEFAULT_SCOPE__", {})
        info = (scope.get("webapp.user-detail", {}) or {}).get("userInfo")
        if not info:
            return None
        return _parse("tiktok", handle, info)
    except Exception as e:
        logger.info("[social_lookup] tt keyless %s failed: %s", handle, e)
        return None


async def _keyless(platform: str, handle: str) -> Optional[dict]:
    if platform == "instagram":
        return await _ig_keyless(handle)
    if platform == "tiktok":
        return await _tt_keyless(handle)
    return None


# --- Tier 2: RapidAPI fallback (only if a key is configured) -----------------

async def _rapidapi(platform: str, handle: str) -> Optional[dict]:
    key = (settings.rapidapi_key or "").strip()
    if not key:
        return None
    if platform == "instagram":
        host = settings.rapidapi_ig_host
        url = f"https://{host}/v1/info"
        params = {"username_or_id_or_url": handle}
    elif platform == "tiktok":
        host = settings.rapidapi_tt_host
        url = f"https://{host}/user/info"
        params = {"unique_id": handle}
    else:
        return None
    headers = {"x-rapidapi-key": key, "x-rapidapi-host": host}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            return None
        return _parse(platform, handle, resp.json())
    except Exception as e:
        logger.info("[social_lookup] rapidapi %s %s failed: %s", platform, handle, e)
        return None


async def lookup_profile(platform: str, raw_handle: str) -> Optional[dict]:
    """Public profile signal for a handle. Always returns at least the canonical
    URL fields (found=False) so callers can store the link even on failure."""
    handle = clean_handle(raw_handle)
    if not handle:
        return None

    # 1) free keyless first — no key, works great from a residential IP.
    enriched = await _keyless(platform, handle)

    # 2) paid fallback only if keyless found nothing AND a key is set.
    if (not enriched or not enriched.get("found")) and (settings.rapidapi_key or "").strip():
        rp = await _rapidapi(platform, handle)
        if rp and rp.get("found"):
            enriched = rp

    return enriched or _build(platform, handle, found=False)
