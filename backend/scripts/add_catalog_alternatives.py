"""Add verified Amazon products as alternatives for existing needs.

    ../.venv/bin/python scripts/add_catalog_alternatives.py --facts picks.json [--date 2026-10-15]

picks.json: {"<ASIN>": {"need": "...", "title": "...", "brand": "...", "price": "$12.99",
             "rating": "4.6", "count": "1234", "img": "https://m.media-amazon.com/images/I/...",
             "name": "short display name", "rationale": "one line"}}

Each new entry copies module, concerns and references from the need's existing
products (so it serves the same habits), gets `suits` from its title for skin
products, and is inserted right after the last product with that need. Marked
`alternative: true` so it ranks under the researched pick unless it fits better.
Gear gets all diet/allergen flags true (no conflict); consumables stay null
(unknown) unless the title says vegan / fragrance-free.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys

import yaml

CATALOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "product_catalog.yaml")
CONSUMABLE = {"electrolytes", "protein_breakfast", "fiber", "face_cleanser", "moisturizer", "sunscreen",
              "sunscreen_stick", "lip_spf", "adapalene", "retinol_serum", "niacinamide_serum", "vitamin_c_serum",
              "azelaic_acid", "bha_exfoliant", "aha_exfoliant", "hyaluronic_serum", "clay_mask", "ointment",
              "ketoconazole_shampoo", "melatonin", "magnesium", "l_theanine", "creatine", "collagen", "vitamin_d3",
              "omega3", "glycine", "multivitamin", "b12", "protein_powder"}
SKIN_WORDS = ["oily", "dry", "sensitive", "acne", "mineral", "gel", "cream", "lotion", "fragrance-free",
              "redness", "combination", "normal"]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--facts", required=True)
    ap.add_argument("--date", default=dt.date.today().isoformat())
    a = ap.parse_args()
    picks = json.load(open(a.facts))
    text = open(CATALOG, encoding="utf-8").read()
    data = yaml.safe_load(text)["products"]
    by_need: dict[str, list[dict]] = {}
    have_asin = set()
    have_id = {p["id"] for p in data}
    for p in data:
        if p.get("module") != "retired" and p.get("need"):
            by_need.setdefault(p["need"], []).append(p)
        m = re.search(r"/dp/([A-Z0-9]{10})", p.get("url", ""))
        if m:
            have_asin.add(m.group(1))
    added = 0
    lines = text.split("\n")
    for asin, f in picks.items():
        need = f["need"]
        if asin in have_asin or need not in by_need:
            print("skip", asin, need)
            continue
        ref = by_need[need][0]
        price = re.search(r"\$\s*([\d,]+(?:\.\d{1,2})?)", f.get("price") or "")
        if not price:
            print("skip (no price)", asin)
            continue
        price_v = float(price.group(1).replace(",", ""))
        pid = slug(f["name"])
        while pid in have_id:
            pid += "-2"
        have_id.add(pid)
        title_l = (f.get("title") or "").lower()
        gear = need not in CONSUMABLE
        tags = {k: (True if gear else None) for k in
                ("vegetarian", "vegan", "fragrance_free", "sulfate_free", "gluten_free", "dairy_free")}
        if not gear:
            if "vegan" in title_l:
                tags["vegan"] = tags["vegetarian"] = True
            if "fragrance free" in title_l or "fragrance-free" in title_l or "unscented" in title_l:
                tags["fragrance_free"] = True
        suits = [w for w in SKIN_WORDS if w in title_l] if ref.get("module") == "skinhairmax" else []
        tier = "budget" if price_v < 20 else "mid" if price_v <= 60 else "premium"
        y = [f"- id: {pid}",
             f"  name: {json.dumps(f['name'])}",
             f"  brand: {json.dumps(f['brand'])}",
             f"  module: {ref['module']}",
             f"  need: {need}",
             "  alternative: true"]
        if suits:
            y.append(f"  suits: [{', '.join(suits)}]")
        y += ["  concerns:"] + [f"  - {c}" for c in ref.get("concerns") or []]
        y += [f"  url: https://www.amazon.com/dp/{asin}",
              f"  image: {f['img']}",
              f"  price_tier: {tier}",
              f"  price_usd: {price_v:.2f}",
              f"  rating: {float(f['rating'])}",
              f"  rating_count: {int(re.sub(r'[^0-9]', '', str(f['count'])))}",
              f"  checked: {a.date}",
              "  tags:"] + [f"    {k}: {'null' if v is None else str(v).lower()}" for k, v in tags.items()]
        y += [f"  rationale: {json.dumps(f['rationale'])}", "  references:"]
        y += [f"  - {r}" for r in ref.get("references") or []]
        y += [f"  slug: {slug(f['name']).title()}"]
        # insert after the last existing entry for this need
        last_id = by_need[need][-1]["id"]
        i = next(k for k, l in enumerate(lines) if l == f"- id: {last_id}")
        j = i + 1
        while j < len(lines) and not lines[j].startswith("- id: ") and not lines[j].startswith("# "):
            j += 1
        lines[j:j] = y
        by_need[need].append({"id": pid})
        added += 1
    open(CATALOG, "w", encoding="utf-8").write("\n".join(lines))
    print(f"added {added}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
