"""Live product-link search.

Complements `services.product_catalog` (the hand-curated, fact-filtered
catalog) with a live web-search path. When the user asks for a product
the catalog doesn't cover, we issue a constrained search query, parse
the results for direct-product URLs (Amazon `/dp/<ASIN>` shape), and
return them as Product-shaped objects that the chat agent can cite.

Design rules (mirror the catalog module's contract):

  1. **Direct product URLs only.** We accept results matching
     `amazon.com/.../dp/<ASIN>` (10+ alphanumeric chars). Search-result
     URLs (`/s?k=`), category pages, profile pages, etc. are dropped.
     If no result matches, return [] — better than returning a non-
     product link.

  2. **Cache aggressively.** Identical queries within an hour return the
     cached result, so a busy chat session doesn't keep hitting DDG.

  3. **Allow-list integration.** Every URL we return is added to a
     session-local `_LIVE_ALLOWLIST` so the downstream
     `link_validator.allowed_urls()` doesn't strip the link the agent
     just cited (the validator was originally built around the static
     catalog).

  4. **Module-aware query shaping.** A bare "moisturizer" search returns
     anything; a skinmax-tagged "moisturizer" search reformulates to
     "best moisturizer for sensitive skin" so results are coach-relevant.

The chat agent's `recommend_product` tool calls `find_or_search` — the
combined catalog-then-live entrypoint — so the LLM sees a single block
of vetted product links regardless of which path produced them.

API:
  search_live(query, module, max_results)  → list[ProductHit]
  find_or_search(module, concerns, ...)    → list[ProductHit]
  format_for_prompt(hits)                  → str
  live_allowed_urls()                      → set[str]
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Iterable, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------- #
#  Types                                                                 #
# ---------------------------------------------------------------------- #

@dataclass(frozen=True)
class ProductHit:
    """Live-search result, shaped like product_catalog.Product enough to
    use the same prompt formatter / link-validator integration."""
    name: str
    url: str          # canonical /dp/<ASIN> form
    snippet: str      # short DDG result snippet, ≤200 chars
    source: str       # "catalog" | "live"

    def to_markdown_bullet(self, max_snippet_chars: int = 100) -> str:
        s = self.snippet or ""
        if len(s) > max_snippet_chars:
            s = s[: max_snippet_chars - 1].rstrip() + "…"
        sep = " — " if s else ""
        return f"- [{self.name}]({self.url}){sep}{s}"


# ---------------------------------------------------------------------- #
#  URL filtering                                                         #
# ---------------------------------------------------------------------- #

# Real Amazon product URL: `https://www.amazon.com/<anything>/dp/<ASIN>/?...`
# ASIN is 10 alphanumeric chars (Amazon's stable product identifier).
#
# We RESTRICT to `amazon.com` (US storefront) only — regional URLs like
# amazon.de, amazon.co.uk, amazon.ca route the user to a foreign locale
# they can't easily checkout from, AND the same ASIN often points at a
# different product on different storefronts. The user reported invalid
# links, and a chunk of the badness was DDG returning regional Amazon
# pages mixed with the .com results.
_AMAZON_DP_RE = re.compile(
    r"https?://(?:www\.|smile\.)?amazon\.com/(?:[^?#\s]*?/)?dp/([A-Z0-9]{10})(?:[/?#]|$)",
    re.IGNORECASE,
)
# Acceptable secondary forms — `/gp/product/<ASIN>` is the legacy mobile path.
_AMAZON_GP_RE = re.compile(
    r"https?://(?:www\.|smile\.)?amazon\.com/gp/product/([A-Z0-9]{10})(?:[/?#]|$)",
    re.IGNORECASE,
)


def _extract_asin_url(url: str) -> Optional[str]:
    """Return a clean canonical Amazon URL if `url` is a direct product
    page, else None. Strips marketing query strings (?ref=, ?tag=, etc.)
    so the catalog doesn't end up with 5 variants of the same product."""
    if not url:
        return None
    m = _AMAZON_DP_RE.search(url) or _AMAZON_GP_RE.search(url)
    if not m:
        return None
    asin = m.group(1).upper()
    # Try to preserve the slug between `amazon.com/` and `/dp/` so users
    # see a readable URL — the slug is purely cosmetic to Amazon.
    slug_m = re.search(
        r"https?://(?:www\.)?amazon\.[a-z.]+/([^/?#\s]+)/dp/",
        url, re.IGNORECASE,
    )
    if slug_m:
        slug = slug_m.group(1)
        return f"https://www.amazon.com/{slug}/dp/{asin}"
    return f"https://www.amazon.com/dp/{asin}"


