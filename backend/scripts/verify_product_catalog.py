"""Verify the product catalog against live Amazon pages.

For every ACTIVE entry (module != retired) it checks:
  schema   url is a clean https://www.amazon.com/dp/<ASIN>, ASIN unique, module
           known, >=3 lowercase concerns, price_tier, tags, <=120-char rationale
           with no medical-claim words, references that exist under backend/,
           image is an /images/I/ URL.
  product  the page title (+ byline) carries the brand and >=50% of the name's
           tokens, i.e. the link opens the product we name.
  buyable  the page has a buy box (Add to Cart / Buy Now) and is not marked
           out of stock / currently unavailable.
  image    the catalog image is the page's current main image, and the CDN
           serves it as a real image (not the 43-byte placeholder GIF).
           --write-images re-syncs it when Amazon swaps the main image.

    python scripts/verify_product_catalog.py                 # all active entries
    python scripts/verify_product_catalog.py <id> [<id> ...] # just these ids
    python scripts/verify_product_catalog.py --all           # include retired
    python scripts/verify_product_catalog.py --lint          # schema only, no network
    python scripts/verify_product_catalog.py --json out.json # also dump rows
    python scripts/verify_product_catalog.py --write-images  # store each OK page's main image
    python scripts/verify_product_catalog.py --asin A [B ..] # dump page facts (one session)
    python scripts/verify_product_catalog.py --search "nature made melatonin 3mg"
    python scripts/verify_product_catalog.py --facts-snippet > snippet.js
    python scripts/verify_product_catalog.py --facts catalog_facts.json

Amazon pacing: one cookie session per run, ~5.5-8 s between page requests.
If Amazon serves its robot-check page the script backs off (45 s, then 90 s)
and, after 3 robot checks in a row, stops requesting pages for the rest of
the run (remaining rows report ROBOT_CHECK). It never submits the check.

When Amazon keeps robot-checking scripted requests, --facts-snippet prints a
console snippet that captures the same page facts in an ordinary browser tab
(same pacing, stops on a robot check) and downloads catalog_facts.json;
--facts runs every rule on that file instead of fetching pages. Images are
still fetched live from the CDN, and rows are marked with the capture time.
"""
from __future__ import annotations

import gzip
import html
import http.cookiejar
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import Counter
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parent.parent
CATALOG = BACKEND / "data" / "product_catalog.yaml"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
STOP = {"the", "and", "with", "for", "of", "a", "an", "oz", "fl", "ml", "count", "pack", "by"}

MODULES = {"sleepmax", "energymax", "focusmax", "calmmax", "trainmax", "skinhairmax",
           "longevitymax", "suppmax", "peptidemax", "general", "retired"}
PRICE_TIERS = {"budget", "mid", "premium"}
URL_RE = re.compile(r"^https://www\.amazon\.com/dp/([A-Z0-9]{10})$")
IMG_RE = re.compile(r"^https://m\.media-amazon\.com/images/I/[A-Za-z0-9+%_.-]+\.(jpg|jpeg|png|webp)$")
CONCERN_RE = re.compile(r"^[a-z0-9_]+$")
# Rationales are shown to users next to a buy link: no health claims.
CLAIM_RE = re.compile(r"\b(cures?|treats?|treatment|prevents?|heals?|disease|clinically[- ]proven|"
                      r"guarantee[sd]?|detox|boosts? (?:testosterone|immunity|metabolism)|"
                      r"anti[- ]?anxiety|insomnia|depression|fat[- ]burn\w*)\b", re.I)


# --------------------------------------------------------------------------- #
#  HTTP: one cookie session, polite pacing, robot-check back-off               #
# --------------------------------------------------------------------------- #

_JAR = http.cookiejar.CookieJar()
_OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_JAR))
_last = [0.0]
_robot_streak = [0]
ROBOT_LIMIT = 3


class RobotCheck(Exception):
    pass


def _decode(body: bytes, enc: str) -> str:
    if enc == "gzip":
        body = gzip.decompress(body)
    elif enc == "deflate":
        body = zlib.decompress(body)
    return body.decode("utf-8", "ignore")


def _get(url: str) -> str:
    wait = 5.5 + random.random() * 2.5 - (time.monotonic() - _last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "gzip, deflate"})
    try:
        with _OPENER.open(req, timeout=25) as r:
            return _decode(r.read(), r.headers.get("Content-Encoding", ""))
    finally:
        _last[0] = time.monotonic()


