"""Lightweight product-link resolver for current module docs.

Returns Amazon search links for products explicitly present in module reference
files or retrieved evidence. This avoids forcing the full agent path for simple
"give me links" turns.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from urllib.parse import quote_plus

from config import settings
from services.rag_service import retrieve_chunks

logger = logging.getLogger(__name__)

_SERVICES_DIR = Path(__file__).resolve().parent
_REFERENCE_FILES = {
    "skinmax": _SERVICES_DIR / "skinmax_notification_engine_reference.md",
    "hairmax": _SERVICES_DIR / "hairmax_notification_engine_reference.md",
    "bonemax": _SERVICES_DIR / "bonemax_notification_engine_reference.md",
    "heightmax": _SERVICES_DIR / "heightmax_notification_engine_reference.md",
    "fitmax": _SERVICES_DIR / "fitmax_notification_engine_reference.md",
}

_CURATED_PRODUCTS = {
    "skinmax": [
        "CeraVe Foaming Facial Cleanser",
        "CeraVe Hydrating Cleanser",
        "CeraVe PM Facial Moisturizing Lotion",
        "CeraVe Moisturizing Cream",
        "CeraVe Daily Moisturizing Lotion",
        "Paula's Choice 2% BHA Liquid Exfoliant",
        "EltaMD UV Clear SPF 46",
        "EltaMD UV Physical SPF 41",
        "La Roche-Posay Toleriane Gentle Cleanser",
        "La Roche-Posay Toleriane Hydrating Cleanser",
        "La Roche-Posay Anthelios SPF 50+",
        "La Roche-Posay Cicaplast Baume B5",
        "The Ordinary Azelaic Acid 10%",
        "The Ordinary Niacinamide 10% + Zinc 1%",
        "The Ordinary Alpha Arbutin 2%",
        "The Ordinary Hyaluronic Acid 2% + B5",
        "The Ordinary Glycolic Acid 7% Toning Solution",
        "The Ordinary AHA 30% + BHA 2% Peeling Solution",
        "Differin Adapalene 0.1%",
        "SkinCeuticals CE Ferulic",
        "Dr. Jart+ Ceramidin Cream",
    ],
    "hairmax": [
        "Minoxidil",
        "Finasteride",
        "Topical Finasteride",
        "Hims topical fin/min combo",
        "Ketoconazole Shampoo",
        "Nizoral",
        "Dermaroller",
    ],
}

_CURATED_BRANDS = {
    "skinmax": [
        "CeraVe",
        "Paula's Choice",
        "EltaMD",
        "La Roche-Posay",
        "The Ordinary",
        "Differin",
        "SkinCeuticals",
        "Dr. Jart+",
    ],
    "hairmax": [
        "Rogaine",
        "Hims",
        "Keeps",
        "Nizoral",
    ],
}

_PRODUCT_ALIASES = {
    "Paula's Choice 2% BHA Liquid Exfoliant": ["paulas choice bha", "paula's choice bha", "paulas choice"],
    "EltaMD UV Clear SPF 46": ["elta md", "eltamd", "elta md uv clear"],
    "EltaMD UV Physical SPF 41": ["elta md physical", "eltamd physical"],
    "La Roche-Posay Toleriane Gentle Cleanser": ["la roche posay toleriane", "la roche posay cleanser"],
    "La Roche-Posay Toleriane Hydrating Cleanser": ["la roche posay hydrating cleanser"],
    "La Roche-Posay Anthelios SPF 50+": ["la roche posay anthelios", "anthelios spf"],
    "CeraVe Foaming Facial Cleanser": ["cerave foaming cleanser", "cerave cleanser"],
}

_PRODUCT_PATTERN = re.compile(
    r"\b(?:[A-Z][a-zA-Z0-9+%.'/-]*)(?:\s+[A-Z0-9][a-zA-Z0-9+%.'/-]*){0,5}\b"
)
_BLOCKLIST = {
    "AM", "PM", "PM Routine", "AM Routine", "Skin Type", "Primary Concern",
    "Secondary Concern", "Midday Tip", "Hydration Check", "Retinoid Night",
    "Rest Night", "Weekly Exfoliation", "Monthly Progress Photo", "Monthly Routine Check-in",
    "BoneMax", "HeightMax", "HairMax", "Skinmax", "FitMax", "The", "Use", "Wake Time",
    "Combining", "Daily", "Bloodwork", "Real Talk", "Dermarolling",
}

# Tokens that look like product names but are actually workflow steps,
# routine sections, or generic body parts. The LLM frequently emits these
# via the recommend_product tool. Drop the link entirely if the proposed
# name normalizes to one of these.
_GENERIC_NAME_BLACKLIST: frozenset[str] = frozenset({
    # routine workflow words
    "routine", "amroutine", "pmroutine", "morningroutine", "eveningroutine",
    "nightroutine", "morning", "evening", "night", "midday", "noon",
    "step", "step1", "step2", "step3", "stepone", "steptwo",
    # body / category words
    "skin", "skincare", "hair", "haircare", "scalp", "face", "facial",
    "body", "lips", "lip", "eyes", "eye", "feet", "foot",
    "fitness", "workout", "training", "lifting", "diet", "nutrition",
    # ambiguous singletons that aren't products
    "cleanser", "moisturizer", "serum", "exfoliant", "toner",
    "mask", "spray", "lotion", "cream", "gel", "oil",
    "shampoo", "conditioner",
    # bot fillers
    "tip", "tips", "advice", "recommend", "recommendation", "product", "products",
    "yes", "no", "ok", "okay",
})

# Ingredient + protocol tokens that DO make a single-word query specific
# enough to ship as a product link. "salicylic" alone is a real product
# search; "cleanser" alone is not.
_INGREDIENT_TOKENS: frozenset[str] = frozenset({
    # skin actives
    "salicylic", "glycolic", "lactic", "mandelic", "azelaic", "retinol",
    "retinoid", "tretinoin", "adapalene", "niacinamide", "hyaluronic",
    "ceramide", "panthenol", "centella", "vitaminc", "ascorbic",
    "benzoyl", "peroxide",
    # hair
    "minoxidil", "finasteride", "dutasteride", "ketoconazole", "biotin",
    # sun
    "spf", "zinc", "titanium",
    # fitness supplements
    "creatine", "whey", "casein", "magnesium", "ashwagandha", "caffeine",
    # bone / chewing
    "mastic", "falim", "jawzrsize",
})


def _is_specific_product_query(name: str) -> bool:
    """A product link query is specific enough to ship if at least one is true:

      1. Multi-token name (>= 2 word tokens). "CeraVe Foaming Cleanser" passes.
      2. Single token but matches a known ingredient ("salicylic", "minoxidil").
      3. Already a curated brand/product (caller guarantees this if needed).

    Generic single-noun queries ("routine", "skin", "moisturizer") fail —
    those produce useless Amazon search pages and confuse the user.
    """
    raw = (name or "").strip()
    if not raw:
        return False
    norm = re.sub(r"[^a-z0-9]+", "", raw.lower())
    if norm in _GENERIC_NAME_BLACKLIST:
        return False
    tokens = [t for t in re.findall(r"[a-z0-9]+", raw.lower()) if t]
    if len(tokens) >= 2:
        return True
    if not tokens:
        return False
    single = tokens[0]
    if single in _INGREDIENT_TOKENS:
        return True
    # Single brand-name token (e.g. "CeraVe", "Nizoral") — at least 5 chars
    # and starts uppercase in the original.
    if raw[0:1].isupper() and len(single) >= 5 and single not in _GENERIC_NAME_BLACKLIST:
        return True
    return False

_PRODUCT_CACHE: dict[str, list[str]] = {}


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _norm_tokens(s: str) -> list[str]:
    return [tok for tok in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(tok) >= 3]


def _extract_products(text: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for match in _PRODUCT_PATTERN.findall(text or ""):
        name = match.strip(" -:;,.()[]")
        if len(name) < 4 or name in _BLOCKLIST:
            continue
        if not re.search(r"[A-Z]", name):
            continue
        key = _normalize(name)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def _module_products(maxx_id: str) -> list[str]:
    cached = _PRODUCT_CACHE.get(maxx_id)
    if cached is not None:
        return cached
    ref = _REFERENCE_FILES.get(maxx_id)
    if not ref or not ref.exists():
        _PRODUCT_CACHE[maxx_id] = []
        return []
    try:
        text = ref.read_text(encoding="utf-8")
    except Exception as e:
        logger.warning("product link ref read failed for %s: %s", maxx_id, e)
        _PRODUCT_CACHE[maxx_id] = []
        return []
    products = list(_CURATED_PRODUCTS.get(maxx_id, []))
    products.extend(_extract_products(text))
    _PRODUCT_CACHE[maxx_id] = products
    return products


def _amazon_search_url(name: str) -> str:
    """Resolve a product name to a DIRECT product page URL.

    Returns the long-form catalog URL (`amazon.com/<Slug>/dp/<ASIN>`)
    when the name matches a catalog entry. Returns an empty string
    when no match — callers MUST then skip the link entirely instead
    of shipping a search-results URL ("amazon.com/s?k=…"), which is
    what the user complained about. The catalog is the single source
    of truth; if a product isn't there, we don't link it.
    """
    try:
        from services.product_catalog import lookup_by_name
        hit = lookup_by_name(name)
        if hit:
            return hit.display_url
    except Exception:
        pass
    return ""


def _brand_name(product_name: str) -> str:
    aliases = (
        ("paulaschoice", "Paula's Choice"),
        ("eltamd", "EltaMD"),
        ("larocheposay", "La Roche-Posay"),
        ("cerave", "CeraVe"),
        ("theordinary", "The Ordinary"),
        ("drjart", "Dr. Jart+"),
        ("skinceuticals", "SkinCeuticals"),
        ("hims", "Hims"),
        ("nizoral", "Nizoral"),
        ("rogaine", "Rogaine"),
        ("keeps", "Keeps"),
    )
    norm_full = _normalize(product_name)
    for needle, brand in aliases:
        if norm_full.startswith(needle):
            return brand
    toks = _norm_tokens(product_name)
    if not toks:
        return product_name
    return toks[0].title()


def product_brands_for_module(maxx_id: str, max_brands: int = 8) -> list[str]:
    """Brands we actually stock (verified catalog) for this program."""
    from services.product_catalog import RETIRED_MODULE, active_catalog, normalize_module
    module = normalize_module(maxx_id)
    if not module or module == RETIRED_MODULE:
        return []
    out: list[str] = []
    for p in active_catalog():
        if p.module == module and p.brand and p.brand not in out:
            out.append(p.brand)
        if len(out) >= max_brands:
            break
    return out


_WORD = re.compile(r"[a-z0-9]+")


async def product_links_from_context(
    *,
    message: str,
    maxx_id: str,
    max_links: int = 3,
) -> str:
    """'Give me links' for a program: the verified catalog products that fit
    the message, surfaced as tappable product cards (no URLs in the text).
    Returns "" when nothing fits, so the turn falls through to the coach."""
    from services.lc_agent import record_catalog_products
    from services.product_catalog import RETIRED_MODULE, find_products, normalize_module
    module = normalize_module(maxx_id)
    if not module or module == RETIRED_MODULE:
        return ""
    words = [w for w in _WORD.findall((message or "").lower()) if len(w) >= 3]
    bigrams = [f"{a}_{b}" for a, b in zip(words, words[1:])]
    # A real match only (what the message names), this program first, then
    # the whole catalog ("link for magnesium" from a Sleepmax thread).
    from services.product_catalog import products_named_in
    products = products_named_in(message, modules=[module], limit=max_links)
    if not products:
        return ""
    record_catalog_products(products)
    lines = ["here's what i'd get, tap a card to buy:"]
    for p in products:
        why = (p.rationale or "").rstrip(".").lower()
        lines.append(f"- {p.name}" + (f": {why}" if why else ""))
    return "\n".join(lines)