# ---------------------------------------------------------------------- #
#  Query shaping                                                         #
# ---------------------------------------------------------------------- #

# How each module's queries should be biased so search results align with
# coaching context. "skinmax + retinoid" → "retinoid for skin acne anti-aging"
# returns more product-relevant results than the bare ingredient name.
_MODULE_QUERY_HINTS: dict[str, str] = {
    "skinmax":   "skincare",
    "hairmax":   "hair care",
    "fitmax":    "supplement",
    "heightmax": "posture",
    "bonemax":   "jaw face",
}


def _shape_query(query: str, module: Optional[str]) -> str:
    base = (query or "").strip()
    if not base:
        return ""
    bias = _MODULE_QUERY_HINTS.get((module or "").strip().lower(), "")
    # Constrain to amazon — the validator only accepts `/dp/<ASIN>` URLs
    # so non-Amazon results would just get dropped.
    parts = [p for p in (base, bias, "site:amazon.com") if p]
    return " ".join(parts)[:180]


# ---------------------------------------------------------------------- #
#  Session allow-list                                                    #
# ---------------------------------------------------------------------- #

# URLs we've returned to the agent within the last hour. The link
# validator merges this with the static catalog allow-list so the agent
# can cite live-search URLs without the validator stripping them. Cleaned
# up by `_GC_AT` periodically.
_LIVE_ALLOWLIST: dict[str, float] = {}
_ALLOWLIST_TTL_S = 3600.0
_ALLOWLIST_MAX = 1024


