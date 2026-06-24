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
    brand: str = ""   # catalog brand; "" for live hits
    image: str = ""   # curated catalog image URL; "" for live hits

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
    parts = [p for p in (base, bias) if p]
    return " ".join(parts)[:120]


def _amazon_search_url(query: str) -> str:
    """Build a clean Amazon search URL from free-text. Always lands on
    a real product results page on amazon.com, which is the most
    reliable thing we can hand the user without PA-API credentials.
    Replaces the prior DDG → /dp/<ASIN> scraping path which was
    chronically unreliable: DDG indexes lag Amazon's catalog (stale
    ASINs that 404), Amazon serves bot-shaped UAs different HTML so
    the liveness probe was bouncing, and Render's egress was getting
    rate-limited."""
    import urllib.parse as _u
    q = _u.quote_plus(query.strip()[:120])
    return f"https://www.amazon.com/s?k={q}"


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

# Cache of {url: (timestamp, (alive, title))} so repeated calls for the
# same query don't re-hit Amazon. TTL: 24h. Capped at 2k entries.
_LIVE_CHECK_CACHE: dict[str, tuple[float, tuple[bool, str]]] = {}
_LIVE_CHECK_TTL_S = 86400.0
_LIVE_CHECK_MAX = 2048


_TITLE_RE = re.compile(
    r'<span\s+id="productTitle"[^>]*>([^<]+)</span>',
    re.IGNORECASE | re.DOTALL,
)
_HEAD_TITLE_RE = re.compile(r"<title>([^<]+)</title>", re.IGNORECASE)


