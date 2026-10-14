"""Probe the chat as a real user: one fresh thread per prompt, record the
reply text, visual blocks, product cards and timing. Used to check that cards
and visuals show up when they should (and only then), and that every product
card links into the verified catalog.

    python scripts/chat_visuals_probe.py --base http://localhost:8002 --out probe.json [--only tag,...]
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
import urllib.request

sys.path.insert(0, ".")

# (tag, prompt, expectation)  expectation keys: blocks (set of types that should
# appear, or "none"), products ("yes" / "no" / "any")
CASES = [
    # products: should surface verified cards
    ("prod_sleepmask", "what sleep mask should i get?", {"products": "yes"}),
    ("prod_blackout", "my room isn't dark enough at night, what should i buy?", {"products": "yes"}),
    ("prod_creatine", "which creatine should i buy?", {"products": "yes"}),
    ("prod_magnesium_link", "give me a link for magnesium glycinate", {"products": "yes"}),
    ("prod_timer", "what timer should i use for my focus blocks?", {"products": "yes"}),
    ("prod_bottle", "what water bottle should i get so i drink more?", {"products": "yes"}),
    ("prod_spf", "which sunscreen should i buy for daily use?", {"products": "yes"}),
    ("prod_dumbbells", "what dumbbells should i get for training at home?", {"products": "yes"}),
    ("prod_earplugs", "best earplugs for sleeping?", {"products": "yes"}),
    ("prod_peptide", "where can i buy bpc-157?", {"products": "no"}),
    ("prod_theanine", "where can i buy l-theanine?", {"products": "yes"}),
    ("prod_supp_sleep", "what supplements should i get for sleep?", {"products": "yes"}),
    ("prod_journal", "recommend a journal for my evening brain dump", {"products": "yes"}),
    ("noprod_creatine", "is creatine safe to take long term?", {"products": "no"}),
    ("noprod_protein", "how much protein do i need a day?", {"products": "no"}),
    # no products, no blocks: conversational
    ("conv_hi", "hey", {"products": "no", "blocks": "none"}),
    ("conv_thanks", "thanks that helps", {"products": "no", "blocks": "none"}),
    ("conv_badnight", "i slept terribly last night", {"products": "no", "blocks": "none"}),
    ("conv_stressed", "i'm really stressed about work this week", {"products": "no", "blocks": "none"}),
    ("know_nap", "should i nap after lunch?", {"products": "no"}),
    # explicit visuals
    ("vis_compare", "compare magnesium and melatonin for sleep", {"blocks": {"comparison"}}),
    ("vis_compare2", "coffee vs coffee with l-theanine for focus, compare them", {"blocks": {"comparison"}}),
    ("vis_timeline", "give me a week-by-week plan to fix my sleep schedule", {"blocks": {"timeline"}}),
    ("vis_table", "put a simple 3-day home workout in a table", {"blocks": {"table"}}),
    ("vis_checklist", "give me a checklist for a better wind-down", {"blocks": {"checklist"}}),
    ("vis_stats", "hit me with the key numbers on caffeine and sleep", {"blocks": {"stat_cards"}}),
    ("vis_flow", "what order should my morning routine go in?", {"blocks": {"flowchart", "checklist"}}),
    ("vis_flow2", "in what order should i do my wind-down?", {}),
    ("vis_multi", "make me a 4 week focus plan with a timeline and a checklist", {"blocks": {"timeline", "checklist"}}),
    # implicit: a block is fine but must not be junk
    ("imp_caffeine", "how late can i have coffee?", {}),
    ("imp_zone2", "what is zone 2 cardio and how much do i need?", {}),
]


def _post(base: str, path: str, token: str, body: dict, timeout: int = 150) -> dict:
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


async def _token() -> str:
    from sqlalchemy import select
    from db.sqlalchemy import AsyncSessionLocal
    from models.sqlalchemy_models import ChatConversation
    from api.auth import create_access_token
    async with AsyncSessionLocal() as db:
        c = (await db.execute(select(ChatConversation).where(ChatConversation.title == "Calmmax plan").limit(1))).scalars().first()
        return create_access_token(str(c.user_id))


def main() -> None:
    args = sys.argv[1:]
    base = args[args.index("--base") + 1] if "--base" in args else "http://localhost:8002"
    out = args[args.index("--out") + 1] if "--out" in args else "probe.json"
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    token = asyncio.run(_token())
    from services.product_catalog import allowed_urls
    allowed = allowed_urls()
    rows = []
    for tag, prompt, exp in CASES:
        if only and tag not in only:
            continue
        conv = _post(base, "/api/chat/conversations", token, {"title": f"probe {tag}"})
        cid = conv.get("id") or (conv.get("conversation") or {}).get("id")
        t = time.monotonic()
        try:
            r = _post(base, "/api/chat/message", token, {"message": prompt, "conversation_id": cid})
        except Exception as e:
            rows.append({"tag": tag, "prompt": prompt, "error": str(e)})
            print(f"{tag:22} ERROR {e}")
            continue
        dt = time.monotonic() - t
        blocks = [b.get("type") for b in r.get("visual_blocks") or []]
        prods = r.get("products") or []
        bad_links = [p.get("url") for p in prods if p.get("url") not in allowed]
        verdict = []
        if exp.get("products") == "yes" and not prods:
            verdict.append("MISSING_PRODUCTS")
        if exp.get("products") == "no" and prods:
            verdict.append("UNWANTED_PRODUCTS")
        if exp.get("blocks") == "none" and blocks:
            verdict.append("UNWANTED_BLOCKS")
        if isinstance(exp.get("blocks"), set) and not (set(blocks) & exp["blocks"]):
            verdict.append("MISSING_BLOCK")
        if bad_links:
            verdict.append("NON_CATALOG_LINK")
        if "http" in (r.get("response") or ""):
            verdict.append("URL_IN_TEXT")
        import re as _re
        text_l = (r.get("response") or "").lower()
        if _re.search(r"\b\d+(\.\d+)?\s*(mg|mcg|iu|grams?)\b", json.dumps(r.get("visual_blocks") or []).lower()):
            verdict.append("DOSE_IN_BLOCK")
        if _re.search(r"looks?max|lookmax|psl\b|mewing", text_l):
            verdict.append("STALE_VOICE")
        if _re.search(r"\b(the|my|our) (docs|safety rules?|rules)|course material\b|not allowed to|can'?t recommend dosing", text_l):
            verdict.append("META_TALK")
        rows.append({"tag": tag, "prompt": prompt, "secs": round(dt, 1), "blocks": blocks,
                     "visual_blocks": r.get("visual_blocks"), "products": prods,
                     "response": r.get("response"), "choices": r.get("choices"),
                     "verdict": verdict or ["OK"]})
        print(f"{tag:22} {dt:5.1f}s blocks={blocks} products={[p.get('name','')[:28] for p in prods]} -> {','.join(verdict) or 'OK'}", flush=True)
        try:
            urllib.request.urlopen(urllib.request.Request(f"{base}/api/chat/conversations/{cid}", method="DELETE",
                                                          headers={"Authorization": "Bearer " + token}), timeout=20)
        except Exception:
            pass
    json.dump(rows, open(out, "w"), indent=1, default=str)


if __name__ == "__main__":
    main()
