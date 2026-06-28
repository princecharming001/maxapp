"""Public social-profile lookup for creator applications.

Given an Instagram or TikTok handle, fetch the PUBLIC profile signal we use to
gauge a creator: follower count, avatar, display name, verified badge. This is
read-only enrichment — we never authenticate as the user.

Provider-agnostic by design. The default talks to RapidAPI scrapers (one key,
swappable host per platform). Response shapes differ wildly between scrapers, so
parsing is deliberately DEFENSIVE: we walk the JSON for any of the well-known
field names rather than hard-coding one vendor's schema. If no key is configured
or the call fails, we return None and the application flow degrades gracefully
to "handle only" (still stores the canonical profile URL).

To use: set RAPIDAPI_KEY (and optionally RAPIDAPI_IG_HOST / RAPIDAPI_TT_HOST to
whichever scraper you subscribed to). See config.py.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(12.0, connect=6.0)

# Field-name candidates we accept from whatever scraper is wired up.
_FOLLOWER_KEYS = (
    "follower_count", "followers_count", "followers", "edge_followed_by",
    "fans", "followerCount", "follower",
)
_AVATAR_KEYS = (
    "profile_pic_url_hd", "profile_pic_url", "profile_picture", "avatar",
    "avatar_larger", "avatar_medium", "avatarThumb", "hd_profile_pic_url_info",
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
        # last meaningful path segment of a profile URL
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
        # some scrapers nest the url, e.g. {'url_list': [...]} or {'url': ...}
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


def _parse(platform: str, handle: str, data: Any) -> dict:
    followers = _coerce_count(_deep_find(data, _FOLLOWER_KEYS))
    avatar = _coerce_url(_deep_find(data, _AVATAR_KEYS))
    name = _deep_find(data, _NAME_KEYS)
    verified = _deep_find(data, _VERIFIED_KEYS)
    found = followers is not None or avatar is not None or bool(name)
    return {
        "platform": platform,
        "handle": handle,
        "url": canonical_url(platform, handle),
        "followers": followers,
        "avatar_url": avatar,
        "full_name": str(name) if name else None,
        "verified": bool(verified) if verified is not None else False,
        "found": found,
    }


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
            logger.info("[social_lookup] %s %s -> HTTP %s", platform, handle, resp.status_code)
            return None
        return _parse(platform, handle, resp.json())
    except Exception as e:  # network, JSON, anything — degrade gracefully
        logger.info("[social_lookup] %s %s failed: %s", platform, handle, e)
        return None


async def lookup_profile(platform: str, raw_handle: str) -> Optional[dict]:
    """Public profile signal for a handle, or None when unavailable.

    Always returns at least the canonical URL fields when a handle is valid even
    if the provider has no key / fails — so callers can store the link.
    """
    handle = clean_handle(raw_handle)
    if not handle:
        return None
    base = {
        "platform": platform,
        "handle": handle,
        "url": canonical_url(platform, handle),
        "followers": None,
        "avatar_url": None,
        "full_name": None,
        "verified": False,
        "found": False,
    }
    provider = (settings.social_lookup_provider or "").strip().lower()
    enriched: Optional[dict] = None
    if provider == "rapidapi":
        enriched = await _rapidapi(platform, handle)
    return enriched or base