async def _probe_url(url: str, *, timeout_s: float = 4.5) -> tuple[bool, str]:
    """Fetch enough of `url` to decide both:
       (a) is it serving a real product page (alive=True)
       (b) what is the product title (so the caller can verify relevance)

    Strategy:
      - Range 0-32K so we read enough HTML to capture <title> AND the
        productTitle span without downloading full marketing assets.
      - Real-browser User-Agent (Amazon serves a different shell to
        scraper-shaped UAs and the title element changes).
      - Returns (alive, title). On any network error we now return
        (False, "") — fail-CLOSED. The previous fail-open policy let
        invalid links through under flaky network conditions.
    """
    import time
    cached = _LIVE_CHECK_CACHE.get(url)
    if cached and (time.time() - cached[0]) < _LIVE_CHECK_TTL_S:
        # Cache holds (alive, title) tuples now — pull both.
        return cached[1]   # type: ignore[return-value]

    result: tuple[bool, str] = (False, "")
    try:
        import httpx
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
            r = await client.get(
                url,
                headers={**headers, "Range": "bytes=0-32768"},
            )
            final = str(r.url).lower()
            status = r.status_code
            alive = (
                status in (200, 206)
                and "/dp/" in final
                and "/errors/" not in final
                and "/ref=cs_503" not in final
                and "/b?node=" not in final
                and not re.match(
                    r"^https?://(?:www\.)?amazon\.com/?(?:\?[^#]*)?$",
                    final,
                )
            )
            title = ""
            if alive and r.text:
                body = r.text[:32000]
                low = body.lower()
                if (
                    ("currently unavailable" in low and "we don't know when" in low)
                    or "page not found" in low
                    or "we couldn't find that page" in low
                    or "looking for something?" in low   # Amazon's 404 footer
                ):
                    alive = False
                else:
                    m = _TITLE_RE.search(body)
                    if not m:
                        m = _HEAD_TITLE_RE.search(body)
                    if m:
                        title = re.sub(r"\s+", " ", m.group(1)).strip()
                        # Trim Amazon's "Amazon.com:" prefix and any
                        # trailing " : ..." junk.
                        title = re.sub(r"^amazon\.com\s*:?\s*", "", title, flags=re.IGNORECASE)
                        title = title[:300]
            result = (alive, title)
    except Exception as e:
        logger.debug("[product_search] probe net err for %s: %s", url, e)
        # FAIL-CLOSED — bad link is worse than no link.
        result = (False, "")

    _LIVE_CHECK_CACHE[url] = (time.time(), result)   # type: ignore[assignment]
    if len(_LIVE_CHECK_CACHE) > _LIVE_CHECK_MAX:
        ranked = sorted(_LIVE_CHECK_CACHE.items(), key=lambda kv: kv[1][0])
        for k, _ in ranked[: len(_LIVE_CHECK_CACHE) // 4]:
            _LIVE_CHECK_CACHE.pop(k, None)
    return result


# Backward-compat shim — anything outside this module still calling
# _is_alive(url) just gets the boolean.
async def _is_alive(url: str, *, timeout_s: float = 4.5) -> bool:
    alive, _title = await _probe_url(url, timeout_s=timeout_s)
    return alive
    return alive


_STOPWORDS = {
    "the", "and", "for", "with", "of", "a", "an", "to", "in", "on",
    "best", "good", "top", "your", "you", "buy", "amazon", "site", "com",
}


def _query_keywords(query: str) -> set[str]:
    """Tokenize a user query into meaningful keywords for relevance check."""
    if not query:
        return set()
    toks = re.findall(r"[a-z0-9]{3,}", query.lower())
    return {t for t in toks if t not in _STOPWORDS}


def _title_matches_query(title: str, query_keywords: set[str]) -> bool:
    """Does the product title contain at least one query keyword?

    Conservative: if we have NO keywords (empty query) we accept (no
    filter signal). Otherwise we require ≥1 overlap so the linked
    product is at least topically adjacent to what the user asked.
    Drops the "user asks for moisturizer, DDG returns moisturizer-themed
    coffee mug" failure mode the user reported.
    """
    if not query_keywords:
        return True
    if not title:
        return False
    title_toks = set(re.findall(r"[a-z0-9]{3,}", title.lower()))
    return bool(query_keywords & title_toks)


async def _filter_alive(
    hits: list["ProductHit"],
    *,
    limit: int,
    query_keywords: Optional[set[str]] = None,
) -> list["ProductHit"]:
    """Run liveness + relevance checks in parallel; return up to `limit`
    ProductHits whose URLs Amazon is serving AND whose product title
    overlaps the user's query keywords.

    Two-stage filter (alive AND relevant) is what catches the
    "valid-but-wrong-product" failure mode. Order preserved (search-rank).
    Bounded at `limit * 3` candidates so an all-dead/all-irrelevant
    query can't blow the timeout budget."""
    if not hits:
        return []
    candidates = hits[: max(limit * 3, limit)]
    results = await asyncio.gather(
        *[_probe_url(h.url) for h in candidates],
        return_exceptions=True,
    )
    out: list[ProductHit] = []
    for h, res in zip(candidates, results):
        if isinstance(res, Exception):
            continue
        alive, title = res
        if not alive:
            continue
        if query_keywords and not _title_matches_query(title, query_keywords):
            logger.debug(
                "[product_search] dropping irrelevant hit: %s (title=%r, keywords=%s)",
                h.url, title, query_keywords,
            )
            continue
        # Upgrade the hit's name to the actual Amazon title when we have
        # one — DDG titles are often truncated or cluttered.
        if title and len(title) > len(h.name):
            h = ProductHit(name=title[:120], url=h.url, snippet=h.snippet, source=h.source)
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
    """Build a deterministic Amazon search URL from `query` and return
    it as a single ProductHit. ALWAYS works — there's no probe to fail,
    no DDG index to be stale.

    Why we abandoned the DDG → /dp/<ASIN> scrape:
      - DDG indexes lag Amazon's catalog by weeks, so the ASINs DDG
        knows about are often delisted by the time we link them.
      - Amazon serves bot-shaped UAs different HTML, so the liveness
        probe was getting bounced and we were dropping good links.
      - Render's egress IPs get rate-limited by Amazon under load.
      - Even when liveness passed, the product on the page wasn't
        always the right one (the "moisturizer mug" failure mode).

    A search URL sidesteps every one of those: it lands on Amazon's
    own ranked results for the keyword, which is exactly what the user
    would do anyway. We give the user one click + Amazon's choice of
    best matches, instead of zero-or-one possibly-wrong hand-picked
    product. Catalog hits (find_or_search → product_catalog) still
    return curated /dp/ URLs first; this is only the FALLBACK.
    """
    shaped = _shape_query(query, module)
    if not shaped:
        return []
    url = _amazon_search_url(shaped)
    _record_url(url)
    title = f"Search Amazon: {shaped[:80]}"
    logger.info(
        "[product_search] live → search-URL fallback for %r (module=%s)",
        shaped, module,
    )
    return [
        ProductHit(
            name=title,
            url=url,
            snippet=f"Amazon results for '{shaped[:60]}'",
            source="live",
        )
    ]


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
                    brand=p.brand,
                    image=p.image,
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