def _record_url(url: str) -> None:
    import time
    now = time.time()
    _LIVE_ALLOWLIST[url] = now
    if len(_LIVE_ALLOWLIST) > _ALLOWLIST_MAX:
        # Drop oldest 25%.
        ranked = sorted(_LIVE_ALLOWLIST.items(), key=lambda kv: kv[1])
        for k, _ in ranked[: len(_LIVE_ALLOWLIST) // 4]:
            _LIVE_ALLOWLIST.pop(k, None)


def live_allowed_urls() -> set[str]:
    """URLs returned by recent live searches. Merged with the static
    catalog allow-list by `link_validator._is_catalog_url`."""
    import time
    now = time.time()
    return {
        u for u, t in list(_LIVE_ALLOWLIST.items())
        if (now - t) < _ALLOWLIST_TTL_S
    }


# ---------------------------------------------------------------------- #
#  URL liveness check                                                    #
# ---------------------------------------------------------------------- #

# Cache of {url: is_alive} so repeated calls for the same query don't
# re-hit Amazon. TTL: 24h. Capped at 2k entries.
_LIVE_CHECK_CACHE: dict[str, tuple[float, bool]] = {}
_LIVE_CHECK_TTL_S = 86400.0
_LIVE_CHECK_MAX = 2048


async def _is_alive(url: str, *, timeout_s: float = 4.0) -> bool:
    """HEAD-request `url` and decide if Amazon is currently serving a
    real product page for it.

    Heuristic:
      - 200/301/302 with a final URL still on amazon.com/.../dp/<ASIN>
        (NOT redirected to /errors/, /b?node=, or homepage) → alive.
      - 404, 410, or redirect to a search/error page → dead.

    Network errors fail-open (return True) — we'd rather show a slightly-
    stale link than block the agent's whole reply on a flaky connection.
    The cache TTL handles repeat damage if the URL is genuinely dead.
    """
    import time
    now = time.time()
    cached = _LIVE_CHECK_CACHE.get(url)
    if cached and (now - cached[0]) < _LIVE_CHECK_TTL_S:
        return cached[1]

    alive = True   # fail-open default
    try:
        import httpx
        # Amazon serves different pages to bot UAs; mimic a desktop browser.
        # `allow_redirects=True` so we see where Amazon ultimately lands.
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/16.6 Safari/605.1.15"
            ),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout_s,
            headers=headers,
        ) as client:
            # Use GET (range-limited) — Amazon often blocks plain HEAD.
            r = await client.get(url, headers={**headers, "Range": "bytes=0-2048"})
            final = str(r.url).lower()
            status = r.status_code
            alive = (
                status in (200, 206)
                and "/dp/" in final
                and "/errors/" not in final
                and "/ref=cs_503" not in final
                and "/b?node=" not in final
                # If Amazon bounced to homepage, it's a soft-404.
                and not re.match(
                    r"^https?://(?:www\.)?amazon\.com/?(?:\?[^#]*)?$",
                    final,
                )
            )
            # Body-level sanity: if the page literally says "Currently
            # unavailable" or "we couldn't find that page", treat as dead.
            if alive and r.text:
                txt = r.text[:8000].lower()
                if (
                    "currently unavailable" in txt and "we don't know when" in txt
                ) or (
                    "page not found" in txt or "we couldn't find that page" in txt
                ):
                    alive = False
    except Exception as e:
        logger.debug("[product_search] liveness probe network err for %s: %s", url, e)
        alive = True   # fail-open

    _LIVE_CHECK_CACHE[url] = (now, alive)
    if len(_LIVE_CHECK_CACHE) > _LIVE_CHECK_MAX:
        ranked = sorted(_LIVE_CHECK_CACHE.items(), key=lambda kv: kv[1][0])
        for k, _ in ranked[: len(_LIVE_CHECK_CACHE) // 4]:
            _LIVE_CHECK_CACHE.pop(k, None)
    return alive


async def _filter_alive(hits: list["ProductHit"], *, limit: int) -> list["ProductHit"]:
    """Run liveness checks in parallel; return up to `limit` ProductHits
    whose URLs Amazon is currently serving as real product pages.

    Order is preserved (search-rank order) — we don't re-rank by
    liveness, just drop dead links. Bounded at `limit * 2` checks so a
    pathological all-dead query doesn't blow the timeout budget."""
    if not hits:
        return []
    candidates = hits[: max(limit * 2, limit)]
    results = await asyncio.gather(
        *[_is_alive(h.url) for h in candidates],
        return_exceptions=True,
    )
    out: list[ProductHit] = []
    for h, ok in zip(candidates, results):
        if isinstance(ok, Exception):
            continue
        if ok:
            out.append(h)
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------- #
#  Main entrypoints                                                      #
# ---------------------------------------------------------------------- #

async def search_live(
    query: str,
    *,
    module: Optional[str] = None,
    max_results: int = 3,
) -> list[ProductHit]:
    """Issue a constrained DDG search and return up to `max_results`
    real Amazon product hits. Empty list on no match / search failure.

    Two-stage filter:
      1. URL shape — must match `amazon.com/.../dp/<ASIN>` (US only).
      2. Liveness — HEAD/GET the URL and confirm Amazon is currently
         serving a real product page (not 404 / 'currently unavailable'
         / redirect-to-homepage). Cached 24h per URL.

    Stage 2 protects against the "links aren't valid" failure mode the
    user reported — DDG's index lags Amazon's catalog by weeks, so
    plain search results regularly include delisted ASINs."""
    shaped = _shape_query(query, module)
    if not shaped:
        return []
    try:
        from services.web_search import _ddg_search
        # Ask for more raw results than we need — most won't be /dp/<ASIN>,
        # and of those that are, some will be dead. 8× over-fetch.
        raw = await asyncio.wait_for(
            asyncio.to_thread(_ddg_search, shaped, max_results * 8, None),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        logger.info("[product_search] timeout for %r", shaped)
        return []
    except Exception as e:
        logger.info("[product_search] failed for %r: %s", shaped, e)
        return []

    raw_hits: list[ProductHit] = []
    seen_asins: set[str] = set()
    for r in raw or []:
        url = (r.get("href") or r.get("url") or "").strip()
        clean = _extract_asin_url(url)
        if not clean:
            continue
        # Dedupe by ASIN — sometimes search returns 3 variants of the
        # same product (region pages, sponsored, etc.).
        asin_match = re.search(r"/dp/([A-Z0-9]{10})", clean)
        asin = asin_match.group(1) if asin_match else clean
        if asin in seen_asins:
            continue
        seen_asins.add(asin)

        title = (r.get("title") or "").strip()
        # Trim DDG's "Amazon.com: ..." prefix that adds no signal.
        title = re.sub(r"^amazon(?:\.[a-z]+)?\s*:?\s*", "", title, flags=re.IGNORECASE)
        # Truncate at the first " - " or " | " separator (Amazon
        # title-stuffs the URL slug after the brand+name).
        title = re.split(r"\s+[\|–—-]\s+", title, maxsplit=1)[0]
        title = title[:120].strip() or "Product on Amazon"

        snippet = (r.get("body") or r.get("snippet") or "").strip()
        snippet = re.sub(r"\s+", " ", snippet)[:200]

        raw_hits.append(ProductHit(
            name=title,
            url=clean,
            snippet=snippet,
            source="live",
        ))

    # Stage 2: liveness check. Drops 404s / "currently unavailable" /
    # redirect-to-homepage results. Parallelized; cached 24h.
    hits = await _filter_alive(raw_hits, limit=max_results)
    for h in hits:
        _record_url(h.url)

    logger.info(
        "[product_search] %d/%d alive for %r (module=%s, raw=%d)",
        len(hits), len(raw_hits), shaped, module, len(raw or []),
    )
    return hits


async def find_or_search(
    *,
    module: Optional[str],
    concerns: Optional[Iterable[str]],
    user_facts: Optional[dict] = None,
    limit: int = 3,
) -> list[ProductHit]:
    """Catalog-first, live-search-fallback. Returns Product-shaped hits
    that the agent can drop straight into a markdown link.

    Strategy:
      1. Hit the curated catalog. If it returns >= 1 result, stop —
         curated entries are fact-filtered and rationale-rich, which the
         live path can't be. (Live results are URLs only.)
      2. If catalog returns 0 (rare after the synonym + soft-fallback
         changes, but possible for genuinely-novel concerns), issue a
         constrained DDG search and return up to `limit` real Amazon
         product URLs.

    Always returns at least an empty list — never raises."""
    concern_list = [c for c in (concerns or []) if c]
    # ---- 1. Curated catalog ------------------------------------------ #
    try:
        from services.product_catalog import find_products
        cat_hits = find_products(
            module=module,
            concerns=concern_list,
            user_facts=user_facts,
            limit=limit,
        )
        if cat_hits:
            return [
                ProductHit(
                    name=p.name,
                    url=p.display_url,
                    snippet=p.rationale,
                    source="catalog",
                )
                for p in cat_hits
            ]
    except Exception as e:
        logger.warning("[product_search] catalog lookup failed: %s", e)

    # ---- 2. Live search fallback ------------------------------------- #
    # Compose a search query from the concern list + module hint. Use
    # the first 2 concerns to keep the query short.
    q = " ".join(concern_list[:2]) if concern_list else (module or "")
    return await search_live(q, module=module, max_results=limit)


# ---------------------------------------------------------------------- #
#  Prompt formatting (mirrors product_catalog.format_for_prompt)         #
# ---------------------------------------------------------------------- #

def format_for_prompt(
    hits: list[ProductHit],
    *,
    header: str = "## CATALOG-VETTED PRODUCTS (use these EXACT links — do not invent URLs)",
) -> str:
    if not hits:
        return ""
    lines = [h.to_markdown_bullet() for h in hits]
    return f"{header}\n" + "\n".join(lines)
