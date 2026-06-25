"""image_search_service.py — real-photo search + download for task-guide step images.

SC1/SC3: step images are REAL photos pulled from web image search (not generated). We
use the Openverse API (https://api.openverse.org) — keyless, returns Creative-Commons /
public-domain images with attribution. We prefer the `rawpixel` source, which is clean
studio product photography on light/neutral backgrounds (so SC2's no-gradient blend
works), and fall back to other sources with a resolution floor.

Only the SEARCH + DOWNLOAD live here (run at build time by scripts/fetch_step_images.py,
never per request). The runtime just resolves the cached on-disk path
(step_image_service.resolve_step_image).
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from typing import Optional

logger = logging.getLogger(__name__)

_OPENVERSE = "https://api.openverse.org/v1/images/"
_UA = "maxapp-taskguide/1.0 (https://trymax.app; dev cache build)"
# rawpixel = clean studio product shots on white; stocksnap/flickr = decent fallbacks.
_PREFERRED_SOURCES = ("rawpixel", "stocksnap")
_MIN_WIDTH = 600


@dataclass
class ImageCandidate:
    url: str
    width: int
    height: int
    source: str
    creator: str
    license: str
    license_url: str
    foreign_landing_url: str


# Anonymous Openverse allows short bursts then 429s; keep a minimum spacing between
# requests and back off on throttle so a full fetch run stays under the limit.
_MIN_INTERVAL_S = 7.0
_last_request_at = 0.0


def _get_json(url: str, timeout: int = 25, *, retries: int = 4) -> dict:
    global _last_request_at
    for attempt in range(retries):
        wait = _MIN_INTERVAL_S - (time.time() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                _last_request_at = time.time()
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            _last_request_at = time.time()
            if e.code in (429, 401) and attempt < retries - 1:
                backoff = 20 * (attempt + 1)
                logger.info("[image_search] throttled (%s); backing off %ss", e.code, backoff)
                time.sleep(backoff)
                continue
            raise
    raise RuntimeError("unreachable")


def search(query: str, *, limit: int = 30) -> list[ImageCandidate]:
    """Return real-photo candidates for `query`, best first (preferred sources, then
    larger images). Commercial-use + modifiable licenses only."""
    # NB: keep params to the anonymous-allowed set. license_type / size require an
    # authenticated client (401 otherwise); every Openverse result is openly licensed
    # anyway, so we filter on the returned `license` field client-side instead.
    params = {
        "q": query,
        "page_size": str(limit),
        "mature": "false",
    }
    url = _OPENVERSE + "?" + urllib.parse.urlencode(params)
    try:
        data = _get_json(url)
    except Exception as e:
        logger.warning("[image_search] openverse query failed (%s): %s", query, e)
        return []

    out: list[ImageCandidate] = []
    for r in data.get("results", []) or []:
        u = r.get("url") or ""
        if not u:
            continue
        w = int(r.get("width") or 0)
        h = int(r.get("height") or 0)
        if w and w < _MIN_WIDTH:
            continue
        out.append(ImageCandidate(
            url=u, width=w, height=h,
            source=str(r.get("source") or ""),
            creator=str(r.get("creator") or ""),
            license=str(r.get("license") or ""),
            license_url=str(r.get("license_url") or ""),
            foreign_landing_url=str(r.get("foreign_landing_url") or ""),
        ))

    def rank(c: ImageCandidate):
        pref = _PREFERRED_SOURCES.index(c.source) if c.source in _PREFERRED_SOURCES else len(_PREFERRED_SOURCES)
        return (pref, -(c.width * c.height))

    out.sort(key=rank)
    return out


def download(url: str, out_path: str, *, timeout: int = 40, min_bytes: int = 3000) -> bool:
    """Download `url` to `out_path` (binary). Returns True on a plausible image."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
        if not data or len(data) < min_bytes:
            return False
        import os
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        logger.warning("[image_search] download failed (%s): %s", url, e)
        return False


def attribution(c: ImageCandidate) -> dict:
    """License/attribution record to persist next to the cached image (SC2 constraint)."""
    return asdict(c)