def is_robot_page(page: str) -> bool:
    return ('id="productTitle"' not in page and 's-search-result' not in page
            and ("validateCaptcha" in page or "captcha" in page.lower()
                 or "api-services-support@amazon.com" in page))


def fetch(url: str) -> str:
    """GET an amazon.com page. Raises RobotCheck when Amazon keeps serving its
    robot check (after backing off), and once ROBOT_LIMIT checks in a row have
    been seen, refuses to request anything else this run."""
    if _robot_streak[0] >= ROBOT_LIMIT:
        raise RobotCheck("skipped: Amazon is serving robot checks to this session")
    for attempt in range(3):
        try:
            page = _get(url)
        except urllib.error.HTTPError as e:   # 503 = throttled, same as a robot check
            if e.code not in (429, 503):
                raise
            page = "captcha"
        if not is_robot_page(page):
            _robot_streak[0] = 0
            return page
        _robot_streak[0] += 1
        if _robot_streak[0] >= ROBOT_LIMIT or attempt == 2:
            break
        time.sleep(45 * (attempt + 1))
    raise RobotCheck("Amazon served its robot check")


def fetch_image(url: str) -> tuple[int, str, int]:
    """(status, content-type, bytes) for an image URL on Amazon's CDN."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            return r.status, r.headers.get("Content-Type", ""), len(body)
    except urllib.error.HTTPError as e:
        return e.code, "", 0
    except Exception:
        return 0, "", 0


# --------------------------------------------------------------------------- #
#  Page parsing                                                               #
# --------------------------------------------------------------------------- #

def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def image_id(url: str) -> str:
    """'https://m.media-amazon.com/images/I/61EidjXUBrL._SL1000_.jpg' -> '61EidjXUBrL'."""
    m = re.search(r"/images/I/([^./]+)", url or "")
    return m.group(1) if m else ""


def page_facts(page: str) -> dict:
    title = re.search(r'<span id="productTitle"[^>]*>(.*?)</span>', page, re.S)
    title = _text(title.group(1)) if title else ""
    byline = re.search(r'id="bylineInfo"[^>]*>(.*?)</a>', page, re.S)
    byline = _text(byline.group(1)) if byline else ""
    # Main image first: the first hiRes in the image-block data, else the landing image.
    hires = re.findall(r'"hiRes":"(https://m\.media-amazon\.com/images/I/[^"]+)"', page)
    large = re.findall(r'"large":"(https://m\.media-amazon\.com/images/I/[^"]+)"', page)
    old = re.findall(r'data-old-hires="(https://m\.media-amazon\.com/images/I/[^"]+)"', page)
    main = (old or hires or large or [""])[0]   # data-old-hires = the landing (main) image
    # Only the product's own gallery (image-block data), not related/sponsored tiles.
    all_ids = {image_id(u) for u in hires + large + old}
    avail = re.search(r'<div id="availability"[^>]*>(.*?)</div>', page, re.S)
    avail = _text(re.sub(r"<script.*?</script>", "", avail.group(1), flags=re.S)) if avail else ""
    canon = re.search(r'<link rel="canonical" href="[^"]*/dp/([A-Z0-9]{10})', page)
    # Selected variation ("552 Pair / Black", "5 Fl Oz") — part of what the link opens.
    picks = re.findall(r'id="inline-twister-expanded-dimension-text-\w+"[^>]*>\s*([^<]{1,80}?)\s*<', page)
    picks += re.findall(r'id="variation_\w+".{0,800}?<span class="selection">\s*([^<]{1,80}?)\s*</span>',
                        page, re.S)
    variation = " / ".join(dict.fromkeys(_text(v) for v in picks if v.strip()))[:160]
    return {
        "title": title,
        "byline": byline,
        "variation": variation,
        "image": main,
        "image_ids": sorted(i for i in all_ids if i),
        "availability": avail[:90],
        "add_to_cart": 'id="add-to-cart-button"' in page,
        "buy_now": 'id="buy-now-button"' in page,
        "out_of_stock": 'id="outOfStock"' in page
                        or bool(re.search(r"Currently unavailable|We don't know when or if this item", avail)),
        "canonical_asin": canon.group(1) if canon else "",
    }


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", s.lower()) if len(t) > 1 and t not in STOP}


# --------------------------------------------------------------------------- #
#  Checks                                                                     #
# --------------------------------------------------------------------------- #

def schema_problems(p: dict, seen_ids: set, seen_asins: dict) -> list[str]:
    probs = []
    pid = str(p.get("id") or "")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", pid):
        probs.append("id not kebab-case")
    if pid in seen_ids:
        probs.append("duplicate id")
    seen_ids.add(pid)
    for k in ("name", "brand"):
        if not str(p.get(k) or "").strip():
            probs.append(f"missing {k}")
    module = p.get("module")
    if module not in MODULES:
        probs.append(f"unknown module {module!r}")
    if module == "retired":
        return probs
    m = URL_RE.match(str(p.get("url") or ""))
    if not m:
        probs.append("url is not https://www.amazon.com/dp/<ASIN>")
    else:
        asin = m.group(1)
        if asin in seen_asins:
            probs.append(f"ASIN also used by {seen_asins[asin]}")
        seen_asins[asin] = pid
    concerns = p.get("concerns") or []
    if len(concerns) < 3:
        probs.append("fewer than 3 concerns")
    bad = [c for c in concerns if not CONCERN_RE.match(str(c))]
    if bad:
        probs.append(f"concerns not lowercase snake_case: {bad}")
    if p.get("price_tier") not in PRICE_TIERS:
        probs.append("bad price_tier")
    tags = p.get("tags")
    if not isinstance(tags, dict) or any(v not in (True, False, None) for v in tags.values()):
        probs.append("tags must be a dict of true/false/null")
    rationale = str(p.get("rationale") or "")
    if not rationale or len(rationale) > 120:
        probs.append(f"rationale length {len(rationale)} (1-120)")
    claim = CLAIM_RE.search(rationale)
    if claim:
        probs.append(f"rationale has claim word {claim.group(0)!r}")
    refs = p.get("references") or []
    if not refs:
        probs.append("no references")
    missing = [r for r in refs if not (BACKEND / r).is_file()]
    if missing:
        probs.append(f"missing reference files {missing}")
    if not IMG_RE.match(str(p.get("image") or "")):
        probs.append("image is not an /images/I/ URL")
    return probs


def check(p: dict, schema: list[str], facts: dict | None = None) -> dict:
    """Verify one entry. With `facts` (ASIN -> page facts captured in a real
    browser, see --facts-snippet) the page is not fetched; the same rules run
    on the captured facts and the image is still checked live on the CDN."""
    out = {"id": p.get("id"), "name": p.get("name"), "brand": p.get("brand"),
           "module": p.get("module"), "url": p.get("url"), "image_in_catalog": p.get("image")}
    if schema:
        out.update(status="SCHEMA", detail="; ".join(schema))
        return out
    asin = URL_RE.match(p["url"]).group(1)
    if facts is not None:
        if asin not in facts:
            return {**out, "status": "NO_FACTS", "detail": f"{asin} not in the facts file"}
        f = dict(facts[asin])
        out["source"] = f"browser capture {f.get('captured_at', '')}".strip()
        if f.get("robot_check"):
            return {**out, "status": "ROBOT_CHECK", "detail": "robot check during capture"}
    else:
        try:
            f = page_facts(fetch(p["url"]))
        except RobotCheck as e:
            return {**out, "status": "ROBOT_CHECK", "detail": str(e)}
        except Exception as e:
            return {**out, "status": "ERROR", "detail": str(e)[:120]}
    out.update(f)
    hay = f"{f['title']} {f['byline']}".lower()
    brand_ok = all(t in hay for t in tokens(p.get("brand") or ""))
    name_t = tokens(p.get("name") or "") - tokens(p.get("brand") or "")
    overlap = len(name_t & tokens(f"{f['title']} {f.get('variation', '')}")) / max(1, len(name_t))
    out["brand_ok"], out["name_overlap"] = brand_ok, round(overlap, 2)
    cat_img = str(p.get("image") or "")
    if not f["title"]:
        out["status"] = "NO_PAGE"
    elif not brand_ok or overlap < 0.5:
        out["status"] = "WRONG_PRODUCT"
    elif f["out_of_stock"] or not (f["add_to_cart"] or f["buy_now"]):
        out["status"] = "UNAVAILABLE"
        out["detail"] = f["availability"] or "no buy box"
    elif not f["image"]:
        out["status"] = "NO_IMAGE"
    elif image_id(cat_img) != image_id(f["image"]):
        out["status"] = "IMAGE_MISMATCH"
        where = "a gallery image" if image_id(cat_img) in f.get("image_ids", []) else "not the main image"
        out["detail"] = f"catalog image is {where}; page main image is {f['image']}"
    else:
        code, ctype, size = fetch_image(cat_img)
        out["image_http"] = [code, ctype, size]
        if code != 200 or not ctype.startswith("image/") or size < 1000:
            out["status"] = "BAD_IMAGE"
            out["detail"] = f"{code} {ctype} {size}B"
        else:
            out["status"] = "OK"
    if f["canonical_asin"] and f["canonical_asin"] != asin:
        out["note"] = f"canonical ASIN {f['canonical_asin']} (variation family)"
    return out


def write_images(rows: list[dict]) -> int:
    """Point each entry's image at its page's main image. Only rows whose
    product/buyability checks passed (OK or IMAGE_MISMATCH/BAD_IMAGE) are
    touched; edits are line-level so comments and layout survive."""
    fixes = {r["id"]: r["image"] for r in rows
             if r.get("status") in ("OK", "IMAGE_MISMATCH", "BAD_IMAGE") and r.get("image")}
    lines = CATALOG.read_text().splitlines(keepends=True)
    cur, n = None, 0
    for i, line in enumerate(lines):
        m = re.match(r"- id: (\S+)", line)
        if m:
            cur = m.group(1)
            continue
        if cur in fixes and re.match(r"  image: ", line):
            new = f"  image: {fixes[cur]}\n"
            if line != new:
                lines[i], n = new, n + 1
    CATALOG.write_text("".join(lines))
    return n


# --------------------------------------------------------------------------- #
#  CLI                                                                        #
# --------------------------------------------------------------------------- #

def search(query: str, n: int = 6) -> list[dict]:
    """Organic (non-sponsored) results for a query: asin + title."""
    page = fetch("https://www.amazon.com/s?k=" + urllib.parse.quote_plus(query))
    out = []
    for m in re.finditer(r'<div[^>]+data-asin="([A-Z0-9]{10})"[^>]+data-component-type="s-search-result"(.*?)(?=<div[^>]+data-component-type="s-search-result"|$)', page, re.S):
        asin, chunk = m.group(1), m.group(2)
        if "Sponsored" in chunk[:4000] or "AdHolder" in chunk[:400]:
            continue
        t = re.search(r'<h2[^>]*>.*?<span[^>]*>(.*?)</span>', chunk, re.S)
        out.append({"asin": asin, "title": _text(t.group(1)) if t else ""})
        if len(out) >= n:
            break
    return out


FACTS_SNIPPET = r"""// Paste into the DevTools console of an ordinary https://www.amazon.com tab.
// Fetches each catalog page at the same 5.5-8 s pace as the script, extracts
// the facts verify_product_catalog.py checks, stops on a robot check, and
// downloads catalog_facts.json. Then:  python scripts/verify_product_catalog.py --facts catalog_facts.json
(async () => {
  const asins = __ASINS__;
  const facts = {};
  const grab = (p, re) => [...p.matchAll(re)].map(m => m[1]);
  for (const asin of asins) {
    const r = await fetch('/dp/' + asin, {credentials: 'include'});
    const p = await r.text();
    const doc = new DOMParser().parseFromString(p, 'text/html');
    const txt = s => ((doc.querySelector(s) || {}).textContent || '').replace(/\s+/g, ' ').trim();
    if (!doc.querySelector('#productTitle') && /validateCaptcha|captcha/i.test(p)) {
      facts[asin] = {robot_check: true}; console.warn('robot check, stopping'); break;
    }
    const hires = grab(p, /"hiRes":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g);
    const old = grab(p, /data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g);
    const large = grab(p, /"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/g);
    const av = doc.querySelector('#availability');
    if (av) av.querySelectorAll('script,style').forEach(n => n.remove());
    const avail = av ? av.textContent.replace(/\s+/g, ' ').trim() : '';
    const canon = ((doc.querySelector('link[rel=canonical]') || {}).href || '').match(/\/dp\/([A-Z0-9]{10})/);
    const variation = [...doc.querySelectorAll('[id^="inline-twister-expanded-dimension-text-"], [id^="variation_"] .selection')]
      .map(n => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    facts[asin] = {
      title: txt('#productTitle'), byline: txt('#bylineInfo'),
      variation: [...new Set(variation)].join(' / ').slice(0, 160),
      image: old[0] || hires[0] || large[0] || '',
      image_ids: [...new Set([...hires, ...old, ...large].map(u => (u.match(/\/images\/I\/([^./]+)/) || [])[1]).filter(Boolean))],
      availability: avail.slice(0, 90),
      add_to_cart: !!doc.querySelector('#add-to-cart-button'),
      buy_now: !!doc.querySelector('#buy-now-button'),
      out_of_stock: !!doc.querySelector('#outOfStock') || /Currently unavailable|We don't know when or if this item/.test(avail),
      canonical_asin: canon ? canon[1] : '',
      captured_at: new Date().toISOString().slice(0, 16),
    };
    console.log(Object.keys(facts).length + '/' + asins.length, asin, facts[asin].title.slice(0, 60));
    await new Promise(res => setTimeout(res, 5500 + Math.random() * 2500));
  }
  window.catalogFacts = facts;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(facts, null, 1)], {type: 'application/json'}));
  a.download = 'catalog_facts.json';
  a.click();
})();
"""


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["--facts-snippet"]:
        data = yaml.safe_load(CATALOG.read_text())
        asins = [URL_RE.match(p["url"]).group(1) for p in data["products"]
                 if p.get("module") != "retired" and URL_RE.match(str(p.get("url") or ""))]
        print(FACTS_SNIPPET.replace("__ASINS__", json.dumps(asins)))
        return
    if args[:1] == ["--search"] and len(args) > 1:
        for r in search(" ".join(args[1:])):
            print(r["asin"], "|", r["title"][:110])
        return
    if args[:1] == ["--asin"] and len(args) > 1:
        for asin in args[1:]:
            try:
                f = page_facts(fetch("https://www.amazon.com/dp/" + asin))
                f.pop("image_ids")
            except RobotCheck as e:
                f = {"robot_check": str(e)}
            print(json.dumps({"asin": asin, **f}, indent=1), flush=True)
        return

    json_out = facts = None
    if "--json" in args:
        i = args.index("--json")
        json_out = args[i + 1]
        args = args[:i] + args[i + 2:]
    if "--facts" in args:
        i = args.index("--facts")
        facts = json.loads(Path(args[i + 1]).read_text())
        args = args[:i] + args[i + 2:]
        print(f"page facts from {len(facts)} browser-captured pages (images still checked live)")
    flags = {a for a in args if a.startswith("--")}
    only = [a for a in args if not a.startswith("--")]

    data = yaml.safe_load(CATALOG.read_text())
    products = data["products"]
    seen_ids: set = set()
    seen_asins: dict = {}
    schema = {p.get("id"): schema_problems(p, seen_ids, seen_asins) for p in products}

    rows = []
    for p in products:
        if only and p["id"] not in only:
            continue
        if p.get("module") == "retired" and "--all" not in flags and not only:
            continue
        if "--lint" in flags:
            r = {"id": p["id"], "module": p.get("module"),
                 "status": "SCHEMA" if schema[p["id"]] else "LINT_OK",
                 "detail": "; ".join(schema[p["id"]]), "title": ""}
        else:
            r = check(p, schema[p["id"]], facts)
        rows.append(r)
        extra = r.get("detail") or r.get("note") or ""
        print(f"{r['status']:14} {r['module']:12} {r['id']:40} | {r.get('title', '')[:60]}"
              + (f"  [{extra[:90]}]" if extra else ""), flush=True)

    if json_out:
        Path(json_out).write_text(json.dumps(rows, indent=1))
    if "--write-images" in flags:
        print(f"wrote {write_images(rows)} image(s) to {CATALOG.name}")
    active = Counter(p.get("module") for p in products if p.get("module") != "retired")
    print("active per module:", dict(sorted(active.items())),
          "| retired:", sum(1 for p in products if p.get("module") == "retired"))
    print("SUMMARY", dict(Counter(r["status"] for r in rows)))


if __name__ == "__main__":
    main()
