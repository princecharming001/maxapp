"""Post-generation link validator.

Goal: every product link in a chat reply must point to a SPECIFIC product
page (Amazon `/dp/<ASIN>`, brand-direct product URL, etc.) — never an
Amazon search URL or an LLM-fabricated link.

Strategy:
  1. Resolve catalog brand mentions to direct URLs. If the bot wrote
     "CeraVe Hydrating Cleanser" with no link, append the catalog link.
  2. Detect existing links in the answer:
     - If the URL is in the catalog's allowed_urls() → keep as-is.
     - If it's an `amazon.com/s?k=...` SEARCH URL → swap for the catalog
       URL of whatever product name the link wraps. If we can't match,
       drop the URL entirely (keep the visible text).
     - If it's a non-catalog vendor URL → drop the URL.
  3. Idempotent: running the validator twice produces the same output.

The validator runs after both fast_rag and the agent path, so closed-
loop enforcement holds regardless of which route produced the answer.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Markdown link `[text](url)` — text is non-greedy, URL stops at `)`.
# Real links (must start with http(s)).
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
# Placeholder/garbage in the URL slot, e.g. `[CeraVe](link)` /
# `[CeraVe](url)` / `[CeraVe](here)` / `[CeraVe](TBD)`. The LLM
# sometimes emits these when it forgets to call recommend_product.
# We detect any `[label](nonurl)` form and try to resolve the label
# to the catalog; if we can't, we strip the link wrapper entirely.
_MD_PLACEHOLDER_RE = re.compile(
    r"\[([^\]]+)\]\(\s*((?!https?://)[^)\s][^)]*)\s*\)"
)

# Bare URL (not inside markdown brackets — best-effort).
_BARE_URL_RE = re.compile(r"(?<![\(\[])\bhttps?://[^\s)\]\>]+")

# Amazon search URL — `/s?k=...` or `/s/?k=...` or `?field-keywords=` etc.
_AMAZON_SEARCH_RE = re.compile(
    r"https?://(?:www\.)?amazon\.[a-z.]+/s[?/].*",
    re.IGNORECASE,
)

# Generic search URLs we should never ship.
_OTHER_SEARCH_RE = re.compile(
    r"https?://(?:www\.)?(?:google|bing|duckduckgo|sephora|ulta|target|walmart)\.[a-z.]+/(?:search|s|sr)\b",
    re.IGNORECASE,
)


def _is_catalog_url(url: str) -> bool:
    """Accept URLs from EITHER the static curated catalog OR the live
    product-search session allow-list. Live URLs are added by
    `services.product_search` whenever it returns a hit, so the agent
    can cite a real DDG-sourced /dp/<ASIN> link without the validator
    stripping it as 'not catalog'."""
    u = url.strip()
    try:
        from services.product_catalog import allowed_urls as _catalog_urls
        if u in _catalog_urls():
            return True
    except Exception:
        pass
    try:
        from services.product_search import live_allowed_urls as _live_urls
        if u in _live_urls():
            return True
    except Exception:
        pass
    return False


def _resolve_to_catalog(visible_text: str) -> Optional[str]:
    """If the visible text matches a catalog product, return its
    DIRECT long-form product URL (`amazon.com/<Slug>/dp/<ASIN>`)."""
    try:
        from services.product_catalog import lookup_by_name
        hit = lookup_by_name(visible_text)
        if hit:
            return hit.display_url
    except Exception:
        return None
    return None


def _is_bad_url(url: str) -> bool:
    if not url:
        return False
    if _is_catalog_url(url):
        return False
    # Amazon search URLs (`/s?k=...`) are now ACCEPTED — they're our
    # live-fallback path when the curated catalog can't match. A search
    # URL is far better than no link at all (DDG /dp/<ASIN> scraping
    # was chronically broken: stale ASINs, bot-blocked probes). The
    # search URL always lands on a real Amazon page where the user
    # picks the product Amazon ranks best for the keyword.
    if _AMAZON_SEARCH_RE.match(url):
        return False
    # Generic non-amazon search URLs (google/bing/etc.) are still bad —
    # they don't lead to anywhere useful for buying.
    if _OTHER_SEARCH_RE.match(url):
        return True
    # Anything else from amazon.com that isn't /dp/<ASIN> or /s?k= is
    # suspect — the LLM hallucinated.
    if re.match(r"https?://(?:www\.)?amazon\.[a-z.]+/", url, re.IGNORECASE):
        if "/dp/" not in url and "/gp/product/" not in url and "/s?" not in url:
            return True
    return False


# --------------------------------------------------------------------------- #
#  Catalog-link enrichment                                                    #
# --------------------------------------------------------------------------- #

def _enrich_brand_mentions(text: str, *, max_inserts: int = 4, matched: Optional[list] = None) -> tuple[str, int]:
    """Where the bot mentioned a catalog product by name without a link,
    append a `(<direct-url>)` next to the FIRST mention. Limited to
    `max_inserts` to avoid spammy answers. Resolved Products are appended to
    `matched` (for structured product cards)."""
    try:
        from services.product_catalog import load_catalog
        catalog = load_catalog()
    except Exception:
        return text, 0
    if not catalog:
        return text, 0

    inserts = 0
    out = text
    seen_ids: set[str] = set()

    # Build a [start, end) list of regions that are INSIDE existing
    # markdown links so we don't double-link or break existing markup.
    def _link_regions(s: str) -> list[tuple[int, int]]:
        return [(m.start(), m.end()) for m in re.finditer(r"\[[^\]]+\]\([^\)]+\)", s)]

    def _inside_link(pos: int, regions: list[tuple[int, int]]) -> bool:
        return any(a <= pos < b for a, b in regions)

    # Track text-surface candidate strings that have already been enriched
    # so a "The Ordinary" mention doesn't get matched 3 times by 3
    # different "The Ordinary X" catalog entries (each appending its
    # own [The Ordinary](url) pill next to the same brand mention).
    enriched_candidates: set[str] = set()

    # Iterate catalog with the LONGEST product names first. Without this,
    # "The Ordinary Hyaluronic Acid" would claim the "The Ordinary"
    # prefix in a sentence about "The Ordinary Niacinamide" before the
    # niacinamide entry got a chance to match its own (more specific)
    # name. Most-specific match wins.
    catalog_by_specificity = sorted(catalog, key=lambda p: -len(p.name))

    # Pre-compute which 2-token prefixes are SHARED by multiple catalog
    # products (e.g. "The Ordinary", "La Roche-Posay"). Don't auto-link
    # those — picking one arbitrarily would mislead the user. Specific
    # mentions ("The Ordinary Niacinamide") still match via 3-token /
    # full-name patterns above the 2-token candidate.
    _prefix_count: dict[str, int] = {}
    for _p in catalog:
        _toks = _p.name.split()
        if len(_toks) >= 2:
            key = " ".join(_toks[:2]).lower()
            _prefix_count[key] = _prefix_count.get(key, 0) + 1
    ambiguous_2token_prefixes = {k for k, v in _prefix_count.items() if v > 1}

    for p in catalog_by_specificity:
        if inserts >= max_inserts:
            break
        if p.id in seen_ids:
            continue
        # Skip if this product's URL is already in the answer.
        if p.url in out:
            seen_ids.add(p.id)
            continue
        # Try several name patterns in order: full catalog name first,
        # then progressively shorter prefixes (first 3 tokens, first 2)
        # so "EltaMD UV Clear" in the answer matches catalog name
        # "EltaMD UV Clear Broad-Spectrum SPF 46" without the LLM
        # having to type the full marketing string.
        name_tokens = p.name.split()
        candidates = [p.name]
        if len(name_tokens) > 3:
            candidates.append(" ".join(name_tokens[:3]))
        if len(name_tokens) > 2:
            two_tok = " ".join(name_tokens[:2])
            # Skip the 2-token candidate if it's a shared brand prefix
            # (multiple products start with it). Picking one arbitrarily
            # would mislead the user.
            if two_tok.lower() not in ambiguous_2token_prefixes:
                candidates.append(two_tok)
        m = None
        matched_label: str = p.name
        link_regions = _link_regions(out)
        for cand in candidates:
            # Skip a candidate that's already been enriched by an
            # earlier (more-specific) catalog product on this run.
            if cand.lower() in enriched_candidates:
                continue
            pat = re.compile(r"\b" + re.escape(cand) + r"\b", re.IGNORECASE)
            for hit in pat.finditer(out):
                # Skip matches that fall inside an existing link bubble
                # (would double-link or shred the markdown).
                if _inside_link(hit.start(), link_regions):
                    continue
                m = hit
                matched_label = cand
                break
            if m:
                break
        if m:
            ins = f" ([{matched_label}]({p.url}))"
            # Don't append if the next chars already look like a link.
            following = out[m.end(): m.end() + 5]
            if "](" in following or "(http" in following:
                seen_ids.add(p.id)
                continue
            out = out[: m.end()] + ins + out[m.end():]
            inserts += 1
            seen_ids.add(p.id)
            enriched_candidates.add(matched_label.lower())
            if matched is not None:
                matched.append(p)

    # Single-token brand fallback: scan for distinctive names ("Differin",
    # "Nizoral", "tretinoin", "creatine") not yet linked. Resolves via
    # lookup_by_name's distinctive-names map → direct catalog URL.
    if inserts < max_inserts:
        try:
            from services.product_catalog import lookup_by_name
        except Exception:
            lookup_by_name = None
        if lookup_by_name:
            DISTINCTIVE_TOKENS = (
                "tretinoin", "differin", "minoxidil", "rogaine", "finasteride",
                "kirkland", "nizoral", "ketoconazole", "creatine", "ashwagandha",
                "magnesium", "azelaic", "niacinamide", "centella",
            )
            for tok in DISTINCTIVE_TOKENS:
                if inserts >= max_inserts:
                    break
                pat = re.compile(rf"\b{re.escape(tok)}\b", re.IGNORECASE)
                regions = _link_regions(out)
                hit = None
                for h in pat.finditer(out):
                    if not _inside_link(h.start(), regions):
                        hit = h
                        break
                if not hit:
                    continue
                resolved = lookup_by_name(tok)
                if not resolved or resolved.id in seen_ids or resolved.url in out:
                    if resolved:
                        seen_ids.add(resolved.id)
                    continue
                ins = f" ([{hit.group(0)}]({resolved.url}))"
                out = out[: hit.end()] + ins + out[hit.end():]
                inserts += 1
                seen_ids.add(resolved.id)
                if matched is not None:
                    matched.append(resolved)

    return out, inserts


# --------------------------------------------------------------------------- #
#  Link rewriting                                                             #
# --------------------------------------------------------------------------- #

def _rewrite_md_links(text: str) -> tuple[str, int, int]:
    """Walk every `[label](url)`. If url is bad, swap it (or strip the
    link wrapper, leaving label as plain text)."""
    rewritten = 0
    stripped = 0

    def repl(m: re.Match) -> str:
        nonlocal rewritten, stripped
        label = m.group(1)
        url = m.group(2).strip()
        if not _is_bad_url(url):
            return m.group(0)
        # Try to upgrade to a catalog URL via the label.
        upgraded = _resolve_to_catalog(label)
        if upgraded:
            rewritten += 1
            return f"[{label}]({upgraded})"
        # Couldn't upgrade — drop the link wrapper, keep readable text.
        stripped += 1
        return label

    out = _MD_LINK_RE.sub(repl, text)
    return out, rewritten, stripped


def _rewrite_placeholder_links(text: str) -> tuple[str, int, int]:
    """Catch `[label](link)`, `[label](url)`, `[label](here)` and other
    non-URL placeholder slots the LLM sometimes emits when it forgets
    to call `recommend_product`. Try to resolve the label to a catalog
    URL; if no match, strip the link wrapper so only the readable name
    remains."""
    rewritten = 0
    stripped = 0

    def repl(m: re.Match) -> str:
        nonlocal rewritten, stripped
        label = m.group(1)
        upgraded = _resolve_to_catalog(label)
        if upgraded:
            rewritten += 1
            return f"[{label}]({upgraded})"
        stripped += 1
        return label

    out = _MD_PLACEHOLDER_RE.sub(repl, text)
    return out, rewritten, stripped


def _strip_bare_urls(text: str) -> tuple[str, int]:
    """Bare URLs (not in markdown links) — drop the bad ones outright.
    The catalog ones we leave alone."""
    stripped = 0

    def repl(m: re.Match) -> str:
        nonlocal stripped
        url = m.group(0)
        if _is_bad_url(url):
            stripped += 1
            return ""
        return url

    out = _BARE_URL_RE.sub(repl, text)
    # Tidy up double spaces / spaces-before-punct from removed URLs.
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    return out.strip(), stripped


# --------------------------------------------------------------------------- #
#  Public entry point                                                         #
# --------------------------------------------------------------------------- #

def _enrich_category_mentions(text: str, *, max_inserts: int = 2, matched: Optional[list] = None) -> tuple[str, int]:
    """When the bot mentions a product CATEGORY without any specific
    brand (e.g. 'use a moisturizer with ceramides', 'add creatine'),
    surface a single catalog pick for that category as an inline link.
    The brand enricher only fires on specific name mentions; this is
    the broader safety net so the user gets a link even when the LLM
    speaks generically.
    """
    try:
        from services.product_catalog import find_products
    except Exception:
        return text, 0
    # category → (module, concern_seed) pairs. The first existing,
    # non-already-linked match in the text gets the inline link.
    CATEGORIES: list[tuple[str, str, list[str]]] = [
        # token              module      concerns
        ("moisturizer",      "skinmax",  ["dryness", "barrier", "moisturizer"]),
        ("moisturiser",      "skinmax",  ["dryness", "barrier", "moisturizer"]),
        ("cleanser",         "skinmax",  ["gentle_cleansing", "cleanser"]),
        ("sunscreen",        "skinmax",  ["sun_protection", "spf"]),
        ("spf",              "skinmax",  ["sun_protection", "spf"]),
        ("retinoid",         "skinmax",  ["acne", "anti_aging", "retinoid"]),
        ("retinol",          "skinmax",  ["anti_aging", "retinol"]),
        ("vitamin c serum",  "skinmax",  ["pigmentation", "vitc", "anti_aging"]),
        ("niacinamide",      "skinmax",  ["pigmentation", "barrier"]),
        ("salicylic",        "skinmax",  ["acne", "blackheads"]),
        ("benzoyl peroxide", "skinmax",  ["acne"]),
        ("shampoo",          "hairmax",  ["scalp_health", "shampoo"]),
        ("conditioner",      "hairmax",  ["scalp_health"]),
        ("minoxidil",        "hairmax",  ["hair_loss", "regrowth", "minoxidil"]),
        ("finasteride",      "hairmax",  ["hair_loss"]),
        ("creatine",         "fitmax",   ["creatine", "muscle_gain", "strength"]),
        ("protein",          "fitmax",   ["protein", "muscle_gain"]),
        ("whey",             "fitmax",   ["protein"]),
        ("multivitamin",     "fitmax",   ["supplement"]),
        ("pre-workout",      "fitmax",   ["pre_workout"]),
        ("preworkout",       "fitmax",   ["pre_workout"]),
        ("electrolyte",      "fitmax",   ["hydration"]),
        ("mastic gum",       "bonemax",  ["jaw_training", "masseter"]),
        ("mouth tape",       "bonemax",  ["mewing", "nasal_breathing"]),
        ("inversion table",  "heightmax",["posture", "decompression"]),
        ("posture corrector","heightmax",["posture"]),
    ]
    inserts = 0
    out = text
    link_regions = [(m.start(), m.end()) for m in re.finditer(r"\[[^\]]+\]\([^\)]+\)", out)]

    def _inside_link(pos: int) -> bool:
        return any(a <= pos < b for a, b in link_regions)

    seen_modules: set[str] = set()
    for token, module, concerns in CATEGORIES:
        if inserts >= max_inserts:
            break
        if module in seen_modules:
            continue   # one category-link per module per response
        pat = re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)
        m = None
        for hit in pat.finditer(out):
            if _inside_link(hit.start()):
                continue
            # Skip when the brand enricher (or any prior pass) already
            # parked a link right after this token. Avoids double-linking
            # tokens like 'minoxidil' / 'creatine' where the distinctive-
            # token path in _enrich_brand_mentions already inserted a link.
            tail = out[hit.end(): hit.end() + 24]
            if re.match(r"\s*\(\[[^\]]+\]\(http", tail):
                continue
            m = hit
            break
        if not m:
            continue
        try:
            hits = find_products(module=module, concerns=concerns, limit=1)
        except Exception:
            hits = []
        if not hits:
            continue
        p = hits[0]
        ins = f" ([{p.brand or p.name}]({p.display_url}))"
        out = out[: m.end()] + ins + out[m.end():]
        link_regions = [(mr.start(), mr.end()) for mr in re.finditer(r"\[[^\]]+\]\([^\)]+\)", out)]
        inserts += 1
        seen_modules.add(module)
        if matched is not None:
            matched.append(p)
    return out, inserts


def validate_and_rewrite_links(text: str) -> str:
    """Sanitize an LLM-produced answer:

      1. Rewrite or strip bad markdown links (search URLs, hallucinated
         amazon links).
      2. Strip bad bare URLs.
      3. Append catalog direct links to brand mentions that lacked one.
      4. Append catalog category-pick links to category mentions
         ('moisturizer', 'creatine', 'shampoo', ...) when no brand-
         specific link is in the response yet.

    Idempotent. Safe to call on every answer.
    """
    if not text or not text.strip():
        return text
    original = text

    # Catalog Products resolved from prose mentions this call — handed to the
    # chat layer (via the per-turn product sink) so they render as preview
    # cards. The inline links inserted below get stripped from the prose
    # downstream; the cards carry the links instead.
    matched: list = []

    text, rewrote, stripped = _rewrite_md_links(text)
    text, ph_rewrote, ph_stripped = _rewrite_placeholder_links(text)
    text, bare_stripped = _strip_bare_urls(text)
    text, enriched = _enrich_brand_mentions(text, matched=matched)
    text, cat_enriched = _enrich_category_mentions(text, matched=matched)
    enriched += cat_enriched

    if matched:
        try:
            from services.lc_agent import record_catalog_products
            record_catalog_products(matched)
        except Exception:
            pass

    if rewrote or stripped or ph_rewrote or ph_stripped or bare_stripped or enriched:
        logger.info(
            "[link-validator] md_rewrote=%d md_stripped=%d "
            "placeholder_rewrote=%d placeholder_stripped=%d "
            "bare_stripped=%d enriched=%d",
            rewrote, stripped, ph_rewrote, ph_stripped, bare_stripped, enriched,
        )
    return text if text else original
