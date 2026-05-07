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
_AMAZON_DP_RE = re.compile(
    r"https?://(?:www\.)?amazon\.[a-z.]+/(?:[^?#\s]*?/)?dp/([A-Z0-9]{10})(?:[/?#]|$)",
    re.IGNORECASE,
)
# Acceptable secondary forms — `/gp/product/<ASIN>` is the legacy mobile path.
_AMAZON_GP_RE = re.compile(
    r"https?://(?:www\.)?amazon\.[a-z.]+/gp/product/([A-Z0-9]{10})(?:[/?#]|$)",
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
#  Main entrypoints                                                      #
# ---------------------------------------------------------------------- #

async def search_live(
    query: str,
    *,
    module: Optional[str] = None,
    max_results: int = 3,
) -> list[ProductHit]:
    """Issue a constrained DDG search and return up to `max_results`
    real Amazon product hits. Empty list on no match / search failure."""
    shaped = _shape_query(query, module)
    if not shaped:
        return []
    try:
        from services.web_search import _ddg_search
        # Ask for more raw results than we need — most won't be /dp/<ASIN>.
        raw = await asyncio.wait_for(
            asyncio.to_thread(_ddg_search, shaped, max_results * 5, None),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        logger.info("[product_search] timeout for %r", shaped)
        return []
    except Exception as e:
        logger.info("[product_search] failed for %r: %s", shaped, e)
        return []

    hits: list[ProductHit] = []
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

        hits.append(ProductHit(
            name=title,
            url=clean,
            snippet=snippet,
            source="live",
        ))
        _record_url(clean)
        if len(hits) >= max_results:
            break

    logger.info(
        "[product_search] %d hits for %r (module=%s, raw=%d)",
        len(hits), shaped, module, len(raw or []),
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
