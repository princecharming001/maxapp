"""Write Amazon listing facts (price, rating, rating count) into the catalog.

Amazon robot-checks scripted fetches, so the facts are read in a real browser
session (open any amazon.com page, run the snippet in the docstring of
`BROWSER_SNIPPET` below in its console, save the JSON it prints) and this
script applies them to data/product_catalog.yaml, keeping comments and order.

    ../.venv/bin/python scripts/refresh_product_listings.py --facts listings.json [--date 2026-10-15] [--dry-run]

listings.json: {"<ASIN>": {"price": "$39.00", "rating": "4.4", "count": "15632", "title": "..."}, ...}
A product whose page showed no price (out of stock, unavailable) keeps its old
price; the summary lists it so someone can swap it out.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys

CATALOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "product_catalog.yaml")
FIELDS = ("price_usd", "rating", "rating_count", "checked")

BROWSER_SNIPPET = r"""
const asins = [/* ASINs */];
const parse = html => { const d = new DOMParser().parseFromString(html, 'text/html'); const q = s => d.querySelector(s)?.textContent?.trim();
  return { title: q('#productTitle'), price: q('#corePrice_feature_div .a-offscreen') || q('#corePriceDisplay_desktop_feature_div .a-offscreen') || q('.a-price .a-offscreen'),
           rating: (q('#acrPopover .a-icon-alt') || '').split(' ')[0], count: (q('#acrCustomerReviewText') || '').replace(/[^0-9]/g, '') }; };
const out = {}; for (const a of asins) { out[a] = parse(await (await fetch('/dp/' + a)).text()); await new Promise(r => setTimeout(r, 1200)); }
copy(JSON.stringify(out));
"""


def parse_price(s: str | None) -> float | None:
    m = re.search(r"\$\s*([\d,]+(?:\.\d{1,2})?)", s or "")
    return round(float(m.group(1).replace(",", "")), 2) if m else None


def apply(text: str, facts: dict, date: str) -> tuple[str, list[str], list[str]]:
    lines = text.split("\n")
    out: list[str] = []
    updated, no_price = [], []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.match(r"^- id: (\S+)", line)
        if not m:
            i += 1
            continue
        # the whole entry: until the next "- id:" or a top-level comment/blank run
        j = i + 1
        block = []
        while j < len(lines) and not re.match(r"^- id: ", lines[j]) and not re.match(r"^# ", lines[j]):
            block.append(lines[j])
            j += 1
        url = next((b for b in block if b.strip().startswith("url:")), "")
        am = re.search(r"/dp/([A-Z0-9]{10})", url)
        f = facts.get(am.group(1)) if am else None
        if f:
            old = {k: next((b.split(":", 1)[1].strip() for b in block if b.strip().startswith(k + ":")), None) for k in FIELDS}
            price = parse_price(f.get("price"))
            rating = (f.get("rating") or "").strip()
            count = re.sub(r"\D", "", str(f.get("count") or ""))
            new = {
                "price_usd": f"{price:.2f}" if price is not None else old["price_usd"],
                "rating": rating or old["rating"],
                "rating_count": count or old["rating_count"],
                "checked": date if (price is not None or rating) else old["checked"],
            }
            if price is None:
                no_price.append(m.group(1))
            block = [b for b in block if not any(b.strip().startswith(k + ":") for k in FIELDS)]
            at = next((k for k, b in enumerate(block) if b.strip().startswith("price_tier:")), len(block) - 1)
            ins = [f"  {k}: {v}" for k, v in new.items() if v not in (None, "")]
            block = block[: at + 1] + ins + block[at + 1:]
            updated.append(m.group(1))
        out.extend(block)
        i = j
    return "\n".join(out), updated, no_price


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--facts", required=True)
    ap.add_argument("--date", default=dt.date.today().isoformat())
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    facts = json.load(open(a.facts))
    text = open(CATALOG, encoding="utf-8").read()
    new, updated, no_price = apply(text, facts, a.date)
    print(f"updated {len(updated)} products; no price on page: {', '.join(no_price) or 'none'}")
    if not a.dry_run:
        open(CATALOG, "w", encoding="utf-8").write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
