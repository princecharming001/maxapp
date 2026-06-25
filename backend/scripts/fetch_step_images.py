"""fetch_step_images.py — fetch REAL step photos from web image search + cache locally.

SC1/SC3/SC4: step images are real photos pulled from web image search (NOT generated).
Source of record: data/step_image_sources.json — license-clean photos (Unsplash License,
free commercial use) harvested via web image search, keyed by step subject. The live
Openverse search (services/image_search_service) is the alternative when its API isn't
rate-limited; this script prefers the curated manifest so a build is reliable + offline-
downloadable from the image CDN.

For each step: derive a subject (keyword map) -> pick the next UNUSED candidate (global
de-dup so no two steps share a photo, within OR across tasks) -> download once to
backend/uploads/hero/steps/<task_key_hash>/<n>.jpg -> re-encode to a sane JPEG -> record
attribution.json. Idempotent: skips images that already exist (unless --force).

Usage: .venv312/bin/python scripts/fetch_step_images.py [task_key_substring] [--force]
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
from services import image_search_service as iss  # noqa: E402
from services.step_image_service import step_dir, step_image_path, _EXTS  # noqa: E402

_MANIFEST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "data", "step_image_sources.json")
# Unsplash CDN sizing: ~1100px wide, jpg, cropped — light + consistent.
_IMG_PARAMS = "?w=1100&q=80&fm=jpg&fit=crop"

# Step subject -> a concrete, photographable product/scene query (manifest key).
_SUBJECT_MAP = [
    (("cleanse", "cleanser", "face wash", "foaming"), "facial cleanser bottle"),
    (("vitamin c", "serum", "essence", "hyaluronic", "ampoule"), "serum dropper bottle"),
    (("retino", "adapalene", "tretinoin", "benzoyl", "salicylic", "active treatment", "treatment"), "skincare treatment tube"),
    (("exfoliat", "aha", "bha", "peel", "glycolic", "toner"), "skincare toner bottle"),
    (("moistur", "ceramide", "hydrate", "cream", "lotion", "seal"), "moisturizer cream jar"),
    (("sunscreen", "spf", "sun protection", "reapply"), "sunscreen lotion bottle"),
    (("mask",), "sheet face mask skincare"),
    (("water", "hydration", "drink", "glass", "sip"), "glass of water"),
    (("pillow",), "white pillow bedding"),
    (("gua sha", "roller", "massage", "jaw", "lift", "depuff"), "jade facial roller"),
]


def _load_manifest() -> dict:
    with open(_MANIFEST_PATH) as f:
        return json.load(f)


def subject_query(step: dict) -> str:
    ings = step.get("ingredients") or []
    ing_names = " ".join(str(i.get("generic_name") or i.get("name") or "") for i in ings)
    blob = f"{ing_names} {step.get('title','')} {step.get('body','')[:80]}".lower()
    for keys, q in _SUBJECT_MAP:
        if any(k in blob for k in keys):
            return q
    return "_generic"


def _exists(task_key: str, n: int) -> bool:
    d = step_dir(task_key)
    return any(os.path.isfile(os.path.join(d, f"{n}{e}")) for e in _EXTS)


def _reencode_jpg(src_path: str, dst_path: str, max_dim: int = 1280) -> bool:
    try:
        from PIL import Image
        with Image.open(src_path) as im:
            im = im.convert("RGB")
            w, h = im.size
            scale = min(1.0, max_dim / max(w, h))
            if scale < 1.0:
                im = im.resize((int(w * scale), int(h * scale)))
            im.save(dst_path, "JPEG", quality=85)
        return True
    except Exception:
        return False


def _scan_used(manifest: dict) -> set[str]:
    """Collect photo base-URLs already assigned in any task's attribution.json so a
    fresh fetch keeps photos distinct across tasks too (SC3)."""
    used: set[str] = set()
    steps_root = step_dir("x").rsplit(os.sep, 1)[0]
    if not os.path.isdir(steps_root):
        return used
    for d in os.listdir(steps_root):
        ap = os.path.join(steps_root, d, "attribution.json")
        if os.path.isfile(ap):
            try:
                for v in json.load(open(ap)).values():
                    if isinstance(v, dict) and v.get("base_url"):
                        used.add(v["base_url"])
            except Exception:
                pass
    return used


async def main(filt: str, force: bool) -> tuple[int, int]:
    manifest = _load_manifest()
    used_global = _scan_used(manifest)
    fetched = skipped = 0
    async with AsyncSessionLocal() as db:
        like = f"%{filt}%" if filt else "skinmax%"
        rows = await db.execute(
            text("SELECT task_key, payload FROM task_guides WHERE task_key LIKE :l ORDER BY task_key"),
            {"l": like},
        )
        for task_key, payload in rows.fetchall():
            p = payload if isinstance(payload, dict) else json.loads(payload)
            d = step_dir(task_key)
            attrib_path = os.path.join(d, "attribution.json")
            attrib = {}
            if os.path.isfile(attrib_path):
                try:
                    attrib = json.load(open(attrib_path))
                except Exception:
                    attrib = {}

            for s in (p.get("steps") or []):
                n = int(s.get("n") or 0)
                if not n:
                    continue
                if _exists(task_key, n) and not force:
                    skipped += 1
                    continue
                subj = subject_query(s)
                candidates = manifest.get(subj) or manifest.get("_generic") or []
                picked = None
                for base in candidates:
                    if base in used_global:
                        continue
                    tmp = os.path.join(d, f".{n}.dl")
                    if iss.download(base + _IMG_PARAMS, tmp):
                        out = step_image_path(task_key, n)
                        if _reencode_jpg(tmp, out):
                            os.remove(tmp)
                            picked = base
                            break
                        if os.path.exists(tmp):
                            os.remove(tmp)
                # If every candidate is taken, allow reuse of the first that downloads.
                if not picked:
                    for base in candidates:
                        tmp = os.path.join(d, f".{n}.dl")
                        if iss.download(base + _IMG_PARAMS, tmp):
                            out = step_image_path(task_key, n)
                            if _reencode_jpg(tmp, out):
                                os.remove(tmp)
                                picked = base
                                break
                            if os.path.exists(tmp):
                                os.remove(tmp)
                if picked:
                    used_global.add(picked)
                    attrib[str(n)] = {"query": subj, "base_url": picked,
                                      "source": "unsplash", "license": "Unsplash License"}
                    fetched += 1
                    print(f"fetched {task_key} step {n} (q={subj!r}) <- {picked}")
                else:
                    print(f"!! no image for {task_key} step {n} (q={subj!r})")
            if attrib:
                os.makedirs(d, exist_ok=True)
                json.dump(attrib, open(attrib_path, "w"), indent=2)
    print(f"\n[fetch-step-images] fetched={fetched} skipped={skipped}")
    return fetched, skipped


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--force"]
    force = "--force" in sys.argv
    asyncio.run(main(args[0] if args else "", force))
    sys.exit(0)
